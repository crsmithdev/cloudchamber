# Evaluation run — the same change, drafted three times a side

Run 2026-09-22 (night). `evals/20260922-stage2.md` judged one pair of drafts
and read the cast-and-caps change as a win, 16 of 20. This run drafts the same
brief (`20260922134631-ad7c`) three times on each side and judges matched
pairs, four passes each, half in each reading order, by Gemini 3.1 Pro, GLM-4.7
and GPT-5.1.

## The single pair was luck

| | one pair | three pairs |
|---|---|---|
| passes | 20 | 36 |
| the new drafts won | 16 | **13** |
| read second | 6 of 10 | **1 of 18** |

The noise floor says why a single pair could not settle it: two drafts by the
**same code**, judged the same way, split 12–3 to whichever was read first over
16 passes. Across the arms the split was 29–7, the same 81%.

## Mean scores, pooled per draft

| axis | old | new (caps) | fix |
|---|---|---|---|
| ending | 4.57 | 4.11 | **4.68** |
| hook | 4.04 | 3.87 | **4.38** |
| momentum | 4.18 | 4.03 | **4.43** |
| feeling | 4.32 | 4.25 | **4.48** |
| people | 4.03 | 4.09 | **4.34** |
| cost | 4.82 | 4.63 | **4.86** |
| presence | 4.31 | **4.48** | 4.40 |
| clarity | **4.27** | 4.23 | 4.19 |
| all axes | 4.32 | 4.21 | **4.47** |

The caps change lost on one axis and one only: **ending**, 4.57 → 4.11, with no
overlap between the arms (every old draft 4.50+, every new draft 4.30−).

## The cause, in the schedules

The length budget is fixed, so raising the paying beat to 1,100 words took the
words from the last beat:

| | last beat ÷ median | last beat words |
|---|---|---|
| old | 0.86, 0.87, 0.93 | 675, 699, 759 |
| caps change | 0.71, 0.75, 0.81 | 535, 586, 741 |
| after the fix | 1.00, 1.06, 1.10 | 809, 861, 925 |

## The fix holds

`e2a292b` holds the last beat at the median beat's words or above. Three drafts
with it, against the same three old drafts, 36 passes:

- **26 of 36**, and **9 of 18 read second**, where the caps change managed 1 of
  18 and the noise floor is about 3 of 16.
- Ending **4.68** against 4.14, hook +0.50, momentum +0.46, every axis but
  clarity above the old arm.
- Every one of the three fix drafts scores 4.44 or better over all axes; the
  best old draft scores 4.48 and the other two 4.22 and 4.25.

## Cost

| arm | cost | wall | register rewrites |
|---|---|---|---|
| old | $9.13 | 36 min | 2, 9, 5 |
| caps change | $6.84 | 27 min | 3, 1, 3 |
| fix | $7.67 | 31 min | 3, 2, 5 |

The single pair had said the caps change cost $1.87 more; three a side say it
costs $2.29 less, and the fix gives some of that back. The old arm's spread
($6.90 to $12.15) is wider than any difference between the arms.

## What this changes about how to measure

- One pair of drafts cannot settle a prompt change: the reading order decides
  about four passes in five, and a pair can land either way inside that.
- Three a side, matched, both orders, with the absolute scores pooled per
  draft, separated a real effect (ending, and then the fix) from noise.
- The within-arm pair is worth its cost: it is the only thing that says what
  the floor is.
