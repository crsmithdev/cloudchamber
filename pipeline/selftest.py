"""python -m pipeline.selftest

Runs the pipeline end to end against a synthetic repo in a temp directory.
Checks the things that actually break: wikidot stripping, PDF furniture and
de-hyphenation, window sizing, tag gating, and — the important one — that
re-harvesting the same material produces the same passage ids, so decisions
survive a change to the heuristics.

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

[[footnoteblock]]
[[include :scp-wiki:component:license-box]]
=====
> **Filename:** test.png
> **Author:** testauthor
=====
"""


def main() -> int:
    from . import read_pdf, read_scp, signals, themes
    from .bank import Bank
    from .harvest import score
    from .segment import MAX_WORDS, MIN_WORDS, windows

    tmp = Path(tempfile.mkdtemp(prefix="fogbelt-selftest-"))
    (tmp / "refs" / "scp").mkdir(parents=True)
    (tmp / "refs" / "scp" / "scp-0000.md").write_text(SCP_FIXTURE, encoding="utf-8")

    print("scp adapter")
    doc = read_scp.parse(tmp / "refs" / "scp" / "scp-0000.md")
    text = " ".join(b.text for b in doc.blocks)
    check("front matter parsed", doc.author == "testauthor", repr(doc.author))
    check("footnote body removed", "must be removed entirely" not in text)
    check("html comment removed", "attribution comment" not in text)
    check("include block removed", "info-ayers" not in text and "|lang=en" not in text)
    check("module removed", "[[module" not in text and "Rate]]" not in text)
    check("licensebox tail removed", "Filename:" not in text)
    check("triple link kept its label", "Site-81" in text)
    check("no stray brackets", not re.search(r"[\[\]]", text.replace("[REDACTED]", "")))
    check("prose survived", doc.word_count() > 150, f"{doc.word_count()} words")

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
    warm = [p for p in passages if "warm-mechanism" in p.tags]
    check("warm-mechanism fires on warmth+harm", len(warm) > 0)
    polite = signals.compute(
        "She smiled and thanked him kindly. She was gentle and careful and "
        "warm, and she welcomed the patient guest with comfort and care."
    )
    check(
        "warm-mechanism does not fire without harm",
        signals.tag_scores(polite)["warm-mechanism"] < signals.THRESHOLD,
        f"{signals.tag_scores(polite)['warm-mechanism']}",
    )
    year_only = signals.compute("The year was 1994. Then it was 1995, and then 1996.")
    check("bare years are not big numbers", year_only["big_numbers"] == 0.0)
    check(
        "comma-grouped numbers are",
        signals.compute("A total of 240,000 were processed.")["big_numbers"] > 0,
    )

    print("\npdf adapter")
    pdf_ok = _pdf_check(tmp, read_pdf, check)

    print("\nthemes")
    trows = themes.from_doc(doc)
    check("themes extracted", len(trows) > 0, f"{len(trows)}")
    check("themes carry facets", all(t["facets"] for t in trows))

    print("\nbank and decision trail")
    bank = Bank(tmp / "seeds")
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
    doc2 = read_scp.parse(tmp / "refs" / "scp" / "scp-0000.md")
    passages2 = [score(p) for p in windows(doc2)]
    added2, refreshed2 = bank.merge(passages2)
    check("re-harvest adds nothing new", added2 == 0, f"+{added2}")
    check("re-harvest refreshes all", refreshed2 == len(passages2))
    check("ids stable across re-harvest", set(bank.load()) == first_ids)
    check("decision survived re-harvest", len(bank.history(passages[0].id)) == 2)

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

    docs = read_pdf.parse(out, source_prefix="selftest")
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
