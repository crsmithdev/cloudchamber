from pathlib import Path

from extract import scp

FX = Path(__file__).parent / "fixtures"


def render(doc):
    return "\n\n".join(f"[{b.kind}] {b.text}" for b in doc.blocks) + "\n"


def test_fixture_strips_every_known_leak_byte_for_byte():
    doc = scp.parse(FX / "scp-0000.md", source_prefix="scp")
    assert render(doc) == (FX / "scp-0000.expected.txt").read_text()
    assert (doc.title, doc.author, doc.license) == ("SCP-0000", "testauthor", "CC BY-SA 3.0")


def test_fixture_has_no_markup_in_prose():
    doc = scp.parse(FX / "scp-0000.md", source_prefix="scp")
    prose = " ".join(b.text for b in doc.prose())
    for leak in ("[[", "]]", "##", "@@", "||", "<style", "footnote"):
        assert leak not in prose
