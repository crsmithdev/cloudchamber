# The testimony, rules and dossier profiles against channels F, L and S

3 October. Three new drafting profiles, each drafted from three of its
channel's video titles and judged against that video's transcript. The
panel is GPT-5.1 and Grok 4.3, eight passes a judge a pair, both orders,
concurrency 2. Every draft ran on `0056d55` except `73b8`, which ran on
`c7067ed` (that commit changes only the rules schedule ask). Rows in
`bank/judgements.jsonl` on main. Judging cost $3.53 by the OpenRouter
balance ($3.97 by the runs' own estimates): 14 pairs, 224 passes. A few
passes left one axis unscored, so some cells count 7 of 8 or 23 of 24.

## What changed

The hook window, the hook question and the register's time-and-place rule
are keys now (`opening.*`, `clarity.*`, register `teller`, container
`rules`; spec amendment of 3 October). The profiles:

| profile | channel | length | settings beyond listen |
|---|---|---|---|
| `testimony` | F | 7,000 words, 8–11 beats | first person, past, register teller, opening promise, window 40, echo_title, spoken signposts, focal 1 |
| `rules` | L | 6,000 words, 7–10 beats | testimony, and container rules |
| `dossier` | S | 11,000 words, 10–14 beats | register teller, opening promise, spoken signposts, recap; person from the brief |

The lengths come from the transcripts: F 6,665 and 7,447 words; L's rules
stories 5,286, 5,806 and 6,772; S 9,185 to 19,019, five of seven between
11,300 and 14,500.

## Method

The recipe of `evals/20261002-channel-l.md`:

```
cloudchamber draw --genre horror --sampling tail --shape listen --auto --seed "<title>"
cloudchamber draft <draw> --profile <profile>
cloudchamber lab compare --arm <video id> --arm <full draw id> --passes 8 --concurrency 2
```

| profile | video | draft | listen control |
|---|---|---|---|
| testimony | `vs-hIS0zHK8` | `20261003220301-3a58` | `bf3e` (30 Sep) |
| testimony | `qT46_pYAdyk` | `20261003220301-7c78` | `17e7` (1 Oct) |
| testimony | `vs-hIS0zHK8` | `20261003220301-96c4` | `69c0` (1 Oct) |
| rules | `2qk6eDM86NI` | `20261003220301-3413` | `20261003221755-519c`, sibling |
| rules | `E9NNA7zbUv8` | `20261003220301-596c` | `20261003221755-6d8d`, sibling |
| rules | `QAf_39F6h7o` | `20261003220301-73b8` | `a529` (2 Oct) |
| dossier | `-cg2zIQHmUU` | `20261003220301-ffc5` | `20261003221755-f0c5`, sibling |
| dossier | `1a-yLGuSlM0` | `20261003220301-8219` | `20261003221755-f11a`, sibling |
| dossier | `MTpxDdMKSYs` | `20261003220301-8d47` | `20261003221755-3dfd`, sibling |

Channel F has two transcripts in the corpus, so the three testimony draws
repeat the listen baselines' pairing: two on `vs-hIS0zHK8`, one on
`qT46_pYAdyk`. Where no listen draft with both judges' rows existed, the
budget allowed a listen control: a sibling of the profile draft's own brief
(`Drafting.sibling`: the brief copied, the schedule and scenes new), so the
two arms of a pair share the brief. The F controls and `a529` are other
briefs from the same titles, drafted under listen on 30 Sep–2 Oct.

Gap is ours minus the source on the 1–5 scale. Lost is the passes the
source scored higher, out of the passes that judge completed on that axis.

## Testimony against F

| axis | GPT-5.1 testimony | GPT-5.1 listen | Grok testimony | Grok listen |
|---|---|---|---|---|
| **hook** | **+0.58**, lost 3 of 24 | −0.21, lost 12 of 24 | **+1.17**, lost 5 of 24 | +0.83, lost 7 of 23 |
| **clarity** | **+0.96**, lost 2 of 24 | −0.38, lost 15 of 24 | **+1.33**, lost 3 of 24 | +0.13, lost 12 of 23 |
| momentum | +0.92, lost 2 of 24 | +0.08, lost 11 of 24 | +1.63, lost 1 of 24 | +0.52, lost 7 of 23 |
| people | +0.79, lost 2 of 24 | +0.29, lost 7 of 24 | +0.71, lost 7 of 24 | +1.22, lost 1 of 23 |
| presence | +1.13, lost 0 of 24 | +1.33, lost 0 of 24 | +2.63, lost 0 of 24 | +2.39, lost 0 of 23 |
| feeling | +1.00, lost 0 of 24 | +0.92, lost 1 of 24 | +1.83, lost 0 of 24 | +1.74, lost 0 of 23 |
| cost | +1.04, lost 0 of 24 | +1.25, lost 0 of 24 | +2.38, lost 0 of 24 | +2.22, lost 0 of 23 |
| ending | +0.63, lost 2 of 24 | +0.75, lost 1 of 24 | +0.83, lost 7 of 24 | +0.96, lost 3 of 23 |
| mean | +0.88 | +0.51 | +1.56 | +1.25 |

By pair, hook and clarity:

| draft | judge | hook | clarity | mean |
|---|---|---|---|---|
| `3a58` | GPT-5.1 | +0.75 (0 of 8) | +1.25 (0 of 8) | +0.91 |
| `3a58` | Grok | +1.88 (0 of 8) | +2.25 (1 of 8) | +2.11 |
| `7c78` | GPT-5.1 | +1.00 (0 of 8) | +1.00 (0 of 8) | +1.03 |
| `7c78` | Grok | +1.63 (1 of 8) | +0.25 (2 of 8) | +1.34 |
| `96c4` | GPT-5.1 | 0.00 (3 of 8) | +0.63 (2 of 8) | +0.70 |
| `96c4` | Grok | 0.00 (4 of 8) | +1.50 (0 of 8) | +1.23 |

**Both target axes move, on both judges.** GPT-5.1 had given channel F the
hook in 12 of 24 passes and clarity in 15 of 24; it now gives them in 3 and
2. The drafts face outward: 49–64 first-person words and 9–11 "you" words
per 1,000, and each opens on the narrator's work and the wrong thing in its
first two sentences (`7c78`: a ground controller at a space centre, and
something looking at Earth). The 2 October first-person arm had made a
narrator's log; this one did not.

`96c4` ties the hook: its first lines are a name, a seat number and a
casualty count, and the judges take the source's cold image (a crash, then
three moons) over a promise that states facts. The promise at 40 words is
stricter than F itself, whose first wrong thing comes at about 90 words
(`qT46_pYAdyk`) and 200 (`vs-hIS0zHK8`).

**Below listen:** Grok's people (+1.22 to +0.71; passes lost 1 of 23 to 7 of
24, four of them on `7c78`, where the judge reads the cast as procedural)
and Grok's ending (lost 3 of 23 to 7 of 24). GPT-5.1's presence, cost and
ending fall by 0.12 to 0.21 with no more than one more pass lost. One point
of view and fewer quoted lines (8–11 quote marks per 1,000 against 18–45 in
the listen drafts) are the likely cost to people.

## Rules against L

| axis | GPT-5.1 rules | GPT-5.1 listen | Grok rules | Grok listen |
|---|---|---|---|---|
| **hook** | **+1.42**, lost 2 of 24 | +1.29, lost 2 of 24 | **+1.61**, lost 4 of 23 | +1.83, lost 2 of 24 |
| **clarity** | **−0.21**, lost 14 of 24 | −0.38, lost 14 of 24 | **+0.52**, lost 10 of 23 | −0.42, lost 15 of 24 |
| momentum | +1.33, lost 3 of 24 | +1.25, lost 2 of 24 | +1.78, lost 2 of 23 | +1.67, lost 2 of 24 |
| people | +1.79, lost 0 of 24 | +1.88, lost 0 of 24 | +2.17, lost 0 of 23 | +2.13, lost 0 of 24 |
| presence | +1.08, lost 6 of 24 | +1.79, lost 0 of 24 | +2.48, lost 0 of 23 | +2.79, lost 0 of 24 |
| feeling | +1.71, lost 0 of 24 | +1.71, lost 0 of 24 | +2.70, lost 0 of 23 | +2.67, lost 0 of 24 |
| cost | +1.29, lost 0 of 24 | +1.50, lost 0 of 24 | +2.43, lost 0 of 23 | +2.29, lost 0 of 24 |
| ending | +1.54, lost 0 of 24 | +1.67, lost 0 of 24 | +2.00, lost 0 of 23 | +2.38, lost 0 of 24 |
| mean | +1.24 | +1.34 | +1.96 | +1.92 |

| draft | judge | hook | clarity | presence | control, same video: hook / clarity |
|---|---|---|---|---|---|
| `3413` | GPT-5.1 | +1.63 (0 of 8) | +0.38 (3 of 8) | +2.00 | `519c`: +1.38 / +0.63 |
| `3413` | Grok | +2.71 (0 of 7) | +0.43 (3 of 7) | +2.86 | `519c`: +2.38 / +0.75 |
| `596c` | GPT-5.1 | +0.63 (2 of 8) | −0.50 (6 of 8) | −0.75 (6 of 8) | `6d8d`: +0.63 / −1.00 |
| `596c` | Grok | +0.38 (4 of 8) | +1.00 (3 of 8) | +2.38 | `6d8d`: +0.88 / −0.88 |
| `73b8` | GPT-5.1 | +2.00 (0 of 8) | −0.50 (5 of 8) | +2.00 | `a529`: +1.88 / −0.75 |
| `73b8` | Grok | +1.88 (0 of 8) | +0.13 (4 of 8) | +2.25 | `a529`: +2.25 / −1.13 |

**Channel L saturates hook as it did on 2 October, and clarity is still
the axis it keeps.** Rules lifts clarity a little on GPT-5.1 (+0.17, the
same 14 of 24 passes lost) and more on Grok (+0.94, 15 to 10 passes lost),
on all three pairs for Grok. Hook does not move on L: it was +1.29 and
+1.83 under listen. **Below listen:** GPT-5.1's presence (+1.79 to +1.08,
lost 0 to 6 of 24), all six on `596c`: the judge counts the source's one
physical horror a rule against ours, an unseen occupant that leaves an
absence. Grok's hook (−0.22) and ending (−0.38) fall without many lost
passes. `596c` is 5,160 words, the shortest draft, and its schedule set
seven rules for eight beats.

## Dossier against S

| axis | GPT-5.1 dossier | GPT-5.1 listen | Grok dossier | Grok listen |
|---|---|---|---|---|
| **hook** | **+0.71**, lost 4 of 24 | +0.33, lost 9 of 24 | **+2.29**, lost 0 of 24 | +2.09, lost 1 of 23 |
| **clarity** | **+1.71**, lost 0 of 24 | +1.75, lost 0 of 24 | **+2.00**, lost 1 of 24 | +1.13, lost 6 of 23 |
| momentum | +1.00, lost 2 of 24 | +0.67, lost 7 of 24 | +2.33, lost 0 of 24 | +1.78, lost 3 of 23 |
| people | +0.50, lost 7 of 24 | +0.71, lost 6 of 24 | +2.08, lost 0 of 24 | +2.00, lost 0 of 23 |
| presence | +1.42, lost 1 of 24 | +1.58, lost 0 of 24 | +2.71, lost 0 of 24 | +2.83, lost 0 of 23 |
| feeling | +0.13, lost 9 of 24 | −0.08, lost 10 of 24 | +2.29, lost 0 of 24 | +2.04, lost 0 of 23 |
| cost | −0.63, lost 16 of 24 | −0.63, lost 16 of 24 | +1.54, lost 0 of 24 | +1.52, lost 1 of 23 |
| ending | +0.04, lost 11 of 24 | −0.25, lost 14 of 24 | +2.04, lost 2 of 24 | +1.43, lost 2 of 23 |
| mean | +0.61 | +0.51 | +2.16 | +1.85 |

| draft | judge | hook | clarity | control (sibling): hook / clarity |
|---|---|---|---|---|
| `ffc5` | GPT-5.1 | 0.00 (4 of 8) | +1.88 (0 of 8) | `f0c5`: −0.75 (7 of 8) / +1.88 |
| `ffc5` | Grok | +2.25 (0 of 8) | +2.50 (0 of 8) | `f0c5`: +1.75 / +1.63 |
| `8219` | GPT-5.1 | +1.13 (0 of 8) | +1.63 (0 of 8) | `f11a`: +1.38 / +2.00 |
| `8219` | Grok | +2.25 (0 of 8) | +1.75 (1 of 8) | `f11a`: +2.63 / +1.13 |
| `8d47` | GPT-5.1 | +1.00 (0 of 8) | +1.63 (0 of 8) | `3dfd`: +0.38 / +1.38 |
| `8d47` | Grok | +2.38 (0 of 8) | +1.75 (0 of 8) | `3dfd`: +1.86 / +0.57 |

**On S the hook moves on GPT-5.1 (+0.38, lost 9 to 4 of 24) and clarity on
Grok (+0.87, lost 6 to 1).** The other two cells were at saturation under
listen. The two arms share each brief, so this is the profile and not the
brief. The listen siblings came out third person on all three briefs; two
of the three dossier drafts came out first person (68 and 72 first-person
words per 1,000), the third (`8219`) mixes a first-person teller with a
schedule that says third person limited. **Below listen:** GPT-5.1's people
(−0.21, one more pass lost) and presence (−0.16). Cost is S's on GPT-5.1 in
both arms (16 of 24).

## Faults seen in the drafts

- **The register's own example is copied.** `sceneTeller` gives one example
  of a teller's line ("I'll start with the part nobody believes"). Four of
  the nine drafts say it or a close variant, two of them as their first
  sentence (`ffc5`, `8219`). Across drafts this is a catchphrase. Todo #37.
- **Teller against a third-person brief.** `dossier` leaves person to the
  brief; `8219`'s schedule chose third person, and its first beat opens in
  the first person because the register asks for a narrator who speaks to
  "you". Todo #37.
- **A rules schedule failed shape once.** `73b8`'s first schedule stated its
  container as "a numbered flight-rule card", which the fixed-axis check does
  not read as `rules`. The schedule ask now says the form line names rules
  (`c7067ed`); the second try passed.

## What this is not

- Three pairs a profile, one draft a pair. The halves of one pair still
  spread by about ±0.3, so a per-pair cell carries that much.
- The F and the `a529` controls are other briefs drafted on 30 Sep–2 Oct
  under earlier code; only the five siblings share a brief with their
  profile draft.
- Each profile changes several keys at once. Which key moved the hook or
  clarity is not separated.

## Follow-ups

| # | item |
|---|---|
| 9 | done: the hook window and the opening are keys; testimony moves F's hook on both judges |
| 33 | note: `testimony` and `rules` fix first person; `listen` still does not |
| 35 | the restated screen flags a rule said again under the rules container |
| 37 | the teller register's example is copied into drafts; teller against a third-person brief |
