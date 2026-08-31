#!/usr/bin/env python3
"""Score a judge run against the answer key. Usage: score.py <key.json> <judge.json>

The key is either pairs.json (built by build.py) or control_key.json.
Reports accuracy excluding ties, the tie rate, per-degradation detection,
order consistency where both orders are present, and the decoy tie rate,
which is the control: a judge that never ties on decoys is manufacturing
distinctions and its accuracy means nothing.
"""
import json, sys, collections

key = {i.get('pair_id'): i for i in json.load(open(sys.argv[1]))}
run = {r['pair_id']: r['choice'] for r in json.load(open(sys.argv[2]))}

def intact_of(k):
    return k.get('intact') or k.get('_intact')
def deg_of(k):
    return k.get('degradation') or k.get('_deg')
def kind_of(k):
    return k.get('_kind', 'real')

real = [(p, c) for p, c in run.items() if kind_of(key[p]) == 'real']
dec  = [(p, c) for p, c in run.items() if kind_of(key[p]) == 'decoy']

ties = sum(1 for _, c in real if c == 'TIE')
ok   = sum(1 for p, c in real if c == intact_of(key[p]))
n    = len(real)
print(f"real pairs   : {ok}/{n} correct, {ties} ties -> acc {ok/(n-ties):.3f}" if n - ties else "no scorable pairs")
print(f"position bias: {100*sum(1 for _,c in real if c=='A')/n:.0f}% A")

if dec:
    dt = sum(1 for _, c in dec if c == 'TIE')
    print(f"decoy ties   : {dt}/{len(dec)} ({100*dt/len(dec):.0f}%)  <- must be well above zero")

per = collections.defaultdict(lambda: [0, 0])
for p, c in real:
    d = deg_of(key[p]); per[d][1] += 1; per[d][0] += (c == intact_of(key[p]))
print("\nby degradation:")
for d, (a, b) in sorted(per.items()):
    print(f"  {d:<24} {a:>2}/{b:<2}  {100*a/b:3.0f}%")

both = collections.defaultdict(dict)
for p, c in real:
    if p.endswith('__o0') or p.endswith('__o1'):
        both[p[:-4]][p[-1]] = (c, intact_of(key[p]))
if both:
    cons = sum(1 for v in both.values() if len(v) == 2 and
               (v['0'][0] == v['0'][1]) == (v['1'][0] == v['1'][1]))
    print(f"\norder consistency: {cons}/{len(both)} = {100*cons/len(both):.0f}%")
