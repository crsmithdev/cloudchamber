# The plan, by goal

24 September. Chris set four principles and seven goals. This plan replaces
the order of `2026-09-24-the-plan-after-the-score-gap.md`. That document and
`2026-09-24-loop-sequence.md` stay the record of why each built piece exists.

Revision 8, after seven red-team rounds. The seventh found no fatal issue. Each figure below was read from the
store, `bank/judgements.jsonl` or the code at `main`.

## Principles

- A highly configurable ideation pipeline that produces creative, original
  story ideas.
- Fact checks and red-team passes on each idea, against plot holes,
  non-sequiturs and canon violations.
- Drafts of compelling, best-in-class narratives, for reading and for audio
  drama.
- Evaluation against judge panels, per draft and against known examples.

## Goals

| # | Goal | Target |
|---|---|---|
| G1 | Idea to drafted story, gate waits excluded | < 20 min |
| G2 | Code or prompt change to judged result | < 10 min |
| G3 | Quality against the transcripts and premises used for comparison | hold the bar |
| G4 | Work repeated across check and draft runs | −80% |
| G5 | Claude usage at list price | −50% |
| G6 | OpenRouter judge spend | −50% |
| G7 | Codebase simplicity and elegance | fewer lines and fewer mechanisms at the end of the plan |

**Scope.** This plan serves principles 3 and 4 and the goals. It changes
nothing in ideation (principle 1) or in what the checks find (principle 2),
and it must not make either worse. A step that could weaken principle 2 is
either guarded for it or listed under decisions.

## Where the time goes

A draft is a first pass, one write and one bind a beat in sequence, then
rewrites that the listen and structure screens ask for. Six listen drafts with
usage recorded, drafted from beat 1, at the listen profile's 10,000 words and
about 12 beats:

| Draft | Setting | Rewrites | First pass | Draft wall | List $ | Draws running at once |
|---|---|---|---|---|---|---|
| `c933` | none | 12 | 9.3 min | 25.4 min | 12.40 | 1 |
| `3f55` | none | 10 | 17.3 min | 42.0 min | 12.15 | 1 |
| `7797` | none | 10 | 19.7 min | 36.0 min | 13.19 | 1 |
| `f20a` | claims | 5 | 15.6 min | 32.0 min | 13.26 | 6 |
| `9c02` | claims | 9 | 16.0 min | 51.8 min | 20.54 | 9 |
| `de03` | claims | 9 | 17.2 min | 50.6 min | 21.73 | 9 |

What the store and the code show:

1. **The bind is most of the time, in the first pass and in each rewrite.**
   In `9c02` the scene calls sum to 8.4 min and the binds to 34.5 min. A bind
   emits a median of 4.5k output tokens, 4.1k of them thinking; a scene about
   1.2k. A rewrite is one scene call (`drafting.ts:487`) and two binds
   (`:488`, `:490`).
2. **The length ceiling sends most rewrites back.** Since `ee5e235` (21 Sep)
   the register states both listen rules (`prompts.ts:373`). Since then, 37
   rewrites carried the length line and 33 of them reached the ceiling; 8
   carried the numeral line. `c933` predates `ee5e235`; its figures are clock
   times, which the counter counts (`listen.ts:35`) and the register asks for
   ("Give the hour").
3. **The claims screen runs over the whole story after the first pass and
   after every rewrite** (`drafting.ts:297`, `:491` → `scenesession.ts:213-215`).
   No automatic rewrite reads it: `rewritePlan` reads the structure and listen
   profiles only (`drafting.ts:79-90`). In the draft phase of `9c02`: 10
   extractions, 116 verify calls, $9.94.
4. **A rewrite rebinds and re-screens the beat after it, even when that beat
   is due in the same round** (`drafting.ts:488-491`). In `9c02`, 5 of 8
   rebinds were replaced within the round.
5. **The two clean check passes run one after the other on the same brief**
   (`CLEAN_PASSES = 2`, `drafting.ts:66`, `:398-401`), and neither reads the
   other. The second pass earns its place: in 5 of 24 stored rounds it found
   an accepted finding the first had not. The claims chain `88c3` → `91bf`
   → `9c02` ran five passes, about 21 min of its 77; its repair calls took
   about 1.5 min.

The judge side:

| Judge | p50 | max | Share of spend | Note |
|---|---|---|---|---|
| Gemini 3.1 Pro | 17 s | 37 s | 61% | the noisiest judge |
| GPT-5.1 | 14 s | 30 s | 21% | |
| GLM-4.7 | 123 s | 504 s | 17% | sets the wall time of every judged run |

A judged pair costs $2.04 to $2.23 at 24 passes a judge (median $2.16), and
about $0.72 at 8.

## Baselines

| Goal | Baseline | Unit |
|---|---|---|
| G1 | unrestricted: about 2 min ideate, 2–10 min check, 25–42 min draft. Claims chain with two repair rounds: 77 min | first step to last step of the chain |
| G2 | about 45 min for a writer change: parallel drafts, then GLM | `lab best` `ms.draft` + `ms.judge` |
| G3 | the score gaps of 24 September against Void of Fears and Vox Mortis | the same pairs, panel and passes |
| G4 | in `9c02`: 113 claims calls, 5 rebinds and 5 structure screens replaced before anything read them | calls a draft whose answer a later call replaces before anything reads it |
| G5 | $12–14 a listen draft unrestricted; $20–22 under claims; $36.57 for the claims chain, of which $16.03 is ideation, checks and repair | `usage.cost_usd` |
| G6 | the rule in force: 3 judges, 8 passes a judge, about $0.72 a pair | `cost_usd` a judged pair |
| G7 | 15,940 lines of tracked non-test source, TypeScript and Python | `wc -l` |

G5 is read in list dollars. Drafting runs on the subscription, and nothing
measured links the list price to its limit.

## Guards

**Same prompts.** A change that leaves every prompt byte-identical, and
removes or reorders only calls whose answer nothing reads, needs a test, not
a panel.

**Changed output.** A change that alters any text a model writes, or which
beats get rewritten, needs a judged comparison: arms drafted from one source
with `cloudchamber branch` (the schedule pinned), both orders, the score gap.
It lands if the gap does not fall below `−GAP_MARGIN` over matched pairs.
Two drafts of one arm differ about as much as two arms do
(`evals/20260924-draft-variance-dominates.md`), so a smaller loss would not
show, and the write-up says so.

**Canon.** A change to the bind, or to what a beat reads before its bind,
also needs a canon reading. The bind is the canon check on drafted prose: it
exists because a beat written after a contradiction inherits it
(`scenesession.ts:136-139`). The panel does not count contradictions. The
arm's own bind flags cannot serve either, because a weaker bind records fewer
flags and looks better. So a reference bind, today's model at today's effort,
reads each arm's final text once, read-only, and counts the contradictions
that survive into the story. Its disagreement with itself is measured once,
in step 3, before it judges any arm; step 6 uses the same figure as the
bind's noise floor. The arm lands if its count a beat does not exceed the
control's by more than the larger of that disagreement and the spread
between the control's own drafts. About 12 calls a draft, $1.4–2.5, no panel. `bind()` itself writes
findings, patches, verdicts and steps on the arm's draw
(`scenesession.ts:152-163`, `draw.ts:136-141`), so the reference reading
needs its own path that records on a separate draw; step 3 builds it.

## The order

| # | Step | Goals | Guard | Adds | Removes |
|---|---|---|---|---|---|
| 1 | **Skip what the round replaces, and one claims screen a draft.** In `registerRewrites`, `regenerate(k)` neither rebinds nor re-screens k+1 when k+1 is due in the same round. The first-pass screen and every automatic rewrite skip the claims screen; `scenes` runs it once when the rewrites end, even when none ran, and records each beat's findings under that beat's latest pass so `screenFindings` (`chain.ts:122-126`) shows them. A gate-2 `rewrite k` still screens. | G4, G5, G1 | same prompts: the scene and bind prompts of k+1 are the same bytes (`write.ts:174-183`). A test pins the call count. A second test asserts the one change a person sees: gate 2 shows the claims of the final text, where today each beat shows the claims of the last rewrite that screened it | a flag on `regenerate`; the per-beat pass bookkeeping | under claims, 123 calls, about 12.7 min and $10.3 a draft (`9c02`); with no claims, the 5 rebinds and 5 screens, about 6.4 min and $1.40, estimated from `9c02` |
| 2 | **Fewer judges.** Re-pool every stored experiment of 24 September without each judge in turn. Remove a judge whose absence leaves every reading outside the margin on its side; try Gemini first, then GLM. | G6, G2 | the stored log | — | Gemini: 61% of the spend. GLM: 17%, and 2–8 min of every judged run |
| 3 | **The comparison runner.** `lab compare --arm <draws> --arm <draws>`: pairs across arms matched by source, both orders, the score gap per arm pair, and the within-arm pairs as the floor. The same command judges a draw against a transcript, so G3 has an instrument in the repository. Arms are drafted in their own worktrees with `cloudchamber branch` and judged from the main checkout, so the log lands in `main`'s `bank/` (`paths.ts:5-7`). A bind in an arm writes its verdicts to the worktree's `bank/` (`scenesession.ts:163`), so the arm run sets `CLOUDCHAMBER_BANK` (`paths.ts:6`) to `main`'s. | G2, G3 | the stored runs re-pool to their published numbers | arm pooling in `pool.ts`; a command; the read-only reference bind of the canon guard | nothing tracked: the transcript scripts were never committed |
| 4 | **The listen ceilings.** First type the ceilings in `draftconfig.ts`: today `rewritePlan` reads them untyped (`drafting.ts:82`), and a misspelt override adds a new key while the ceiling stays at 0.12 (`draftconfig.ts:68-71`), so the arm silently does nothing. Then one comparison, three arms: today; the numeral counter not counting clock times; that plus `long_share_max = 0.15`. The counter is shared (`listen.ts:49,98`, `report.ts:120`, `drafts.ts:81`), so the pool figure that `numerals_max` was set against is measured again first. | G1, G5 | changed output | the types | about half the length rewrites across the stored drafts; a third in `9c02` |
| 5 | **Write in sequence, then bind at once.** In the first pass, write every beat in sequence from the unbound text of the beats before it, then bind all beats at once, as the `parallel` order already binds (`scenesession.ts:124-125`). In each rewrite round, write the due beats in sequence, each from the new text before it, as today (`drafting.ts:484-487`); then bind every rewritten beat against its new predecessor, and every beat after a rewritten one that is not itself due, all at once; then screen once, over every rewritten and every rebound beat, so each gets a new pass and gate 2 shows its new flags (`chain.ts:96-127`). Today `registerRewrites` awaits each rewrite's binds and screen in turn (`drafting.ts:508-517`). A bind's patch to beat k no longer reaches the writing of k+1, and a bind of k+1 reads k before k's own patch lands; each beat still reads the new text of the beat before it. The canon guard is what measures both. Binds that start together miss the prompt cache (ADR-0010), about $1.2 a draft. | G1 | changed output, and canon | — | the inline bind (`scenesession.ts:128`), the serial rewrite loop and step 1's flag on `regenerate`; the first pass from about 16 to about 7 min, the rewrite phase from about 14 to about 6 |
| 6 | **Effort `low` on the bind.** First the noise floor: the stored bind prompts run again at today's setting, to learn how often the bind agrees with itself. Effort is a `stages.toml` key only (`config.ts:192`), so each arm is a commit. | G1, G5 | changed output, and canon | — | unknown: 4.1k of the bind's 4.5k output tokens are thinking |
| 7 | **Delete what nothing uses.** `evals/judge.py` and `evals/tally.py` (270 lines; `rubric.test.ts` and `pool.test.ts` already run on fixtures, so only their reference comments change). `app/pipeline/lab/beats.ts` and its test (191 lines; nothing else imports it, and beat branches are dropped). The per-beat half of `rubric.ts` that only `beats.ts` calls (`BeatPlan`, `beatPrompt`, `beatComplete`, `beatAxes`, from line 103) and its tests. The three other exports used nowhere: `StoryRow`, `DrawAction`, `OffList`. | G7 | the suite | — | about 540 lines |
| — | **Held: the two clean passes at once.** It would save about 9 of the claims chain's 21 check minutes. It needs every chain read scoped to one pass id (`chain.ts:157`, `:329-333`, `:357`), a first pass that `accept` does not start (`drafting.ts:212`), a draw status that two passes do not both write (`lifecycle.ts:136,147`), and a second ledger extraction avoided (`check.ts:92`). That is a refactor of the chain's state with a principle-2 risk, and it adds a mechanism. Build it only if G1 on the claims chain is worth that. | G1 | a refactor | pass-scoped reads; a speculative pass | — |

Steps 1, 2, 3 and 7 need no panel. Step 1's two halves land together:
skipping the rebind of k+1 changes the story a claims extraction reads, unless
the claims screen has already moved to the end. Step 3 runs steps 4 to 6,
which go as one judged series in that order, each against the last arm that
landed. Step 7 can run at any point; it touches no prompt.

Four limits on step 3. Every worktree shares one store (`paths.ts:33`), so
all arms must be at one schema version. `branch` copies the source's stored
`draft_config` (`drafting.ts:123`), so an arm that changes `draft.toml` must
pass `--profile listen`, the control arm too: the stored configs of `c933`,
`3f55` and `7797` differ from today's profile in chronology and screens.
`resolved()` then reads the arm's own `draft.toml`
(`drafting.ts:121-122`); without it the arm drafts from the source's stored
config, and `branch` takes no other override (`cli/main.ts:224-227`). A worktree has no `corpus/`
link, so a setting arm fails (`settings.ts:140`) and the listen pool is
silently empty (`listen.ts:70`); the arm run links it first.

## What the steps are expected to move

From the stored step timings of `9c02`, each step taken from what the steps
before it leave.

| After step | Claims draft wall | Claims draft $ | Basis |
|---|---|---|---|
| today | 51.8 min | 20.54 | `9c02` |
| 1 | about 39 min | about 10.2 | 5 binds and screens, 6.4 min, $1.40; 9 claims rescreens at about 0.7 min, $8.9 |
| 4 | about 32 min | about 8.7 | a third of the 9 rewrites in `9c02`, at about 2.3 min and $0.50 each |
| 5 | about 15 min | about 9.9 | the first pass from 16 to 7 min; the rewrite phase from about 14 to about 6 (the scene calls stay in sequence, the binds go at once); cache misses add about $1.2 |
| 6 | unknown | unknown | depends on how much of the bind's thinking effort removes |

Across the stored drafts, step 4 removes about half the length rewrites, not
a third; `9c02` is the conservative case.

**G1.** An unrestricted chain with no repair round, after steps 1, 4 and 5:
2 min ideate, 2–10 min check, about 13–17 min draft. That is about 17–29
min: **G1 is met when the check passes are short**, and step 6 widens the
margin. **A claims chain with two repair rounds comes to about 40 min**: 2
min ideate, 21 min of five check passes, 1.5 min of repair, about 15 min
draft. The held step takes about 9 min off that. On the claims chain the
check passes, not the draft, are what stand between the plan and G1.

**G5.** The draft phase meets −50% under claims after step 1 ($20.54 to about
$10.2). The claims chain goes from $36.57 to about $26: −29%. Ideation,
checks and repair ($16.03) do not move in this plan. An unrestricted draft
moves by about $1.40 in step 1 and the rest in steps 4 to 6. **G5 at the
chain is not met by this plan.** The lever left is effort on the checks,
which is a principle-2 decision.

**G4.** Step 1 removes all 123 replaced calls in `9c02`.

**G6.** Against the rule in force, removing Gemini meets −50% alone (−61%).
Removing GLM gives −17%. If neither re-pools cleanly, reading at 4 passes a
judge when the reading is a mean over several pairs gives −50%, which the
last plan already allows.

**G2.** A change judged on stored draws, with GLM gone: about 3 min of
judging. A change that needs new drafts: the draft time plus the judge, about
18 min after step 5.

**G7.** Removed: about 540 lines (the Python pair, `lab/beats.ts`, the
per-beat rubric and three unused exports),
a judge, the inline bind and the serial rewrite loop. Added: a flag and the
per-beat bookkeeping (step 1); arm pooling, a command and the reference bind
(step 3); the ceiling types (step 4); the round-at-once rewrite (step 5).
**Drafting ends with fewer mechanisms, and the line total likely ends a
little smaller: the deletions are counted, the additions are estimates.** The
line count at the end of step 7 is the reading.

## Decisions for Chris

| Decision | Options | Recommendation |
|---|---|---|
| G2 for writer changes | < 10 min is unreachable while a draft takes 20+ min | G2 applies to changes judged on stored draws; a writer change's loop is the draft time plus 3 min |
| G1's length | the listen profile (10,000 words, about 12 beats) or the default (5,000 words, 5–10 beats); draft time scales with beats | measure G1 at the listen profile, since that is what gets drafted |
| The claims chain and G1 | accept about 40 min; build the held step for about 31; or cut repair rounds or `CLEAN_PASSES`, which lets about 1 brief in 5 through with a defect | accept, and hold the step |
| Effort on the checks (principle 2) | `medium` on the checks, guarded by recall against their own noise floor on the 24 stored clean-pass rounds; the only lever on the chain's $16 | measure the noise floor first, then decide |
| The claims screen (principle 2) | keep it, once a draft (step 1); or turn it off, $9.94 and 126 calls a draft | keep it: it is the only check of drafted text against the setting. Its 304 unverifiable of 309 looks like an extraction fault, a principle-2 follow-up |
| Best of 3 (principle 3) | a default, or a command | a command. The drafts run in parallel, so the wall time barely moves, but the Claude cost triples, against G5 |

## Rules that hold

- A changed-output step lands through step 3's comparison, not before.
- An arm is a commit, drafted in its own worktree, judged from `main`.
- Read with the score gap, both orders, 8 passes a judge for one pair.
- Keep judge calls in flight under about 24 at once: about 120 at once
  failed 114 of 360 passes. Claude calls have no such limit, and nothing
  enforces one; their cost is the slowdown in the load column of the first
  table. After step 5 a draft starts about 12 binds at once, so six
  comparison drafts start about 72. G2's figures assume one draft at a time
  and are optimistic for a comparison until that is measured.

## Dropped, and why

| Proposal | Why |
|---|---|
| a `timeline` command | `report.ts` already sums cost by stage and prints the time from seed to gate 2 |
| a quiet rerun of a claims chain | about 77 min and $36 for a baseline that step 1's call counts do not need; G1 is measured on the first draft after it |
| the bind's own flags as the canon guard | a weaker bind records fewer flags and looks better |
| moving `CLEAN_PASSES`, `AUTO_CHECKERS` and the round ceiling into `draft.toml` | `resolved()` returns the stored config unmerged (`drafting.ts:117-123`), so each key needs a fallback at every read: more surface, not less |
| moving the auto loop into its own module | `autoRounds` calls four private methods and is called back from `autoGate` and `gate.ts:69`: four new public methods or a cycle |
| a claims cache per setting | the chain cache exists; each extraction words its claims anew, so it hits about 10 times in 319 |
| deleting the claims verdict cache | the gate-1 check reads it (`check.ts:226-229`) |
| re-checking only what a repair changed | the ledger check compares every part with every other; finding ids carry the draw id; the stall test reads open findings |
| the thirty-word figure in the register | a new clause under the accretion rule; step 4 moves the ceiling instead |
| a floor lookup from the log | `lab best` judges sibling pairs as `rank`; there is no separate floor to look up |
| capping GLM | a 120 s cap fails 123 of its 244 passes |
| deleting the restated screen | a gate-2 `rewrite k` reads its flags (`drafting.ts:467`), and so does `report.ts:152` |
| deleting the `parallel` scene order | it has tests, and step 5 builds on it |
| beat branches as a loop | `judgeableBeats` judges only the branch beat; no calibration point exists |

## Open questions

- **The panel is a proxy, and it reads text.** No person has heard a draft and
  a channel story side by side. G3 rests on the panel alone.
- **Ideation is outside this plan.** Nothing here measures originality or
  whether the checks find plot holes. That is the next plan's question.
