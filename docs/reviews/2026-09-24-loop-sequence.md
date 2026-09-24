# The ten-minute loop — build sequence

The order the candidates of `docs/reviews/2026-09-23-ten-minute-loop.pdf` are
built in, and why. The review names eight candidates and sizes them; this file
is the sequence, the dependencies and the changes made to the review's own
ordering. Written 2026-09-24 with `main` at `b68ec27`.

## The constraint that sets the order

**OpenRouter credit.** A judged run is the gate on anything that changes what a
model reads. L1 costs about $5, L2 about $25. On 24 September the balance was
$3.58, so **no judged run could run at all**. Everything that needs no panel is
therefore built first, in dependency order, and the judged work queues behind a
top-up.

The second constraint is the record of 23 September: three prompt changes were
judged and **none landed** (`evals/20260923-presence.md`,
`20260923-caps-ablation.md`, `20260923-register-cut.md`). The review's central
restraint follows from that and is adopted: **no prompt text changes until the
loop exists.**

## Sequence

| # | Candidate | Time | Judged run | Blocked by |
|---|---|---|---|---|
| 0 | Take the report off the critical path (04a) | 10 min | none | — **landed `b68ec27`** |
| 1 | Branch a draft at a point (01) + `steps.version` | 40 min | none | — |
| 2 | The experiment runner, `cloudchamber lab` (02) | 90 min | none to build | 1 |
| 3 | Beat-level judging, L1 (03) | 45 min | **calibration owed** | 1, credit |
| — | *gate: does L1 reproduce the L2 losses of 23 Sep?* | | | 3 |
| 4 | Rewrite waves, odd then even (04b) | 20 min | owes L2 | 2 |
| 5 | Write the next beat while the last binds (05) | 30 min | owes L2 | 2 |
| 6 | Provenance and timeline, the rest of 06 | 40 min | none | 1 |
| 7 | One table of constraints (07) | 60 min | snapshot test only | 2, 3 |
| 8 | Systematize the shaped templates (08) | — | every step | 7 |

The spine is **1 → 2 → 3**. Step 2 is the keystone: it takes a judged run from
35–45 minutes and about $26 of hand work down to one command, which is what
makes steps 4, 5 and 7 affordable at all.

## What `bank/judgements.jsonl` is for

The review has step 2 append every pass to a log and rebuild its tables from it.
That is an archive. It is worth more as a **set the next run is answered
against**, and the three uses below decide its columns. One row per pass:
experiment, brief, arm, the stored draft ids of the pair, judge, reading order,
the eight axes, overall, cost.

**1. Re-pool a past run under a corrected rule. This is the only free one.**
Pooling is deterministic, so a change to the weight or the floor rule re-reads
every past run at no cost. On 23 September the floor rule was wrong and the
register cut came back at 0.29, and the run was written off as unreadable. The
passes themselves were fine; only the arithmetic over them was not. Logged, the
corrected all-three-pairs rule is applied to that run again for nothing, and it
either becomes readable or is rejected for a reason that holds.

**2. Reuse the arm, never the verdict.** A verdict is a judgement of two
particular texts and does not transfer to new prose. The stored arm does: all
three runs of 23 September answered against the same `fix1-3` drafts, which is
three of the six drafts a comparison needs. The log names the draft ids of every
pair, so the runner finds a stored arm instead of drafting a baseline again.
Step 1 is what makes an arm re-derivable — a branch at beat 1 writes a second
arm against the first's schedule.

The floor is the same saving and nobody has taken it yet. Each of the three runs
floored its **own** arm — `pres1`–`pres2`, `last1`–`last3`, `cut1`–`cut3` — so
each paid for a floor, and two of the three floors were badly shaped. The
review's rule is a floor cached per baseline, judged once on one brief until the
baseline moves. The log is what makes "cached" mean anything.

**3. Record what the panel has already ruled on.** Three clauses were judged and
rejected on 23 September and the record of that is three markdown files. The log
is what stops a fourth session proposing the presence clause again.

**What it is not.** It is not a test set a prompt change replays against. New
prompt text makes new prose, new prose needs new passes, and there is no free
regression run here. The saving is the baseline half of a comparison and the
floor, not the comparison.

## Accretion, once the loop is cheap

`CLAUDE.md`'s rule is about **prompt text**, and it says so: it names the four
layers that can state a constraint, all of them in `prompts.ts` and `write.ts`.
A judgements log, a case in the runner and a stored arm are code. They do not
accrete in the sense the rule means, and the rule is not an argument against
building them.

The rule itself survives a cheap loop, and one half of it starts working for the
first time. Its two halves are add and remove. The add half rests on a measured
local optimum: on 23 September the two presence clauses took register rewrites
from 10 to 25 and drafting cost up 50%, the register cut took them from 10 to 26
and cost up 46%, and neither arm won. A faster loop does not move that. The
remove half has never been affordable:
the register cut was rejected **on cost**, not on quality, so *"remove clauses
with the protocol you add them with"* has never once run to a verdict. At L1 it
can. Expect the first honest use of the loop to be a deletion, not an addition.

Nothing in `CLAUDE.md` changes until the loop exists and has run. A rule relaxed
before its replacement works is a rule with nothing behind it.

## Three changes to the review's ordering

**`steps.version` moves from 06 into step 1.** The review parks it with the rest
of provenance. On 23 September a word count measured inside a worktree carrying a
rejected change was published as a fact about `main` — 409/211/6556 where `main`
had 386/110/6432 (corrected in `373fb40`). A git sha and a dirty flag on every
step would have caught it, and step 1 is already writing a schema-13 migration.

**04b's gain is larger than the review sizes it.** The review measures the serial
register rewrites on draw `20260921145735-c933`, which had 12 of them: 15.4
minutes. The register-cut arm of 23 September ran **26**. Waves help most on
exactly the drafts that need them most.

**The corrected floor rule is built into step 2, not left to the script.** The
review has the runner cache a floor per baseline. Two runs on 23 September
anchored both floor pairs on one draft; on the register cut that anchor was the
weakest of its three and the floor came back 0.29 instead of near 0.5, which made
the run unreadable (`evals/20260923-register-cut.md`). The runner must pair **all
three** drafts of an arm — 1 v 2, 1 v 3, 2 v 3 — and never anchor on one.

## Verified before sequencing

Checked against the tree at `b6606a8`, because the review was written at
`b7830bf` and states figures that decide the order.

| Review claim | Result |
|---|---|
| the store wants schema 13 | `SCHEMA_VERSION = 12` in `app/pipeline/store/db.ts`; 11 → 12 migrates **in place** with nullable columns, so a bump is cheap |
| the report sits on the critical path | was awaited at `drafting.ts:260` (draft) and `:411` (every rewrite), 60 s timeout each |
| register rewrites run serially | confirmed: `for (const [k, lines] of due) { await this.regenerate(...) }` |
| the `effort` knob exists and nothing sets it | confirmed in `StageConfig`, plumbed to `call()`, absent from `stages.toml` |

## Step 0, as landed

`b68ec27`. `writeReport` was awaited in `draft` and again in every register
rewrite, each spawning headless Chrome with a 60 s timeout, for a PDF no model
reads. Draft and rewrite now write the HTML only; `keep` starts the full report
and does not wait on it. The `/api/draws/:id/report.pdf` route already answers a
missing file with *run `cloudchamber report <draw>`*.

A test in `drafting.test.ts` pins it: a counting printer is never called across a
draft and a rewrite, and once after `keep`. Reverting the draft line fails it.
