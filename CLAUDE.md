# Fog Belt

A horror anthology. This repo is the source of truth.

*Instructions for a session. Anything that describes what another document contains belongs in that document, not here.*

## Read first

**`playbook.md`** before pitching or developing. It generates; nothing in it evaluates, and its header carries the register.

**`catalogue.md`** before reviewing. It describes what has been written and holds the instruments for reading a premise back.

**`seeding-v7.md`** when the job is to produce candidates rather than triage them. It sits upstream of the playbook and hands off at §2.

**`lore/<setting>.md`** before seeding, whole. Every run is under a setting — `setting-a` unless one is named — and the file is the bank the setting pull comes from and the canon the cull checks against. `lore/README.md` says what its nine sections do.

**`README.md`** for the layout and the form a story file takes.

Every story file ends with two appended review sections. Read the preamble of either before treating a finding in it as a verdict; nothing in them has been applied, and no story text has been altered by them.

## Pitching

One paragraph per pitch, one at a time. Chris replies take-it or pass; do not develop anything he has not taken.

Check `stories/` before developing: whether a story feels like another one already on the slate is the only thing anywhere that functions as a criterion. Under a setting other than the default the slate is `stories/<setting>/`, and a premise resting on anything the lore file's §7 lists as absent is dead before it is pitched. Twenty-five are written, and `stories/00-undeveloped.md` carries the reasoning that parked what was parked, so the same rejected construction does not get re-attempted.

## Working here

A story is one file under `stories/`, written by hand. Nothing generates it.

**`extracted/` is the exception, and it has a rule.** `pipeline harvest` fills the
candidate pool and `pipeline export` writes `extracted/exemplars.md`; both are
regenerable and neither should be hand-edited. `extracted/decisions.jsonl` is the
opposite — append-only, tracked, and the only file in the repo that cannot be
rebuilt from its sources. Never rewrite or prune it. Chris's passes are as
load-bearing as his keeps.

**Whether a session can reach GitHub depends on where it runs.** Cloud sessions and the device bridge cannot: edit and commit there, and Chris pushes manually from his own terminal. A local Claude Code session on this machine can, and has standing permission to push. The repo is private; check that before any push, because the tracked PDFs are not redistributable. See the README for the detail.

**Repo only.** Project docs were abandoned on 2026-08-28. Do not read from or write to the Claude project's doc store — it is stale by definition and anything written there is lost. This repo, reached through the folder connected to the session, is the only source and the only destination.
