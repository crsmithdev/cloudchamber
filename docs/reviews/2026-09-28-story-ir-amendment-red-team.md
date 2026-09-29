# Red team: the story IR amendment (§14)

28 September, night. Reviewed: `docs/specs/2026-09-28-story-ir.md` §14 at
commit `d8c6e36` on branch `ir-revision`, as a proposal owed no loyalty.
Method: every claim re-read against `app/pipeline/ir/*.ts` on `ir-s1`, the
harness (`evals/20260928-ir-harness.ts`), the store's copy draws (`2617`,
`9a9c`, `b5a7`, `b7ba`), and `/tmp/ir-harness-result.json`. No model call.

Severity: **fatal** means a conclusion does not follow from the data;
**gap** means a recommendation is under-specified or under-evidenced;
**nit** is a wording or a citation. Code bugs are listed apart and not fixed.

## Fatal

### F1. The calendar paragraph blames the model for a parser bug

§14.2 says that under `claude-sonnet-5` "L1 chose day 0 = 3 March, emitted
everything consistent with 14 March = day 11, and L3 found nothing". The
store says otherwise. Sonnet's L1 emitted ISO dates (`9a9c`, `b7ba`:
`date="1911-03-14"`); opus emitted prose dates (`2617`: `date="14 March
1911"`). `l3Calendar` reads each date through `parseWhen`
(`app/pipeline/ir/s2.ts:106`), which matches only "14 March" or "March 14"
(`app/pipeline/ir/s1.ts:59-60`), so every sonnet anchor was dropped at
`s2.ts:107` before any pair was compared. On `e33a` sonnet's L1 had emitted
the stated pair itself, `day.1 = 1911-03-03` and `day.11 = 1911-03-14`; L3
threw it away. "L3 found 0" under sonnet is a code bug, on both draws.

Consequence: §14.4's "the cheap model: not for L1 or L4" rests on three
legs, and this one is gone. The delegation miss is one run, and F2 gives it
another explanation. The knights label is a schema fault the prompt invites
(C4), not a model fault: opus put `total="9"` on the same line. What is left
is the cost argument, $0.43 against $0.37, which is enough on its own and
should be the stated reason. **Corrected in §14.2 after this review.**

### F2. Every recall claim about L4 is confounded by its finding cap

`irPlanLedger` ends "At most 10 findings" (`app/pipeline/prompts.ts:288`).
On `08aa` under sonnet L4 spent all eight of its findings on one derived
anchoring (§14.2) and none on the delegation; under opus it spent seven of
nine on other things and two on the delegation. A plan whose calendar drift
alone fills the budget cannot show whether the model saw the delegation.
The same cap breaks §14.5's S2′: five planted conflicts on a plan that
already yields seven to nine findings leaves no room to count recall.

Fix before any repeat: take the calendar out of L4's remit (S1′ does dates
at $0) and either raise the cap or plant into a plan with no other
findings. Then the sonnet question costs $0.14 a run to answer.

## Gaps

### G1. L4's precision is nobody's measurement

The eval's "read as genuine plan-vs-ledger conflicts on manual check"
(`evals/20260928-ir-harness.md:115-119`) is the harness author reading seven
findings once. Two of them are judgements, not conflicts: "The Knights
number only a handful" against "nine remain of twelve", and "Holt
delivers his tongues speech at the ninth day's session" against a 1909
speech, which is a conflict only if the beat has him deliver it rather than
recall it. §14.5's S3′ kill rule ("Chris finds fewer than half real") is the
first precision measurement, and it spends the resource the plan of record
calls scarce, a person's hour, on nine findings a draw for five draws.

### G2. The calendar fix as written cannot run

§14.4 says L3 drops any `time` symbol "whose `date` is not quoted in the
ledger (`quoted`, as `s1.ts:155` does)". `quoted` (`app/pipeline/recur.ts:173`)
is a loosened substring match on three or more words; an ISO date is one
token and a prose date is two, so nothing matches either way. The check
needs a parsed comparison, and `parseWhen` needs an ISO branch first (C1).
The offset "from the schedule's beats" is undefined when the beats drift,
and §14.2 shows both stored schedules drift. What the check can return is a
set of pairs that do not agree, for a person; that is a question, which
§14.4 grants for the vote and not for the calendar. And L1's prompt invites
the derived anchors it forbids: "the calendar date it states or implies"
(`prompts.ts:266`) stands two sentences before "do not do the arithmetic
yourself".

### G3. The vote fix moves the same judgement to another field

`member_of` on a person symbol is the same model making the same link that
`voters=` failed to make. The evidence that it is a read and not an
inference is the ledger's own prefix, "Guild delegate: Dace" (line 19),
which all three runs carried into the symbol's text and two into a
`role` attribute. That is favourable and it is not a run. The eligible set
also needs the Chamberlain's status, presiding officer (line 16) and either
in or out of the twelve, which the ledger does not state; so the check's
output is "twelve votes, twelve or thirteen or fourteen eligible", a
question in every case. §14.4 says so and should not call the arithmetic
deterministic.

### G4. S3′'s "no UI pane" is not zero code

A plan finding stored as a `finding` artifact with `source: "screen"`
reaches gate 2 through `chain.screenFindings()` only if its `pass` equals
the beat's screen pass (`app/pipeline/chain.ts:125-130`), which is assigned
at bind time, after the plan; and `drafts.ts:126` labels every screen
finding "ledger". Small, but S3′ needs a pass rule and a label, and §14.5
promises neither.

### G5. The amendment invokes the freeze and then spends under it

§14.3 defers §12 under rule 3 of `docs/reviews/2026-09-26-the-plan-from-here.md`
("no more check replays until a draft shows a check failure that a person
hears"). S2′ ($4.50) and S3′ ($0.45 a draw) are check spend on the plan,
and no person has heard a plan defect; `08aa`'s flags were read, not heard.
Either §14.5 asks for a stated exception, or it queues behind step 1 of
the plan of record. It does neither.

### G6. One ledger, one plan, one run per model

`08aa` and `e33a` share one pinned ledger, byte for byte. Every "both
models" sentence in §14.2 is one run per model on one ledger. The
delegation is one plan line; recall on that kind of defect is 1 of 1 under
opus and 0 of 1 under sonnet, and F2 says the 0 may be the cap. §14.2 says
"most" of the 26 monotonic findings are false after reading four of the
thirteen schedules; the true count is not in the amendment, and S1′ should
produce it before anything else is decided.

### G7. "S1 errors only" can pass on nothing parsed

The monotonic check skips any beat whose `when` gives no day and no date
(`s1.ts:118-120`), silently. A schedule written as "late September" and
"the next morning" passes with zero findings. An auto rule on S1 needs a
coverage count (beats parsed of beats total) beside the error count.

### G8. L2 at gate 1 is not yet "one verdict per symbol per chain"

`verifyClaims` caches by normalised statement text (`app/pipeline/check.ts:265`).
L1's wording of a symbol varies per run, and its `setting:` tagging gave 19,
6, 20 and 13 eligible symbols on one ledger. Until the symbol table is
lowered once and pinned (§11), L2 at gate 1 re-verifies on every round, and
§14.4's "about the same cost a pass" is a range of 3×.

### G9. The bind's late catch is one draft, and the saving is not yet paid

"The bind caught all three" is `08aa` only; `e33a`'s bind was not read for
the calendar. The saving §14.2 names, $1.35 of scenes and $3.51 of screens,
is what a redraft from beat 2 would have cost; Chris did not redraft `08aa`,
the flags stayed open. The measured saving today is $0; the claim is that
a plan check turns an open flag into a line edit before the spend, and that
has one instance and no counterfactual.

## Code bugs, not fixed

| id | where | what |
|---|---|---|
| C1 | `s2.ts:106`, `s1.ts:59-60` | no ISO date branch; every sonnet anchor dropped (F1) |
| C2 | `s2.ts:78-83`, `check.ts:272` | L2 looks up verdicts by `statement`, which the verify model may rewrite; `e33a`/sonnet lost `hell`'s verdict (12 of 13 resolved) |
| C3 | `s1.ts:55` | ordinal regex matches inside "fifty-second day" (day 2), "forty-eighth day" (day 8) |
| C4 | `s1.ts:82-88`, `:121` | `storyOrder` drops the year and compares a day number to a date serial |
| C5 | `s1.ts:70` | the year is read as an hour ("1911" → 19:11) |
| C6 | `s1.ts:135-147` | one withheld defect reported once per beat, plus a duplicate "different `until`" finding |
| C7 | `prompts.ts:268`, `s2.ts:118-123` | the `count` schema has no "of a total" kind; "nine of twelve" becomes `voters=9` (sonnet) or `total=9` (opus) |
| C8 | `prompts.ts:266` | "states or implies" invites the arithmetic the next sentence forbids |

## Cheaper than the amendment's own experiments

| question | the amendment's step | cheaper |
|---|---|---|
| does sonnet's L1 carry the calendar pair | S2′, five runs | fix C1 and re-run `l3Calendar` over the four stored `parsed` symbol tables: $0 (by inspection `b7ba` already has the pair) |
| was the delegation miss the model or the cap | S2′ | remove calendar lines from L4's prompt, re-run L4 alone on `2617`'s stored symbols under sonnet three times: $0.42 |
| how many stored schedules truly fail `linear` | S1′ | the same, and it must come first: $0 |
| L4's precision | S3′, five draws, Chris reads | Chris reads the nine opus findings on `08aa` and nine on `e33a` already in `/tmp/ir-harness-result.json`: $0, twenty minutes |
| is the vote a read or an inference | none | grep the four stored symbol tables for `role="Guild delegate"`: two of four carried it; $0 |

## What this changes in §14

F1 is corrected in §14.2 in the commit after this file. Everything else is
left for Chris: F2 and G2 reshape S2′ and the calendar row; G5 is a
decision about the freeze that is his.
