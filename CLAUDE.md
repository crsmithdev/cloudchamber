# Cloud Chamber

A story pipeline: a seed becomes premises, a brief, a checked outline and a
draft. Run the CLI as `bun cloudchamber <command>`.

`docs/knobs.md` lists every tunable — the settings and their list sizes,
the genre shortcuts, the sampling modes, the sources, the drafting defaults
and the model per stage. It is generated: run `bun cloudchamber help` for the same
thing live. After you change a setting file or a toml, regenerate it with the
settings hidden, so that no setting name lands in this public repository:

```
CLOUDCHAMBER_SETTINGS=/nonexistent bun cloudchamber help --md > docs/knobs.md
```

The corpus is not in this repository. The books, the example bank, the
narration transcripts, the settings and the stories live in a private
repository, cloned as `~/cloudchamber-corpus` and linked in as `corpus/`.
Code reads it only through `CORPUS` and the paths under it in
`app/pipeline/paths.ts`. The public repository names no setting.

The specs in `docs/specs/` are the design of record for the ideation and
drafting pipelines. `CONTEXT.md` is the glossary of the domain's terms, and
`docs/adr/` records the decisions that are hard to reverse.

## Prompt accretion

This rule covers prompt text only. Code that measures prompts, such as a log,
a lab case or a stored arm, is outside it.

A measured failure invites one more clause in the prompt. One more clause is
sometimes right, but frequent use is a code smell.

The pipeline can state one constraint at four moments: the schedule plans it and
the register shapes it, both in `app/pipeline/prompts.ts`; the screen question
detects it and the rewrite line repairs it, both in `app/pipeline/write.ts`.
Before you add a clause, find which of the four already states the property.
Keep the constraint at the layer that enforces it, and let the other layers
point at that layer.

Add a clause only when no layer states the property. Name the layer you chose in
the commit.

Test a removal the same way as an addition: arms from `cloudchamber branch`,
judged by the panel in `app/pipeline/lab/`, read by the score gap in
`lab/pool.ts`. A gap inside the margin means the panel cannot tell the arms
apart. It does not prove that the clause does no work.
