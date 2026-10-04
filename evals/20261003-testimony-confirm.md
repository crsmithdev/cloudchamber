# Testimony against listen on channel F: six briefs, same-brief siblings

3 October (drafts and judging ran 23:47 3 Oct to 00:40 4 Oct UTC). This
run checks the testimony result of `evals/20261003-profiles-testimony-rules-dossier.md`
with more drafts and a fair control. That run had three pairs, one draft a
pair, and listen controls drafted on other briefs under older code. This
run has six F videos, one fresh brief a video, and both arms drafted on
that brief at `787154a` (the #37 fix).

## Method

Channel F had two transcripts. Four more are in the corpus now
(`mcHzyyWUljA`, `afqi57x6z2M`, `LLx1pL08gi0`, `Zl23nJsVDHo`: single stories
with first-person titles, 7,216 to 8,488 words). For each of the six videos:

```
cloudchamber draw --genre horror --sampling tail --shape listen --auto --seed "<title>"
cloudchamber draft <draw> --profile testimony
Drafting.sibling(<draw>, { profile: "listen" })     # the brief and ledger copied, schedule and scenes new
cloudchamber lab compare --arm <video id> --arm <full draw id> --passes 8 --concurrency 2
```

The panel is GPT-5.1 and Grok 4.3, eight passes a judge a pair, both
orders. Twelve pairs, 192 passes. Rows in `bank/judgements.jsonl`. Grok
left three passes on `5b07` and one on `9814` unscored, so the listen
column counts 45 for Grok.

| video | testimony | listen sibling |
|---|---|---|
| `vs-hIS0zHK8` | `20261003234710-a5d2` | `20261003235920-5b07` |
| `qT46_pYAdyk` | `20261003234710-eb18` | `20261004000136-8626` |
| `mcHzyyWUljA` | `20261003234710-fc58` | `20261004000556-066f` |
| `afqi57x6z2M` | `20261003234710-5ecb` | `20261004000114-c3a2` |
| `LLx1pL08gi0` | `20261003234710-63ff` | `20261003235906-e613` |
| `Zl23nJsVDHo` | `20261003234710-b921` | `20261004000022-9814` |

Gap is ours minus the source on the 1–5 scale, pooled over all the passes
of the six pairs. Lost is the passes the source scored higher, out of the
passes that judge completed on that axis.

## Pooled over six briefs

| axis | judge | testimony | listen | testimony − listen |
|---|---|---|---|---|
| **hook** | GPT-5.1 | +0.75, lost 3 of 48 | +0.35, lost 16 of 48 | **+0.40** |
| **hook** | Grok | +1.75, lost 5 of 48 | +0.67, lost 16 of 45 | **+1.08** |
| **clarity** | GPT-5.1 | +1.33, lost 4 of 48 | +0.88, lost 13 of 48 | **+0.46** |
| **clarity** | Grok | +1.67, lost 8 of 48 | +0.56, lost 19 of 45 | **+1.11** |
| momentum | GPT-5.1 | +1.00, lost 1 of 48 | +0.54, lost 13 of 48 | +0.46 |
| momentum | Grok | +1.96, lost 1 of 48 | +0.80, lost 12 of 45 | +1.16 |
| people | GPT-5.1 | +0.79, lost 8 of 48 | +1.00, lost 4 of 48 | **−0.21** |
| people | Grok | +1.38, lost 4 of 48 | +1.18, lost 6 of 45 | +0.20 |
| presence | GPT-5.1 | +0.96, lost 7 of 48 | +0.98, lost 6 of 48 | −0.02 |
| presence | Grok | +2.42, lost 2 of 48 | +2.33, lost 2 of 45 | +0.08 |
| feeling | GPT-5.1 | +0.96, lost 1 of 48 | +0.90, lost 2 of 48 | +0.06 |
| feeling | Grok | +2.00, lost 1 of 48 | +1.84, lost 0 of 45 | +0.16 |
| cost | GPT-5.1 | +0.94, lost 0 of 48 | +0.90, lost 1 of 48 | +0.04 |
| cost | Grok | +2.10, lost 0 of 48 | +2.00, lost 0 of 45 | +0.10 |
| ending | GPT-5.1 | +0.33, lost 13 of 48 | +0.19, lost 15 of 48 | +0.15 |
| ending | Grok | +1.23, lost 8 of 48 | +1.00, lost 7 of 45 | +0.23 |

## By brief: testimony − listen (passes lost: testimony · listen)

| video | judge | hook | clarity | momentum | people | presence | ending |
|---|---|---|---|---|---|---|---|
| `vs-hIS0zHK8` | GPT-5.1 | −0.38 (1 · 0 of 8) | +0.50 (0 · 2) | −0.13 | 0.00 | 0.00 | 0.00 |
| `vs-hIS0zHK8` | Grok | +0.29 (1 of 8 · 0 of 6) | +0.42 | +0.21 | +0.50 | +0.21 | +0.13 |
| `qT46_pYAdyk` | GPT-5.1 | −0.63 (2 · 1) | +1.13 (1 · 5) | +0.38 | −0.38 | −0.13 | −0.13 |
| `qT46_pYAdyk` | Grok | +0.50 (2 · 3) | +1.50 (5 · 8) | +1.38 | −0.38 | 0.00 | −0.25 |
| `mcHzyyWUljA` | GPT-5.1 | +1.63 (0 · 7) | −0.63 (1 · 0) | +0.38 | −0.88 (3 · 0) | −0.25 | 0.00 |
| `mcHzyyWUljA` | Grok | +2.00 (0 · 4) | +0.63 (1 · 2) | +0.75 | −1.00 (1 · 0) | −0.38 | +0.25 |
| `afqi57x6z2M` | GPT-5.1 | −0.13 (0 · 0) | +1.50 (0 · 4) | +1.00 | −0.13 | +0.38 | −0.13 |
| `afqi57x6z2M` | Grok | +1.50 (0 · 3) | +3.25 (0 · 5) | +3.13 | +1.88 (1 · 5) | +0.63 | +0.75 |
| `LLx1pL08gi0` | GPT-5.1 | +1.63 (0 · 7) | −0.50 (2 · 0) | +1.00 | +0.13 | +0.25 | +1.00 (1 · 5) |
| `LLx1pL08gi0` | Grok | +1.38 (2 · 5) | −0.88 (2 · 1) | 0.00 | −0.75 (1 · 0) | −0.13 | 0.00 |
| `Zl23nJsVDHo` | GPT-5.1 | +0.25 (0 · 1) | +0.75 (0 · 2) | +0.13 | 0.00 | −0.38 (7 · 5) | +0.13 |
| `Zl23nJsVDHo` | Grok | +0.57 (0 of 8 · 1 of 7) | +1.39 (0 · 3) | +1.25 | +0.79 | +0.45 | +0.20 |

Feeling and cost move by no more than ±0.5 on any brief.

**The hook and clarity gains hold, and they are past GAP_MARGIN (0.15) on
both judges.** Pooled, hook is +0.40 (GPT-5.1) and +1.08 (Grok), clarity
+0.46 and +1.11. Passes lost to the source fall from 16 to 3 of 48 (GPT-5.1
hook), 16 to 5 (Grok hook), 13 to 4 and 19 to 8 (clarity). By brief, the
gain is not uniform: Grok's hook is up on all six, Grok's clarity on five,
GPT-5.1's clarity on four, and GPT-5.1's hook on three (it is down 0.38 and
0.63 on the two old videos; there the listen siblings open on the event
("The masks came down at 23:52.") or on day one, and GPT-5.1 takes that
over the testimony drafts' self-introduction). The 3 October run had GPT-5.1
listen at −0.21 hook; same-brief listen siblings on this code score +0.35,
so part of that run's gap was the control.

**The cost is people on GPT-5.1: −0.21, passes lost 4 to 8 of 48.** Two
briefs carry it: `fc58` (−0.88 GPT-5.1, −1.00 Grok) and `63ff` on Grok
(−0.75). Grok's pooled people is +0.20. Presence, feeling, cost and ending
are flat or up on both judges; no pooled cell on those axes falls past
the margin. GPT-5.1's ending is weak in both arms (13 and 15 of 48 lost).

## Confounds

- **Length.** The listen siblings run 11,014 to 12,220 words (profile
  10,000); the testimony drafts 7,957 to 8,870 (profile 7,000). F's
  transcripts run 6,665 to 8,488. Part of the clarity and momentum gain can
  be length, not the testimony keys.
- **Person.** Four listen siblings came out third person (3 to 7
  first-person words per 1,000); two came out first person (`c3a2` 55,
  `9814` 53). Every testimony draft is first person (52 to 63). On
  `afqi57x6z2M` both arms are first person and the gain is still the largest
  (Grok clarity +3.25), so the person alone does not explain it.
- **A listen schedule failed shape.** On `fc58`'s brief the listen schedule
  put a screening a week before day 1 in beat 2, and `form.chronology =
  linear` refused it on two tries; the third sibling (`066f`) passed. The
  failed sibling `20261003235759-0e5f` and the second try are left in the store.

## The #37 symptom

No draft's first sentence repeats another's. "I'll start with" appears in
none of the twelve; "the part nobody believes" appears once, mid-draft, in
`5ecb` ("I want to be plain about this because it's the part nobody
believes"). The new pattern is at the level of form: **four of the six
testimony drafts open "My name is <name>."** (`a5d2`, `b921`, `fc58`,
`5ecb`), and the other two open "I'm a <job>" and "I am the woman who…".
The promise line asks the narrator to say who they are within 40 words,
and the drafts answer it the same way. Across briefs, a few short
paragraph openings repeat ("It was not footsteps.", "Nothing was between
us.", "So there it is." in both `b921` and `fc58`); none is a first
sentence.

## Cost

$3.33 by the runs' own estimates, $3.11 by the OpenRouter balance (12.67 to
9.56). Drafting ran on the Claude CLI.

## Follow-ups

| # | item |
|---|---|
| 37 | done at `787154a` |
| 38 | testimony's promise opening makes "My name is X." the first sentence in 4 of 6 drafts |
| 39 | the listen arm runs 11–12k words against F's 7–8.5k; a length-matched listen control |
