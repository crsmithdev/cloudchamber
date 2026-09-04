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
# A contents line, two forms: "Lowland Sea—Suzy McKee Charnas" and
# "“Toother” by Terry Dowling". The Datlow volumes use both across the series.
_TOC_LINE = re.compile(r"^\s*(.{2,70}?)\s*[—–]\s*([A-Z][^\d]{2,40})\s*$")
_TOC_BY = re.compile(r"^\s*[“\"\u2018']?(.{2,70}?)[”\"\u2019']?\s+by\s+([A-Z][^\d]{2,40})\s*$")
# A contents entry whose byline wrapped past the end of the page keeps its
# quotes but loses its author, and the last story of the book went with it.
_TOC_QUOTED = re.compile(r"^\s*[“\"](.{2,70}?)[”\"]\s*(?:by\b.*)?$")
# Front and back matter that sits in a contents list and is not a story.
_NOT_A_TITLE = re.compile(
    r"^\s*(table of contents|contents|copyright|copyright page|title page|"
    r"cover|dedication|epigraph|acknowledge?ments?|permissions?|about the \w+|"
    r"also by\b|index|begin reading|newsletter|sign up|praise for|"
    r"tom doherty|first published|colophon|front matter|back matter|"
    r"thank you for|or visit us|for email updates|originally published|"
    r"reprinted by|all rights|introduction\b)", re.I)
# A permissions or copyright page carries many "X by Y" lines that are not a
# contents list. If one of these appears on the page, it is not the contents.
_NOT_A_TOC_PAGE = re.compile(
    r"(originally published|reprinted by permission|all rights reserved|"
    r"copyright \u00a9|first appeared in|also edited by|praise for)", re.I)
# A series backlist ("Also Edited by ...") is a page of bare titles and reads
# exactly like a contents list. So does a page of review quotes.
_NOT_A_LIST_PAGE = re.compile(r"^\s*also (edited )?by\b|praise for", re.I | re.M)
# Back matter, which otherwise runs on into the last story of the book and
# left every anthology's final entry carrying the contributor biographies.
_END_MATTER = re.compile(
    r"^\s*(about the (author|editor|contributor|translator)s?|"
    r"acknowledge?ments?|honou?rable mentions|also (edited )?by|"
    r"contributor notes|permissions|copyright|index)\b", re.I)
# An opener's title and byline are set in caps at the top of the page.
_CAPS_LINE = re.compile(r"^\s*([A-Z][A-Z' ,:!?.\u2019-]{2,60})\s*$")


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


_PERM = re.compile(
    r"[\u201c\"]([^\u201c\u201d\"\n]{2,70})[\u201d\"]\s+by\s+"
    r"[A-Z][A-Za-z.'\u2019\- ]{2,40}\.?\s*Copyright", re.S)


def _permissions(pages: list[str]) -> tuple[list[str], int]:
    """Story titles off the permissions page, for a book with no contents.

    Several of these conversions drop the contents page entirely. What they
    keep is the acknowledgement of first publication — one entry per story,
    in order, and nothing else quoted that way.
    """
    titles: list[str] = []
    last = -1
    for i, page in enumerate(pages[:40]):
        found = _PERM.findall(page.replace("\n", " "))
        if len(found) >= 3:
            titles += [" ".join(t.split()) for t in found]
            last = i
    return titles, last


def _toc(pages: list[str]) -> list[str]:
    return _contents(pages)[0]


def _contents(pages: list[str]) -> tuple[list[str], int]:
    """Story titles from a table of contents, in order.

    Three forms. An anthology lists `Title—Author` or `"Title" by Author`,
    which is unmistakable. Otherwise the contents is a header and then one
    line per story, either a bare title or `Title Author` run together with
    no separator at all; that is looser, so it is only trusted on a page that
    says it is the contents, and on the pages the list runs onto.

    The unambiguous forms win outright when the book has them. Accumulating
    across the whole front matter is what let a series backlist and a year's
    summation contribute hundreds of phantom titles.
    """
    pairs: list[str] = []
    bare: list[str] = []
    run = 0
    last = -1
    for i, page in enumerate(pages[:40]):
        lines = [l.rstrip() for l in page.splitlines() if l.strip()]
        if not lines or _NOT_A_TOC_PAGE.search(page) or _NOT_A_LIST_PAGE.search(page):
            run = 0
            continue
        found = []
        for l in lines:
            m = _TOC_LINE.match(l) or _TOC_BY.match(l)
            if m:
                found.append(m.group(1).strip().strip("\u201c\u201d\"'"))
        # A contents page is mostly contents. A year's summation names a
        # hundred stories the same way in the middle of its prose, and taking
        # those left the book with a table of contents it never had.
        listing = len(found) >= 4 and len(found) >= len(lines) * 0.5
        # Only once the page has proved itself a contents list is a bare
        # quoted line an entry; in prose it is dialogue, and reading a page of
        # it as the contents swallowed whole books.
        if listing:
            found = []
            for l in lines:
                m = (_TOC_LINE.match(l) or _TOC_BY.match(l)
                     or _TOC_QUOTED.match(l))
                if m:
                    found.append(m.group(1).strip().strip("\u201c\u201d\"'"))
        if listing:
            pairs += found
            last = i
            run = 0
            continue
        # `T C` / `ABLE OF ONTENTS` is how a drop cap survives extraction, so
        # match on the letters rather than on the words.
        # `T C` / `ABLE OF ONTENTS` is how a drop cap survives extraction, so
        # match on the letters rather than on the words. Only the first line
        # counts: "contents" anywhere on the page matched a copyright notice,
        # and the run then chained through the whole front matter.
        head = _norm(lines[0])
        opens = head in ("contents", "tableofcontents", "ableofontents")
        entries = [e for e in (_list_entry(l) for l in lines[1 if opens else 0:]) if e]
        # A long contents runs onto the next page without repeating its
        # header, but only for a page or two. Letting it run further chained
        # through the summation's award lists and read half the front matter
        # as titles.
        if opens and not bare:
            bare, run = entries, 1
            last = i
        elif run and run < 3 and len(entries) >= max(3, len(lines) * 0.6):
            bare += entries
            last = i
            run += 1
        else:
            run = 0

    # Order matters. A page that is mostly `Title—Author` lines is the book's
    # own contents and unmistakable; a page that calls itself the contents is
    # next; the permissions page is the fallback for a conversion that dropped
    # the contents altogether.
    perms: list[str] = []
    if not pairs and not bare:
        perms, at = _permissions(pages)
        if perms:
            last = at

    seen, out = set(), []
    for t in (pairs or bare or perms):
        n = _norm(t)
        if (not n or len(n) <= 2 or n in seen or _NOT_A_TITLE.match(t)
                or "http" in t or "@" in t or ".com" in t):
            continue
        seen.add(n); out.append(t)
    return out, last


def _list_entry(line: str) -> str:
    """One contents line, or "" if it does not read like one."""
    # Dot leaders and a page number: "A HANGING . . . . . . 41".
    l = re.sub(r"[\s.\u00b7\u2026]{4,}\s*\d*\s*$", "", line).strip()
    w = l.split()
    if not (1 <= len(w) <= 12) or l.endswith((",", ";", ":", ".")):
        return ""
    return l


_NAME_WORD = re.compile(
    r"^(?:[A-Z][\w'\u2019.\-]*|and|de|van|von|del|della|da|di|la|le|el|Jr\.?|Sr\.?|I{1,3})$")


def _title_keys(entry: str):
    """(title, author) readings of one contents line.

    A contents page that separates the title from the byline gives one
    reading. One that runs them together — "Nikishi Lucy Taylor" — gives no
    way to know where the title stops, so offer every split whose tail reads
    like a name and let the body decide which one it opens with.
    """
    yield entry, ""
    words = entry.split()
    for k in range(len(words) - 1, 0, -1):
        tail = words[k:]
        head = " ".join(words[:k])
        if len(tail) > 5 or len(head) < 5:
            continue
        if all(_NAME_WORD.match(w) for w in tail):
            yield head, " ".join(tail)


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
    toc, front = _contents(pages)
    keys: dict[str, tuple[int, str, str]] = {}
    for i, entry in enumerate(toc):
        for cand, by in _title_keys(entry):
            keys.setdefault(_norm(cand), (i, cand, by))
    used: set[int] = set()
    sections: list[tuple[str, str, list[str]]] = []

    for i, page in enumerate(pages):
        lines = [l for l in page.splitlines() if l.strip()]
        title = author = ""
        # A story body always follows the contents. Before it, a title line is
        # the book's own half-title or a blurb, and matching there consumes the
        # entry so the real story merges into its predecessor.
        if lines and i > front:
            first = lines[0].strip()
            if keys:
                # Once only. A collection repeats every title in its story
                # notes and again in an index, and each repeat would open a
                # second section for a story already read.
                hit = keys.get(_norm(first))
                if hit and hit[0] not in used:
                    used.add(hit[0])
                    title, author = hit[1], hit[2]
                    if len(lines) > 1 and not author:
                        b = _BYLINE.match(lines[1]) or _CAPS_LINE.match(lines[1])
                        if b:
                            author = b.group(1).strip().title()
            else:
                m = _TITLE_LINE.match(first) or _CAPS_LINE.match(first)
                if m and len(m.group(1).split()) <= 9 and len(lines) > 1:
                    b = _BYLINE.match(lines[1]) or _CAPS_LINE.match(lines[1])
                    if b:
                        title, author = m.group(1).strip(), b.group(1).strip().title()

        if not title and i > front and lines and _END_MATTER.match(lines[0].strip()):
            sections.append(("", "", []))
        if title:
            sections.append((title, author, []))
        if sections:
            sections[-1][2].append(page)
        else:
            sections.append(("", "", [page]))

    return [(t, a, "\n\f\n".join(p)) for t, a, p in sections], bool(toc)


# --- main entry -----------------------------------------------------------


def _drop_title(body: str, title_norm: str, author: str) -> tuple[str, str]:
    """Strip a leading title (and byline) off a block.

    Returns the body and its kind. A block that is nothing but the title is a
    heading, so it never lands inside a harvested passage; a block where the
    title runs straight into the prose keeps the prose and loses the title.
    """
    if not title_norm:
        return body, "prose"
    rest = body
    if rest.lower().startswith(title_norm):
        rest = rest[len(title_norm):].lstrip(" .,\u2014\u2013-\n")
    else:
        return body, "prose"
    for by in (f"by {author}".lower(), author.lower()):
        if author and rest.lower().startswith(by):
            rest = rest[len(by):].lstrip(" .,\u2014\u2013-\n")
            break
    if len(rest.split()) < 8:
        return body, "heading"
    return rest, "prose"

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

    if split_stories:
        sections, from_toc = _split_stories(pages)
    else:
        sections, from_toc = [("", "", "\n\f\n".join(pages))], False
    docs: list[Doc] = []
    for title, sec_author, text in sections:
        text = _reflow(text)
        chunks = [c for c in re.split(r"\n\s*\n", text) if c.strip()]
        prose = [c for c in chunks if not _is_matter(c)]
        # A contents-matched title is proof the section is a story, so it
        # only has to clear a short-short floor. When a contents list drove
        # the split, an untitled section is front or back matter; without one
        # it may be the whole novel, so it stays.
        floor = 250 if title else min_section_words
        if sum(len(c.split()) for c in prose) < floor:
            continue
        if not title and from_toc:
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
            # The story's own title and byline open its first page. Reflow
            # glues them onto the opening paragraph, so strip them off rather
            # than trying to recognise a short title-page block.
            body, kind = _drop_title(body, title_norm, sec_author or author)
            if kind == "prose" and len(body.split()) < 8:
                continue
            doc.blocks.append(Block(body, kind=kind, locator=f"p.{page_no}"))
        if doc.blocks:
            docs.append(doc.finalize())

    # A misread contents page drops every section as front matter and the book
    # disappears. Falling back to one doc keeps the text in the pool.
    if not docs and split_stories:
        return parse(path, source_prefix, False, author, min_section_words)
    return docs
