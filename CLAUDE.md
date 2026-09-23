# Cloud Chamber

A story-ideation pipeline: a seed and six example passages become five
premises, each executed as a vignette; you choose one at the gate, and the
draw derives an outline, two context vignettes, an ending and a brief.

`docs/knobs.md` lists every tunable — the settings and their list sizes,
the genre shortcuts, the sampling modes, the sources, the drafting defaults
and the model per stage. It is generated: run `cloudchamber help` for the same
thing live, or `cloudchamber help --md > docs/knobs.md` after changing a setting
file or a toml. Never edit it by hand.

The corpus is not in this repository. The books, the example bank, the
narration transcripts, the settings and the stories live in a private
repository, cloned as `~/cloudchamber-corpus` and linked in as `corpus/`.
Code reads it only through `CORPUS` and the paths under it in
`app/pipeline/paths.ts`. The public repository names no setting: run the
`help --md` regeneration with `CLOUDCHAMBER_SETTINGS=/nonexistent`, or the
setting names land in a public file.

The specs in `docs/specs/` are the design of record for the ideation and
drafting pipelines. `CONTEXT.md` is the glossary of the domain's terms, and
`docs/adr/` records the decisions that are hard to reverse.

## Prompt accretion

A measured failure invites one more clause in the prompt. Be highly suspicious
of that move. One more clause is sometimes right, but frequent use is a code
smell.

The pipeline can state one constraint at four moments: the schedule plans it and
the register shapes it, both in `app/pipeline/prompts.ts`; the screen question
detects it and the rewrite line repairs it, both in `app/pipeline/write.ts`.
Before you add a clause, find which of the four already states the property.
Keep the constraint at the layer that enforces it, and let the other layers
point at that layer.

Add a clause only when no layer states the property. Name the layer you chose in
the commit.

Remove clauses with the protocol you add them with: three drafts a side, matched
pairs, both orders, and a within-arm floor. A clause the panel does not miss was
never doing work.
