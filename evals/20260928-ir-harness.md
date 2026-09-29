# S1+S2 head-to-head: gate 1 today against the story IR

28 September. Branch `ir-s1` (on top of `ir-s0`) builds S1 and S2 of
`docs/specs/2026-09-28-story-ir.md` §13.3 and runs them head-to-head against
today's gate 1 (`runCheck`) on the doc's own two draws: `08aa` (the worked
example, §3.3) and `e33a` (its chain root, no replanned schedule).

**The new pipeline catches the plan defect the doc built this whole design
around, and both ledger-internal defects it names, at less than the old
pipeline's cost — but only under the default model, and it misses one of the
three named defects in every arm.**

## What changed

| file | change |
|---|---|
| `app/pipeline/ir/s1.ts` | typed `when` (day, date, hour); monotonic-`when`-under-`linear`; withheld consistency across beats; `uses` against the pinned ledger. $0, no model call |
| `app/pipeline/ir/s2.ts` | L1 symbolise (new stage `ir-symbolize`), L2 resolve (reuses `verifyClaims`, `check.ts`), L3 calendar/count arithmetic (deterministic), L4 plan-vs-ledger (new stage `ir-plan-ledger`), L5 link (data only) |
| `app/pipeline/ir/gate.ts` | S3 backend: `planGateAuto` (the auto rule), `enterPlanGate` (the transition); neither wired to any screen |
| `app/pipeline/lifecycle.ts` | `awaiting_plan_gate` status, mirroring `awaiting_draft_gate` |
| `app/pipeline/check.ts` | `verifyClaims` exported for L2's reuse |
| `app/pipeline/prompts.ts`, `config.ts`, `stages.toml` | two new stages, `ir-symbolize` and `ir-plan-ledger`, both defaulting to `claude-opus-5` / fallback `claude-sonnet-5` |
| `evals/stored/s1.ts` | S1 against every stored schedule, $0 |
| `evals/20260928-ir-harness.ts` | this run |

`bun test`: 386 pass, 0 fail (360 existing + 26 new). No check, gate, bind or
UI changed; nothing landed.

Built on `ir-s0` rather than against `main`: S0 already threads `uses`,
`present`, `exit`, `may_invent` through `parseSchedule` and the scene ask,
which S1's `uses`-against-ledger check needs. S0's own failure (the
prose-compliance bet on the scene ask) does not implicate this schema; S0 and
S1 are independent, per the doc's own §13.3 line.

## S1 against the store

`evals/stored/s1.ts`, 45 of 48 stored schedule artifacts resolved via
`chainOf` (the rest lack a pinned ledger or fail to parse), $0, 392ms total.
14 of 45 raise a finding. On `08aa` it raises the exact bug the doc names
(§11): beat 3 ("First day, 3 March, afternoon") reads earlier in the story
than beat 2 ("3 March 1911, sixth hour") under `linear`, plus 11 withheld
findings from one real inconsistency (an item due at beat 11 is still listed
withheld, `until never`, at beat 11 itself), reported once per beat that
promised the reveal — noisy, not wrong; a dedupe pass is a follow-up.

## The harness

`evals/20260928-ir-harness.ts`. Each arm runs on a fresh copy of the draw's
brief, held to its own pinned ledger (`copyBrief`, as `evals/replay/run.ts`
does), so nothing stored was touched; every copy draw was archived after its
run. Old arm: `Drafting.check` (gate 1, default checkers: claims, ledger,
structure, resemblance, reader). New arm: S1 ($0) + L1 symbolise + L2 resolve
+ L3 calendar + L4 plan-vs-ledger, under two models for the new stages
(`ir-symbolize`, `ir-plan-ledger`, and L2's `check-claims-verify`/`-confirm`):
`claude-opus-5` (the repo's configured default for every stage touched here)
and `claude-sonnet-5` (the cheaper model the repo already uses by default for
claims verification itself).

## Cost, time, calls

Cost and calls include the brief-copy bookkeeping steps (`execute`,
`outline`, `context`, `ending`, `ledger-extract`), which are `copied`, not
model calls, and cost $0; they inflate the call count by 5 in every row.

| draw | arm | model(s) | calls | cost | wall time |
|---|---|---|---|---|---|
| `08aa` | old (gate 1) | claude-opus-5 + claude-sonnet-5 (claims) | 32 | $3.09 | 146s |
| `08aa` | new S1+S2 | claude-opus-5 | 31 | $3.88 | 144s |
| `08aa` | new S1+S2 | claude-sonnet-5 | 15 | **$0.78** | 271s |
| `e33a` | old (gate 1) | claude-opus-5 + claude-sonnet-5 (claims) | 34 | $2.00 | 209s |
| `e33a` | new S1+S2 | claude-opus-5 | 32 | $2.50 | 137s |
| `e33a` | new S1+S2 | claude-sonnet-5 | 23 | **$1.15** | 229s |

The cheaper model cuts cost 75-80% against both the old pipeline and the
default-model new pipeline, but takes longer wall time (fewer, slower calls
under low concurrency — `check-claims-verify`/`-confirm` calls run one per
symbol, not batched) and, as the accuracy table below shows, misses the one
defect that needed a model to connect two different ledger lines.

The new pipeline under the default model costs about the same as gate 1
today ($3.88 vs $3.09 on `08aa`; $2.50 vs $2.00 on `e33a`) — this is not yet
the cheaper-and-better case the design doc argues for (§0.4, §12.1's $0.23
plan-check estimate): L1 symbolising the whole ledger into 60+ typed symbols
plus a full L2 resolve pass costs more than the doc's own back-of-envelope
figure for a single lowering call. S1's $0 static checks and L3's $0
arithmetic are exactly as cheap as promised; L1/L2/L4 (the parts that touch a
model) are not yet using shape A of the doc's staged collapse (§12.4), which
folds the plan check into the already-necessary lowering rather than adding
it beside gate 1's existing checkers.

## Accuracy: the three named defects (§3.3)

Ground truth is the design doc's own worked example. The old pipeline's
gate-1 findings (3 per draw, both runs) are reader "unanswered" questions and
one prose contradiction (Holt's "eleven days" line) — **it caught none of
the three named defects, on either draw**, which is the doc's own point: the
delegation and calendar defects live in the plan and the ledger's own
arithmetic, and gate 1 today checks neither.

| defect | old gate 1 | new, claude-opus-5 | new, claude-sonnet-5 |
|---|---|---|---|
| delegation (08aa only, plan vs. ledger) | not caught (doesn't exist at gate 1 time) | **caught** — L4: "The Council proper sits at the capital and sends only a delegation..." contradicted against `hall.blackdoor`/`council.seats`; two independent findings, both naming the telephone/courier line | **not caught** — L4 found 8 findings, all calendar-placement, none naming the delegation |
| calendar (both draws, ledger-internal) | not caught (`checkVerify` drops arithmetic; `derivation` checker off by default) | **caught, redundantly** — L3: 40 findings on `08aa`, 36 on `e33a`, all versions of "day 1 is 3 March, day 11 is 14 March: 10 days apart by count, 11 by date," at $0 | **caught, differently** — L3 found 0 (this run's L1 pass didn't surface enough independent day-anchors), but L4 independently caught 7-8 day-placement contradictions per draw as paid textual findings instead of $0 arithmetic |
| vote (both draws, twelve seats plus a delegate voting, tally twelve) | not caught | **not caught, any arm** — every run's `vote.day11` symbol recorded `voters: 12` (matching `seats: 12`); L1 never connected line 19 ("Guild delegate: Dace...") to line 37's roll count, so there was nothing for L3's arithmetic to catch | same miss |

The vote miss is real and reproduced in all four new-pipeline runs (both
draws, both models): L1's symbolise prompt asks for `voters` as an attribute
of the vote count itself, and nothing tells it to cross-check the named
voters against the body's named seat-holders. A concrete follow-up: ask L1 to
list each named voter beside the tally, so L3 can count them instead of
trusting a model-computed `voters` figure.

## False positives

L4's other findings (7 on `08aa`/opus, 7 on `e33a`/opus, not the delegation
or calendar ones) read as genuine plan-vs-ledger conflicts on manual check —
a Knights headcount, a seating distance, a spoken-word count, a
requisition date against the frame's timing — consistent with the doc's own
account that L4 catches more than the three named defects once it exists.

One clear false positive: under `claude-sonnet-5` on `08aa`, L3 flagged
`knights: 9 voters against 12 seats`. The ledger's line ("Nine Knights
remain of twelve: two fallen, one rumoured traitor") is a headcount, not a
vote; this run's L1 mislabelled a "remaining of total" fact using the
vote-count schema's `seats`/`voters` names. The fact itself is true (9 ≠
12); the label is wrong. A schema fix (a `remaining`/`total` kind separate
from `seats`/`voters`) is a follow-up, not done here.

L2 also resolved one symbol `CONTRADICTED` against the setting on `08aa`
(`prophecy.targeting`) and two on `e33a` (`circle.third`, `thing.stairs`),
none of which are in the doc's §3.3 table — plausible catches, but there is
no ground truth here to score them against; flagging as unverified, not as
either a hit or a false positive. Under `planGateAuto`'s rule (no static
error, no `CONTRADICTED` symbol), both draws would correctly **hold**, not
auto-pass, under the default model: `08aa` on its S1 monotonic finding plus
this symbol, `e33a` on the two `CONTRADICTED` symbols alone.

## Not run

- S4 (conformance screen), S5, S6: out of scope for this pass, per the task.
- A third model or a repeat run to separate real variance from one-shot luck:
  L1's non-determinism (catching the calendar defect via 40 redundant
  findings under opus, zero under sonnet, on the same ledger) means one run
  per arm is a single sample, not a distribution. `lab canon`-style repeated
  reads would cost roughly what this harness already spent, again.
- Tuning L1's prompt to fix the vote miss: the follow-up above is not applied
  here, so the reported vote result is the prompt's first, untuned attempt.
