# The corpus is a private repository, and the public one names no setting

The books, the example bank, the narration transcripts, the settings and the stories live in a private repository, cloned as `~/cloudchamber-corpus` and linked in as `corpus/`. Code reaches them only through `CORPUS` and the paths under it in `app/pipeline/paths.ts`. The copyrighted text and the settings' names must not reach the public history, which was scrubbed and recreated once to remove them.

## Consequences

Anything generated into a tracked file must not name a setting: `docs/knobs.md` is regenerated with `CLOUDCHAMBER_SETTINGS=/nonexistent`. A fresh clone does not run until the corpus is linked.
