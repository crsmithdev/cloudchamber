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
