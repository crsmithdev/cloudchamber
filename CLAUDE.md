# Fog Belt

A horror anthology. This repo is the source of truth.

**Read `playbook.md` before pitching or developing anything, and `catalogue.md` before reviewing anything.** It is entirely generative: §0 is the ideation workflow, §1–§4 are the four banks it pulls from — themes, dread mechanisms, artifacts, setting-a elements — and §5 is how a story gets told. Nothing in it evaluates. The rest of the repo is `stories/` (the slate, one file each, plus `stories/00-undeveloped.md` — the bench) and `refs/` (source annexes; read, never edited). `catalogue.md` at the root is the other half of the pair, and describes rather than generates: the slate as it stands — sameness across all 24, the collision map, the variety index, the unused ground, and the expert panels' cross-story material — followed by the descriptive apparatus moved out of the playbook on 2026-08-29, being the recurring shapes, the anti-patterns, the thirteen lenses and the source lookup. Every story file ends with two appended sections: a red-team appendix (2026-08-28), whose preamble must be read before any finding in it is treated as a verdict, and a slate review and fact check (2026-08-29) carrying that story's expert corrections, collision rulings and proposed changes. Nothing in either has been applied.

## Pitching

One paragraph per pitch, one at a time. Chris replies take-it or pass; do not develop anything he has not taken.

The recurring shapes, the anti-patterns and the thirteen lenses in `catalogue.md` are **lenses, not tests**. They show what a premise contains and push it into its next draft; they do not grade it, and conformance to them is not a measure of anything. An unused shape is not a vacancy. A pitch may decline any of them on purpose. The single thing that does function as a criterion is whether a story feels like another one already on the slate (`catalogue.md` §8.11).

Check `stories/` for differentiation before developing a premise. Twenty-four are written and the bench file lists what was greenlit and never developed, what was parked, and why — the parked entries carry the reasoning that parked them, so the same rejected construction does not get re-attempted.

## The register

Every story carries a distinctly setting-a twist or matrix, and it has to be structural rather than scenery — `playbook.md` §4 is the bank, twelve domains from land title to the administration of the dead. A neighbourhood name in a sentence is worth nothing.

Pitch dark. The target register is setting-c and setting-b — it does not work out well for anybody. Heavier on body horror, weirder themes, weird religious angles. Avoid the conventional, and avoid the "schedule that predicts the future" shape; the maintained schedule already carries eleven of the twenty-four.

**No comedy, and nothing heartwarming.** The comic register was withdrawn from the playbook on 2026-08-28 and the source material for it was deleted from the annexes. Warmth as a delivery mechanism is different and is still central: the narrator is good at their job and warm, and that is what makes it unbearable.

## Working here

No build step and no generated files. A story is one file under `stories/`, in the three-part form described in the README.

**No Claude session can reach GitHub.** Edit and commit through the device bridge; Chris pushes manually from his own terminal. See the README for the detail.

**Repo only.** Project docs were abandoned on 2026-08-28. Do not read from or write to the Claude project's doc store — it is stale by definition and anything written there is lost. This repo, reached through the folder connected to the session, is the only source and the only destination.
