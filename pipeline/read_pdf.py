"""PDF -> Doc.

Built for the ebook-converted anthologies in `sources/texts/books/` — the Datlow volumes,
Evenson, Langan, Watts, Chiang, King. Those share a set of artifacts that will
wreck a naive extraction:

  * running headers and footers repeated on every page
  * bare page numbers on their own line
  * words hyphenated across a line break
  * front matter (title, copyright, TOC, acknowledgements) and back matter
    (author bios, "about the editor", permissions) that is not prose
  * in anthologies, many stories by different authors in one file

Uses `pdftotext` (poppler) when present because it is fast and its paragraph
handling on reflowed ebooks is better than the Python libraries'; falls back to
pdfplumber. Nothing here calls a model or the network.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from collections import Counter
from pathlib import Path

from .doc import Block, Doc, clean_text, slugify

# --- raw text extraction --------------------------------------------------


def _pdftotext(path: Path) -> list[str]:
    out = subprocess.run(
        ["pdftotext", "-enc", "UTF-8", "-q", str(path), "-"],
        capture_output=True,
        check=True,
    )
    text = out.stdout.decode("utf-8", errors="replace")
    return text.split("\f")


def _pdfplumber(path: Path) -> list[str]:
    import pdfplumber

    pages = []
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    return pages


def raw_pages(path: str | Path) -> list[str]:
    path = Path(path)
    if shutil.which("pdftotext"):
        try:
            return _pdftotext(path)
        except subprocess.CalledProcessError:
            pass
    return _pdfplumber(path)


# --- page furniture -------------------------------------------------------

_PAGE_NUM = re.compile(r"^\s*[ivxlcdm]{1,7}\s*$|^\s*\d{1,4}\s*$", re.I)


def _running_lines(pages: list[str], edge: int = 2, min_share: float = 0.25) -> set[str]:
    """Lines appearing at the top or bottom of many pages are furniture."""
    counter: Counter[str] = Counter()
    for p in pages:
        lines = [l.strip() for l in p.splitlines() if l.strip()]
        for l in lines[:edge] + lines[-edge:]:
            if 3 <= len(l) <= 90:
                counter[re.sub(r"\d+", "#", l).lower()] += 1
    need = max(3, int(len(pages) * min_share))
    return {k for k, v in counter.items() if v >= need}


def _strip_furniture(page: str, running: set[str], edge: int = 2) -> str:
    lines = page.splitlines()
    keep = []
    for i, line in enumerate(lines):
        s = line.strip()
        near_edge = i < edge or i >= len(lines) - edge
        if near_edge and (
            _PAGE_NUM.match(s) or re.sub(r"\d+", "#", s).lower() in running
        ):
            continue
        keep.append(line)
    return "\n".join(keep)


# --- de-hyphenation and paragraph reflow ----------------------------------

_HYPHEN_BREAK = re.compile(r"(\w)[-‐‑–]\s*\n\s*(\w)")
_LINE_JOIN = re.compile(r"(?<![.!?:;\"”'’])\n(?!\s*\n)(?=[a-z(\"“'])")


def _reflow(text: str) -> str:
    """Rebuild paragraphs from hard-wrapped lines.

    These conversions keep no indentation and put no blank line between
    paragraphs, so a page arrives as thirty lines all starting at column zero
    and the whole page became one block. `segment.windows` wants 150-400
    words, so a 600-word block yielded exactly one truncated passage and most
    of the prose was never seen.

    The tell is ragged-right: every line inside a paragraph runs to the
    measure, and only the last one falls short. So a line that ends a sentence
    *and* stops well before the measure ends a paragraph; anything else is a
    continuation.
    """
    text = _HYPHEN_BREAK.sub(r"\1\2", text)
    lines = [l.rstrip() for l in text.split("\n")]
    widths = sorted(len(l) for l in lines if l.strip())
    if not widths:
        return text
    measure = widths[int(len(widths) * 0.9)]
    if measure < 20:                       # not wrapped prose; leave it alone
        return _LINE_JOIN.sub(" ", text)

    paras: list[list[str]] = [[]]
    for line in lines:
        st = line.strip()
        if not st:
            if paras[-1]:
                paras.append([])
            continue
        paras[-1].append(st)
        ends_sentence = st.endswith((".", "!", "?", '"', "”", "’", "'"))
        if ends_sentence and len(st) < measure * 0.85:
            paras.append([])
    return "\n\n".join(" ".join(p) for p in paras if p)


# --- front / back matter --------------------------------------------------

_MATTER_MARKERS = re.compile(
    r"^\s*(contents|table of contents|copyright|all rights reserved|"
    r"acknowledgements?|acknowledgments?|permissions?|about the (author|editor)|"
    r"also by|first published|isbn|printed in|dedication|epigraph|"
    r"a note on the type|colophon|index)\b",
    re.I | re.M,
)


def _is_matter(chunk: str) -> bool:
    if _MATTER_MARKERS.search(chunk):
        return True
    words = chunk.split()
    if not words:
        return True
    # Copyright / permissions pages are dense with © and years and short lines.
    if chunk.count("©") or re.search(r"\bISBN\b", chunk):
        return True
    # A block that is mostly capitalized short lines is a TOC or title page.
    lines = [l for l in chunk.splitlines() if l.strip()]
    if len(lines) >= 4:
        shortish = sum(1 for l in lines if len(l.split()) <= 8)
        if shortish / len(lines) > 0.85:
            return True
    return False


# --- story splitting ------------------------------------------------------

_TITLE_LINE = re.compile(r"^\s{0,20}([A-Z][A-Za-z' ,:!?-]{2,60})\s*$")
_BYLINE = re.compile(r"^\s*(?:by\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3})\s*$")
# A contents line: "Lowland Sea—Suzy McKee Charnas". Em dash, not hyphen.
_TOC_LINE = re.compile(r"^\s*(.{2,70}?)\s*[—–]\s*([A-Z][^\d]{2,40})\s*$")
# An opener's title and byline are set in caps at the top of the page.
_CAPS_LINE = re.compile(r"^\s*([A-Z][A-Z' ,:!?.\u2019-]{2,60})\s*$")


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _toc(pages: list[str]) -> list[str]:
    """Story titles from a table of contents, in order.

    Two forms. An anthology lists `Title—Author`, which is unmistakable. A
    single-author collection has no bylines to list, so its contents page is a
    header and then bare titles — looser, and only trusted on a page that says
    it is the contents.
    """
    titles: list[str] = []
    for page in pages[:40]:
        lines = [l.rstrip() for l in page.splitlines() if l.strip()]
        pairs = [m.group(1).strip() for m in
                 (_TOC_LINE.match(l) for l in lines) if m]
        if len(pairs) >= 4:
            titles += pairs
            continue
        # `T C` / `ABLE OF ONTENTS` is how a drop cap survives extraction, so
        # match on the letters rather than on the words.
        head = _norm(" ".join(lines[:3]))
        if "contents" in head or "ableofontents" in head:
            for l in lines[1:]:
                # Dot leaders and a page number: "A HANGING . . . . . . 41".
                l = re.sub(r"[\s.·…]{4,}\s*\d*\s*$", "", l).strip()
                w = l.split()
                if 1 <= len(w) <= 10 and not l.endswith((",", ";", ":")):
                    titles.append(l)
    seen, out = set(), []
    for t in titles:
        n = _norm(t)
        if n and n not in seen and len(n) > 2:
            seen.add(n); out.append(t)
    return out


def _split_stories(pages: list[str]) -> list[tuple[str, str, str]]:
    """Split an anthology into (title, author, text), one entry per story.

    Two strategies. If the book has a table of contents, a page whose first
    line is one of its titles opens that story — precise, and it survives the
    typography changing between the contents and the body. Otherwise a page
    that opens with a title line and a byline starts a section.

    The old rule required the opening page to be nearly empty, on the theory
    that a story starts on a title page. In these conversions it does not: the
    title, the byline and the first page of prose share a page, so the rule
    matched almost nothing and a 418-page anthology came back as three
    sections, one of them 190,000 words. A novel still returns one section,
    which is correct.
    """
    wanted = {_norm(t): t for t in _toc(pages)}
    sections: list[tuple[str, str, list[str]]] = []

    for page in pages:
        lines = [l for l in page.splitlines() if l.strip()]
        title = author = ""
        if lines:
            first = lines[0].strip()
            if wanted:
                # Once only. A collection repeats every title in its story
                # notes and again in an index, and each repeat would open a
                # second section for a story already read.
                hit = wanted.pop(_norm(first), None)
                if hit:
                    title = hit
                    if len(lines) > 1:
                        b = _BYLINE.match(lines[1]) or _CAPS_LINE.match(lines[1])
                        if b:
                            author = b.group(1).strip().title()
            else:
                m = _TITLE_LINE.match(first) or _CAPS_LINE.match(first)
                if m and len(m.group(1).split()) <= 9 and len(lines) > 1:
                    b = _BYLINE.match(lines[1]) or _CAPS_LINE.match(lines[1])
                    if b:
                        title, author = m.group(1).strip(), b.group(1).strip().title()

        if title:
            sections.append((title, author, []))
        if sections:
            sections[-1][2].append(page)
        else:
            sections.append(("", "", [page]))

    return [(t, a, "\n\f\n".join(p)) for t, a, p in sections]


# --- main entry -----------------------------------------------------------


def parse(
    path: str | Path,
    source_prefix: str = "pdf",
    split_stories: bool = True,
    author: str = "",
    min_section_words: int = 700,
) -> list[Doc]:
    """Parse one PDF into one or more Docs (one per story, where detectable)."""
    path = Path(path)
    pages = raw_pages(path)
    running = _running_lines(pages)
    pages = [_strip_furniture(p, running) for p in pages]

    sections = _split_stories(pages) if split_stories else [("", "", "\n\f\n".join(pages))]

    docs: list[Doc] = []
    for title, sec_author, text in sections:
        text = _reflow(text)
        chunks = [c for c in re.split(r"\n\s*\n", text) if c.strip()]
        prose = [c for c in chunks if not _is_matter(c)]
        if sum(len(c.split()) for c in prose) < min_section_words:
            continue

        stem = slugify(title) if title else path.stem
        doc = Doc(
            source_id=f"{source_prefix}/{slugify(path.stem)}/{stem}",
            title=title or path.stem,
            author=sec_author or author,
            origin=str(path),
            kind="fiction",
            meta={"pages": len(pages), "file": path.name},
        )
        page_no = 1
        title_norm = (title or "").strip().lower()
        for c in prose:
            page_no += c.count("\f")
            body = clean_text(c.replace("\f", " "))
            if len(body.split()) < 8:
                continue
            # The story's own title page survives the matter filter because it
            # is short and capitalized rather than boilerplate. Mark it as a
            # heading so it never lands inside a harvested passage.
            first_line = body.splitlines()[0].strip().lower()
            is_title_page = (
                title_norm
                and len(body.split()) <= 25
                and (first_line == title_norm or body.lower().startswith(title_norm))
            )
            kind = "heading" if is_title_page else "prose"
            doc.blocks.append(Block(body, kind=kind, locator=f"p.{page_no}"))
        if doc.blocks:
            docs.append(doc.finalize())

    return docs
