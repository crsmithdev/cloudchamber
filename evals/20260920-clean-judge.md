# The judge read the screen notes: all seven drafts re-judged on the scenes alone

Found 2026-09-20 (morning). `evals/judge.py` loaded each draft from
`/api/draws/:id/story`, and that render appends every ledger, restated and
structure flag after its beat as `[screen-ledger beat 4] span → replacement`.
On the run-7 draft that is 52 notes and 2,022 of the 11,540 words the judges
saw, about a sixth. The source transcripts carried nothing comparable.

The judges read the notes as part of the story. Across the seven runs they
named them on 11 of the 16 passes we lost, always on clarity and usually on
momentum: "bracketed screen-ledger beat intrusions" (GPT-5.1), "jumps between
ledger beats, screen notes, and scenes" (Grok), "distracting bracketed
meta-text" (Gemini).

Fixed in 618e7ce: the story endpoint takes `?flags=0` and the judge asks for
it. Every draft was then re-judged on the same sources, same three families,
same three order-swapped passes. Nine passes cost about $0.70 a draft.

## Parity, before and after

| run | draw | template | source | notes read | clean |
|---|---|---|---|---|---|
| 1 | `70ac` | told | Void of Fears `vs-hIS0zHK8` | 5/9 | **7/9** |
| 2 | `2f03` | signal, plain | Void Signal `Ap5gN19SWc0` | 9/9 | 9/9 |
| 3 | `f1a4` | signal, steered | Void Signal `Ap5gN19SWc0` | 8/9 | **9/9** |
| 4 | `b6bb` | listen, plain | Void Signal `Ap5gN19SWc0` | 3/9 below | **7/9** |
| 5 | `f8ab` | listen, shaped | Void Signal `1a-yLGuSlM0` | 5/9 | **8/9** |
| 6 | `c621` | listen, numeral budget | Galactic Horrors `yqo8nPLaV0k` | 9/9 | 9/9 |
| 7 | `d83e` | listen, hard presence | Void Signal `1a-yLGuSlM0` | 8/9 | **9/9** |

47 of 63 becomes **58 of 63**, with two ties. Every draft now reaches
parity, including the plain `listen` draft that was the one failure. By
family: Gemini 3.1 Pro 20/21, GPT-5.1 18/21, Grok 4.3 20/21. GPT-5.1, the
strictest judge, moves from 12/21 to 18/21.

## Axes, before and after

How often the source won or tied, out of 63 passes.

| axis | notes read | clean | moved |
|---|---|---|---|
| presence | 30 | **27** | 3 |
| people | 16 | 18 | −2 |
| cost | 23 | 18 | 5 |
| clarity | 26 | **18** | 8 |
| hook | 11 | 11 | 0 |
| momentum | 22 | **11** | 11 |
| ending | 8 | 2 | 6 |
| feeling | 4 | 1 | 3 |

Momentum halved and clarity lost a third: those were the axes the notes
were charged to. Presence did not move, and it is now the open axis by a
wide margin. People is the only axis that got worse, and on the clean text
it ties cost and clarity for second.

## What the clean losses ask for

Five passes lost, two tied. The `needs` on the five, in the judges' words:

- **A cast that sounds like people.** "More differentiated voices for
  Verhoeven, Tomas, Okonjo and Priya in direct dialogue" (`70ac`, GPT-5.1);
  "direct dialogue that breaks out of the narrator's uniform voice" (`b6bb`,
  Gemini); "more dialogue scenes" (`f8ab`, Grok).
- **The thing in the room.** "So the vast machine's will arrives in the same
  space as the people, not only through inference and arithmetic" (`70ac`);
  "bringing a concrete, in-the-moment scene … much earlier" (`b6bb`).
- **One external confrontation.** "One clear external confrontation before
  the final dose" (`f8ab`); "a more dynamic physical plot" (`b6bb`).

On the run-7 draft, which won every pass, GPT-5.1 still gave the source
presence three times, people twice and hook twice: the blight "stays mostly
conceptual until the eerie rows on the Reach", the cast "share a more
uniform, careful diction", and the source opens on "humanity destroyed its
own planet … the enemy never died" while ours opens on a soil audit.

## What this changes

1. The earlier write-ups' parity figures are the notes-read ones. Each now
   carries a line pointing here; the tables inside them are left as
   recorded.
2. The run-4 conclusion, that the plain `listen` template failed, was the
   notes as much as the template: 3/9 is 7/9 clean. The fixes built on it
   (the register, the delivery questions, the numeral budget) still moved
   the axes they targeted, on both texts.
3. The remaining gap is not delivery. It is **presence, people and the
   hook**, in that order, and all three are upstream of the draft: the
   premise, the cast the schedule assigns, and what beat 1 opens on.
