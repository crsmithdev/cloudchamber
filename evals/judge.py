#!/usr/bin/env python3
"""Blind pairwise judge for a narrated listen; the parity rule is in the run write-ups under evals/.

  judge.py --ours <draw-id | file> --source <transcript.json | file> [--passes 3] [--judge claude|gemini] [--model M]

Both texts are shown as unlabelled transcripts, Story One and Story Two, with
the order swapped on alternate passes. The judge answers each rubric axis with
One, Two or Tie and a 1-5 score for each story, then an overall call. Parity:
ours wins or ties overall in at least two of three passes.

Two drafts of one brief sit below what a pairwise call against a narrated
source can separate, and most judges pick whichever story they read first, so
a head to head runs an even number of passes, half in each order, and only a
result that holds in both orders counts. `--degrade` judges a draft against a
damaged copy of itself: a panel that cannot tell those apart cannot rank
anything finer.
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
        # flags=0: the scenes alone. With flags on, the text carries every screen note after its beat,
        # about a sixth of the words on a twelve-beat draft, and the judges read them as part of the story.
        return json.load(urllib.request.urlopen(f"http://127.0.0.1:80/api/draws/{src}/story?flags=0"))["text"]
    if src.endswith(".json"):
        t = json.load(open(src)); text = " ".join(x["text"] for x in t["snippets"])
        i = text.find("Let's dive into today's story")
        if 0 <= i < 3000: text = text[i + 30:]
        text = re.sub(r"^\s*(Sub subscribe\.?|Subscribe\.?)\s*", "", text)
        return text
    return open(src).read()

DEGRADES = {
    # the flaw the judges name most: a moment summarised instead of played out
    "summary": lambda t: "\n\n".join(p.split(". ")[0].strip().rstrip(".") + "." for p in t.split("\n\n") if p.strip()),
    # the ending a listener is left with, cut away
    "truncate": lambda t: "\n\n".join(t.split("\n\n")[: max(1, int(len(t.split("\n\n")) * 0.75))]),
}

def degrade(text, mode):
    """A deliberately damaged copy of a draft, for calibrating the panel."""
    return DEGRADES[mode](text)

def prompt(one, two):
    qs = "\n".join(f"{k}: {q}" for k, q in RUBRIC)
    return f"""Two stories written to be read aloud by one narrator on a long-form story channel, given here as plain transcripts. One or both may carry transcription errors (misheard words, missing punctuation); ignore those and judge what a listener would hear.

<story_one>
{one}
</story_one>

<story_two>
{two}
</story_two>

Judge them as a listener who has forty minutes in the car and many channels to choose from. For each question answer One, Two or Tie, and score each story on that question from 1 (poor) to 5 (as good as the best you have heard), with one sentence of evidence that names a moment from each story. The scores are absolute: two stories may both score low, or both high. Then give an overall call, One, Two or Tie, and three sentences on what the weaker one would need.

{qs}

Output exactly this shape and nothing else:
<verdict>
<axis name="hook" one="N" two="N">One|Two|Tie</axis> ...one line per axis in the order given, each followed by <why>one sentence</why>
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
    body = json.dumps({"model": model, "max_tokens": 16000, "reasoning": {"effort": "low"}, "messages": [
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

def complete(r):
    """Every axis answered and an overall given. A thinking model can spend its budget before it answers; a truncated reply is a failed call, never a verdict."""
    return len(r["axes"]) == len(RUBRIC) and r["overall"] in ("ours", "source", "tie")

def parse(out, flipped):
    def side(v):
        v = v.strip().lower()
        if v.startswith("tie"): return "tie"
        return ("ours" if v.startswith("one") else "source") if not flipped else ("source" if v.startswith("one") else "ours")
    axes, scores = {}, {}
    for m in re.finditer(r'<axis name="(\w+)"([^>]*)>\s*(\w+)', out):
        axes[m[1]] = side(m[3])
        got = {k: int(v) for k, v in re.findall(r'(one|two)="(\d)"', m[2])}
        if len(got) == 2:
            scores[m[1]] = {"ours": got["two" if flipped else "one"], "source": got["one" if flipped else "two"]}
    whys = re.findall(r"<why>(.*?)</why>", out, re.S)
    ov = re.search(r"<overall>\s*(\w+)", out)
    needs = re.search(r"<needs>(.*?)</needs>", out, re.S)
    return {"axes": axes, "scores": scores, "whys": [w.strip() for w in whys], "overall": side(ov[1]) if ov else "?", "needs": needs[1].strip() if needs else "", "raw": out}

def main():
    a = argparse.ArgumentParser(); a.add_argument("--ours", required=True); a.add_argument("--source", default=None)
    a.add_argument("--passes", type=int, default=4); a.add_argument("--judge", default="claude", choices=["claude", "gemini", "openrouter"])
    a.add_argument("--model", default="claude-opus-5")
    a.add_argument("--out", default=None)
    a.add_argument("--degrade", choices=sorted(DEGRADES), default=None,
                   help="judge --ours against a damaged copy of itself; --source is then ignored")
    args = a.parse_args()
    if args.judge == "openrouter" and args.model == "claude-opus-5":
        raise SystemExit("--judge openrouter needs --model, e.g. google/gemini-3.1-pro-preview")
    if not args.source and not args.degrade:
        raise SystemExit("--source is required unless --degrade names a damage to judge against")
    if args.passes % 2:
        print(f"  note: {args.passes} passes is odd, so one reading order gets one more; most judges follow the order", flush=True)
    ours = load(args.ours)
    source = degrade(ours, args.degrade) if args.degrade else load(args.source)
    run = {"gemini": run_gemini, "openrouter": run_openrouter}.get(args.judge, run_claude)
    results = []
    for i in range(args.passes):
        flipped = i % 2 == 1
        one, two = (source, ours) if flipped else (ours, source)
        for attempt in range(3):
            r = parse(run(prompt(one, two), args.model), flipped)
            if complete(r):
                break
            print(f"  pass {i+1} attempt {attempt+1} incomplete ({len(r['axes'])}/{len(RUBRIC)} axes); retrying", flush=True)
        r["flipped"] = flipped; r["complete"] = complete(r); results.append(r)
        print(f"[{args.model}] pass {i+1} ({'source first' if flipped else 'ours first'}): overall {r['overall']}  " + " ".join(f"{k}={v}" for k, v in r["axes"].items()), flush=True)
    scored = [r for r in results if r["complete"]]
    wins = sum(1 for r in scored if r["overall"] in ("ours", "tie"))
    ok = bool(scored) and wins * 2 > len(scored)   # a majority of the passes that answered
    dropped = len(results) - len(scored)
    print(f"\nparity: {'yes' if ok else 'no'} ({wins}/{len(scored)} passes won or tied"
          + (f", {dropped} dropped as incomplete" if dropped else "") + ")")
    # the absolute scores, averaged per axis: what a pairwise call cannot show when both sit at the ceiling
    rows = [(k, [r["scores"][k] for r in scored if k in r.get("scores", {})]) for k, _ in RUBRIC]
    if any(v for _, v in rows):
        print("\nscores, 1-5, mean over the passes that gave them:")
        for k, v in rows:
            if v: print(f"  {k:<9} ours {sum(x['ours'] for x in v) / len(v):.1f}   {'damaged' if args.degrade else 'source'} {sum(x['source'] for x in v) / len(v):.1f}   ({len(v)} passes)")
    for r in results:
        print("\nneeds:", r["needs"])
    if args.out: json.dump({"ours": args.ours, "source": args.source, "degrade": args.degrade, "judge": args.judge, "model": args.model, "results": results}, open(args.out, "w"), indent=1)

if __name__ == "__main__": main()
