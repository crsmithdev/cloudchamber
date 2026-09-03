# EXTRACTION.md

Design for pulling exemplar candidates out of the `refs/` PDF corpus without
ever loading a PDF into session context. Drafted 2026-09-02, voice session.
Companion to `HARVEST.md` and `SELECTION.md`. Not yet built.

## The constraint being worked around

Established across two sessions, and it is hard:

- The sandbox has **no network access**. It cannot fetch anything itself.
- The only bridge from Drive into the session is `download_file_content`, which
  returns **base64 into context**. A 1 MB PDF becomes several hundred thousand
  tokens. A 4 MB PDF is not survivable. This almost certainly killed an earlier
  session.
- Web search returns **snippets, never page bodies**. Useless for verbatim prose.

So the rule stands: **never move a large file toward the model.** Move the
extraction to where the file already is.

## The pattern that already works

The SCP scraper solves exactly this problem and was simply built for a different
corpus. It runs on Chris's machine, does its work locally, and writes small
markdown into Drive. Markdown comes back down through `download_file_content`
cheaply and reliably — proven repeatedly this session.

**This design is that scraper, pointed at PDFs.** Nothing novel is required.

    PDF on local disk  →  local script slices  →  small .md into Drive  →  session reads

## What the script does

Local. Python. `pypdf` or `pdfplumber` (both verified working, and the
print-only-a-slice pattern was proved on a throwaway PDF in an earlier session).
Per PDF:

1. Extract text page by page.
2. Window it into passages of **150–400 words**, breaking on paragraph
   boundaries rather than fixed offsets.
3. Score each passage against cheap structural heuristics (below).
4. Keep the top N — 30 to 60 per volume is a sane target.
5. Write them to a scratch file as **numbered verbatim snippets**, each carrying
   its source: author, title, page number.
6. Upload that file to Drive as `seeds/candidates/<source-slug>.md`.

One volume per run. Never batch the whole corpus — the point is small files.

## Heuristics: finding candidates, not judging them

**The script must not try to identify good exemplars.** It cannot. What it can do
is cheaply enrich the pool so that culling by hand is worth the time. Aim for
recall — a generous, noisy shortlist beats a clever, narrow one.

Usable signals, all mechanical:

- **Document-shape.** High density of dates, times, reference numbers, initials,
  section headers, form-field colons, all-caps labels. Catches `[document-working]`.
- **Clinical register.** Anatomical and procedural vocabulary co-occurring with
  institutional vocabulary in the same passage. Catches `[clinical-body]`.
- **Withholding.** Redaction marks, ellipses, bracketed omissions, sentences that
  terminate before their object. Catches `[withheld]`.
- **Scale.** Population nouns and quantities without intensifier adverbs — harm
  stated numerically and flatly. Catches `[scale]`.
- **Non-release.** Passage ends without a summarising clause; final sentence is
  concrete rather than abstract. Weak signal, worth including anyway.
- **Surprisal**, if convenient. Human professional prose runs 2.03–3.9× model
  baseline. Useful as a floor, not a ranking.

Tag each candidate with whichever heuristics fired. That gives coverage checking
for free, since the six tags exist precisely so gaps are visible.

## What stays manual

Selection. Permanently.

The script produces `candidates/`. Chris culls into `exemplars.md`. A script
cannot tell an exemplar from a paragraph, and the standing rule holds:
**nothing model-written, and nothing machine-selected, enters `exemplars.md`.**
Verbatim only, source and licence attached, strongest last.

Expected shape of the work: a few hundred candidates accumulate across the
corpus; Chris reads them over time, keeps six to ten. Culling is cheap and can be
done in fragments. Finding was always the expensive part — this removes it.

## Corpus priority

Smallest and most on-register first, so the pipeline is proven before anything
large is attempted:

1. **Langan, *The Wide Carnivorous Sky*** — 1.07 MB, smallest, ID `1Q-OeVk3ym0YD7s4_xEOlDBfbtqwkPi6k`
2. **Evenson, *The Glassy Burning Floor of Hell*** — strongest single register match
3. **Watts, *Blindsight*** — 1.17 MB, ID `1RCRF7NatUUsY2QZG_msf7nSSiUnL8zne`; clinical body, scale
4. **Datlow, *Body Shocks*** — ID `1qo5B3cdGYGM55hSLmCPiB3gx3G9CJCDv`
5. The 17 *Best Horror of the Year* volumes — last, highest noise per page

Evenson's *Contagion* at 19.7 MB is the stress case. If the pattern holds on it,
it holds on anything.

## Open questions

- Whether extracted PDF text is clean enough to use verbatim without hand
  repair. Ligatures, hyphenation across line breaks, running heads and page
  numbers intruding mid-passage. Likely needs a normalisation pass; needs a look
  at real output before deciding how much.
- Whether page-number attribution survives extraction reliably enough to cite.
- Copyright posture: these are candidates in a private working file, not
  redistribution, and passages are short. Worth Chris's own judgement before the
  file grows large.
