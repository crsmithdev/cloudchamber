# Gate 1 stays in Drafting, and the step recorder stays in Pipeline

The architecture review of 26 September 2026 proposed two deepenings that were then declined. This record keeps a later review from proposing them again for the same reasons.

**Gate 1 out of `Drafting`, holding the draw across an auto run.** The problem it was meant to close is a person's accept that slips in between two auto rounds, while the draw stands at `awaiting_check_gate`. In the service that cannot happen. Between one round's commit and the next round's hold, `autoRounds` makes no I/O await: the findings are read synchronously, and `reconcile`, `accept` and `repair` each hold the draw before their first await. An API request is a macrotask and cannot run in that gap. Only a second process on the same store, such as a CLI run, could. Holding across rounds would need versions of recheck, accept and reconcile that do not hold, and each round moves the chain to a new draw. Without the hold, the change moves about 330 lines and adds nothing to depth.

**The step recorder out of `Pipeline`.** Callers use `invoke`, `artifact`, `db`, `draw` and `steps` together. A separate recorder leaves `Pipeline.invoke` as a pass-through, or it changes the type of 23 importers. The retry table can already be tested through `Pipeline` with `FakeModel` and an in-memory store.

## Consequences

`Drafting` holds both gates. A reader of gate 1 starts at `gate.ts` and follows `check`, `accept`, `dismiss` and `autoRounds` in `drafting.ts`. Reopen the first proposal if the CLI and the service start to run auto on the same draws, or if an await appears between rounds.
