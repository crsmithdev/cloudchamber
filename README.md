# Fog Belt

Horror anthology working repo. **This repo is the source of truth.**

## Layout

```
CLAUDE.md                    standing instructions for a Claude session here
playbook.md                  the working guide -- generate from section 0

stories/NN-slug.md           one story each; 24 developed
stories/00-undeveloped.md    the bench -- greenlit but never developed, parked
                             attempts with their reasoning, held pairs, passed-on

refs/                        source annexes; read, never edited
  chiang.md
  watts.md
  setting-c.md
  setting-b.md
  evangelion.md
  jaynes.md
  scp/djkaktus-<range>.md    the djkaktus corpus, five files by SCP number
  scp/djkaktus-canons-and-tales.md
  scp/assorted.md            19 articles by other authors
  scp/candidates.md          63 triaged, unregistered articles
```

Source tags in the distillate map one-to-one onto `refs/`: `[C]` chiang, `[W]`
watts, `[setting-c]` setting-c, `[TC]` setting-b, `[E]` evangelion,
`[K]` the djkaktus files, `[S]` scp/assorted.md.
`[FB]` is doctrine arrived at in-house and has no source file.

## Working on it

Edit the file under `stories/`. There is no build step and no generated file --
the directory is the slate. Adding a story is one new file.

Each story has three sections:

- **Summary** -- one paragraph.
- **Synopsis** -- the story in prose, at length.
- **Notes** -- origin, lane, status, open items, differentiation warnings,
  decisions owed.

Synopses for stories 1-21 run to a four-to-six paragraph convention; 22-24 run
longer, and the author's prose was preserved rather than compressed.
`stories/00-undeveloped.md` is the bench, not a story: greenlit concepts never
developed, parked attempts with the reasoning that parked them, the held pairs
and the passed-on list.

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
stories, the distillate and the format notes, so the slate can be read from the
Claude app on mobile. It is refreshed by Claude from committed content and is
never authoritative; see `fogbelt/README-sync.md` there. The official GitHub
integration ("+" -> Add from GitHub in the Project) can replace it with an
automatic read-only sync, which reflects only what has been pushed.

An older **Google Drive `fogbelt` folder** exists and is stale. It is not
maintained and should not be read as current.
