#!/usr/bin/env python3
"""Pool the runs of a panel, weighting each judge by how little it follows the reading order.

  tally.py <judge json>...  [--floor <judge json>...]

Every judge tends to take the story it reads first: over the runs of 22 September
that was about four passes in five, whether or not the two drafts differed. So a
judge's weight here is 1 - (passes where it took the first read) / (its passes),
and a judge that always takes the first read counts for nothing. `--floor` takes
the runs of a within-arm pair — two drafts by one code — which is the noise floor
the result has to clear.
"""
import argparse, glob, json, os, statistics as st

AX = ["hook", "presence", "people", "feeling", "cost", "ending", "clarity", "momentum"]

def load(paths):
    runs = []
    for p in paths:
        for f in sorted(glob.glob(p)):
            j = json.load(open(f))
            rs = [r for r in j["results"] if r["complete"]]
            if rs: runs.append({"model": j["model"], "file": os.path.basename(f), "results": rs})
    return runs

def followed(r):
    """A run written before judge.py recorded it: the pass took the story it read first."""
    return r["followed_order"] if "followed_order" in r else r["overall"] == ("source" if r["flipped"] else "ours")

def follow_rate(runs, model):
    rs = [r for run in runs if run["model"] == model for r in run["results"]]
    return sum(1 for r in rs if followed(r)) / len(rs), len(rs)

def report(runs, label):
    if not runs: return None
    models = sorted({r["model"] for r in runs})
    print(f"\n== {label}: {sum(len(r['results']) for r in runs)} passes, {len(models)} judges")
    weighted = num = 0.0
    for m in models:
        rate, n = follow_rate(runs, m)
        weight = round(1 - rate, 2)
        rs = [r for run in runs if run["model"] == m for r in run["results"]]
        wins = sum(1 for r in rs if r["overall"] == "ours") + 0.5 * sum(1 for r in rs if r["overall"] == "tie")
        second = [r for r in rs if r["flipped"]]
        won2 = sum(1 for r in second if r["overall"] == "ours")
        print(f"  {m.split('/')[-1]:<24} ours {wins:>4.1f}/{len(rs):<3} · read second {won2}/{len(second)} · took the first read {rate:.0%} · weight {weight:.2f}")
        weighted += weight * wins / len(rs); num += weight
    share = weighted / num if num else float("nan")
    print(f"  weighted share to ours: {share:.2f}" + ("   (every judge simply took the first read)" if not num else ""))
    rs = [r for run in runs for r in run["results"]]
    sc = {a: ([r["scores"][a]["ours"] for r in rs if a in r.get("scores", {})],
              [r["scores"][a]["source"] for r in rs if a in r.get("scores", {})]) for a in AX}
    if any(o for o, _ in sc.values()):
        print("  scores 1-5:", "  ".join(f"{a} {st.mean(o):.2f}/{st.mean(s):.2f}" for a, (o, s) in sc.items() if o))
    return share

def main():
    a = argparse.ArgumentParser()
    a.add_argument("runs", nargs="+")
    a.add_argument("--floor", nargs="*", default=[])
    args = a.parse_args()
    share = report(load(args.runs), "the comparison")
    floor = report(load(args.floor), "the noise floor (two drafts by one code)") if args.floor else None
    if share is not None and floor is not None:
        print(f"\nours {share:.2f} against a floor of {floor:.2f}: "
              + ("clears the floor" if share - floor > 0.1 else "inside the floor, so this says nothing yet"))

if __name__ == "__main__": main()
