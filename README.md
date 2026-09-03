# Fog Belt

Horror anthology working repo. **This repo is the source of truth.**

## Layout

Four kinds of thing, one directory each: what the project reads (`sources/`),
what it has concluded (`research/`), what a machine pulled out (`extracted/`),
and what it has made (`stories/`). Plus the code and the two standing documents.

```
CLAUDE.md                    standing instructions for a Claude session here
playbook.md                  the generative half. 0 is what the series is;
                             1 is the ideation workflow; 2-5 are the banks it
                             pulls from (themes, dread mechanisms, artifacts,
                             setting-a elements); 6 is how a story gets told.
                             Nothing in it evaluates.
catalogue.md                 the other half -- describes rather than generates.
                             The slate as it stands (2026-08-29), then the
                             recurring shapes, the anti-patterns, the thirteen
                             lenses and the source lookup. Per-story findings
                             live at the end of each story file.
seeding-v7.md                generation, upstream of the playbook. Six engines,
                             universal moves 3-8, an inversion rule for minting
                             engines, a repair table. Supersedes seeding v1-v6
sources.toml                 what the pipeline reads and what it takes from
                             each source -- passages, themes, or both

stories/NN-slug.md           one story each; 25 developed
stories/00-undeveloped.md    the bench -- greenlit but never developed, parked
                             attempts with their reasoning, held pairs, passed-on

sources/                     material the project reads. See sources/README.md
  texts/books/*.pdf          29 anthologies and collections, tracked, NOT
                             redistributable. Read locally, never published
  texts/scp/scp-NNNN.md      109 SCP articles, verbatim wikidot, CC BY-SA 3.0
  distilled/                 setting-c, setting-b, Evangelion, Jaynes -- where no
                             full text can be held, the distillate IS the source
  queue/scp-candidates.md    63 triaged articles not yet held

research/                    what the project has concluded. See its README
  craft.md generation.md     the evidence behind playbook 1/6 and behind the
                             shape of a generation call
  register.md setting-a.md    the genre terms 0 stands on; the specifics behind 5
  literature.md              academic work on horror. Read for themes, never
                             for passages -- criticism conditions for criticism
  corpus.md                  award-attested horror free to read online, with the
                             licensing map. A standard to read against
  selection.md               design for the selection stage. Not built

extracted/                   everything the pipeline produced. See its README
  exemplars.jsonl            the candidate pool (regenerable; gitignored)
  themes.jsonl               extracted themes (regenerable; gitignored)
  decisions.jsonl            every keep and pass, append-only, TRACKED. The one
                             file here that cannot be rebuilt from anything else
  exemplars.md               the kept set, written by `pipeline export`
  packets/                   what each generation call was conditioned on

pipeline/                    the seeding machinery. Two extractions: verbatim
                             passages (how a story reads) and themes (what gets
                             made). Local, no model, no network
.claude/skills/
  seed-premises/SKILL.md     how a generation call is shaped: draw the
                             constraints outside the model, condition on
                             exemplars, ask for a distribution rather than a
                             list, cull before pitching. Wraps playbook 1
                             rather than replacing it
```

Source tags in `playbook.md` and `catalogue.md` resolve to full text wherever
full text exists. `[C]` Chiang and `[W]` Watts are the books in
`sources/texts/books/`; `[S]` is `sources/texts/scp/`. `[setting-c]`, `[TC]`, `[E]`
and `[J]` are `sources/distilled/`, where the distillate is the source of
record because the thing itself cannot be held. `[FB]` is doctrine arrived at
in-house and has no source file.

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

## Running the pipeline

```bash
python -m pipeline harvest      # sources/texts/ -> passage candidates
python -m pipeline themes       # sources/ -> theme candidates
python -m pipeline review       # the cull: k / p / m / s / b / q
python -m pipeline export       # kept passages -> extracted/exemplars.md
python -m pipeline draw -n 6    # a generation packet
python -m pipeline.selftest     # verify the code after a sync
```

`pipeline/README.md` has the rest, including which parts are weakest and where
the feedback edges from `extracted/decisions.jsonl` are meant to attach.

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

The `fogbelt` folder under Google Drive for Desktop is *this directory*, synced.
Writing there writes here. A second, older `fogbelt` folder at the Drive root and
a claude.ai Project both held copies at various points; both are stale, neither
is authoritative, and anything read from either should be checked against this
repo before it is believed.

Drive sync leaves `.tmp.driveupload/` and `.tmp.drivedownload/` scratch
directories, and occasionally a zero-byte `.git/index.lock` that blocks every
git command with "Another git process seems to be running". Both are gitignored;
the lock is safe to delete when no git process is actually running.
