# sources — material the project reads

Split by one question: **is this the thing itself, or is it something written
about the thing?**

```
texts/        the thing itself, verbatim
  books/      29 PDFs — Datlow (17 vols), Evenson, Langan, Watts, Chiang, King
  scp/        109 SCP articles, verbatim wikidot source, CC BY-SA 3.0
distilled/    the thing itself is not holdable, so the distillate stands in
queue/        triaged, wanted, not yet held
```

## texts/

What `pipeline harvest` reads. Verbatim prose is the only thing that can
condition register, so this is the only directory passages come from. Nothing
in here is edited, ever.

The PDFs are tracked in git and are **not redistributable** — read locally,
harvested locally, never published. The SCP articles are CC BY-SA 3.0 and carry
author, source URL and licence in their front matter; anything published from
them must carry the same.

## distilled/

setting-c, setting-b, Evangelion, Jaynes. These are not summaries
of something we hold — the source is a setting too large to hold (setting-c, setting-b), a television series, or a book of argument rather than prose. For
these the distillate **is** the source of record, and `sources.toml` marks setting-c
and setting-b `reader = "research"` so themes come from reference material
rather than from fiction.

## queue/

`scp-candidates.md` — sixty-three articles triaged against the register's taste
profile and verified to say what the pitch says. Eleven are held in `texts/scp/`;
the rest are not. This is a shopping list, not evidence.

## What used to be here

`refs/summaries/` mixed three unlike things: retellings of texts we now hold,
distillates of things we cannot hold, and the project's own research. The
research moved to `research/`. The retellings were deleted on 2026-09-03 —
`chiang.md`, `watts.md`, six `djkaktus-*.md` and `assorted.md`, about 880 KB —
because the works they retold are now in `texts/` in full, and a retelling of a
book you have is a worse copy of it. They are recoverable from git history if a
piece of the analysis turns out to be worth keeping.
