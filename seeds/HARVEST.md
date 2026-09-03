# HARVEST — how passages get into `seeds/exemplars.md`

*Companion to `exemplars.md`, which says what belongs there. This says how to get it there without
destroying a session. Written 2026-09-02 after a prior session was killed by loading a PDF.*

## The hard constraint

**No large file may enter the model's context.** A 2 MB PDF returned through
`download_file_content` arrives as base64 in-context and ends the session. This has happened once.
The rule is not "be careful with large files" — it is that the bytes must never be printed.

Exemplars are also the one artifact that cannot be paraphrased around the problem. A distillate of
Evenson is criticism, not Evenson; conditioning on it produces criticism. The passage must be
verbatim, so the file must be opened. The procedure below opens it somewhere the context cannot see.

## Cost shape, which is the reason this is tractable

Six to ten passages of 150–400 words is roughly 2,000 words total. Holding the finished set is
trivial. **The expense is entirely in the finding, not the holding.** So the procedure optimises for
never reading a source twice: one source per session, harvest, write, done.

## Route A — plain-text web sources (preferred; use first)

SCP articles under the `[S]` tag are already the right length, already in register, and reachable
as text. No PDF, no base64, no crash risk. Fetch the article, take one passage, discard the rest.

This is the default route. Exhaust it before touching Route B.

Caveat: fetch returns navigation and markup around the prose. Take only the body, and confirm the
passage is prose rather than boilerplate before it is written anywhere.

## Route B — PDFs in `refs/` (only when a tag cannot be covered by Route A)

1. Fetch the file **to sandbox disk, never to context.** If the connector cannot write to disk
   without returning the payload, stop — do not "try it and see."
2. Open it in the sandbox. Extract by page range.
3. **Print only the candidate slice**, a few hundred words at a time. Never print the document,
   never print a page count's worth of text, never `print(text)`.
4. Judge the slice, keep or discard, move to the next range.
5. Write the keepers to `exemplars.md`. Do not open the PDF again.

**Front matter.** The Datlow volumes open with many pages of series listings, other-titles-by,
copyright and tables of contents. Start extraction at the first story, not at page one, or the
harvest returns boilerplate.

**Order by size.** Test the mechanism on the smallest file available before spending it on a large
one. A failed attempt on a small file costs a retry; a failed attempt on a large one costs the
session.

## Selection

Which passage is a good exemplar is a judgement call and belongs to Chris, not to a keyword search.
The sustainable division: the model fetches, slices and formats; Chris nominates and approves.

A rough pass by the model is acceptable as a **provisional** set to test the seeding procedure
against, explicitly marked as such, and recurated later at a desk. It is not canon until approved.

## Coverage

The set is checked against the six tags in `exemplars.md` rather than allowed to accumulate along
one axis: `[no-resolution]`, `[warm-mechanism]`, `[document-working]`, `[clinical-body]`,
`[scale]`, `[withheld]`.

`[no-resolution]` is the hardest to excerpt — an ending carries no weight without its setup, so it
needs a longer passage than the others and may need to sit at the 400-word ceiling.

## Standing prohibition

Nothing model-written enters `exemplars.md`, ever. The regression it causes is invisible on
inspection, which is why the rule is absolute rather than a matter of judgement.
