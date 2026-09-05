"""PDF -> stories.

Reading (salvaged from the pre-reset pipeline, where each rule cost a found
bug): page text via pdftotext when present else pdfplumber, drop-cap rejoin,
running-line and page-number stripping, de-hyphenation and paragraph reflow,
front/back-matter detection.

Splitting (new): the PDF's embedded outline first; page-level cues when
there is no outline; a manifest `stories` list overrides both.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from collections import Counter
from dataclasses import dataclass
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


_CAPS_RUN = re.compile(r"^[A-Z](?: [A-Z])*$")


def _rejoin_dropcaps(page: str) -> str:
    """Put decorative initials back on the words they were cut from.

    A drop cap is its own text run, so the opening letter of a story arrives
    on a line by itself and the rest of the word follows on the next one:
    `S` then `easick and shivering`. A title set with several of them gives
    `J O O W` over `ust utside ur indows`, which is where 95 stories got
    their titles from.
    """
    lines = page.split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        head = lines[i].strip()
        tail = lines[i + 1].strip() if i + 1 < len(lines) else ""
        merged = _merge_dropcaps(head, tail) if head and tail else ""
        if merged:
            out.append(merged)
            i += 2
            continue
        out.append(lines[i])
        i += 1
    return "\n".join(out)


# A title keeps its small words whole while its neighbours lose their initial,
# so the count of capitals falls short of the count of words by exactly the
# number of whole ones. Ordered by how readily a title leaves one unadorned.
_WHOLE = ("THE", "OF", "AND", "A", "AN", "TO", "FOR", "IN", "ON", "AT",
          "WITH", "FROM", "BY", "OR", "AS", "IS", "IT")


def _merge_dropcaps(head: str, tail: str) -> str:
    """`A R S` over `T THE IDING CHOOL` is `AT THE RIDING SCHOOL`."""
    if not _CAPS_RUN.match(head):
        return ""
    caps = head.split()
    words = tail.split()
    if not words or len(caps) > len(words):
        return ""
    # One initial and a word that carries on in lower case: `S` / `easick`.
    if len(caps) == 1 and tail[0].islower():
        return caps[0] + tail
    skips = len(words) - len(caps)
    if skips:
        # Some words kept their own first letter. Guessing which by looking
        # for whole words fails on a fragment that happens to spell one — the
        # `AS` of `WAS` — so only the readiest candidates are spent.
        bare = lambda w: w.strip(".,:;!?'\u2019\u201c\u201d\"").upper()
        ranked = sorted(
            (i for i, w in enumerate(words) if bare(w) in _WHOLE),
            key=lambda i: (_WHOLE.index(bare(words[i])), i))
        if len(ranked) < skips:
            return ""
        held = set(ranked[:skips])
    else:
        held = set()
    out, it = [], iter(caps)
    for i, w in enumerate(words):
        out.append(w if i in held else next(it) + w)
    return " ".join(out)


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

# --- splitting ------------------------------------------------------------

@dataclass
class Section:
    title: str
    author: str
    start: int          # first page index, inclusive
    end: int            # last page index, exclusive
    method: str         # outline | cues | manifest | single


# Outline entries and cue lines that are not stories.
_NOT_A_STORY = re.compile(
    r"^\s*(the best (of|horror)|introduction|contents|table of contents|publishing details|"
    r"title page|copyright|dedication|epigraph|acknowledge?ments?|acknowledgment of copyright|"
    r"about the (authors?|editor|translator)|also by|other books by|also edited by|permissions?|"
    r"praise for|cover|index|story notes|notes on the|afterword|foreword|preface|"
    r"a note on the type|colophon|newsletter|sign up|begin reading|half.?title|frontispiece)\b",
    re.I)
_EM = re.compile(r"\s*[—–]\s*")


def outline_entries(path: Path) -> list[tuple[str, int]]:
    """(title, page index) for every level-1 outline entry, in document order."""
    from pdfminer.pdfdocument import PDFDocument, PDFNoOutlines
    from pdfminer.pdfpage import PDFPage
    from pdfminer.pdfparser import PDFParser
    from pdfminer.pdftypes import resolve1

    out: list[tuple[str, int]] = []
    with open(path, "rb") as f:
        doc = PDFDocument(PDFParser(f))
        try:
            outlines = list(doc.get_outlines())
        except PDFNoOutlines:
            return []
        pageids = {pg.pageid: i for i, pg in enumerate(PDFPage.create_pages(doc))}
        for level, title, dest, action, _se in outlines:
            if level != 1:
                continue
            d = dest
            if d is None and action is not None:
                a = resolve1(action)
                d = a.get("D") if isinstance(a, dict) else None
            if isinstance(d, (str, bytes)):
                try:
                    d = doc.get_dest(d)
                except Exception:
                    d = None
            d = resolve1(d)
            if isinstance(d, dict):
                d = d.get("D")
            ref = d[0] if isinstance(d, list) and d else None
            page = pageids.get(getattr(ref, "objid", None))
            if page is not None:
                out.append((str(title).strip(), page))
    return out


def split_by_outline(entries: list[tuple[str, int]], n_pages: int, author: str) -> list[Section]:
    entries = sorted(entries, key=lambda e: e[1])
    secs: list[Section] = []
    for i, (title, page) in enumerate(entries):
        end = entries[i + 1][1] if i + 1 < len(entries) else n_pages
        if _NOT_A_STORY.match(title):
            continue
        t, a = title, author
        if not author and _EM.search(title):
            t, a = _EM.split(title, 1)
        secs.append(Section(t.strip(), a.strip(), page, end, "outline"))
    return secs


def _first_line(page: str) -> str:
    for l in page.splitlines():
        if l.strip():
            return l.strip()
    return ""


def _norm(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", s.upper())


def contents_titles(pages: list[str]) -> list[str]:
    """Titles off a printed contents page, if one exists. Page numbers are
    ignored: OCR mangles them. Used to confirm cue lines, never as the sole
    source of boundaries."""
    for p in pages[:40]:
        if re.match(r"\s*(table of )?contents\b", p.strip(), re.I):
            titles = []
            for l in p.splitlines()[1:]:
                l = l.strip()
                if not l or _NOT_A_STORY.match(l):
                    continue
                t = re.sub(r"[\s.·_]{2,}.*$", "", l)          # dotted leaders and whatever follows
                t = re.sub(r"\s+\S{0,4}$", "", t) if re.search(r"\d|[SO]{1,3}$", t.split()[-1]) and len(t.split()) > 1 else t
                if 2 <= len(t) <= 70:
                    titles.append(t)
            return titles
    return []


def split_by_cues(pages: list[str], author: str, running: set[str]) -> list[Section]:
    """A body page whose first line is short, all-caps and not furniture starts
    a story. With a contents page, only lines matching one of its titles count,
    which drops part headings like TWO or THREE."""
    titles = contents_titles(pages)
    keys = {_norm(t) for t in titles}
    body_from = 0
    for i, p in enumerate(pages[:40]):
        if re.match(r"\s*(table of )?contents\b", p.strip(), re.I):
            body_from = i + 1
    starts: list[tuple[int, str]] = []
    for i, p in enumerate(pages):
        if i < body_from:
            continue
        fl = _first_line(p)
        if not fl or len(fl) >= 40 or not fl.isupper() or not re.search(r"[A-Z]{2}", fl):
            continue
        if re.sub(r"\d+", "#", fl).lower() in running or _NOT_A_STORY.match(fl):
            continue
        if keys and _norm(fl) not in keys:
            continue
        starts.append((i, fl))
    end = len(pages)
    for i, p in enumerate(pages):
        if i > (starts[0][0] if starts else 0) and _NOT_A_STORY.match(_first_line(p)) and re.match(r"about the author|acknowledg", _first_line(p), re.I):
            end = i
            break
    secs = []
    for n, (i, t) in enumerate(starts):
        j = starts[n + 1][0] if n + 1 < len(starts) else end
        secs.append(Section(t.title().replace("'S ", "'s "), author, i, j, "cues"))
    return secs


def split_by_manifest(stories: list[dict], n_pages: int, author: str) -> list[Section]:
    st = sorted(stories, key=lambda s: s["page"])
    return [Section(s["title"], s.get("author", author), s["page"] - 1,
                    (st[i + 1]["page"] - 1) if i + 1 < len(st) else n_pages, "manifest")
            for i, s in enumerate(st)]


# --- main entry -----------------------------------------------------------

def _blocks(text: str, title: str, author: str, page0: int) -> list[Block]:
    out = []
    title_norm = title.strip().lower()
    page_no = page0 + 1
    for c in re.split(r"\n\s*\n", text):
        if not c.strip():
            continue
        page_no += c.count("\f")
        body = clean_text(c.replace("\f", " "))
        if _is_matter(body):
            continue
        # The story's own title and byline open its first page; reflow glues
        # them onto the opening paragraph.
        low = body.lower()
        if title_norm and low.startswith(title_norm):
            body = body[len(title):].lstrip(" .,\u2014\u2013-\n")
            for by in (f"by {author}".lower(), author.lower()):
                if author and body.lower().startswith(by):
                    body = body[len(by):].lstrip(" .,\u2014\u2013-\n")
                    break
        if len(body.split()) < 8:
            continue
        out.append(Block(body, kind="prose", locator=f"p.{page_no}"))
    return out


def read(path: str | Path, source_id: str, author: str = "", genre: str = "",
         manifest_stories: list[dict] | None = None) -> list[Doc]:
    """One Doc per story."""
    path = Path(path)
    raw = raw_pages(path)
    running = _running_lines(raw)
    pages = [_rejoin_dropcaps(_strip_furniture(p, running)) for p in raw]

    if manifest_stories:
        secs = split_by_manifest(manifest_stories, len(pages), author)
    else:
        entries = outline_entries(path)
        secs = split_by_outline(entries, len(pages), author) if entries else []
        if not secs:
            secs = split_by_cues(pages, author, running)
    if not secs:
        secs = [Section(path.stem.split(" - ", 1)[-1], author, 0, len(pages), "single")]

    docs: list[Doc] = []
    for ord_, s in enumerate(secs):
        text = _reflow("\n\f\n".join(pages[s.start:s.end]))
        blocks = _blocks(text, s.title, s.author, s.start)
        if sum(b.words for b in blocks) < 250:
            continue
        doc = Doc(source_id=f"{source_id}/{slugify(s.title)}", title=s.title, author=s.author,
                  origin=str(path), kind="fiction",
                  meta={"pages": f"{s.start + 1}-{s.end}", "split_by": s.method, "ord": ord_, "genre": genre})
        doc.blocks = blocks
        docs.append(doc.finalize())
    return docs
