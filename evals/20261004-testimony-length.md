# Testimony against a length-matched listen control, and the promise opening without a name

4 October (drafts 04:06 UTC, judging to about 06:00 UTC). This run closes two
follow-ups of `evals/20261003-testimony-confirm.md`:

- **#39.** The listen siblings of that run ran about 10,000 words and the
  testimony drafts about 7,000. This run drafts a third arm, listen at
  testimony's length, on the same six briefs, and judges it.
- **#38.** Four of the six testimony drafts opened "My name is X." The
  promise opening now asks for the narrator's situation and the wrong
  thing, and says that the opening does not introduce the narrator by name
  (`9690d80`). This run drafts testimony again on the same six briefs and
  judges it.

## Method

All twelve new drafts are siblings of the six testimony draws of 3 October
(`Drafting.sibling`: the brief and ledger copied, the schedule and scenes
new), drafted at `9690d80`:

```
Drafting.sibling(<testimony draw>, { profile: "listen", overrides: { "length.words": 7000, "beats.min": 8, "beats.max": 11, "beats.words_max": 1000 } })
Drafting.sibling(<testimony draw>, { profile: "testimony" })
cloudchamber lab compare --arm <video id> --arm <full draw id> --passes 8 --concurrency 2
```

The overrides are testimony's length keys in `draft.toml`. Everything else in
the listen arm is the listen profile: the signal register, the scene
opening at a 150-word window, person and tense from the brief. The panel is
GPT-5.1 and Grok 4.3, eight passes a judge a pair, both orders. Twelve
pairs, 192 passes, rows in `bank/judgements.jsonl` on main.

| video | testimony (3 Oct) | listen long (3–4 Oct) | listen matched (new) | testimony after #38 (new) |
|---|---|---|---|---|
| `vs-hIS0zHK8` | `20261003234710-a5d2` | `20261003235920-5b07` | `20261004040638-a213` | `20261004040638-4a09` |
| `qT46_pYAdyk` | `20261003234710-eb18` | `20261004000136-8626` | `20261004040639-e89d` | `20261004040638-5fdd` |
| `mcHzyyWUljA` | `20261003234710-fc58` | `20261004000556-066f` | `20261004040639-c58f` | `20261004040638-d7ef` |
| `afqi57x6z2M` | `20261003234710-5ecb` | `20261004000114-c3a2` | `20261004040639-6136` | `20261004040638-0519` |
| `LLx1pL08gi0` | `20261003234710-63ff` | `20261003235906-e613` | `20261004040640-a931` | `20261004040638-e703` |
| `Zl23nJsVDHo` | `20261003234710-b921` | `20261004000022-9814` | `20261004040640-6014` | `20261004040639-8b35` |

Length, by one whitespace word count over the judged text for every arm
(this count gives F's transcripts the 6,665–8,367 words of the 3 October
file, but gives the 3 October drafts about 15% less than that file did):

| arm | words |
|---|---|
| F transcripts | 6,665–8,367 |
| testimony (3 Oct) | 6,601–7,442 |
| testimony after #38 | 7,264–7,528 |
| listen long | 9,579–10,378 |
| listen matched | 6,511–7,479 |

The matched arm lands on testimony's length. Two of its six are first
person (`6136` 55, `6014` 54 first-person words per 1,000), the same two
briefs as in the long arm; the other four are third person (4–8).

Gap is ours minus the source on the 1–5 scale, pooled over the passes of
the six pairs. Lost is the passes the source scored higher, out of the
passes that judge completed on that axis.

## #39: three arms, pooled over six briefs

| axis | judge | testimony | listen long | listen matched | testimony − matched |
|---|---|---|---|---|---|
| **hook** | GPT-5.1 | +0.75, lost 3 of 48 | +0.35, lost 16 of 48 | +0.50, lost 14 of 48 | **+0.25** |
| **hook** | Grok | +1.75, lost 5 of 48 | +0.67, lost 16 of 45 | +1.50, lost 8 of 48 | **+0.25** |
| **clarity** | GPT-5.1 | +1.33, lost 4 of 48 | +0.88, lost 13 of 48 | +1.10, lost 8 of 48 | **+0.23** |
| **clarity** | Grok | +1.67, lost 8 of 48 | +0.56, lost 19 of 45 | +1.48, lost 9 of 48 | **+0.19** |
| **momentum** | GPT-5.1 | +1.00, lost 1 of 48 | +0.54, lost 13 of 48 | +0.83, lost 9 of 48 | **+0.17** |
| **momentum** | Grok | +1.96, lost 1 of 48 | +0.80, lost 12 of 45 | +1.67, lost 4 of 48 | **+0.29** |
| people | GPT-5.1 | +0.79, lost 8 of 48 | +1.00, lost 4 of 48 | +0.81, lost 8 of 48 | −0.02 |
| people | Grok | +1.38, lost 4 of 48 | +1.18, lost 6 of 45 | +1.42, lost 4 of 48 | −0.04 |
| presence | GPT-5.1 | +0.96, lost 7 of 48 | +0.98, lost 6 of 48 | +0.92, lost 8 of 48 | +0.04 |
| presence | Grok | +2.42, lost 2 of 48 | +2.33, lost 2 of 45 | +2.42, lost 1 of 48 | 0.00 |
| feeling | GPT-5.1 | +0.96, lost 1 of 48 | +0.90, lost 2 of 48 | +0.92, lost 3 of 48 | +0.04 |
| feeling | Grok | +2.00, lost 1 of 48 | +1.84, lost 0 of 45 | +1.98, lost 1 of 48 | +0.02 |
| cost | GPT-5.1 | +0.94, lost 0 of 48 | +0.90, lost 1 of 48 | +0.96, lost 1 of 48 | −0.02 |
| cost | Grok | +2.10, lost 0 of 48 | +2.00, lost 0 of 45 | +2.04, lost 0 of 48 | +0.06 |
| ending | GPT-5.1 | +0.33, lost 13 of 48 | +0.19, lost 15 of 48 | +0.38, lost 12 of 48 | −0.04 |
| ending | Grok | +1.23, lost 8 of 48 | +1.00, lost 7 of 45 | +1.42, lost 5 of 48 | −0.19 |

Share of testimony's gain over listen long that the matched arm also gets,
(matched − long) / (testimony − long):

| axis | GPT-5.1 | Grok |
|---|---|---|
| hook | 0.15 of 0.40 (38%) | 0.83 of 1.08 (77%) |
| clarity | 0.23 of 0.46 (50%) | 0.92 of 1.11 (83%) |
| momentum | 0.29 of 0.46 (63%) | 0.87 of 1.16 (75%) |

By brief, testimony − matched (passes lost: testimony · matched):

| video | judge | hook | clarity | momentum |
|---|---|---|---|---|
| `vs-hIS0zHK8` | GPT-5.1 | −0.13 (1 · 1) | +0.38 (0 · 1) | +0.50 |
| `vs-hIS0zHK8` | Grok | +0.13 (1 · 1) | +1.25 (0 · 2) | +0.38 |
| `qT46_pYAdyk` | GPT-5.1 | −0.13 (2 · 2) | +0.13 (1 · 2) | −0.13 |
| `qT46_pYAdyk` | Grok | +0.50 (2 · 3) | +1.00 (5 · 6) | +0.50 |
| `mcHzyyWUljA` | GPT-5.1 | +0.38 (0 · 3) | −0.63 (1 · 0) | −0.13 |
| `mcHzyyWUljA` | Grok | −0.38 (0 · 0) | −0.63 (1 · 0) | −0.50 |
| `afqi57x6z2M` | GPT-5.1 | +0.38 (0 · 3) | +0.75 (0 · 0) | +0.50 |
| `afqi57x6z2M` | Grok | +0.88 (0 · 1) | +0.63 (0 · 0) | +1.38 |
| `LLx1pL08gi0` | GPT-5.1 | +1.13 (0 · 5) | +0.50 (2 · 4) | +0.63 |
| `LLx1pL08gi0` | Grok | +0.25 (2 · 3) | −1.38 (2 · 0) | −0.63 |
| `Zl23nJsVDHo` | GPT-5.1 | −0.13 (0 · 0) | +0.25 (0 · 1) | −0.38 |
| `Zl23nJsVDHo` | Grok | +0.13 (0 · 0) | +0.25 (0 · 1) | +0.63 |

**Most of the gain is length.** At testimony's length, listen gets 38–63% of
testimony's hook, clarity and momentum gain on GPT-5.1 and 75–83% on Grok.
What is left is +0.17 to +0.29 on each of the six cells, all of them just
past GAP_MARGIN (0.15), and it is not uniform by brief: testimony beats the
matched arm on hook in five of six briefs for Grok and three for GPT-5.1,
and on clarity in five for GPT-5.1 and four for Grok.

**The clearest testimony result left is passes lost on GPT-5.1's hook: 3 of
48 against 14 of 48.** The matched arm loses the hook to F as often as the
long arm did (16 of 48); the shorter text gives it a higher mean, not fewer
losses. On Grok the matched arm loses 8 of 48 against testimony's 5. So the
promise opening, not the length, is what stops GPT-5.1 from giving F the
hook.

**The people cost was length too.** Testimony's people deficit against
listen long (−0.21 on GPT-5.1) is −0.02 against the matched arm, with the
same 8 of 48 passes lost. The matched arm's ending is a little better than
testimony's on Grok (−0.19, lost 5 against 8 of 48).

## #38: the promise opening without a name

The change (`9690d80`): the schedule ask, beat 1's scene line, the
hook-late screen question and its rewrite line ask the narrator to state
their situation, the work or the place the story happens in, and what went
wrong there, and say that the opening does not introduce the narrator by
name. The title echo asks for the narrator's situation the title states, not
"the narrator the title names". No example sentence is quoted. The
defaults and the listen profile give the golden prompts byte for byte. A
new test holds the promise prompts to no "who they are", no "who is telling
this" and no ask for a name.

First sentences of the six new testimony drafts:

| draft | first sentence |
|---|---|
| `4a09` | I was a passenger on Pelagic Air 1140, Amsterdam to Almaty, and the masks came down before anything had gone wrong with the aircraft. |
| `5fdd` | I was the overnight Capcom at Mission Control in Houston — the voice that talks to the station. |
| `d7ef` | I was paid six hundred dollars a visit to lie on a bed in a research suite on Dumay Street, and on the first visit the drug went in through the middle of my chest, pressed in by a hand, and my left ear has been gone since. |
| `0519` | I took a government job that paid two million dollars to stand in a room and watch a bathtub, and on the third morning the thing in the tub took the night man's voice out of his mouth. |
| `e703` | I bake bread in my grandmother's summer kitchen, and the burn marks on the first loaf of every bake are tomorrow — what will happen, written before it happens. |
| `8b35` | I was the medic on an ore boat out of Duluth. |

**None opens "My name is"**, and no two first sentences are the same. Four of
six open "I was", and three of those are "I was a/the <role>"
(`4a09`, `5fdd`, `8b35`). That is the shape of F's first-person titles ("I
Survived…", "I Work Mission Control…", "I'm a Ship Medic…"), which beat 1
echoes; F's own transcripts open "I work in NASA mission control.", and two
of six open "My name is" (`afqi57x6z2M`, `Zl23nJsVDHo`). The 3 October
drafts had four of six on "My name is <name>."

A stock line remains a sentence or two later: "I want you to understand"
is in 11 of the 12 testimony drafts of 3–4 October (in the first 300 words
of `a5d2`, `0519`, `8b35`), and in 1 of the 6 F transcripts (todo #40).

Judged against their transcripts:

| axis | judge | testimony (3 Oct) | testimony after #38 |
|---|---|---|---|
| hook | GPT-5.1 | +0.75, lost 3 of 48 | +0.96, lost 0 of 47 |
| hook | Grok | +1.75, lost 5 of 48 | +1.75, lost 4 of 48 |
| clarity | GPT-5.1 | +1.33, lost 4 of 48 | +1.25, lost 2 of 48 |
| clarity | Grok | +1.67, lost 8 of 48 | +1.46, lost 9 of 48 |
| momentum | GPT-5.1 | +1.00, lost 1 of 48 | +1.15, lost 0 of 48 |
| momentum | Grok | +1.96, lost 1 of 48 | +1.85, lost 3 of 48 |
| **people** | GPT-5.1 | +0.79, lost 8 of 48 | **+0.27, lost 19 of 48** |
| **people** | Grok | +1.38, lost 4 of 48 | **+0.92, lost 8 of 48** |
| presence | GPT-5.1 | +0.96, lost 7 of 48 | +0.88, lost 8 of 48 |
| presence | Grok | +2.42, lost 2 of 48 | +2.48, lost 0 of 48 |
| feeling | GPT-5.1 | +0.96, lost 1 of 48 | +1.00, lost 0 of 48 |
| feeling | Grok | +2.00, lost 1 of 48 | +2.06, lost 0 of 48 |
| cost | GPT-5.1 | +0.94, lost 0 of 48 | +1.02, lost 0 of 48 |
| cost | Grok | +2.10, lost 0 of 48 | +2.17, lost 0 of 48 |
| ending | GPT-5.1 | +0.33, lost 13 of 48 | +0.47, lost 11 of 47 |
| ending | Grok | +1.23, lost 8 of 48 | +1.54, lost 4 of 48 |

The hook holds without the name: GPT-5.1 gives F the hook in none of 47
passes. On the two old videos, where GPT-5.1 had preferred the listen
siblings' event openings, the hook is +0.63 and +0.75 (it was +0.25 and
+0.25).

People falls, on two briefs: `d7ef` (GPT-5.1 −1.00, lost 8 of 8; Grok +0.13)
and `4a09` (GPT-5.1 −0.50, lost 6 of 8; Grok 0.00). The judges' reasons name
fewer speakers told apart; `d7ef` has 11.7 quote marks per 1,000 words
against 23.0 in `fc58`, its sibling of 3 October. The #38 change touches
only the first sentences, so this reads as draw variance on the axis where
testimony is already weakest, not as an effect of the change; one draft a
brief cannot separate the two (todo #41).

## Verdict

- Length explains most of testimony's hook, clarity and momentum gain over
  listen long: 38–63% on GPT-5.1, 75–83% on Grok. The residual is +0.17 to
  +0.29, just past the margin on every cell.
- What length does not explain is GPT-5.1's lost hooks: 3 (testimony) and 0
  (after #38) of 48, against 14 for the matched arm.
- Recommendation for F-style draws seeded from a first-person title: keep
  testimony, at the shorter length, as the profile, because it keeps the
  hook and loses nothing past the margin to the matched arm except Grok's
  ending (−0.19); watch people, which fell on the post-#38 drafts (todo #41). Do not make it the default for all listen draws on this
  evidence. The bigger lever is length: the listen profile's 10,000 words
  costs it 0.15–0.92 on hook, clarity and momentum against F.

## Cost

$3.01 by the runs' own estimates ($1.51 for the matched arm, $1.50 for the
new testimony drafts); $2.81 by the OpenRouter balance (9.33 to 6.52).
Drafting ran on the Claude CLI.

## Follow-ups

| # | item |
|---|---|
| 38 | done at `9690d80` |
| 39 | done: this file |
| 40 | "I want you to understand" in 11 of 12 testimony drafts |
| 41 | testimony's people on GPT-5.1: 8, then 19 of 48 passes lost |
| 42 | listen's length: 10,000 words loses hook, clarity and momentum to the matched length |
