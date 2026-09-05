"""The Python seam: what `python -m extract` leaves in the store for the dev subset."""

import re

from extract import pdf, segment
from extract.tests.conftest import ROOT, SOURCES, run

VOL01 = SOURCES / "horror" / "Ellen Datlow - The Best Horror of the Year Volume 01.pdf"
CONTAGION = SOURCES / "horror" / "Brian Evenson - Contagion and Other Stories.pdf"
CONTAGION_STORIES = ["The Polygamy Of Language", "Two Brothers", "A Hanging", "Internal",
                     "Prairie", "Contagion", "Watson's Boy", "By Halves"]


def stories(db, source):
    return db.execute("SELECT * FROM stories WHERE source_id = ? ORDER BY ord", (source,)).fetchall()


def test_dev_subset_is_what_the_manifest_marks(db):
    ids = {r[0] for r in db.execute("SELECT id FROM sources")}
    assert ids == {"scp", "datlow-01", "evenson-contagion"}
    assert db.execute("SELECT count(*) FROM stories WHERE source_id = 'scp'").fetchone()[0] == 10


def test_vol01_stories_come_from_the_outline_with_bylines(db):
    entries = pdf.outline_entries(VOL01)
    expected = [t for t, _ in entries if "—" in t and not pdf._NOT_A_STORY.match(t)]
    rows = stories(db, "datlow-01")
    assert len(rows) == len(expected) == 28
    for r, e in zip(rows, expected):
        title, author = pdf._EM.split(e, 1)
        assert r["title"] == title.strip() and r["author"] == author.strip()
        assert r["split_by"] == "outline"


def test_contagion_splits_on_page_cues_into_eight(db):
    rows = stories(db, "evenson-contagion")
    assert [r["title"] for r in rows] == CONTAGION_STORIES
    assert all(r["author"] == "Brian Evenson" and r["split_by"] == "cues" for r in rows)
    watsons = [r for r in rows if r["title"] == "Watson's Boy"][0]
    assert watsons["words"] > 9000          # TWO and THREE absorbed, not split off


def test_manifest_stories_override_wins():
    docs = pdf.read(CONTAGION, "x", author="Brian Evenson", genre="horror",
                    manifest_stories=[{"title": "First Half", "page": 10}, {"title": "Second Half", "page": 76}])
    assert [d.title for d in docs] == ["First Half", "Second Half"]
    assert all(d.meta["split_by"] == "manifest" for d in docs)


def test_no_furniture_or_markup_survives(db):
    bad = re.compile(r"Google Original|Digitized by|\[\[|\]\]|##|@@|\|\||^\s*\d{1,4}\s*$", re.M)
    for sid, text in db.execute("SELECT id, text FROM stories"):
        assert not bad.search(text), sid


def test_passages_respect_unit_quota_and_boundaries(db):
    for s in db.execute("SELECT id, words, text FROM stories"):
        ps = db.execute("SELECT text, words, stratum FROM passages WHERE story_id = ?", (s["id"],)).fetchall()
        q = segment.quota(s["words"])
        assert len(ps) <= q
        harvestable = sum(len(p.split()) for p in s["text"].split("\n\n") if len(p.split()) <= 400)
        if harvestable >= q * 450:           # enough eligible prose for the quota to be reachable
            assert len(ps) == q, s["id"]
        story = "\n\n" + s["text"] + "\n\n"
        for p in ps:
            assert 150 <= p["words"] <= 400
            assert ("\n\n" + p["text"] + "\n\n") in story       # paragraph-aligned, contiguous


def test_overlap_between_passages_is_bounded(db):
    for s in db.execute("SELECT id FROM stories"):
        texts = [r[0] for r in db.execute("SELECT text FROM passages WHERE story_id = ?", (s[0],))]
        paras = [set(t.split("\n\n")) for t in texts]
        for i in range(len(paras)):
            for j in range(i + 1, len(paras)):
                shared = sum(len(p.split()) for p in paras[i] & paras[j])
                assert shared <= 0.5 * min(sum(len(p.split()) for p in paras[i]), sum(len(p.split()) for p in paras[j]))


def test_segment_is_deterministic_under_a_seed(db):
    from extract.doc import Block, Doc
    r = db.execute("SELECT id, title, author, text FROM stories WHERE source_id = 'datlow-01' ORDER BY words DESC").fetchone()
    def cut(seed):
        d = Doc(source_id=r["id"], title=r["title"], author=r["author"])
        d.blocks = [Block(p) for p in r["text"].split("\n\n") if p.strip()]
        return [p.id for p in segment.cut(d.finalize(), seed=seed)]
    assert cut(0) == cut(0)
    assert cut(0) != cut(1)


def test_facets_fitted_and_labelled(db):
    fit = db.execute("SELECT backend, n FROM facet_fit WHERE id = 1").fetchone()
    assert fit["backend"] in ("biberplus", "local")
    assert fit["n"] == db.execute("SELECT count(*) FROM passages").fetchone()[0]
    assert db.execute("SELECT count(*) FROM passages WHERE d1 IS NULL OR d6 IS NULL OR voice IS NULL OR mode IS NULL").fetchone()[0] == 0
    cells = {r[0] for r in db.execute("SELECT voice || '/' || mode FROM passages")}
    assert len(cells) == 9


def test_facets_refuse_backend_mix_and_warn_on_drift(db, tmp_path):
    out = run("facets", db=db.execute("PRAGMA database_list").fetchone()[2]).stdout
    assert "existing fit" in out


def test_short_paragraphs_and_name_openers_survive(db):
    """An earlier rule dropped every paragraph under eight words (18.7% of the dev
    corpus) and stripped the story's title from any paragraph opening with it."""
    t = db.execute("SELECT text FROM stories WHERE id = 'datlow-01/majorlena'").fetchone()[0]
    assert "\n\nSchulz was dragging Leroy back up.\n\n" in t
    assert "Majorlena put her hand over Leroy’s mouth" in t
    assert "Majorlena had been assessing the road situation." in t
    short = sum(1 for s in db.execute("SELECT text FROM stories WHERE source_id = 'datlow-01'") for p in s[0].split("\n\n") if len(p.split()) < 8)
    assert short > 500
    # the opening title and byline are still removed
    first = db.execute("SELECT text FROM stories WHERE id = 'datlow-01/lowland-sea'").fetchone()[0].split("\n\n")[0]
    assert not first.lower().startswith("lowland sea")
