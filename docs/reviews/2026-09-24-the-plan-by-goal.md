# The plan, by goal

24 September. Chris set four principles and seven goals. This plan replaces
the order of `2026-09-24-the-plan-after-the-score-gap.md`. That document and
`2026-09-24-loop-sequence.md` stay the record of why each built piece exists.

Revision 11: plot holes, from a count of every finding the store holds, and
four points from `2026-09-25-evaluation-of-the-plan-by-goal.md`. It adds
steps 12 and 13 and keeps the numbers of steps 1 to 11.

Revision 10: the check loop, from a walk back through the chain `4400` →
`ae64` → `63b0` → `350a` on 25 September. Revision 9 counted findings that
the verify pass had rejected; a red-team round caught it, and this revision
counts only the findings that survived. Revision 8 had come through
seven red-team rounds; the seventh found no fatal issue. Each figure below was read from the
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

**Scope.** This plan serves principles 2, 3 and 4 and the goals. It changes
nothing in ideation (principle 1). In the checks (principle 2) it changes how
long a check pass thinks, when claims are found and repaired, and how the
clean passes run. Steps 12 and 13 change what counts as a finding: they add
the plot holes that no checker asks about today. A step that could weaken
principle 2 is guarded for it or listed under decisions.

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

## Why the checks run so many rounds

The chain `4400` → `ae64` → `63b0` → `350a`, traced back finding by finding.
A finding here is one the verify pass kept. Stored counts every finding the
store holds for the round: the kept ones and those verify dropped. The last column says in which brief a kept finding's quote first
appears.

| Round | Draw | Started by | Passes | Stored | Kept | Of those, claims | Repaired | Kept quote first appears in |
|---|---|---|---|---|---|---|---|---|
| 1 | `4400` | ideation | 1 | 2 | 1 | 0 | 1, auto | the original brief |
| 2 | `ae64` | auto repair | 2 | 7 | 2 | 2 | none; floor | the original brief |
| — | | Chris at gate 1 | | | | | 1 claim, by hand | |
| 3 | `63b0` | that repair | 1 | 13 | 2 | 1 | 1, auto | the original brief |
| 4 | `350a` | auto repair | 3 | 45 | 4 | 4 | none; floor | the original brief |

1. **Every kept finding quotes the original brief.** 9 findings survived
   verify across four rounds, and each quotes text that was there from the
   start. Each repair rewrote 2 or 3 of about 217 sentences.
2. **Most of them are claims against the setting.** 7 of the 9 are claims
   findings. The claims extraction draws a different set of claims each pass
   (10, 23, 12 and 38 claims in the four rounds), so a contradiction in
   unchanged text surfaces only when a pass happens to extract it. "The
   Sisters are deaf by vow" was kept in round 3 and again in round 4.
3. **Auto does not repair a claims finding.** Claims are auto-eligible
   (`drafting.ts:64`), but a claims finding scores 3, under auto's bar of 7
   (`draft.toml` `[repair] stop_score`): its `invalidates` is `none`, so its
   severity is 0, and the setting line it quotes is not in the prose, the
   outline or the ledger, which costs it 2 (`recur.ts:178`). Auto stops at `floor` and leaves it
   for the gate, where a person accepts one, and the next round begins.
4. **The derivation and ledger checks raise many candidates that verify
   rejects.** In rounds 2 to 4 the store holds 58 of theirs; verify dropped
   57. The one they kept, "Aurelle cannot read their hands" in round 3, quotes
   an ending that no repair had touched: three earlier passes, each thinking
   about 2.6k tokens, missed it. The groove line was raised in every round and
   dropped every time.
5. **A pass now thinks several times longer than it did.** With the same
   prompt and model, a derivation or ledger call took up to 0.85 min and 5.1k
   thinking tokens on 22 September, and 1.9–7.8 min and 7.3k–19.8k tokens on
   24 and 25 September. `stages.toml` sets no effort for either stage. What changed
   is not known.
6. **Two of the seven passes are second clean passes** (`CLEAN_PASSES = 2`),
   and one is a second auto run on `350a`. The chain spent 27.6 min and
   $17.14 on checks.

So the rounds come from claims that surface one pass at a time and that only
a person repairs, and the time comes from passes that think far longer than
they used to. The derivation and ledger checks kept one late finding in the
chain, and raised 57 that verify rejected.

## What the checks find

Every brief checker is a contradiction detector. `checkDerivation` holds each
assertion to the one impossibility and does the sums (`prompts.ts:196`).
`checkLedger` holds the vignettes and the ending to the ledger and to each
other (`prompts.ts:210`). Claims hold the brief to the setting. No checker
asks the questions that find a plot hole:

| Kind of defect | Asked today |
|---|---|
| a contradiction of a fact, a figure, a name or a rule | yes, by all three |
| who knows what, and from when | in part: the ledger's `knowledge` lines |
| an event that does not follow from what comes before it | no |
| a choice with an obvious better option the story does not close off | no |
| a setup with no payoff, or a payoff with no setup | no |
| a question a reader asks that the story does not answer | no |
| a red-team pass on the idea (principle 2) | nothing runs one |

Over the 130 draws the store has checked:

| | Count |
|---|---|
| derivation and ledger findings raised | 1,086 |
| dropped by verify | 876 (81%) |
| kept | 210, in 96 draws |
| kept, by `invalidates` | none 91, particulars 40, arithmetic 21, departure 15, knowledge 14, debt audit 11, custody 9, arrival 9 |
| kept, then accepted by auto / passed by auto / no decision | 140 / 19 / 49 |
| kept by both checkers | 92 of 210 |

A read of every sixth kept finding shows mostly figures and details, for
example "the pod is four decks above the bench, not two" and "27 of 180 is
not most". A listener is unlikely to notice these. A smaller part breaks a
rule the story rests on: a returned person who walks when the returned do
not walk; Aurelle losing the reading of hands when the outline takes the
reading of brains; the seal that speaks while Cathal is on the rocks. Much of
the arithmetic is in figures the outline invents, and the listen profile then
cuts numerals from the draft.

| Stage | Calls | List $ | Call minutes |
|---|---|---|---|
| check-derivation and check-ledger | 732 | 49.3 | 1,296 |
| check-verify | 292 | 13.0 | 181 |
| claims extract and verify | 653 | 49.5 | 72 |

The brief checks cost about $0.50 a draw at list. Their cost is the wall time
of the passes and the rounds, which steps 2 to 5 address. What they catch is
continuity. What they miss is not measured: nothing holds a brief with a
known plot hole, so the recall of the checks is unknown. Steps 12 and 13
measure it and then close the gap.

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
| G4 | in the draft `9c02`: 113 claims calls, 5 rebinds and 5 structure screens replaced before anything read them. In the check chain `4400` → `350a`: a claims extraction and verify on every pass over text that changed by 2 or 3 sentences, and two second clean passes | calls whose answer a later call replaces before anything reads it, plus claims calls over text a pass has already checked |
| G5 | $12–14 a listen draft unrestricted; $20–22 under claims; $36.57 for the claims chain, of which $16.03 is ideation, checks and repair | `usage.cost_usd` |
| G6 | the rule in force: 3 judges, 8 passes a judge, about $0.72 a pair | `cost_usd` a judged pair |
| G7 | 15,940 lines of tracked non-test source, TypeScript with the UI's `.tsx`, and Python (12,019 without `.tsx`) | `wc -l` |

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
in step 7, before it judges any arm; step 10 uses the same figure as the
bind's noise floor. The arm lands if its count a beat does not exceed the
control's by more than the larger of that disagreement and the spread
between the control's own drafts. About 12 calls a draft, $1.4–2.5, no panel. `bind()` itself writes
findings, patches, verdicts and steps on the arm's draw
(`scenesession.ts:152-163`, `draw.ts:136-141`), so the reference reading
needs its own path that records on a separate draw; step 7 builds it.

**Checks.** A change to the check loop is replayed on the chains of 24 and
25 September, from each chain's original brief, and compared on the findings
verify keeps. It must keep every claims finding the stored rounds kept. A
derivation or ledger finding it misses counts against it only if a second
replay run of today's loop keeps it; that second run is the noise floor, since
the stored findings came from more passes than a replay makes. A change that also repairs more
unattended is read by a person on the repaired text, since no replay can
repeat a gate decision. It costs Claude calls, not a panel.

**Plot holes.** A change to what the checks ask is also run on step 12's
plot-hole set. It must catch at least the plants today's loop catches, kind
by kind, over two runs. The set has no truth for a hole nobody planted, so a
person reads what the change keeps on the replayed chains.

## The order

| # | Step | Goals | Guard | Adds | Removes |
|---|---|---|---|---|---|
| 1 | **Skip what the round replaces, and one claims screen a draft.** In `registerRewrites`, `regenerate(k)` neither rebinds nor re-screens k+1 when k+1 is due in the same round. The first-pass screen and every automatic rewrite skip the claims screen; `scenes` runs it once when the rewrites end, even when none ran, and records each beat's findings under that beat's latest pass so `screenFindings` (`chain.ts:122-126`) shows them. A gate-2 `rewrite k` still screens. | G4, G5, G1 | same prompts: the scene and bind prompts of k+1 are the same bytes (`write.ts:174-183`). A test pins the call count. A second test asserts the one change a person sees: gate 2 shows the claims of the final text, where today each beat shows the claims of the last rewrite that screened it | a flag on `regenerate`; the per-beat pass bookkeeping | under claims, 123 calls, about 12.7 min and $10.3 a draft (`9c02`); with no claims, the 5 rebinds and 5 screens, about 6.4 min and $1.40, estimated from `9c02` |
| 2 | **Measure how long a check should think.** On briefs from 24 and 25 September, run the derivation and ledger checks at today's setting twice, then at effort `medium` and `low`. Compare the findings verify keeps, the time and the cost; the round-3 finding "Aurelle cannot read their hands" is the case to watch, since passes that thought 2.6k tokens missed it. Effort is a `stages.toml` key per stage (`config.ts:192`). | G1, G5, principle 2 | checks: the kept findings against today's twice-run spread | — | if a lower effort keeps the same findings, most of each pass's 3–4 min |
| 3 | **Find the claims once.** Round 1 runs the claims extraction several times and verifies the union; the chain cache already holds the verdicts (`check.ts:224-226`). A later round extracts claims only from the sentences its repair changed, each with its paragraph so that a pronoun keeps its referent, and from the new ledger amendments, which can void a line (`chain.ts:37-38`). A claim is a single span checked against the setting, so no pair of unchanged sentences is lost. | G4, G5, G1, principle 2 | checks: every claims finding the stored rounds kept appears in round 1 | a sentence diff between a repair and its source | a claims extraction and its verify calls on every pass over unchanged text, about $1 and 40 s a pass |
| 4 | **Repair a contradicted claim in the round that finds it.** Auto accepts a claims finding that verify kept as `contradicted` with a quoted line from the setting, whatever its score, and reconcile holds it with the round's other fixes. Today it scores 3 and waits for the gate. On a conflict reconcile keeps the fix earlier in the list, and the list is sorted by score (`drafting.ts:442-446`), so a claim at 3 would always lose. The accept rule puts an accepted claim first: the setting is canon, and a derivation or ledger fix is not. | G1, principle 2 | checks, and a person reads the repaired text of the replayed chains | an accept rule for claims in `autoRounds`, and its place at the head of the list | a gate round for each claim; three of this chain's four rounds |
| 5 | **One clean pass at four samples.** In place of two clean passes of two samples each, one pass of four. The samples run at once, so the wall time halves. The recurrence score reads samples run (`chain.ts:164-168`), and `score` gives 3 only when a finding recurs in every sample, 2 when it misses one, and 1 otherwise (`recur.ts:182`). So 2 of 4 would score 1 where 1 of 2 scores 2 today, and a finding at 7 would fall to 5, under `stop_score`. The step scores recurrence as a share: 3 in every sample, 2 in half or more, 1 below that. At 1, 2 and 3 samples that gives today's scores exactly, so the screens and today's passes do not move; at 4 it scores 2 of 4 as 1 of 2 scores today. The replay checks that auto stops at the same findings. `recheck` is called with no sample count (`drafting.ts:212`, `:382`, `:401`), and the pass after a repair runs before auto knows it is clean, so every post-repair pass runs four samples. | G1, G4 | checks | a sample count on every post-repair pass; recurrence as a share | the second clean pass |
| 6 | **Fewer judges.** Re-pool every stored experiment of 24 September without each judge in turn. Remove a judge whose absence leaves every reading outside the margin on its side; try Gemini first, then GLM. | G6, G2 | the stored log | — | Gemini: 61% of the spend. GLM: 17%, and 2–8 min of every judged run |
| 7 | **The comparison runner.** `lab compare --arm <draws> --arm <draws>`: pairs across arms matched by source, both orders, the score gap per arm pair, and the within-arm pairs as the floor. The same command judges a draw against a transcript, so G3 has an instrument in the repository. Arms are drafted in their own worktrees with `cloudchamber branch` and judged from the main checkout, so the log lands in `main`'s `bank/` (`paths.ts:5-7`). A bind in an arm writes its verdicts to the worktree's `bank/` (`scenesession.ts:163`), so the arm run sets `CLOUDCHAMBER_BANK` (`paths.ts:6`) to `main`'s. | G2, G3 | the stored runs re-pool to their published numbers | arm pooling in `pool.ts`; a command; the read-only reference bind of the canon guard | nothing tracked: the transcript scripts were never committed |
| 8 | **The listen ceilings.** First type the ceilings in `draftconfig.ts`: today `rewritePlan` reads them untyped (`drafting.ts:82`), and a misspelt override adds a new key while the ceiling stays at 0.12 (`draftconfig.ts:68-71`), so the arm silently does nothing. Then one comparison, three arms: today; the numeral counter not counting clock times; that plus `long_share_max = 0.15`. The counter is shared (`listen.ts:49,98`, `report.ts:120`, `drafts.ts:81`), so the pool figure that `numerals_max` was set against is measured again first. | G1, G5 | changed output | the types | about half the length rewrites across the stored drafts; a third in `9c02` |
| 9 | **Write in sequence, then bind at once.** In the first pass, write every beat in sequence from the unbound text of the beats before it, then bind all beats at once, as the `parallel` order already binds (`scenesession.ts:124-125`). In each rewrite round, write the due beats in sequence, each from the new text before it, as today (`drafting.ts:484-487`); then bind every rewritten beat against its new predecessor, and every beat after a rewritten one that is not itself due, all at once; then screen once, over every rewritten and every rebound beat, so each gets a new pass and gate 2 shows its new flags (`chain.ts:96-127`). Today `registerRewrites` awaits each rewrite's binds and screen in turn (`drafting.ts:508-517`). A bind's patch to beat k no longer reaches the writing of k+1, and a bind of k+1 reads k before k's own patch lands; each beat still reads the new text of the beat before it. The canon guard is what measures both. Binds that start together miss the prompt cache (ADR-0010), about $1.2 a draft. | G1 | changed output, and canon | — | the inline bind (`scenesession.ts:128`), the serial rewrite loop and step 1's flag on `regenerate`; the first pass from about 16 to about 7 min, the rewrite phase from about 14 to about 6 |
| 10 | **Effort `low` on the bind.** First the noise floor: the stored bind prompts run again at today's setting, to learn how often the bind agrees with itself. Effort is a `stages.toml` key only (`config.ts:192`), so each arm is a commit. | G1, G5 | changed output, and canon | — | unknown: 4.1k of the bind's 4.5k output tokens are thinking |
| 11 | **Delete what nothing uses.** `evals/judge.py` and `evals/tally.py` (270 lines; `rubric.test.ts` and `pool.test.ts` already run on fixtures, so only their reference comments change). `app/pipeline/lab/beats.ts` and its test (191 lines; nothing else imports it, and beat branches are dropped). The per-beat half of `rubric.ts` that only `beats.ts` calls (`BeatPlan`, `beatPrompt`, `beatComplete`, `beatAxes`, from line 103) and its tests. The three other exports used nowhere: `StoryRow`, `DrawAction`, `OffList`. | G7 | the suite | — | about 540 lines |
| 12 | **A plot-hole set.** Take 5 briefs that passed gate 1, 3 unrestricted and 2 under claims. Plant 3 plot holes in each, 15 in all, 3 of each kind: an event that does not follow, a choice with an obvious better option the brief does not close off, a fact a character acts on before they can know it, a setup with no payoff, and a broken outline rule. Each plant changes one vignette or the ending, and `evals/plotholes/` records its span and its kind. Run today's check pass twice on each brief and count, by kind, the plants that verify keeps. The broken rules are the control: today's checks should catch them. | principle 2 | none: it changes no code path | a fixture of 15 plants and a count | — ; it costs about $5 and 30 min |
| 13 | **A reader check.** A sixth checker, `reader` (`check.ts:31`), reads the brief as a skeptical reader and reports each question the story raises and does not answer: an event with no cause in the brief, a choice whose better option the brief does not close off, a fact a character acts on before they can learn it, and a setup with no payoff. It runs once a chain, in round 1, as structure and resemblance already do (`check.ts:48`). A repair changes 2 or 3 sentences, so this assumes a repair does not open a hole. Verify needs its own question for these findings: today it drops a finding whose evidence is not a quote that conflicts (`prompts.ts:279`, `:289`), and a plot hole is an absence, not a conflict. A reader finding does not reach auto's bar. It goes to the gate, because its repair can change the outline. It lands only if step 12 shows that today's checks miss the kinds it asks about. | principle 2 | checks, and plot holes: recall on the four new kinds rises, and the control holds | a checker; its prompt and its verify question | — ; about 2 calls and $0.15 a chain, beside the other round-1 checkers |

Steps 1, 2, 6, 7 and 11 need no panel. Step 1's two halves land together:
skipping the rebind of k+1 changes the story a claims extraction reads, unless
the claims screen has already moved to the end. Steps 2 to 5 go in order and
need no panel. Step 2 comes first because it may change what every pass
costs; step 4 depends on step 3, since a claim found once in round 1 is
repaired once. Step 7 runs steps 8 to 10, which go as one
judged series in that order, each against the last arm that landed. Step 11
can run at any point; it touches no prompt.

Step 9 removes step 1's flag on `regenerate`. That cost is accepted: step 1
lands on a test alone and saves about $10.3 a claims draft now, and step 9
waits for step 7's runner.

Step 12 runs before step 2. Step 2 reads the plot-hole set as well as the
stored chains: a lower effort that keeps the stored findings but loses planted
holes does not land. Step 13 follows step 3, so that a round-1 pass holds
every checker that runs once.

Four limits on step 7. Every worktree shares one store (`paths.ts:33`), so
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

**The check chain.** Today, `4400` → `350a`: 7 passes, 27.6 min, $17.14.
Steps 3 and 4 would have found and repaired this chain's claims in round 1.
The late derivation finding still needs a round, unless step 2's setting
finds it in round 1: 2 or 3 passes where there were 7. Step 5 halves the closing pass's wall time. What a pass costs after
step 2 is not known; at today's 3–4 min a call it is about 5 min, and at the
22 September figure about 1 min. So the chain's checks come to about 2 to 15
min, against 27.6.

| After step | Claims draft wall | Claims draft $ | Basis |
|---|---|---|---|
| today | 51.8 min | 20.54 | `9c02` |
| 1 | about 39 min | about 10.2 | 5 binds and screens, 6.4 min, $1.40; 9 claims rescreens at about 0.7 min, $8.9 |
| 8 | about 32 min | about 8.7 | a third of the 9 rewrites in `9c02`, at about 2.3 min and $0.50 each |
| 9 | about 15 min | about 9.9 | the first pass from 16 to 7 min; the rewrite phase from about 14 to about 6 (the scene calls stay in sequence, the binds go at once); cache misses add about $1.2 |
| 10 | unknown | unknown | depends on how much of the bind's thinking effort removes |

Across the stored drafts, step 8 removes about half the length rewrites, not
a third; `9c02` is the conservative case.

**G1.** An unrestricted chain with no repair round, after steps 1, 8 and 9:
2 min ideate, 2–10 min check, about 13–17 min draft. That is about 17–29
min: **G1 is met when the check passes are short**, and step 10 widens the
margin. **A claims chain comes to about 21–33 min** after steps 2 to 5: 2 min
ideate, 2–15 min of checks, 1.5 min of repair, about 15 min draft. **G1 on a
claims chain is not met by this plan**; its best case is about 21 min.

**G5.** The draft phase meets −50% under claims after step 1 ($20.54 to about
$10.2). The reference chain `88c3` → `9c02` spent $16.03 on ideation, five
check passes and repair. After steps 3 to 5 its checks are a round-1 pass
with about six claims extractions, and post-repair passes at four samples of
about $4.7 each, so that part comes to about $12–14, and the chain to about
$22–24: −35 to −40%. **G5 at the chain is not met by this plan** unless step
2 finds a lower effort that keeps the findings. An unrestricted draft moves by
about $1.40 in step 1 and the rest in steps 8 to 10.

**G4.** Step 1 removes all 123 replaced calls in `9c02`. Steps 3 to 5 take the
claims chain from 7 passes to 2 or 3 and stop the claims calls over
unchanged text. With step 1, G4 is met.

**G6.** Against the rule in force, removing Gemini meets −50% alone (−61%).
Removing GLM gives −17%. If neither re-pools cleanly, reading at 4 passes a
judge when the reading is a mean over several pairs gives −50%, which the
last plan already allows.

**G2.** A change judged on stored draws, with GLM gone: about 3 min of
judging. A change that needs new drafts: the draft time plus the judge, about
18 min after step 9.

**G7.** Removed: about 540 lines (the Python pair, `lab/beats.ts`, the
per-beat rubric and three unused exports),
a judge, the inline bind and the serial rewrite loop. Added: a flag and the
per-beat bookkeeping (step 1); a sentence diff (step 3); an accept rule for
claims (step 4); a sample count on post-repair passes (step 5); arm pooling, a command and the
reference bind (step 7); the ceiling types (step 8); the round-at-once
rewrite (step 9); a sixth checker, if step 12 shows the gap (step 13).
**Drafting ends with fewer mechanisms, and the line total likely ends a
little smaller: the deletions are counted, the additions are estimates.** The
line count at the end of step 11 is the reading.

## Decisions for Chris

| Decision | Options | Recommendation |
|---|---|---|
| G2 for writer changes | < 10 min is unreachable while a draft takes 20+ min | G2 applies to changes judged on stored draws; a writer change's loop is the draft time plus 3 min |
| G1's length | the listen profile (10,000 words, about 12 beats) or the default (5,000 words, 5–10 beats); draft time scales with beats | measure G1 at the listen profile, since that is what gets drafted |
| Auto repairs a contradicted claim (principle 2, step 4) | today a claims finding scores 3 and waits for a person; auto would repair it on verify's verdict and a quoted line from the setting | repair it: the verdict carries its evidence, and the replacement changes only the figure or rule that conflicts. A person reads the replayed chains' repairs before it lands |
| Effort on the checks (principle 2) | step 2 measures it | set it from step 2's result |
| The reader check (principle 2, step 13) | build it if step 12 shows the gap; or keep the checks to continuity | build it if the gap shows. Principle 2 names plot holes and red-team passes, and no check asks for either. Its findings go to a person, so a false one costs a gate decision, not an unattended repair |
| The claims screen (principle 2) | keep it, once a draft (step 1); or turn it off, $9.94 and 126 calls a draft | keep it: it is the only check of drafted text against the setting. Its 304 unverifiable of 309 looks like an extraction fault, a principle-2 follow-up |
| Best of 3 (principle 3) | a default, or a command | a command. The drafts run in parallel, so the wall time barely moves, but the Claude cost triples, against G5 |

## Rules that hold

- A changed-output step lands through step 7's comparison, not before.
- A change to the check loop lands through the replay on stored chains.
- An arm is a commit, drafted in its own worktree, judged from `main`.
- Read with the score gap, both orders, 8 passes a judge for one pair.
- Keep judge calls in flight under about 24 at once: about 120 at once
  failed 114 of 360 passes. Claude calls have no such limit, and nothing
  enforces one; their cost is the slowdown in the load column of the first
  table. After step 9 a draft starts about 12 binds at once, so six
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
| the two clean passes at once | step 5 runs one pass of four samples, which needs no pass-identity refactor |
| carrying derivation and ledger findings between rounds, with a delta question | of the later rounds' 8 kept findings, 7 were claims and 1 quoted untouched text a delta question would not re-ask; a score is recomputed from the latest pass, and findings under `keep_if` are not stored, so a carried finding changes score |
| dropping `supported` findings before verify | verify is two calls a pass, not one a finding, and the gate already hides what verify drops |
| the thirty-word figure in the register | a new clause under the accretion rule; step 8 moves the ceiling instead |
| a floor lookup from the log | `lab best` judges sibling pairs as `rank`; there is no separate floor to look up |
| capping GLM | a 120 s cap fails 123 of its 244 passes |
| deleting the restated screen | a gate-2 `rewrite k` reads its flags (`drafting.ts:467`), and so does `report.ts:152` |
| deleting the `parallel` scene order | it has tests, and step 9 builds on it |
| beat branches as a loop | `judgeableBeats` judges only the branch beat; no calibration point exists |

## Open questions

- **The panel is a proxy, and it reads text.** No person has heard a draft and
  a channel story side by side. G3 rests on the panel alone.
- **Ideation is outside this plan.** Nothing here measures originality.
- **Do the checks find plot holes?** They find continuity errors: 210 kept
  findings in 130 draws, mostly figures and details. No checker asks about
  causes, choices, setups or unanswered questions. Step 12 measures the miss
  and step 13 closes it. A hole in a kind nobody planted stays invisible.
- **Plot holes in the draft.** The draft invents past the brief, and the bind
  checks only contradiction. Step 13 reads the brief, not the story.
- **Why does a check pass think six times longer than on 22 September?**
  The prompt and the model are the same. Step 2 measures what effort buys
  back, not why it changed.
