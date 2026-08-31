#!/usr/bin/env python3
"""Rebuild the blind judge sets from the corpus. Deterministic; seeds are fixed
so a rerun reproduces the same sets and old runs stay comparable.

  build.py pairs    -> corpus/pairs.json (key) + corpus/pairs_blind.json
  build.py control  -> runs/control_key.json + corpus/control_blind.json

`pairs` is every degradation in both orders: exhaustive, but large enough that a
judge shown all of it at once can infer the ablation design (see README test 3).
`control` is the set to actually trust — a subset interleaved with slate-vs-slate
decoys that carry no correct answer, so the tie rate on decoys reveals a judge
that is manufacturing distinctions.
"""
import json, random, sys

slate = {s['id']: s['text'] for s in json.load(open('corpus/slate.json'))}
deg = json.load(open('corpus/degraded.json'))
mode = sys.argv[1] if len(sys.argv) > 1 else 'control'

if mode == 'pairs':
    random.seed(20260831)
    out = []
    for d in deg:
        for o in (0, 1):
            base = slate[d['base_id']]
            A, B = (base, d['text']) if o == 0 else (d['text'], base)
            out.append({"pair_id": f"{d['id']}__o{o}", "A": A, "B": B,
                        "intact": "A" if o == 0 else "B",
                        "degradation": d['degradation'], "base_id": d['base_id']})
    random.shuffle(out)
    json.dump(out, open('corpus/pairs.json', 'w'), indent=1)
    json.dump([{k: v for k, v in p.items() if k in ('pair_id', 'A', 'B')} for p in out],
              open('corpus/pairs_blind.json', 'w'), indent=1)
    print(f"{len(out)} pairs written")

else:
    random.seed(7)
    bases = {d['base_id'] for d in deg}
    per, seen, items = list(deg), {}, []
    random.shuffle(per)
    for d in per:                      # 3 of each degradation, spread over bases
        if seen.get(d['degradation'], 0) < 3:
            seen[d['degradation']] = seen.get(d['degradation'], 0) + 1
            o = random.randint(0, 1)
            base = slate[d['base_id']]
            A, B = (base, d['text']) if o == 0 else (d['text'], base)
            items.append({"pair_id": f"{d['id']}__c{o}", "A": A, "B": B, "_kind": "real",
                          "_intact": "A" if o == 0 else "B", "_deg": d['degradation']})
    pool = [i for i in slate if i not in bases]   # decoys never touch a degraded base
    random.shuffle(pool)
    for i in range(18):
        items.append({"pair_id": f"decoy-{i:02d}", "A": slate[pool[i]],
                      "B": slate[pool[(i + 1) % len(pool)]],
                      "_kind": "decoy", "_intact": None, "_deg": None})
    random.shuffle(items)
    json.dump(items, open('runs/control_key.json', 'w'), indent=1)
    json.dump([{k: v for k, v in i.items() if not k.startswith('_')} for i in items],
              open('corpus/control_blind.json', 'w'), indent=1)
    print(f"{len(items)} items: {sum(1 for i in items if i['_kind']=='real')} real, "
          f"{sum(1 for i in items if i['_kind']=='decoy')} decoy")
