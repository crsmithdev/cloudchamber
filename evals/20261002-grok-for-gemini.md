# Grok 4.3 takes Gemini 3.1 Pro's place on the panel

2 October. Gemini 3.1 Pro gives our drafts 4.4–5.0 on every axis against
channel F and tells nothing apart there (todo #25). Chris dropped it for a
cheaper judge from a third family. The candidates, in order: Grok 4.3, Kimi
K2.6, MiniMax M3. The first one that is not saturated against channel F is
the new judge. Grok 4.3 passed, so the other two were not run.

Rows in `bank/judgements.jsonl`. The rows of these runs name drafts by the
short id given on the command line (`bf3e`, not `20260930172922-bf3e`); see
todo #34.

## Calibration: the three channel F control pairs, eight passes, both orders

| pair | Gemini 3.1 Pro | GPT-5.1 | Grok 4.3 |
|---|---|---|---|
| `bf3e` v `vs-hIS0zHK8` | +2.31 | +0.55 | +1.28 |
| `17e7` v `qT46_pYAdyk` | +2.80 | +0.67 | +1.44 |
| `69c0` v `vs-hIS0zHK8` | +1.97 | +0.30 | +1.00 (7 passes) |
| axes below 0 | none | hook ×3, clarity ×2, people, momentum | clarity on `17e7` (−0.13, 5 of 8 lost) |
| passes lost, hook / clarity / momentum | 1 / 4 / 1 of 24 | 12 / 15 / 11 of 24 | 7 / 12 / 7 of 23 |
| cost a pass | $0.065 | $0.025 | $0.013 |

Grok ranks the three pairs in GPT-5.1's order (`17e7` > `bf3e` > `69c0`) and
loses passes on the same three axes. It reads about 0.7 higher than GPT-5.1
on each pair and about 1.1 lower than Gemini. It is not saturated.

Experiments: Grok `compare-bf3e-vs-zHK8-mur7mqzg`,
`compare-17e7-vs-Adyk-mur7o5xr`, `compare-69c0-vs-zHK8-mur7piam`; GPT-5.1 and
Gemini `compare-zHK8-vs-bf3e-muoe8y6t`, `compare-Adyk-vs-17e7-muoumhta`,
`compare-zHK8-vs-69c0-muouz6c3`.

## Spread of a pair

For each pair a judge read at eight passes, the two disjoint sets of four
(passes 1–4 and 5–8, each set both orders) against the eight-pass gap.
The deviation |set − pooled| is half the difference of the two sets, so its
spread is the error of the pooled gap itself.

| judge | pairs | median | p90 | max |
|---|---|---|---|---|
| GPT-5.1, the 18 pairs Grok also read | 18 | 0.06 | 0.27 | 0.27 |
| Grok 4.3 | 18 | 0.10 | 0.28 | 0.38 |
| GPT-5.1 + Grok 4.3, four a judge against eight a judge | 18 | 0.05 | 0.15 | 0.29 |
| GPT-5.1 + Gemini 3.1 Pro, the same measure | 29 | 0.08 | 0.14 | 0.21 |

The 18 pairs: the three calibration pairs, the twelve of todo #28 and the
three channel L pairs. On the calibration pairs alone, Grok's deviations are
0.03, 0.22 and 0.33; GPT-5.1's are 0.05, 0.27 and 0.27.

## GAP_MARGIN

The pair at eight passes a judge has the same p90 error as the old pair
(0.15 against 0.14), so `GAP_MARGIN` stays at 0.15 for `JUDGES`. One judge
alone needs about 0.27. A run with `--judges openai/gpt-5.1` alone, as the
channel F and channel L runs of 2 October were, reads one pair against 0.27,
not 0.15.

GPT-5.1 and Grok 4.3 disagree on a pair by a median of 0.33 (p90 0.70). Most
of that is level: Grok reads higher against a transcript. On the twelve pairs
of two of our drafts the judges differ by a median of 0.16 and take the same
side on 8 of 12.

## Channel L

Grok on the three channel L pairs of the morning
(`evals/20261002-channel-l.md`): +1.88, +1.95, +2.00 against GPT-5.1's
+1.55, +1.31, +1.59. Grok, like GPT-5.1, loses clarity on `a529` (−1.13, 7
of 8 lost) and hook on `ba9d` (−0.13). Against channel L both judges sit
near +2 on every axis but clarity and hook.

## Cost

$4.21 of OpenRouter for this and todo #28: Grok calibration $0.31, the twelve
pairs $2.15 on GPT-5.1 and $1.50 on Grok, channel L $0.27 on Grok.
