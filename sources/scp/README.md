# SCP articles — original text

Verbatim Wikidot source for 109 SCP articles, one file per article. The
extractor reads them as the `scp` source in `sources/manifest.toml`.

## Provenance

Pulled 2026-09-02 from the live wiki (`scp-wiki.wikidot.com`) via each page's
own view-source module, so the text is the published Wikidot markup — headers,
`[[div]]` blocks, `[[footnote]]`s, component includes and all — not a rendered
or reflowed copy.

Each file opens with front matter recording title, source URL, author,
where the author name came from, license, and retrieval date, followed by an
HTML-comment attribution line, then the source.

## Naming

- `scp-<number>.md` for numbered articles (`scp-049.md`, `scp-2718.md`)
- `scp-001-djk1-the-children.md`, `-djk2-atonement.md`, `-djk3-the-way-it-ends.md`,
  `-tgk-the-broken-god.md`, `-ytk-yoshihides-proposal.md` for the 001 proposals

## Attribution and license

All content is by its credited authors and licensed **CC BY-SA 3.0**. Author
names come from each page's licensebox where it renders server-side (99 files),
otherwise from the original revision in the page history (10 files). SCP-597 is
recorded as `uncredited` — its licensebox renders an unfilled placeholder.

Anything derived from these files and published must carry author, source link
and the CC BY-SA 3.0 notice, and be shared under the same license.

## Known gaps

None outstanding. Five files needed a second pass on 2026-09-02 and are now complete:

- `scp-8980.md`, `scp-4485.md`, `scp-001-djk3-the-way-it-ends.md` are container
  pages whose prose lives in `fragment:` child pages. Each file now holds the
  container source followed by every fragment in creation order, each under a
  comment naming its source page (2, 6 and 28 fragments respectively).
- `scp-001-tgk-the-broken-god.md` was originally pulled from `/ouroboros`, which
  is the SCP-001 proposal *hub*, not the article. Re-pulled from
  `/twistedgears-kaktus-proposal` (1.4 KB shell -> 47 KB article).
- `scp-7179.md` was suspected incomplete but is not: its `[[module ListPages
  range="."]]` is self-referential and the page has no child fragments.

Short files (`scp-527.md`, `scp-439.md`, `scp-2598.md` ...) are short articles,
not truncated pulls.
