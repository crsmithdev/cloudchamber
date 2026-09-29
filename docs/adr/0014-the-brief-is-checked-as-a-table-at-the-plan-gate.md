# The brief is checked as a table at the plan gate, and its prose at the scenes

Proposed 2026-09-29 with §15 of `docs/specs/2026-09-28-story-ir.md`. It is accepted when stage T3 of that section lands; until then gate 1 stands.

Gate 1 checked the brief as prose: each vignette and the ending against the ledger and each other, the brief's claims against the setting, findings read back by a verifier, a repair as a new draw, and a loop of rounds. The store says the loop is passed by `auto` or not at all (since 22 September, 67 gate 1 verdicts by `auto` and 1 by hand; the last by hand on 24 September), and that `auto` cannot act on the one class the IR does not check, the brief against the setting: a contradicted claim scores under its floor and stays open into the draft.

Under this decision the brief's checkable content is its symbol table, lowered once per chain from the pinned ledger and pinned beside it. The plan's text is checked against the setting by gate 1's claims extract and verify (T1′; checking each symbol, L2, caught none of four known contradictions and is dropped, §15.11), the table's arithmetic is checked at $0 (L3), and the plan is checked against it (S1′, L4). The findings reach one gate, the plan gate, where a fix goes into the plan (`apply`) and a prose instruction is a repair. The brief's prose parts are material for the beats that absorb them, and the scenes that absorb them are held to the ledger by the bind and to the setting by the claims screen. Nothing checks a vignette as prose before a scene exists.

## Considered Options

- **Shape B: gate 1 on the table, then the plan gate on the plan.** Two stops between the brief and the scenes. The first is the stop nobody works; keeping it keeps the code and the tab for a rule that runs itself.
- **Resolve each symbol against the setting (L2) and amend the ledger.** Measured on `b82d`: 0 of 4 known contradictions survive, since the ledger states the story's exceptions as rules and never carries some facts. Dropped.
- **Lower the vignettes and the ending too, and unify.** The prose-against-prose class where the ledger is silent is lost without it. It is stage T3′, measured at about $6, and this record does not decide it.

## Consequences

`awaiting_check_gate`, `checking`, `repairing` and `repaired` take no new draws; the draws that hold them keep them, read-only. `autoRounds`, `reconcile`, `verifyFindings`, the ledger and derivation checkers and the check tab's gate controls are deleted at T3. ADR-0009 holds: a repair is still a new draw when prose is rewritten; a fix to the plan rewrites no brief prose and makes no new draw. ADR-0013 holds: `Drafting` has two gates, the plan gate and gate 2. ADR-0006 holds: `--auto` passes the plan gate by a fixed rule (no S1′ error, no L3 error) and no model decides there. The check tab keeps the brief pane and loses gate 1; `docs/specs/2026-09-10-four-tabs.md` reads "the brief" for it. Reopen this record if a draft shows a contradiction between two prose parts that the bind and the claims screen both missed and a person heard.
