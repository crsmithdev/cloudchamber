# Fog Belt

Horror anthology working repo. **This repo is the source of truth.**

## Layout

```
CLAUDE.md                    standing instructions for a Claude session here
playbook.md                  the generative half. 0 is what the series is;
                             1 is the ideation workflow; 2-5 are the banks it
                             pulls from (themes, dread mechanisms, artifacts,
                             setting-a elements); 6 is how a story gets told.
                             Nothing in it evaluates.
catalogue.md                 the other half -- describes rather than generates.
                             The slate as it stands (2026-08-29): sameness across
                             all 24, the collision map, the variety index, unused
                             ground, the expert panels' cross-story material. Then
                             the recurring shapes, the anti-patterns, the thirteen
                             lenses and the source lookup. Per-story findings live
                             at the end of each story file.
seeding-v7.md                generation, upstream of the playbook. Six engines,
                             universal moves 3-8, an inversion rule for minting
                             engines, and a repair table. Supersedes seeding v1-v6.
                             Was misnamed playbook-v2.md until 2026-09-03.
sources.toml                 what the pipeline reads and what it takes from each
                             source -- passages, themes, or both

stories/NN-slug.md           one story each; 25 developed
stories/00-undeveloped.md    the bench -- greenlit but never developed, parked
                             attempts with their reasoning, held pairs, passed-on

pipeline/                    the seeding machinery. Two extractions: verbatim
                             passages (how a story reads) and themes (what gets
                             made). Local, no model, no network. See its README
seeds/                       what the pipeline produces and what Chris decides
  README.md                  the standard: what belongs in the exemplar bank
  exemplars.jsonl            the candidate pool (regenerable; gitignored)
  themes.jsonl               extracted themes (regenerable; gitignored)
  decisions.jsonl            every keep and pass, append-only, TRACKED. The one
                             file here that cannot be rebuilt from anything else
  exemplars.md               the kept set, written by `pipeline export`
  packets/                   what each generation call was conditioned on

doc/                         reading and design, nothing that runs
  literature.md              academic work on what makes horror land. The theme
                             extractor reads this; it never yields passages
  corpus.md                  award-attested horror free to read online, with the
                             licensing map. Held as a standard to read against,
                             deliberately outside refs/ -- nothing here is
                             distilled into the playbook or harvested
  selection.md               design for the selection stage. Not built
  pipeline.svg               the pipeline as a diagram

refs/                        sources. Read, never edited
  *.pdf                      the anthologies -- Datlow, Evenson, Langan, Watts,
                             Chiang, King. 96 MB, not redistributable, GITIGNORED.
                             `pipeline harvest` reads them in place
  scp/scp-NNNN.md            110 SCP articles, verbatim wikidot source, CC BY-SA
  summaries/                 the annexes: the register's commentary on the above.
                             Source files are read; setting-a.md and generation.md
                             are written in-house and grow
    register.md              the genre terms section 0 stands on -- grimdark,
                             cosmic horror, the eerie, the abject, body horror,
                             and the Aristotle constraint, with citations
    generation.md            the evidence behind how a generation call is shaped
                             -- mode collapse and where it comes from, what raises
                             output diversity and by how much, why negations decay
                             with distance from the ask, and why exemplars beat
                             instructions on register
    setting-a.md              the specifics behind playbook section 5 -- fifteen
                             domains of setting-a statutes, bodies, dates, cases
    craft.md                 the evidence behind playbook sections 1 and 6 --
                             eight parts, 74 failure modes with the authority
                             attached, and a verification ledger of what is
                             corrected, refuted, and still to be checked in print
    chiang.md watts.md setting-c.md setting-b.md evangelion.md jaynes.md
    scp/djkaktus-<range>.md  the djkaktus corpus, five files by SCP number
    scp/djkaktus-canons-and-tales.md
    scp/assorted.md          19 articles by other authors
    scp/candidates.md        63 triaged, unregistered articles

.claude/skills/
  seed-premises/SKILL.md     how a generation call is shaped: draw the
                             constraints outside the model, condition on
                             exemplars, ask for a distribution rather than a
                             list, cull before pitching. Wraps playbook 1
                             rather than replacing it
```

Source tags in `playbook.md` and `catalogue.md` map one-to-one onto
`refs/summaries/`: `[C]` chiang, `[W]` watts, `[setting-c]` setting-c, `[TC]`
setting-b, `[E]` evangelion, `[S]` the SCP wiki entire -- the djkaktus
files, scp/assorted.md and scp/candidates.md, folded into one tag on 2026-08-29.
`[FB]` is doctrine arrived at in-house and has no source file.

**Two things live under `refs/scp/`-shaped paths and they are not the same.**
`refs/scp/` is raw article text, 110 files, verbatim. `refs/summaries/scp/` is
the register's commentary on those articles. The commentary was there first and
the raw scrape took the shorter path in September; every reference in
`playbook.md` was repointed on 2026-09-03.

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
python -m pipeline harvest      # refs/ -> passage candidates
python -m pipeline themes       # refs/ -> theme candidates
python -m pipeline review       # the cull: k / p / m / s / b / q
python -m pipeline export       # kept passages -> seeds/exemplars.md
python -m pipeline draw -n 6    # a generation packet
python -m pipeline.selftest     # verify the code after a sync
```

`pipeline/README.md` has the rest, including which parts are weakest and where
the feedback edges from `seeds/decisions.jsonl` are meant to attach.

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
