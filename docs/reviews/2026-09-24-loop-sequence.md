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
