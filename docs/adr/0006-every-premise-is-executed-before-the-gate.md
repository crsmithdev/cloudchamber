# Every premise is executed before the gate, and no model decides at a gate

A draw executes all five premises as vignettes before it stops, and the operator chooses among the vignettes, not among the premises. Choosing on a premise alone inverts: how a premise reads does not predict how it executes (the research behind the ideation spec, §3.8). The gates are the operator's. `auto` passes a gate by a fixed rule, such as the lowest stated probability, or findings at or above a score that quote evidence, never by a model's judgement. A model judging at the gate reached a 73% ceiling and inverted its rubric (the same research, §1.4 and §3.8).

## Consequences

Five execute calls a draw, most of which are discarded. `--auto` is a mechanical stand-in for the operator, not a judge.

## Amendment (2026-09-27): an auto draw executes one premise

Since c7a443d a draw in `auto` mode executes only the premise its gate will take: the lowest stated probability. The rule reads the probability, which the premises step states, and never a vignette, so the other four executes were paid for and never read. A manual draw still executes all five, and the operator still chooses among vignettes.
