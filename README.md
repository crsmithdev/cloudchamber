# Fog Belt

Horror anthology working repo. **This repo is the source of truth.**

## Layout

```
CLAUDE.md                    standing instructions for a Claude session here
playbook.md                  the generative half. 0 is the ideation workflow;
                             1-4 are the banks it pulls from (themes, dread
                             mechanisms, artifacts, setting-a elements); 5 is how
                             a story gets told. Nothing in it evaluates.
catalogue.md                 the other half -- describes rather than generates.
                             The slate as it stands (2026-08-29): sameness across
                             all 24, the collision map, the variety index, unused
                             ground, the expert panels' cross-story material. Then
                             the recurring shapes, the anti-patterns, the thirteen
                             lenses and the source lookup. Per-story findings live
                             at the end of each story file.

stories/NN-slug.md           one story each; 24 developed
stories/00-undeveloped.md    the bench -- greenlit but never developed, parked
                             attempts with their reasoning, held pairs, passed-on

refs/                        annexes. The source files are read, never edited;
                             setting-a.md is written in-house and grows
  setting-a.md                the specifics behind playbook section 4 -- fifteen
                             domains of setting-a statutes, bodies, dates, cases
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

Source tags in `playbook.md` and `catalogue.md` map one-to-one onto `refs/`: `[C]` chiang, `[W]`
watts, `[setting-c]` setting-c, `[TC]` setting-b, `[E]` evangelion,
`[K]` the djkaktus files, `[S]` the wider wiki -- scp/assorted.md and
scp/candidates.md.
`[FB]` is doctrine arrived at in-house and has no source file.

## Working on it

Edit the file under `stories/`. There is no build step and no generated file --
the directory is the slate. Adding a story is one new file.

Each story has three sections, and most now carry two appended review
sections after them:

- **Summary** -- one paragraph.
- **Synopsis** -- the story in prose, at length.
- **Notes** -- origin, lane, status, open items, differentiation warnings,
  decisions owed.
- **Red-team, 2026-08-28** -- an adversarial council's finding list. Read the
  section's preamble first; it says which findings are verdicts and which are
  only conformance to a playbook that no longer grades.
- **Slate review and fact check, 2026-08-29** -- expert corrections, collision
  rulings, what only this story has, and changes proposed.

Nothing in either review section has been applied, and no story text was
altered by them.

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

## Other copies

There are none that are maintained. A Google Drive `fogbelt` folder and a
claude.ai Project both held copies at various points; both are stale, neither is
authoritative, and anything read from either should be checked against this repo
before it is believed.
