# research — what the project has concluded

Not sources. Nobody wrote these about a book; the project wrote them about its
own problem, or collected them as evidence for how the work should be done.

| file | what it is |
| :-- | :-- |
| `craft.md` | the evidence behind playbook §1 and §6 — eight parts, 74 failure modes with the authority attached, and a verification ledger of what is corrected, refuted, and still to be checked in print |
| `generation.md` | why a generation call is shaped the way it is — mode collapse and where it comes from, what raises output diversity and by how much, why negations decay with distance from the ask, why examples beat instructions on register |
| `register.md` | the genre terms §0 stands on — grimdark, cosmic horror, the eerie, the abject, body horror, the Aristotle constraint — with the citations §0 does not carry |
| `setting-a.md` | the specifics behind playbook §5 — fifteen domains of setting-a statutes, bodies, dates, cases. Written in-house and meant to grow |
| `literature.md` | academic work on what makes horror land. `sources.toml` reads this for themes and never for passages: criticism conditions for criticism |
| `corpus.md` | award-attested horror free to read online, with the licensing map. Held as a standard to read *against* — deliberately not in `sources/`, and never harvested |
| `tagging.md` | established practice for classifying passages -- Biber's multi-dimensional analysis and its tooling, Genette focalization, appraisal theory, and what the in-context-learning literature says about choosing a demonstration set. The grounding the six failure tags never had, and the basis of the facets that replaced them on 2026-09-03 |
| `themes.md` | why the theme extractor produces sentences rather than themes, measured over the 432 banked rows, and what the field does instead -- topic modelling, keyphrase extraction, Braun & Clarke thematic analysis and its LLM-assisted forms, TnT-LLM taxonomy induction, motif detection, frame semantics, propositions. Ends in a rebuild recommendation for `pipeline/themes.py` |
| `selection.md` | design for the selection stage. **Not built.** The harvest and example-bank stages it assumed are now `pipeline/`; this one is still paper |

`literature.md` is the only file here the pipeline reads.
