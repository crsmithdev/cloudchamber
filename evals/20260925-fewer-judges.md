# Fewer judges: re-pooling 24 September without each judge

25 September. Step 6 of `2026-09-24-the-plan-by-goal.md`.

This analysis re-pools every stored experiment of 24 September from
`bank/judgements.jsonl` without each judge in turn. It evaluates whether any
judge can be removed while preserving reading directions.

## Protocol

1. Read all rows from `bank/judgements.jsonl` recorded on 24 September.
2. Group the rows by `experiment` and by arm pair.
3. Compute the score gap using `scoreGap` from `app/pipeline/lab/pool.ts`:
   mean of `ours − source` across all axes of all completed passes.
4. Threshold using `GAP_MARGIN = 0.15`:
   - `+` when gap > +0.15
   - `−` when gap < −0.15
   - `inside` when −0.15 ≤ gap ≤ +0.15
5. A judge can go if its absence leaves every reading on the side it had with
   all judges.

## Re-pooling table

| Experiment | Arm pair | Kind | Passes | All judges | Without Gemini 3.1 Pro | Without GLM-4.7 | Without GPT-5.1 |
|---|---|---|---|---|---|---|---|
| `20260924-l1-beat1-5bfc-48ec` | 5bfc vs 48ec | floor | 12 | +0.31 (+) | +0.35 (+) ✓ | +0.29 (+) ✓ | +0.27 (+) ✓ |
| `20260924-l1-beat1-5bfc-48ec-x24` | 5bfc vs 48ec | floor | 69 | +0.30 (+) | +0.39 (+) ✓ | +0.26 (+) ✓ | +0.25 (+) ✓ |
| `20260924-l2-floor-cut2-cut3-x24` | cut2 vs cut3 | floor | 70 | +0.07 (inside) | +0.08 (inside) ✓ | +0.06 (inside) ✓ | +0.07 (inside) ✓ |
| `20260924-register-cut-x24` | cut1 vs cut2 | floor | 68 | −0.22 (−) | −0.21 (−) ✓ | −0.22 (−) ✓ | −0.21 (−) ✓ |
| `20260924-register-cut-x24` | cut1 vs cut3 | floor | 72 | −0.39 (−) | −0.31 (−) ✓ | −0.43 (−) ✓ | −0.42 (−) ✓ |
| `20260924-register-cut-x24` | cut1 vs fix1 | comparison | 70 | −0.40 (−) | −0.38 (−) ✓ | −0.46 (−) ✓ | −0.37 (−) ✓ |
| `20260924-register-cut-x24` | cut2 vs fix2 | comparison | 71 | +0.03 (inside) | +0.06 (inside) ✓ | +0.03 (inside) ✓ | −0.02 (inside) ✓ |
| `20260924-register-cut-x24` | cut3 vs fix3 | comparison | 70 | −0.28 (−) | −0.24 (−) ✓ | −0.24 (−) ✓ | −0.36 (−) ✓ |
| `best-20260921145735-c933-mug3k4g4` | c933 vs f8bc | rank | 72 | +0.08 (inside) | +0.10 (inside) ✓ | +0.06 (inside) ✓ | +0.07 (inside) ✓ |
| `20260924-vof-before-after` | f8ab vs vs-hIS0zHK8 | comparison | 12 | +0.31 (+) | −0.17 (−) ✗ | +0.55 (+) ✓ | +0.56 (+) ✓ |
| `20260924-vof-before-after` | d83e vs vs-hIS0zHK8 | comparison | 12 | +0.54 (+) | +0.25 (+) ✓ | +0.52 (+) ✓ | +0.86 (+) ✓ |
| `20260924-vof-before-after` | 7797 vs vs-hIS0zHK8 | comparison | 12 | +0.73 (+) | +0.34 (+) ✓ | +0.77 (+) ✓ | +1.08 (+) ✓ |
| `20260924-vof-before-after` | c933 vs vs-hIS0zHK8 | comparison | 12 | +0.10 (inside) | −0.45 (−) ✗ | +0.33 (+) ✗ | +0.44 (+) ✗ |
| `20260924-vof-before-after` | d0fd vs vs-hIS0zHK8 | comparison | 12 | +0.09 (inside) | −0.20 (−) ✗ | +0.20 (+) ✗ | +0.28 (+) ✗ |
| `20260924-vof-before-after` | 3cee vs vs-hIS0zHK8 | comparison | 12 | +0.44 (+) | +0.05 (inside) ✗ | +0.50 (+) ✓ | +0.77 (+) ✓ |
| `20260924-vof-before-after` | 686f vs vs-hIS0zHK8 | comparison | 12 | +0.09 (inside) | −0.41 (−) ✗ | +0.28 (+) ✗ | +0.41 (+) ✗ |
| `20260924-vof-before-after` | b7e7 vs vs-hIS0zHK8 | comparison | 12 | +0.67 (+) | +0.09 (inside) ✗ | +0.84 (+) ✓ | +1.06 (+) ✓ |
| `20260924-tc-vs-vox-mortis` | f20a vs N3-KWeuzKko | comparison | 12 | +2.58 (+) | +2.27 (+) ✓ | +2.69 (+) ✓ | +2.80 (+) ✓ |
| `20260924-tc-vs-vox-mortis` | 9c02 vs N3-KWeuzKko | comparison | 12 | +2.70 (+) | +2.45 (+) ✓ | +2.70 (+) ✓ | +2.94 (+) ✓ |
| `20260924-tc-vs-vox-mortis` | de03 vs N3-KWeuzKko | comparison | 12 | +2.60 (+) | +2.31 (+) ✓ | +2.70 (+) ✓ | +2.80 (+) ✓ |
| `20260924-tc-vs-vox-mortis` | 9c02 vs n6Oe2iRVRnA | comparison | 12 | +2.76 (+) | +2.47 (+) ✓ | +2.73 (+) ✓ | +3.08 (+) ✓ |

## Experiment means

For experiments with multiple arm pairs:

| Experiment | Passes | All judges | Without Gemini 3.1 Pro | Without GLM-4.7 | Without GPT-5.1 |
|---|---|---|---|---|---|
| `20260924-register-cut-x24` | 360 | −0.25 (−) | −0.22 (−) ✓ | −0.26 (−) ✓ | −0.27 (−) ✓ |
| `20260924-vof-before-after` | 96 | +0.37 (+) | −0.06 (inside) ✗ | +0.50 (+) ✓ | +0.68 (+) ✓ |
| `20260924-tc-vs-vox-mortis` | 48 | +2.66 (+) | +2.38 (+) ✓ | +2.71 (+) ✓ | +2.90 (+) ✓ |

## Verdicts per judge

| Judge | Match rate | Can judge go? | Rationale |
|---|---|---|---|
| **Gemini 3.1 Pro** | 15 / 21 groups (71%) | **No** | In `20260924-vof-before-after`, removing Gemini changes the side of 6 of 8 groups. `f8ab` flips from positive (+0.31) to negative (−0.17). Three pairs move from inside the margin to negative (`c933`, `d0fd`, `686f`), and two positive pairs drop into the margin (`3cee`, `b7e7`). |
| **GLM-4.7** | 18 / 21 groups (86%) | **No under strict per-pair test; Yes under experiment-mean reading** | On all 24-pass runs (8 groups) and all Vox Mortis runs (4 groups), GLM-4.7 matches on 12 of 12 groups. On 4-pass Void of Fears runs, 5 pairs keep side `+`, while 3 pairs (`c933`, `d0fd`, `686f`) move from inside the margin to `+` because Gemini gives strong positive scores. Read as an experiment mean over Void of Fears, the reading holds side `+` (+0.37 with all judges vs +0.50 without GLM). |
| **GPT-5.1** | 18 / 21 groups (86%) | **No** | Matches on 18 of 21 groups. Like GLM-4.7, its absence shifts the three inside-margin Void of Fears pairs to positive (+0.28 to +0.44). |
