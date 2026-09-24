# The ten-minute loop — build sequence

The order the candidates of `docs/reviews/2026-09-23-ten-minute-loop.pdf` are
built in, and why. The review names eight candidates and sizes them; this file
is the sequence, the dependencies and the changes made to the review's own
ordering. Written 2026-09-24 with `main` at `b68ec27`.

## The constraint that sets the order

**OpenRouter credit.** A judged run is the gate on anything that changes what a
model reads. L1 costs about $5, L2 about $25. On the morning of 24 September the
balance was $3.58, so **no judged run could run at all**, and everything that
needs no panel was built first, in dependency order. Chris topped it up that
afternoon and the balance is $28.58; the order stands, because it was never
only about money — a slice checked against the stored passes is checked in
seconds and for nothing, and a slice checked by a panel is not.

The second constraint is the record of 23 September: three prompt changes were
judged and **none landed** (`evals/20260923-presence.md`,
`20260923-caps-ablation.md`, `20260923-register-cut.md`). The review's central
restraint follows from that and is adopted: **no prompt text changes until the
loop exists.**

## Sequence

| # | Candidate | Time | Judged run | Blocked by |
|---|---|---|---|---|
| 0 | Take the report off the critical path (04a) | 10 min | none | — **landed `b68ec27`** |
| 1 | Branch a draft at a point (01) + `steps.version` | 40 min | none | — **landed `0c586a2`** |
| 2 | The experiment runner, `cloudchamber lab` (02) | 90 min | none to build | 1 — *pooling `2b59240`, the judge ask `77797b4`* |
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

## Four things step 2 has to get right

Written 2026-09-24 while building it, from what the runs of 22–23 September
cost to work with rather than from the design.

**1. An experiment needs an identity, and three other problems follow from its
not having one.** The arms of 23 September are `cut1.txt` and `fix1.txt` in
`~/.cloudchamber/ab/20260922-repeat/`, made by a shell script written for that
run. Nothing in the store knows the experiment happened; the passes were found
again by searching the filesystem for a field name.

That is why an arm cannot be reused: an arm is not a draw, it is a text file
exported from a scratch store that no longer exists. It is why the gate below
step 3 — *does L1 reproduce the L2 losses of 23 Sep?* — is not runnable as
written, because it needs those arms back. And it is why the floor cannot be
cached per baseline: nothing names the baseline.

So `lab` writes an **experiment** whose arms are draw ids in a store that
outlives the run, not paths. Step 1 makes an arm re-derivable from a pinned
schedule; this is the other half of the same idea, and without it the log's
second use is words.

**2. A badly shaped run is refused before it bills, not described afterwards.**
Both mistakes of 23 September were found by reading prose once the money was
spent. `floorPairs` and `anchoredOn` exist now (`app/pipeline/lab/pool.ts`), and
they belong at the front of a run as preconditions:

- a floor whose pairs all hang off one draft — the register cut;
- an arm with fewer drafts than the protocol asks for;
- a pooled result where every judge's weight came out zero, which is a run that
  says only what it read first. The presence floor was exactly that, on two
  judges and eight passes, and it was still reported as 0.62.

A run that cannot say anything should fail at the start.

**3. The runner records its own clock.** The target is a judged result in under
ten minutes and nothing anywhere measures one. `steps` carries `started_at` and
`ended_at`, but an experiment has no wall time of its own, so steps 4 and 5 —
which both promise a speedup and both owe an L2 run — would be settled with a
stopwatch and a memory. Per phase: draft, screen, judge, pool. It is the same
rule `steps.version` follows, which is that a measurement belongs in the
artifact and not in the write-up.

**4. An arm is a commit.** The review writes `--arm <ref-or-worktree>`, which
allows an arm to be a dirty tree, and that is the mistake of 23 September in
the specification: a figure measured inside a worktree carrying a rejected
change, published as a fact about `main`. `steps.version` now detects it. `lab`
should refuse it, or record the diff as part of the experiment. Otherwise the
run is not reproducible and the log's third use records a verdict on a clause
that exists nowhere.

**And one rule for building it.** Every slice of the runner must be verifiable
with no judged run, against the stored passes as a golden set. That is how the
first two slices landed on a balance of $3.58: pooling was checked against
`tally.py` over the three runs of 23 September, and the parser against all 252
stored replies. The corollary is that the golden set is an asset, not a test
fixture — it sits in one scratch directory that nothing backs up, and the
copies now in `app/pipeline/lab/` were made because a slice happened to need
them.

## What `bank/judgements.jsonl` is for

The review has step 2 append every pass to a log and rebuild its tables from it.
That is an archive. It is worth more as a **set the next run is answered
against**, and the three uses below decide its columns. One row per pass:
experiment, brief, arm, the stored draft ids of the pair, judge, reading order,
the eight axes, overall, cost.

**1. Re-pool a past run under a corrected rule. This is the only free one, and
only for a run logged under the corrected rule's inputs.** Pooling is
deterministic, so a change to the weight rule re-reads every past run at no
cost, and the three runs of 23 September re-pool to their published numbers
today (`app/pipeline/lab/pool.test.ts`).

The floor rule is the case where it does not help, and finding that out is what
the use is for. The corrected rule needs all three within-arm pairings, and
every run of 23 September judged only 1 v 2 and 1 v 3 — `cut2 v cut3` was never
asked. So the register cut cannot be rescued by arithmetic; it needs twelve
fresh passes over drafts that already exist, which is the cheapest judged run
available. **A log makes a rule change free only over the pairs it holds.**
That is an argument for judging the third pairing at the time, not for a
smarter tally afterwards.

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
cost: on 23 September the two presence clauses took register rewrites from 10 to
25 and drafting cost up 50%, and the register cut took them from 10 to 26 and
cost up 46%. That half is deterministic and holds. The quality half does not:
two drafts of one arm differ about twice as much as two arms do, so the panel
could not resolve either change in either direction
(`evals/20260924-draft-variance-dominates.md`). "Neither arm won" is not
evidence of a local optimum. The remove half has never been affordable:
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
