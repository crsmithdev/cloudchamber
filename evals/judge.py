#!/usr/bin/env python3
"""Blind pairwise judge for a narrated listen; the parity rule is in the run write-ups under evals/.

  judge.py --ours <draw-id | file> --source <transcript.json | file> [--passes 3] [--judge claude|gemini] [--model M]

Both texts are shown as unlabelled transcripts, Story One and Story Two, with
the order swapped on alternate passes. The judge answers each rubric axis with
One, Two or Tie, then an overall call. Parity: ours wins or ties overall in at
least two of three passes.
"""
import argparse, json, os, re, subprocess, sys, time, urllib.request

RUBRIC = [
 ("hook", "In the first two minutes of listening, which story makes it harder to stop?"),
 ("presence", "In which story does the thing the story is about arrive more fully, in the flesh, in the same place as the people, rather than only being inferred?"),
 ("people", "Whose people are easier to tell apart by ear, and whose speech sounds like people talking?"),
 ("feeling", "In which story does the listener feel what the characters feel, as it happens?"),
 ("cost", "In which story does someone pay a cost that is felt and cannot be taken back?"),
 ("ending", "Which ending would leave a listener sitting in the car after arriving?"),
 ("clarity", "Heard once, read aloud at a steady pace, which story is easier to follow, with fewer sentences a listener would lose the thread of?"),
 ("momentum", "Which story would fewer listeners abandon in the middle?"),
]

def load(src):
    if re.fullmatch(r"\d{14}-[0-9a-f]{4}", src):
        return json.load(urllib.request.urlopen(f"http://127.0.0.1:80/api/draws/{src}/story"))["text"]
    if src.endswith(".json"):
        t = json.load(open(src)); text = " ".join(x["text"] for x in t["snippets"])
        i = text.find("Let's dive into today's story")
        if 0 <= i < 3000: text = text[i + 30:]
        text = re.sub(r"^\s*(Sub subscribe\.?|Subscribe\.?)\s*", "", text)
        return text
    return open(src).read()

def prompt(one, two):
    qs = "\n".join(f"{k}: {q}" for k, q in RUBRIC)
    return f"""Two stories written to be read aloud by one narrator on a long-form story channel, given here as plain transcripts. One or both may carry transcription errors (misheard words, missing punctuation); ignore those and judge what a listener would hear.

<story_one>
{one}
</story_one>

<story_two>
{two}
</story_two>

Judge them as a listener who has forty minutes in the car and many channels to choose from. For each question answer One, Two or Tie, with one sentence of evidence that names a moment from each story. Then give an overall call, One, Two or Tie, and three sentences on what the weaker one would need.

{qs}

Output exactly this shape and nothing else:
<verdict>
<axis name="hook">One|Two|Tie</axis> ...one line per axis in the order given, each followed by <why>one sentence</why>
<overall>One|Two|Tie</overall>
<needs>three sentences</needs>
</verdict>"""

def run_claude(p, model):
    env = dict(os.environ); env.pop("CLAUDECODE", None)
    r = subprocess.run(["claude", "-p", "--output-format", "json", "--no-session-persistence", "--tools", "", "--setting-sources", "",
                        "--system-prompt", "You judge stories for listeners. Output only the tags asked for.", "--model", model],
                       input=p, capture_output=True, text=True, env=env, timeout=900)
    try: return json.loads(r.stdout)["result"]
    except Exception: return r.stdout + r.stderr

OPENROUTER = "https://openrouter.ai/api/v1/chat/completions"

def run_openrouter(p, model):
    """A second family through one key. The key lives in ~/.config/cloudchamber/env, never in the repo."""
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise SystemExit("OPENROUTER_API_KEY is not set: source ~/.config/cloudchamber/env")
    body = json.dumps({"model": model, "max_tokens": 4000, "messages": [
        {"role": "system", "content": "You judge stories for listeners. Output only the tags asked for."},
        {"role": "user", "content": p}]}).encode()
    req = urllib.request.Request(OPENROUTER, data=body, method="POST",
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    last = ""
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=900) as r:
                d = json.load(r)
            if d.get("error"):
                last = json.dumps(d["error"])[:400]
                continue
            return d["choices"][0]["message"]["content"] or ""
        except Exception as e:
            last = f"{type(e).__name__}: {e}"[:400]
            time.sleep(4 * (attempt + 1))
    return f"[openrouter failed] {last}"

def run_gemini(p, model):
    args = ["gemini", "-p", "Judge as instructed in the input.", "-o", "json"] + (["-m", model] if model else [])
    r = subprocess.run(args, input=p, capture_output=True, text=True, timeout=900)
    try: return json.loads(r.stdout)["response"]
    except Exception: return r.stdout + r.stderr

def parse(out, flipped):
    def side(v):
        v = v.strip().lower()
        if v.startswith("tie"): return "tie"
        return ("ours" if v.startswith("one") else "source") if not flipped else ("source" if v.startswith("one") else "ours")
    axes = {m[1]: side(m[2]) for m in re.finditer(r'<axis name="(\w+)">\s*(\w+)', out)}
    whys = re.findall(r"<why>(.*?)</why>", out, re.S)
    ov = re.search(r"<overall>\s*(\w+)", out)
    needs = re.search(r"<needs>(.*?)</needs>", out, re.S)
    return {"axes": axes, "whys": [w.strip() for w in whys], "overall": side(ov[1]) if ov else "?", "needs": needs[1].strip() if needs else "", "raw": out}

def main():
    a = argparse.ArgumentParser(); a.add_argument("--ours", required=True); a.add_argument("--source", required=True)
    a.add_argument("--passes", type=int, default=3); a.add_argument("--judge", default="claude", choices=["claude", "gemini", "openrouter"])
    a.add_argument("--model", default="claude-opus-5")
    a.add_argument("--out", default=None)
    args = a.parse_args()
    if args.judge == "openrouter" and args.model == "claude-opus-5":
        raise SystemExit("--judge openrouter needs --model, e.g. google/gemini-3.1-pro-preview")
    ours, source = load(args.ours), load(args.source)
    run = {"gemini": run_gemini, "openrouter": run_openrouter}.get(args.judge, run_claude)
    results = []
    for i in range(args.passes):
        flipped = i % 2 == 1
        one, two = (source, ours) if flipped else (ours, source)
        out = run(prompt(one, two), args.model)
        r = parse(out, flipped); r["flipped"] = flipped; results.append(r)
        print(f"[{args.model}] pass {i+1} ({'source first' if flipped else 'ours first'}): overall {r['overall']}  " + " ".join(f"{k}={v}" for k, v in r["axes"].items()), flush=True)
    wins = sum(1 for r in results if r["overall"] in ("ours", "tie"))
    ok = wins * 2 > len(results)          # a majority; the agreed rule is two of three
    print(f"\nparity: {'yes' if ok else 'no'} ({wins}/{len(results)} passes won or tied)")
    for r in results:
        print("\nneeds:", r["needs"])
    if args.out: json.dump({"ours": args.ours, "source": args.source, "judge": args.judge, "model": args.model, "results": results}, open(args.out, "w"), indent=1)

if __name__ == "__main__": main()
