"""python -m pipeline.selftest

Runs the pipeline end to end against a synthetic repo in a temp directory.
Checks the things that actually break: wikidot stripping, PDF furniture and
de-hyphenation, window sizing, Biber dimension polarity, and — the important
one — that re-harvesting the same material produces the same passage ids and
does not blank the facets, so decisions survive a change to the heuristics.

No network, no model, no API key. If this passes after a sync, the files
arrived intact.
"""

from __future__ import annotations

import re
import sys
import tempfile
from pathlib import Path

FAILURES: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        print(f"  ok   {name}")
    else:
        print(f"  FAIL {name}  {detail}")
        FAILURES.append(name)


SCP_FIXTURE = """---
title: "SCP-0000"
source: https://scp-wiki.wikidot.com/scp-0000
author: testauthor
license: CC BY-SA 3.0
---

<!-- attribution comment that must not survive -->
[[include component:info-ayers
|lang=en
|page=scp-0000
]]

= **SCP-0000** - //A Test//

----

[[module Rate]]

**Special Containment Procedures:** Subjects are to be processed at the
intake facility on a standard weekly interval. Personnel are not to be
informed of the disposal protocol[[footnote]]This footnote body must be
removed entirely.[[/footnote]].

**Description:** The procedure is administered to residents of the
district in order to reduce the recorded population, which means the
cohort is permanently unable to leave. The observed effect is routine and
unremarkable. Records indicate 1994 as the first year of operation, and
the total processed stands at 240,000 across the region. Personnel
reported no further detail; the identity of the authorizing officer was
never determined and remains unaccounted for.

She was gentle with them. She thanked each subject by name, and she was
careful with the incision, and the wound was clean, and the bodies were
recorded and buried in the standard manner before the next intake.

A link to [[[secure-facility-dossier-site-81|Site-81]]] must survive as
its label, with no stray brackets left behind.

The screening continues. It continues each morning, indefinitely, and the
personnel remain in operation as scheduled.

[[html]]
<style>
.continue-button {
    box-shadow: inset 0 0.3125rem 0 rgba(var(--light-gray-monochrome), 0);
    transition: transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1);
}
</style>
<div class="continue-button">Continue</div>
[[/html]]

[[footnoteblock]]
[[include :scp-wiki:component:license-box]]
=====
> **Filename:** test.png
> **Author:** testauthor
=====
"""


def main() -> int:
    from . import biber, read_pdf, read_scp, signals, themes
    from pathlib import Path
    from .bank import Bank
    from .harvest import score
    from .segment import MAX_WORDS, MIN_WORDS, windows

    tmp = Path(tempfile.mkdtemp(prefix="fogbelt-selftest-"))
    (tmp / "sources" / "texts" / "scp").mkdir(parents=True)
    (tmp / "sources" / "texts" / "scp" / "scp-0000.md").write_text(SCP_FIXTURE, encoding="utf-8")

    print("scp adapter")
    doc = read_scp.parse(tmp / "sources" / "texts" / "scp" / "scp-0000.md")
    text = " ".join(b.text for b in doc.blocks)
    check("front matter parsed", doc.author == "testauthor", repr(doc.author))
    check("footnote body removed", "must be removed entirely" not in text)
    check("html comment removed", "attribution comment" not in text)
    check("include block removed", "info-ayers" not in text and "|lang=en" not in text)
    check("module removed", "[[module" not in text and "Rate]]" not in text)
    check("licensebox tail removed", "Filename:" not in text)
    # An [[html]] block is an embedded iframe document, never narration. One
    # was leaking a full stylesheet into the pool from scp-4485, found by
    # reading the D5 extremes.
    check("html block removed",
          "box-shadow" not in text and "cubic-bezier" not in text
          and "continue-button" not in text)
    check("triple link kept its label", "Site-81" in text)
    check("no stray brackets", not re.search(r"[\[\]]", text.replace("[REDACTED]", "")))
    check("prose survived", doc.word_count() > 150, f"{doc.word_count()} words")

    print("\nsources")
    from . import sources as sources_mod

    (tmp / "sources" / "texts" / "scp" / "README.md").write_text(
        "# The SCP corpus\n\nNotes about where these came from.\n",
        encoding="utf-8",
    )
    scp_src = next(s_ for s_ in sources_mod.load(tmp) if s_.id == "scp")
    matched = [f.name for f in sources_mod.resolve(scp_src, tmp)]
    check("a corpus README is not a source", matched == ["scp-0000.md"], str(matched))

    print("\nsegmentation")
    passages = [score(p) for p in windows(doc)]
    check("passages produced", len(passages) > 0, f"{len(passages)}")
    check(
        "all within size bounds",
        all(MIN_WORDS <= p.words <= MAX_WORDS for p in passages),
        f"{[p.words for p in passages]}",
    )
    check("ids are unique", len({p.id for p in passages}) == len(passages))

    print("\nsignals")
    withheld = signals.compute(
        "The identity was never determined. [REDACTED] No record was found, "
        "and the outcome remains unknown... No further detail is available."
    )
    check("withheld fires on redaction and elision",
          signals.withheld_score(withheld) >= signals.WITHHELD_THRESHOLD,
          f"{signals.withheld_score(withheld)}")
    plain = signals.compute(
        "She walked to the window and looked at the garden. The light was "
        "low and the grass was wet. She counted the rows and went back in."
    )
    check("withheld does not fire on plain narration",
          signals.withheld_score(plain) < signals.WITHHELD_THRESHOLD,
          f"{signals.withheld_score(plain)}")
    check("the six failure tags are gone",
          not any(hasattr(signals, n) for n in ("tag_scores", "tags", "THRESHOLD")))
    check("register_score no longer takes a tag argument",
          signals.register_score.__code__.co_argcount == 1)

    print(f"\nbiber ({biber.BACKEND} backend)")
    involved = (
        "I don't know what you want me to say. I think you already know, and "
        "I really can't tell you anything else. Well, maybe I can. You know "
        "how it is. I mean, I feel like we've been here before, haven't we?"
    )
    informational = (
        "Containment of the specimen requires maintenance of the isolation "
        "chamber at a constant temperature. Personnel with authorization for "
        "the observation of the procedure must record an assessment of the "
        "condition of the containment apparatus at each interval."
    )
    narrative = (
        "He walked to the window and looked out. She had already gone. He "
        "said nothing, and then he told her brother what had happened, and "
        "they drove to the coast, and nobody spoke for an hour."
    )
    rows = [biber.features(t) for t in (involved, informational, narrative)]
    stats = biber.fit(rows)
    dims = [biber.dimensions(r, stats) for r in rows]
    check("d1 separates involved from informational",
          dims[0]["d1"] > dims[1]["d1"], f"{dims[0]['d1']} vs {dims[1]['d1']}")
    check("d2 separates narrative from informational",
          dims[2]["d2"] > dims[1]["d2"], f"{dims[2]['d2']} vs {dims[1]['d2']}")
    check("facets label the poles",
          biber.facets(rows[0], stats)["voice"] == "involved"
          and biber.facets(rows[1], stats)["voice"] == "informational",
          f"{biber.facets(rows[0], stats)} / {biber.facets(rows[1], stats)}")
    persuasive = (
        "Personnel must be instructed to withdraw. If the interval closes, "
        "the committee should require that the site be sealed, and we would "
        "urge the director to recommend that they be told to leave."
    )
    abstract = (
        "The specimen was subsequently transferred, and the enclosure was "
        "sealed by the technicians. However, since the readings were "
        "recorded, the sample has been withheld; therefore the assessment "
        "was consequently deferred."
    )
    more = [biber.features(t) for t in (persuasive, abstract)]
    stats2 = biber.fit(rows + more)
    d4 = [biber.dimensions(r, stats2)["d4"] for r in (more[0], rows[1])]
    d5 = [biber.dimensions(r, stats2)["d5"] for r in (more[1], rows[0])]
    check("d4 separates persuasion from its absence", d4[0] > d4[1], str(d4))
    check("d5 separates abstract from non-abstract", d5[0] > d5[1], str(d5))
    check("all six dimensions are scored",
          len(biber.scored_dimensions(stats2)) == 6,
          str(biber.scored_dimensions(stats2)))
    check("a facet record carries a label per dimension",
          all(biber.LABELS[d][0] in biber.facets(more[0], stats2)
              for d in biber.ALL_DIMENSIONS))
    check("the coverage grid stays two-dimensional", len(biber.CELLS) == 9)
    check("an ambiguous label is reported as such",
          biber.ambiguous("moderate") == ["persuasion", "elaboration"]
          and biber.ambiguous("abstract") == [])
    check("dimension=label matches, bare ambiguous label does not",
          biber.matches({"persuasion": "moderate"}, "persuasion=moderate")
          and not biber.matches({"persuasion": "moderate"}, "moderate"))
    check("stats record the backend", stats["backend"] == biber.BACKEND)
    check("every cell is a known cell",
          biber.cell(biber.facets(rows[0], stats)) in biber.CELLS)
    check("cell tolerates the themes-style facets list",
          biber.cell(["mechanism"]) == "(unscored)")

    print("\npdf adapter")
    pdf_ok = _pdf_check(tmp, read_pdf, check)

    print("\nthemes")
    check("local sentence extraction is gone",
          not hasattr(themes, "harvest_local"))
    try:
        themes.from_doc(doc)
        check("from_doc refuses rather than silently returning spans", False)
    except NotImplementedError:
        check("from_doc refuses rather than silently returning spans", True)

    # The validator is calibrated against playbook §2; if it rejects its own
    # reference corpus it is measuring itself.
    bullets = themes.playbook_bullets(Path.cwd())
    passing = sum(1 for b in bullets if not themes.check(b))
    check("playbook §2 passes its own validator",
          passing / len(bullets) > 0.95, f"{passing}/{len(bullets)}")
    check("a good theme passes",
          not themes.check("A debt notice that enrols on delivery rather than "
                           "on reading, for a sum no one alive could clear."))
    for bad, why in (
        ("This occurs through regular postage received by the subject each week.",
         "opens on a deictic"),
        ("SCP-2271 manifests as a plain white envelope containing a letter about debt.",
         "carries a designation"),
        ("A remedy administered by Doctor Wallace that leaves the treated awake.",
         "carries a proper noun"),
        ("Too short.", "too short"),
    ):
        check(f"rejected: {why}",
              any(why.split()[0] in r for r in themes.check(bad)),
              str(themes.check(bad)))
    m = themes.measure(bullets)
    check("measure reports the §2 grain",
          m["median_words"] == 21 and m["proper_rate"] < 0.05, str(m))

    print("\nbank and decision trail")
    bank = Bank(tmp / "extracted")
    added, refreshed = bank.merge(passages)
    check("first merge adds", added == len(passages) and refreshed == 0,
          f"+{added} ~{refreshed}")
    first_ids = set(bank.load())

    bank.record(passages[0].id, "keep", note="selftest")
    bank.record(passages[0].id, "pass", note="changed my mind")
    hist = bank.history(passages[0].id)
    check("decisions append, never overwrite", len(hist) == 2, f"{len(hist)} rows")
    check("latest verdict wins for views",
          bank.verdicts()[passages[0].id]["verdict"] == "pass")

    # The load-bearing property: re-harvest must not churn ids.
    doc2 = read_scp.parse(tmp / "sources" / "texts" / "scp" / "scp-0000.md")
    passages2 = [score(p) for p in windows(doc2)]
    added2, refreshed2 = bank.merge(passages2)
    check("re-harvest adds nothing new", added2 == 0, f"+{added2}")
    check("re-harvest refreshes all", refreshed2 == len(passages2))
    check("ids stable across re-harvest", set(bank.load()) == first_ids)
    check("decision survived re-harvest", len(bank.history(passages[0].id)) == 2)

    print("\nfacets")
    from . import facets as facets_mod

    result = facets_mod.score(out=tmp / "extracted", refit=True)
    pool = bank.load()
    check("every passage scored", all(p.get("facets") for p in pool.values()))
    check("stats persisted", (tmp / "extracted" / facets_mod.STATS).exists())
    check("distribution sums to the pool",
          sum(result["distribution"].values()) == len(pool))
    # The one that bites: harvest knows nothing about facets, and a naive
    # merge would write them all back as {}.
    bank.merge(passages2)
    check("facets survive a re-harvest",
          all(p.get("facets") for p in bank.load().values()))

    print("\nserve")
    from . import serve as serve_mod

    # Its own bank: these verdicts must not perturb the decision-trail
    # assertions above, which count rows.
    serve_dir = tmp / "serve-extracted"
    Bank(serve_dir).merge(passages)
    facets_mod.score(out=serve_dir, refit=True)
    cull = serve_mod.Cull(serve_dir)
    q = cull.queue("deck", limit=3)
    check("deck queue serves the pool", q["items"] and q["total"] > 0,
          f"{q['total']}")
    check("queue rows carry text and facets",
          all(r["text"] and r["dims"] for r in q["items"]))
    pid = q["items"][0]["id"]
    cull.record([{"id": pid, "verdict": "keep", "method": "triage"}])
    check("a triage keep becomes a survivor",
          [r["id"] for r in cull.queue("bench")["items"]] == [pid])
    cull.record([{"id": pid, "verdict": "keep", "method": "bench",
                  "note": "read in full"}])
    check("a bench verdict clears the bench", cull.queue("bench")["total"] == 0)
    try:
        cull.record([{"id": pid, "verdict": "sideways"}])
        check("a bad verdict is refused", False, "no error raised")
    except ValueError:
        check("a bad verdict is refused", True)
    check("passage verdicts stay out of the theme trail",
          not (serve_dir / "theme-decisions.jsonl").exists())
    check("ui is a real file on disk", (serve_mod.UI / "app.html").exists())
    html = (serve_mod.UI / "app.html").read_text(encoding="utf-8")
    check("the page sets passages as prose", "Newsreader" in html)
    check("the page never calls scrollIntoView", "scrollIntoView" not in html)

    print("\ncompare-mode decisions")
    bank.record(passages[1].id, "keep", method="compare",
                extra={"group": "g1", "group_size": 5, "picked": 2})
    row = [r for r in bank.history(passages[1].id)][-1]
    check("method and group are recorded",
          row["method"] == "compare" and row["group"] == "g1", str(row))
    # Three verdicts on the trail: keep, pass (same passage, changed mind),
    # keep. One whole block of two, and a trailing remainder that is dropped
    # rather than reported as a rate over one.
    check("keep rate reports whole blocks only", bank.keep_rate(block=2) == [0.5],
          str(bank.keep_rate(block=2)))

    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILED: {', '.join(FAILURES)}")
        return 1
    print(f"all checks passed  (pdf adapter: {'exercised' if pdf_ok else 'skipped'})")
    return 0


def _pdf_check(tmp: Path, read_pdf, check) -> bool:
    """Build a small PDF with headers, page numbers and a hyphen break."""
    import shutil
    import subprocess

    chromium = next(
        (c for c in ("/opt/pw-browsers/chromium", "chromium", "chromium-browser",
                     "google-chrome") if shutil.which(c) or Path(c).exists()),
        None,
    )
    if not chromium:
        print("  --   no chromium; pdf adapter not exercised")
        return False

    body = ("<p>" + ("The procedure was admin-<br>istered to the residents of the "
                     "district without incident, and the record was kept. ") * 12 + "</p>")
    html = f"""<style>
@page {{ size:6in 9in; margin:0 }}
body {{ margin:0; font:11pt/1.5 Georgia,serif }}
.page {{ height:9in; width:6in; box-sizing:border-box; padding:.7in .75in;
        page-break-after:always; position:relative }}
.hdr {{ position:absolute; top:.35in; left:.75in; font-size:8pt }}
.pno {{ position:absolute; bottom:.35in; left:0; right:0; text-align:center }}
p.t {{ text-align:center; font-size:16pt; margin-top:2in }}
</style>
<div class='page'><div class='hdr'>A TEST ANTHOLOGY</div>
  <p>Copyright © 2020. All rights reserved.</p><p>ISBN 978-0-0000-0000-0</p>
  <div class='pno'>1</div></div>
<div class='page'><div class='hdr'>A TEST ANTHOLOGY</div>
  <p class='t'>The Test Story</p><p style='text-align:center'>Jane Doe</p>
  <div class='pno'>2</div></div>
""" + "".join(
        f"<div class='page'><div class='hdr'>A TEST ANTHOLOGY</div>{body}"
        f"<div class='pno'>{i}</div></div>"
        for i in range(3, 7)
    )

    src = tmp / "fixture.html"
    src.write_text(html, encoding="utf-8")
    out = tmp / "fixture.pdf"
    try:
        subprocess.run(
            [chromium, "--headless", "--no-sandbox", "--disable-gpu",
             f"--print-to-pdf={out}", "--no-pdf-header-footer", f"file://{src}"],
            check=True, capture_output=True, timeout=90,
        )
    except Exception as e:
        print(f"  --   chromium failed ({type(e).__name__}); pdf adapter not exercised")
        return False

    try:
        docs = read_pdf.parse(out, source_prefix="selftest")
    except Exception as e:
        # No pdftotext and no pdfplumber. Skip rather than take the whole
        # selftest down with it — everything above this point is unaffected.
        print(f"  --   no pdf extractor ({type(e).__name__}); adapter not exercised")
        return False
    check("pdf produced a doc", len(docs) >= 1, f"{len(docs)}")
    if not docs:
        return True
    t = " ".join(b.text for b in docs[0].blocks)
    check("running header stripped", "A TEST ANTHOLOGY" not in t)
    check("copyright page dropped", "ISBN" not in t and "©" not in t)
    check("hyphen break rejoined", "administered" in t and "admin- istered" not in t)
    check("author detected", docs[0].author == "Jane Doe", repr(docs[0].author))
    return True


if __name__ == "__main__":
    sys.exit(main())
