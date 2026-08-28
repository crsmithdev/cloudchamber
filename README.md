# Fog Belt

Horror anthology working repo. **This repo is the source of truth.**

## Layout

```
ideas-v1.md                  the greenlit slate (v1)
ideas-v2-working.md          append-only verbatim archive; PART N per source doc
ideas-v2.md                  GENERATED -- do not hand-edit
parts/00-front-matter.md     schema + <!-- CONTENTS-TABLE --> marker
parts/99-slate-notes.md      format rule + provenance
stories/NN-slug.md           one story each (front matter: number, heading,
                             contents_cell, status)
build.py                     regenerate / verify ideas-v2.md
reference-*.md               distillate, its cuts record, and source annexes
```

## Working on it

```sh
python3 build.py           # regenerate ideas-v2.md from parts/ and stories/
python3 build.py --check   # verify it matches; exits 1 on drift
```

Edit the file under `stories/`, then rebuild. `ideas-v2.md` is generated and
marked `linguist-generated` so GitHub collapses its diff -- review the story
file instead. Adding a story is one new file plus a rebuild; its Contents table
row comes from that file's front matter, so there is no second place to update.

`ideas-v2-working.md` is never edited, only appended to.

## Pushing

**No Claude session can reach GitHub.** Verified 2026-08-28: the cloud
container's egress refuses `github.com`; `api.github.com` returns 403 on every
repository endpoint, public ones included, pointing at an `add_repo` tool that
does not exist; and the sandboxed VM behind the device bridge is blocked on port
22 as well. Filed as anthropics/claude-code issue #84581, open, no workaround.
A personal access token does not help.

So Claude can edit and commit here through the device bridge, but **pushing is
manual** -- run `git push` from your own terminal. Until you do, the work exists
only on this machine.

## Mirrors

The **Fog Belt Project** on claude.ai carries a one-way read-only mirror of the
stories, parts, distillate and ideas-v1, so the slate can be read from the
Claude app on mobile. It is refreshed by Claude from committed content and is
never authoritative; see `fogbelt/README-sync.md` there. The official GitHub
integration ("+" -> Add from GitHub in the Project) can replace it with an
automatic read-only sync, which reflects only what has been pushed.

An older **Google Drive `fogbelt` folder** exists and is stale. It is not
maintained and should not be read as current.
