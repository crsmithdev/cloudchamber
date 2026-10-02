# Against channel F: the figure counter, and a first-person listen profile

2 October. Two changes drafted as siblings of the three channel F control
drafts (`bf3e`, `17e7`, `69c0`: listen profile, 30 Sep–1 Oct) and judged
against their transcripts by GPT-5.1 alone, eight passes a pair, both orders.
Rows in `bank/judgements.jsonl`, experiments `compare-*-muqa*`. $1.49 for six
pairs and two partial reruns. The account held $2.84 when the day began, so
this is one draft an arm, not the three the plan asks for.

## Where the drafts stood

Every stored pass of a draft against a channel transcript, pooled by axis as
the score gap. Gemini 3.1 Pro gives our drafts 4.4–5.0 on every axis against
channel F (48 passes, 30 Sep–1 Oct, one loss in 24 on hook and presence) and
tells nothing apart there. GPT-5.1 still gives the channel three axes:

| GPT-5.1, channel F, 24 passes | gap | passes lost |
|---|---|---|
| clarity | −0.38 | 15 |
| hook | −0.21 | 12 |
| momentum | +0.08 | 11 |
| people | +0.29 | 7 |
| ending, feeling, cost, presence | +0.75 to +1.33 | 0–1 |

Channel S (`a4cd`, two runs): +0.11 and +0.38 on GPT-5.1, people −0.75 to
−0.88, ending −0.38 to −0.62. Channel V (three drafts, two stories): +2.1 to
+2.8 on every judge, no pass lost; it cannot rank anything.

GPT-5.1's reasons on the channel F losses, 30 Sep–1 Oct, name three things:
shifts of view and time ("braided timelines", "intercut perspectives", "hour
zero … hour sixty-one"), dense sentences, and figures ("intricate counting,
nine-minute seams", "hour-counting", "the 112 figure").

## What the text showed

| | channel F (2 stories) | control drafts (3) |
|---|---|---|
| person | first (47–57 first-person words per 1k) | close third, two or three focal figures (4–11) |
| tense | past | present in two of three |
| figures per 1k words, digits or words | 5–7 | 20–26 a draft, 38–47 at the peak beat |
| quote marks per 1k | 0.3–1.6 | 18–45 |
| mean sentence | 16–18 words | 11 |

The listen screen's numeral ceiling (12 per 1k) counted digits only. The
signal register asks for the numbers a person would say aloud, and the scenes
answer by spelling them, so the ceiling saw 1–2 figures per 1k of the 20–26
the drafts carried. The narration pool, counted the same way, sits at 5.1.

## The two arms

Both arms ran on `c98ed95`, which counts number words as figures (`one`
excepted, since it is a pronoun as often as a count) and sets the ceiling at
24 per 1k.

- **A, first person.** The listen profile fixes `form.person = first` and
  `form.tense = past`, the channel's form.
- **B, the counter alone.** Person and tense left to the brief, as before.

One sibling a brief an arm (`Drafting.sibling`: the brief and ledger copied,
the schedule and scenes new), six drafts in 12–20 minutes each, one at 38
after two stalled scene calls.

## Results, GPT-5.1 against the transcript

| brief | control | A, first person | B, counter alone |
|---|---|---|---|
| `bf3e` v `vs-hIS0zHK8` | +0.55 (`bf3e`) | +0.44 (`caef`) | **+0.91** (`62f0`) |
| `17e7` v `qT46_pYAdyk` | +0.67 (`17e7`) | +0.72 (`0458`) | **+0.86** (`8ca1`, 13 passes) |
| `69c0` v `vs-hIS0zHK8` | +0.30 (`69c0`) | +0.52 (`6dcc`) | **+0.70** (`14a8`, 11 passes) |

By axis, the three the channel keeps:

| | control | A | B |
|---|---|---|---|
| clarity | 0.00 / −0.12 / −1.00 | 0.00 / 0.00 / 0.00 | +1.25 / +0.46 / +1.00 |
| momentum | 0.00 / +0.50 / −0.25 | 0.00 / +0.50 / −0.38 | +1.00 / +0.85 / +0.64 |
| hook | −0.12 / −0.25 / −0.25 | −0.62 / −0.38 / +0.62 | +0.12 / −0.38 / −0.18 |

No other axis fell below −0.3 in either arm. The halves of one pair still
spread by up to 0.56 (`caef`: 0.16 and 0.72), so a single pair carries about
±0.3, and B's three pairs are one draft each against one control draft each.

## Reading

**A is not supported, and the judge says why.** Two of three A drafts sit
within 0.1 of their control, the third 0.2 above, and none moves clarity off
0.00. First person did not make the drafts clearer; it made them a narrator's
log. On clarity: "dense log-style
sentences and time jumps around the eversions", "looping chronology ('I have
gone past something and I have to come back for it')". On momentum: "very
meditative, lingering on counts and procedures", "journal-like accrual of
dread and interior reflection". The hook went both ways: `caef` opens as a
shift log ("Day 1 … I began at ten to twelve") and lost it 0 of 8; `6dcc`
opens on "we came down six miles in about ninety seconds and nothing hit
anything" and won it 6 of 8. The channel's first person is confessional and
plain; ours, from the same prompts, turns inward. The profile change is
reverted.

**B is above the control on every brief and on every axis the channel kept,
on one draft each.** Clarity +0.46 to +1.25 where the control had 0.00 to
−1.00; momentum +0.64 to +1.00 where the control had −0.25 to +0.50. The
judge's reasons are the mirror of the losses: "tightly sequenced scenes",
"clearly marked time jumps", "the rate of 'two each time'", "rarely lets go of
immediate scene". But draft variance is about this size (two drafts of one arm
differ about as much as two arms, 24 Sep), and the counter moved the final
figure rate only from 20.0 / 23.8 / 26.3 to 18.9 / 19.2 / 16.6 a draft (the A
drafts, where a narrator counts, ran 24.1 / 26.8 / 25.7). The
edit under `NUMERAL_LINE` leaves most beats it touches over the ceiling (`62f0`
beat 5: 24 → 37; `8ca1` beat 4: 8 → 30 after a register rewrite and the edit),
because the model reads most figures as ones a person would say aloud. So the
mechanism is not shown, and the gain may be the drafts.

**What lands.** The counter and the ceiling at 24 (`c98ed95`): a deterministic
instrument that now measures what it was built to measure, carried by three
drafts that read above their controls and none that read below. The
first-person profile does not.

**What it would take to settle B.** Two more siblings a brief for the control
and for B (six drafts, about 25 minutes), judged GPT-5.1 alone at eight
passes: twelve pairs, about $3, a floor near 0.2. Gemini adds $0.45 a pair and
no information against this channel.

## Correction, later on 2 October: the edit does bring a beat under the ceiling

The per-beat reading above ran the artifact order backwards. Read in step
order (`steps.started_at`, then rowid), over the six 2 October siblings,
the edit under `NUMERAL_LINE` fired 34 times, every time on a beat over 24
per 1k, and left the beat under the ceiling 30 times. The mean beat went
from 32.6 to 17.1 figures per 1k. The four that stayed over started high
or landed just over: `62f0` beat 5 37.4 → 24.4, `8ca1` beat 1 43.4 →
28.8, `0458` beat 1 45.4 → 33.6, `0458` beat 12 35.2 → 26.3. On the B
drafts alone: 13 edits, 11 under, 31.5 → 16.1. The cases quoted above
read the other way round: `62f0` beat 5 went 37 → 24, `8ca1` beat 4 went
30 → 8. So the instrument bites, and `fix = "rewrite"` for the numeral
fault is not needed (todo #27, closed). The gain in B still rests on one
draft a brief (todo #28).

Draft rates, final, from the same reading: controls 19.4 / 23.9 / 25.3;
B 17.0 / 14.0 / 16.1; A 18.8 / 20.0 / 18.2. The B figures given above
(18.9 / 19.2 / 16.6) were a different count; these are `listen.ts`'s
`profile` over the final scene of each beat.

## Arm B on twelve pairs: no gain over the control

Later on 2 October. Two more siblings a brief for each arm (todo #28), so
each brief has two control drafts and two B drafts, and every B draft was
read against every control draft of its brief: twelve pairs, eight passes a
judge, both orders, GPT-5.1 and Grok 4.3. The gap is B minus the control.

| brief | B v control | GPT-5.1 | Grok 4.3 | both |
|---|---|---|---|---|
| `bf3e` | `62f0` v `bf3e` | −0.22 | −0.16 | −0.19 |
| | `0cdd` v `bf3e` | −0.09 | −0.16 | −0.13 |
| | `62f0` v `24a5` | +0.19 | +0.14 | +0.16 |
| | `0cdd` v `24a5` | −0.41 | −0.14 | −0.27 |
| `17e7` | `8ca1` v `17e7` | −0.22 | +0.07 | −0.08 |
| | `b371` v `17e7` | −0.20 | −0.19 | −0.20 |
| | `8ca1` v `7ee7` | +0.14 | −0.19 | −0.02 |
| | `b371` v `7ee7` | +0.11 | +0.09 | +0.10 |
| `69c0` | `14a8` v `69c0` | +0.33 | +0.44 | +0.38 |
| | `efc5` v `69c0` | +0.16 | +0.59 | +0.36 |
| | `14a8` v `a43f` | −0.13 | +0.08 | −0.02 |
| | `efc5` v `a43f` | −0.22 | +0.16 | −0.04 |
| **pooled** | 12 pairs | **−0.05** (96 passes; halves −0.04, −0.06) | **+0.06** (92; −0.02, +0.13) | **0.00** |

By brief, both judges: `bf3e` −0.11, `17e7` −0.05, `69c0` +0.17. By axis,
pooled over the twelve pairs:

| | GPT-5.1 | Grok 4.3 |
|---|---|---|
| clarity | +0.05 | +0.23 |
| momentum | +0.02 | −0.03 |
| hook | −0.14 | +0.04 |
| presence | −0.15 | +0.07 |
| people | −0.11 | +0.10 |
| feeling, cost, ending | −0.07 to +0.03 | −0.01 to +0.05 |

**B does not beat the control.** The pooled gap is inside ±0.15 on each
judge and 0.00 on both. The one-draft lead (+0.91 / +0.86 / +0.70 against
+0.55 / +0.67 / +0.30) was draft variance: on `69c0`, B beats the first
control draft by +0.37 and the second by −0.03, so the first control was the
weak draft. The clarity and momentum gains of the one-draft reading are gone
on GPT-5.1 (+0.05, +0.02); Grok keeps a small clarity lead (+0.23).

The counter stays: it measures the figures the drafts carry, the edit
brings a beat under the ceiling, and on twelve pairs it costs nothing. It
is not a judged gain. Experiments, GPT-5.1: `mur7p0rn`, `mur7ragr`,
`mur7tt3y`, `mur7wd4z`, `mur7z3fs`, `mur81hz3`; Grok 4.3: `mur7r4q7`,
`mur7tm0l`, `mur7vsu6`, `mur7xphd`, `mur804kb`, `mur825mm` (each
`compare-<control>-vs-<B>-<suffix>`). Judging cost $3.65.

## Follow-ups

- ~~The figure edit does not bring a beat under the ceiling (todo #27).~~ Corrected above.
- ~~Arm B on twelve pairs, after a credit top-up (todo #28).~~ Above: no gain.
- A linear schedule can still open at the last hour and jump back (todo #24).
- ~~Channel F readings on GPT-5.1 alone, and a one-judge margin (todo #25).~~ Grok 4.3 replaces Gemini (`evals/20261002-grok-for-gemini.md`).
