# Cloud Chamber

A story-ideation pipeline: a seed and six example passages become five
premises, each executed as a vignette; you choose one at the gate, and the
draw derives an outline, two context vignettes, an ending and a brief.

`docs/knobs.md` lists every tunable — the settings and their list sizes,
the genre shortcuts, the sampling modes, the sources, the drafting defaults
and the model per stage. It is generated: run `cloudchamber help` for the same
thing live, or `cloudchamber help --md > docs/knobs.md` after changing a setting
file or a toml. Never edit it by hand.

The corpus is not in this repository: the books, the example bank, the
narrated-channel transcripts, the lore settings and the stories live in a
private repository, cloned as `~/cloudchamber-corpus` and symlinked in. The
public repository names no setting. Detach `sources/settings` before you
regenerate `docs/knobs.md`, or the setting names land in a public file.

The specs in `docs/specs/` are the design of record for the ideation and
drafting pipelines.
