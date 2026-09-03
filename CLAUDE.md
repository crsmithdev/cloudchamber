# Fog Belt

A horror anthology. This repo is the source of truth.

*Instructions for a session. Anything that describes what another document contains belongs in that document, not here.*

## Read first

**`series.md`** before pitching or developing — what every story has in common, and the register the rest is checked against. The playbook that used to hold it was retired on 2026-09-03; its theme bank is `extracted/themes.jsonl`, its reference material is `sources/summaries/`, and its workflow is the `seed-premises` skill.

**`catalogue.md`** before reviewing. It describes what has been written and holds the instruments for reading a premise back.

**`seeding-v7.md`** when the job is to produce candidates rather than triage them. It sits upstream of the seeding skill.

**`README.md`** for the layout and the form a story file takes.

Every story file ends with two appended review sections. Read the preamble of either before treating a finding in it as a verdict; nothing in them has been applied, and no story text has been altered by them.

## Pitching

One paragraph per pitch, one at a time. Chris replies take-it or pass; do not develop anything he has not taken.

Check `stories/` before developing: whether a story feels like another one already on the slate is the only thing anywhere that functions as a criterion. Twenty-five are written, and `stories/00-undeveloped.md` carries the reasoning that parked what was parked, so the same rejected construction does not get re-attempted.

## Working here

A story is one file under `stories/`, written by hand. Nothing generates it.

**`extracted/` is regenerable.** `pipeline harvest` fills the passage pool and
`pipeline themes --ingest` fills the theme bank; both rebuild from their
sources and neither should be hand-edited. There is no decision layer — keep,
pass and maybe, and the append-only trail under them, were removed on
2026-09-03 and will be re-added later. Both banks are pools as they stand.
The three verdicts that existed before the removal went with it, deliberately;
they are at `git show 9ef1306^:extracted/decisions.jsonl` if ever wanted.

**Whether a session can reach GitHub depends on where it runs.** Cloud sessions and the device bridge cannot: edit and commit there, and Chris pushes manually from his own terminal. A local Claude Code session on this machine can, and has standing permission to push. The repo is private; check that before any push, because the tracked PDFs are not redistributable. See the README for the detail.

**Repo only.** Project docs were abandoned on 2026-08-28. Do not read from or write to the Claude project's doc store — it is stale by definition and anything written there is lost. This repo, reached through the folder connected to the session, is the only source and the only destination.
