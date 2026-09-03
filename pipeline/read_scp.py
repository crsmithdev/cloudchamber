"""SCP wikidot source -> Doc.

The files in sources/texts/scp/ are verbatim Wikidot markup with a YAML front matter
block prepended by the scraper. This strips the machinery — includes, modules,
divs, rate widgets, licenseboxes, image blocks, footnote bodies — and keeps the
prose, because the prose is the only thing worth conditioning on.

Footnotes are dropped rather than inlined: they interrupt the sentence rhythm
that makes a passage worth keeping, and a passage that needs its footnote to
parse is not a passage that works stripped of context in front of a generator.
"""

from __future__ import annotations

import re
from pathlib import Path

from .doc import Block, Doc, clean_text

# --- front matter ---------------------------------------------------------

_FRONT = re.compile(r"\A---\n(.*?)\n---\n", re.S)


def _front_matter(raw: str) -> tuple[dict, str]:
    m = _FRONT.match(raw)
    if not m:
        return {}, raw
    meta: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        meta[k.strip()] = v.strip().strip('"')
    return meta, raw[m.end():]


# --- wikidot stripping ----------------------------------------------------

# Footnote bodies: [[footnote]]...[[/footnote]] — remove entirely, including
# the text inside, which is commentary rather than narration.
_FOOTNOTE = re.compile(r"\[\[footnote\]\].*?\[\[/footnote\]\]", re.S | re.I)
# Paired blocks whose BODY is machinery and must go with the tags. Keep this
# list tight: [[div]] and friends legitimately wrap an entire article, so
# deleting their bodies deletes the story. Learned the hard way — an earlier
# version of this took eleven articles to zero words.
# The body must not contain another opener of the same tag. Several of these
# are self-closing in practice — `[[module Rate]]` has no `[[/module]]` — and a
# plain non-greedy `.*?` then runs forward to the NEXT module's closer and
# deletes everything between. That silently removed 1,482 of scp-2316's 1,676
# words, and it had been doing so since the rule was written.
_PAIRED_DROP = re.compile(
    r"\[\[(module|code|iframe|mediahosting|footnoteblock|html)\b[^\]]*\]\]"
    r"(?:(?!\[\[\1\b).)*?"
    r"\[\[/\1\]\]",
    re.S | re.I,
)
# Single-tag machinery with no closing partner.
_BLOCK_MACHINERY = re.compile(
    r"\[\[(module|image|include|iftags|embed)\b[^\]]*\]\]",
    re.S | re.I,
)
# A bare CSS rule that survived anyway — belt and braces, line-scoped so it
# cannot run away across paragraphs.
_CSS_RULE = re.compile(
    r"(?:^|\n)[^\n{}]{0,120}\{[^{}\n]{0,400}?(?:color|margin|padding|font|width|height|"
    r"display|position|opacity|background|border|content|transform|--[a-z-]+)\s*:"
    r"[^{}]{0,400}?\}", re.I,
)
_INLINE_DIRECTIVE = re.compile(r"\[\[/?[^\]\n]{0,400}?\]\]", re.S)
# Multi-line [[include ... ]] blocks with piped parameters.
_INCLUDE = re.compile(r"\[\[include\b.*?\]\]", re.S | re.I)
# HTML comments (the scraper's attribution line, and wikidot [!-- --] comments)
_HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)
_WIKI_COMMENT = re.compile(r"\[!--.*?--\]", re.S)
# Triple-bracket internal links: [[[page|Label]]] or [[[page]]]
_TRIPLE_LINK = re.compile(r"\[\[\[([^\]|]*?)(?:\|([^\]]*?))?\]\]\]")
# Single-bracket external links: [https://... Label]
_EXT_LINK = re.compile(r"\[(https?://\S+)(?:\s+([^\]]*))?\]")
# Horizontal rules and section separators
_RULE = re.compile(r"^\s*(-{4,}|={4,}|~{4,})\s*$", re.M)
# Heading markers: leading '=' (centered) or '+' (h1..h6)
_HEADING = re.compile(r"^\s*(\++|=)\s*(.+?)\s*$")
# Numbered/bulleted list markers at line start
_LIST = re.compile(r"^\s*([#*]+)\s+")
# Bold/italic/underline/strike/teletype
_EMPH = [
    (re.compile(r"\*\*(.+?)\*\*", re.S), r"\1"),
    (re.compile(r"(?<![:/])//(.+?)//", re.S), r"\1"),
    (re.compile(r"__(.+?)__", re.S), r"\1"),
    (re.compile(r"--(?!-)(.+?)--"), r"\1"),
    (re.compile(r"\{\{(.+?)\}\}", re.S), r"\1"),
]
# Wikidot literal spans: @@text@@ renders text verbatim, and the empty @@@@ is
# used as a spacer. Both are markup and neither is prose.
_LITERAL = re.compile(r"@@(.*?)@@", re.S)
# Inline colour: ##red|text## and ##FF0000|text##. Keep the text, drop the hue.
_COLOUR = re.compile(r"##[#0-9a-z]+\|(.*?)##", re.I | re.S)
# A wikidot table row. `||~ h ||~ h||` is a header row, `|| a || b ||` a body
# row. Tables are data, not prose — the block is classified `meta` and never
# reaches the harvester, rather than being flattened into a sentence.
_TABLE_LINE = re.compile(r"^\s*\|\|")
# Heading markers anywhere in a block, not just on its first line: a run of
# consecutive headings collapses into one chunk, and only the first was being
# caught.
_HEADING_LINE = re.compile(r"^\s*(?:\++|=)\s+(?=\S)", re.M)
# Two headings joined onto one line: "... subject to + level 715/5 ...".
_HEADING_INLINE = re.compile(r"\s\+{1,6}\s+(?=[A-Z])")

# Redaction blocks are meaningful — keep them as a marker the scorer can see.
_REDACT = re.compile(r"[█▓▒░]{2,}")

# Trailing licensebox / image-credit region: everything from the first
# "===== " fence that is followed by "**Filename:**" style credit lines.
_LICENSE_TAIL = re.compile(r"\n={4,}\s*\n(?=(?:>\s*\*\*(?:Filename|Name|Author):).*)", re.S)

_CREDIT_LINE = re.compile(
    r"^\s*>?\s*\*?\*?(Filename|Author|License|Source Link|Name|Derivative of|"
    r"Additional Notes)\s*:?\*?\*?", re.I
)
_NAV_LINE = re.compile(r"^\s*<<.*\|.*>>\s*$")
_BARE_URL_LINE = re.compile(r"^\s*https?://\S+\s*$")


def _strip_markup(body: str) -> str:
    body = _HTML_COMMENT.sub("", body)
    body = _WIKI_COMMENT.sub("", body)
    body = _FOOTNOTE.sub("", body)
    body = _INCLUDE.sub("", body)
    body = _PAIRED_DROP.sub("", body)
    body = _BLOCK_MACHINERY.sub("", body)
    for _ in range(3):
        body, k = _CSS_RULE.subn("", body)
        if not k:
            break
    # Links must resolve BEFORE the generic directive sweep: [[[a|b]]] starts
    # with [[ and the sweep will eat the head of it, stranding a bracket in
    # the middle of a sentence.
    # Prefer the label verbatim. Only the page slug gets its hyphens turned
    # back into spaces — a label like "Site-81" must keep its hyphen.
    body = _TRIPLE_LINK.sub(
        lambda m: m.group(2) if m.group(2) else m.group(1).replace("-", " "), body
    )
    body = _EXT_LINK.sub(lambda m: m.group(2) or "", body)
    body = _INLINE_DIRECTIVE.sub("", body)
    # Any bracket left over is a strip artifact, not content.
    body = re.sub(r"(?<!\w)\]{1,3}|\[{1,3}(?!\w)", "", body)
    # Literal and colour spans unwrap to their contents, before the emphasis
    # pass so that **##red|x##** reduces cleanly.
    for _ in range(3):
        body, k = _LITERAL.subn(lambda m: m.group(1), body)
        if not k:
            break
    body = _COLOUR.sub(lambda m: m.group(1), body)
    for pat, rep in _EMPH:
        body = pat.sub(rep, body)
    # Unmatched emphasis: `marked on a map provided to us **.` — the opener
    # never closed, so the paired rules above could not reach it.
    body = re.sub(r"(?<!\*)\*\*(?!\*)", "", body)
    body = re.sub(r"(?<![:/])//(?=[\s.,;)])", "", body)
    body = _REDACT.sub("[REDACTED]", body)
    return body


def _is_chrome(line: str) -> bool:
    """Lines that are page furniture rather than text."""
    s = line.strip()
    if not s:
        return False
    if _CREDIT_LINE.match(s) or _NAV_LINE.match(s) or _BARE_URL_LINE.match(s):
        return True
    if s.lower().startswith("image credits are from here"):
        return True
    if re.fullmatch(r"[-=~_|>< ]+", s):
        return True
    return False


def parse(path: str | Path, source_prefix: str = "scp") -> Doc:
    path = Path(path)
    raw = path.read_text(encoding="utf-8", errors="replace")
    meta, body = _front_matter(raw)

    # Drop the image-credit / licensebox tail before anything else.
    cut = _LICENSE_TAIL.search(body)
    if cut:
        body = body[: cut.start()]

    body = _strip_markup(body)
    body = _RULE.sub("", body)

    doc = Doc(
        source_id=f"{source_prefix}/{path.stem}",
        title=meta.get("title", path.stem),
        author=meta.get("author", ""),
        license=meta.get("license", ""),
        origin=meta.get("source", str(path)),
        kind="document",
        meta={k: v for k, v in meta.items() if k not in {"title", "author", "license", "source"}},
    )

    for chunk in re.split(r"\n\s*\n", body):
        lines = [ln for ln in chunk.splitlines() if not _is_chrome(ln)]
        if not lines:
            continue

        quote = all(ln.lstrip().startswith(">") or not ln.strip() for ln in lines)
        lines = [re.sub(r"^\s*>\s?", "", ln) for ln in lines]

        joined = clean_text("\n".join(lines))
        if not joined:
            continue

        # A table is data. Classified as meta so `Doc.prose()` skips it —
        # flattening `||1200 hrs EST||2/22/2019||` into a paragraph produced
        # passages that were rows of a dilation log.
        if any(_TABLE_LINE.match(ln) for ln in lines):
            kept = [ln for ln in lines if not _TABLE_LINE.match(ln)]
            if kept:
                doc.blocks.append(Block(clean_text("\n".join(kept)), kind="prose"))
            doc.blocks.append(Block("", kind="meta"))
            continue

        first = lines[0].strip()
        hm = _HEADING.match(first)
        if hm and len(lines) == 1:
            doc.blocks.append(Block(clean_text(hm.group(2)), kind="heading"))
            continue
        # Several headings in a row land in one chunk. Strip the markers and
        # treat the whole run as headings rather than as a paragraph.
        if all(_HEADING.match(ln.strip()) for ln in lines):
            for ln in lines:
                doc.blocks.append(
                    Block(clean_text(_HEADING_LINE.sub("", ln)), kind="heading"))
            continue

        if _LIST.match(first):
            joined = "\n".join(_LIST.sub("", ln) for ln in lines)
            doc.blocks.append(Block(clean_text(joined), kind="list"))
            continue

        # A heading can open a block whose remaining lines are prose, and a
        # heading marker can appear mid-line where two headings were joined.
        # Neither reaches the block-level rules above.
        joined = _HEADING_LINE.sub("", joined)
        joined = _HEADING_INLINE.sub(" ", joined)

        kind = "quote" if quote else "prose"
        # Collapse intra-paragraph newlines: wikidot paragraphs are single
        # logical units even when hard-wrapped.
        joined = re.sub(r"\n+", " ", joined) if kind == "prose" else joined
        doc.blocks.append(Block(clean_text(joined), kind=kind))

    return doc.finalize()


def parse_dir(directory: str | Path, source_prefix: str = "scp") -> list[Doc]:
    directory = Path(directory)
    docs = []
    for p in sorted(directory.glob("*.md")):
        if p.name.upper() in {"README.MD", "CLAUDE.MD"}:
            continue
        try:
            docs.append(parse(p, source_prefix))
        except Exception as e:  # a bad file should not kill a corpus run
            print(f"  ! {p.name}: {e}")
    return docs
