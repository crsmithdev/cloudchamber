# The second-family judge, and what it took back

Run 2026-09-19 (night). Every earlier write-up in this directory reports
parity against its channel on a blind pairwise judge run on Claude Opus,
which is the family that wrote the drafts. Chris supplied an OpenRouter
key, so the same four comparisons were rerun on three independent labs.
The result corrects the record: one draft loses parity outright and one
is carried only by a majority.

Method unchanged from `evals/judge.py`: both texts as unlabelled
transcripts, Story One and Story Two, order swapped on pass 2, eight
axes answered One, Two or Tie, then an overall. Three passes per draft
per family. Parity is a win or tie in a majority of the passes that
answered.

## Deviations

1. **Nothing kept.** All four drafts still wait at gate 2.
2. **The first round was discarded.** Gemini 3.1 Pro spends its budget on
   reasoning before it answers, and four of twelve passes stopped after
   three axes. The script scored those as an unknown overall, which
   counted against the draft. Fixed in eef98ff: a 16k budget at low
   reasoning effort, three retries on an incomplete parse, and parity
   counts only the passes that answered. Every number below comes from a
   clean rerun of all three families under the fixed script, 36 of 36
   passes complete. The discarded round is not in the repo.
3. **The channels are auto-generated transcripts.** They misspell their
   own characters and do not punctuate dialogue. The judge is told to
   ignore transcription noise. This should flatter us on every
   clarity-adjacent axis, and clarity is still among the axes we lose
   most, so the gap is real and probably understated.

## Parity by draft and family

Passes won or tied, of three.

| draft | template | Gemini 3.1 Pro | GPT-5.1 | Grok 4.3 | total | verdict |
|---|---|---|---|---|---|---|
| `20260919205045-2f03` | signal, plain brief | 3 | 3 | 3 | 9/9 | parity, unanimous |
| `20260919210221-f1a4` | signal, steered brief | 3 | 2 | 3 | 8/9 | parity |
| `20260919200711-70ac` | told, plane crash | 3 | 0 | 2 | 5/9 | parity, contested |
| `20260919225941-b6bb` | listen, plain brief | 2 | 0 | 1 | 3/9 | **below parity** |

## Judge severity on the same 12 comparisons

| judge | family | passes won or tied |
|---|---|---|
| Claude Opus 5 | the generator's own | 13/13 |
| Gemini 3.1 Pro | Google | 11/12 |
| Grok 4.3 | xAI | 9/12 |
| GPT-5.1 | OpenAI | 5/12 |

The spread is the finding. The same four texts against the same two
sources score 13/13 and 5/12 depending on who reads them. A single
judge, and especially a same-family judge, cannot settle this.

## Axes, across all 36 independent passes

How often the channel won or tied.

| axis | Gemini | GPT-5.1 | Grok | total |
|---|---|---|---|---|
| cost | 8 | 8 | 6 | 22/36 |
| presence | 7 | 8 | 4 | 19/36 |
| clarity heard once | 1 | 10 | 6 | 17/36 |
| momentum | 1 | 8 | 4 | 13/36 |
| hook | 0 | 3 | 4 | 7/36 |
| ending | 0 | 4 | 2 | 6/36 |
| people | 1 | 3 | 1 | 5/36 |
| feeling | 0 | 1 | 1 | 2/36 |

Opus put clarity first and presence nearly last. All three independent
labs put cost and presence at or near the top. That inversion is the
clearest evidence of the same-family bias: the generator's family reads
our restraint as depth, and three other labs read it as a missing body.

## What this changes

- **The `signal` template holds.** Both signal drafts reach parity on
  every family, 17 of 18 passes. A spoken container with quoted dialogue
  survives an outside reader.
- **The `listen` template fails at the listen.** 3 of 9. The earlier
  write-up recorded parity on Opus alone, and that was wrong. Its
  strengths stand (the best single scene, a clean ledger, the brief's own
  form), and it is not a story anyone would finish in a car. The verdict
  in `evals/20260919225941-b6bb.md` is superseded by this file.
- **The told draft is contested**, carried by Gemini and Grok and
  rejected outright by GPT-5.1.
- **The delivery priority is settled.** Cost first, presence second, then
  clarity. Not clarity first, which is what the same-family judge said.

## Follow-ups

1. Cost paid on the page: a screen question on the marked `<pays>` beat
   asking whether the loss happens in scene rather than being reported
   afterward, and one rewrite when it is absent.
2. Presence in the room: the same beat, asked whether the withheld thing
   is physically present to a character rather than inferred, heard or
   remembered.
3. Sentence length as a rewrite trigger off the listen screen.
4. Run every future comparison on three families. One judge is noise.
