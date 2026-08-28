# Fog Belt

Horror anthology working repo. **This repo is the source of truth.**

## Layout

```
distillate.md                the working playbook -- generate from section 0
format.md                    story schema, the format rule, provenance

stories/NN-slug.md           one story each; 24 developed
stories/00-undeveloped.md    the bench -- greenlit but never developed, parked
                             attempts with their reasoning, held pairs, passed-on

refs/                        source annexes; read, never edited
  chiang-and-watts.md
  setting-c-and-setting-b.md
  neon-genesis-evangelion.md
  julian-jaynes.md
  scp/c1..c6-djkaktus-*.md   the djkaktus corpus, Annexes C1-C6
  scp/f-assorted.md          Annex F -- 18 articles, wider wiki
  scp/scp-8980-ergophobia.md standalone addendum
  scp/candidates.md          63 triaged, unregistered articles
```

Source tags in the distillate map to `refs/`: `[C]` and `[W]` to
chiang-and-watts, `[setting-c]` and `[TC]` to the setting-c file, `[E]` to
Evangelion, `[K]` to the djkaktus annexes, `[S]` to `refs/scp/f-assorted.md`.
`[FB]` is doctrine arrived at in-house and has no source file.

## Working on it

Edit the file under `stories/`. There is no build step and no generated file --
the directory is the slate, and each story stands alone in the three-part form
described in `format.md`. Adding a story is one new file.

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
