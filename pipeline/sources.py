"""What to read, and what to take from it.

A source declares which of the two extractions it feeds. Not every source
feeds both: the academic literature yields themes and no passages (nobody
wants a verbatim paragraph of a psychology paper conditioning the prose), and
a setting like setting-c yields themes from online reference material
rather than from source fiction at all.

Config lives in `sources.toml` next to the repo root. The defaults below match
the current `refs/` layout and are used when no config file is present.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # py<3.11
    tomllib = None


@dataclass
class Source:
    id: str
    path: str = ""  # glob, relative to repo root
    reader: str = "pdf"  # pdf | scp | markdown | research
    passages: bool = True  # feed the exemplar bank
    themes: bool = True  # feed the theme bank
    author: str = ""
    kind: str = "fiction"  # fiction | document | criticism | reference | setting
    license: str = ""
    notes: str = ""
    # For reader = "research": where a session should look. No code fetches
    # these; `pipeline themes --research <id>` emits a brief instead.
    research: list[str] = field(default_factory=list)


DEFAULTS: list[Source] = [
    Source(
        id="scp",
        path="refs/scp/*.md",
        reader="scp",
        passages=True,
        themes=True,
        kind="document",
        license="CC BY-SA 3.0",
        notes="Verbatim wikidot source. Attribution required on anything published.",
    ),
    Source(
        id="datlow",
        path="refs/Ellen Datlow*.pdf",
        reader="pdf",
        passages=True,
        themes=True,
        kind="fiction",
        notes="Anthologies. Story splitting is best-effort; check attribution before quoting.",
    ),
    Source(
        id="evenson",
        path="refs/Brian Evenson*.pdf",
        reader="pdf",
        author="Brian Evenson",
        kind="fiction",
    ),
    Source(
        id="langan",
        path="refs/John Langan*.pdf",
        reader="pdf",
        author="John Langan",
        kind="fiction",
    ),
    Source(
        id="watts",
        path="refs/Peter Watts*.pdf",
        reader="pdf",
        author="Peter Watts",
        kind="fiction",
        license="CC BY-NC-SA",
    ),
    Source(
        id="chiang",
        path="refs/Ted Chiang*.pdf",
        reader="pdf",
        author="Ted Chiang",
        kind="fiction",
    ),
    Source(
        id="king",
        path="refs/Stephen King*.pdf",
        reader="pdf",
        author="Stephen King",
        kind="fiction",
    ),
    Source(
        id="literature",
        path="evals/LITERATURE.md",
        reader="markdown",
        passages=False,  # criticism conditions for criticism
        themes=True,
        kind="criticism",
        notes="Academic studies on what makes horror land. Themes only, never passages.",
    ),
    Source(
        id="setting-c",
        reader="research",
        passages=False,
        themes=True,
        kind="setting",
        notes="Source fiction is far too large to hold. Themes come from reference material.",
        research=[
            "faction cosmology and the theology of the Imperium",
            "attitudes to the body, augmetics, and sanctioned mutilation",
            "bureaucratic horror: the Administratum, tithes, records",
            "how sacrifice is normalized at population scale",
        ],
    ),
    Source(
        id="setting-b",
        reader="research",
        passages=False,
        themes=True,
        kind="setting",
        notes="Same reasoning as setting-c. Reference material, not source fiction.",
        research=[
            "the theological premise and what the breach actually did",
            "faction doctrine and how each justifies itself",
            "the material culture of the war: relics, prosthetics, weapons",
            "what counts as damnation, and who is exempt",
        ],
    ),
]


def load(root: str | Path = ".") -> list[Source]:
    root = Path(root)
    cfg = root / "sources.toml"
    if not cfg.exists() or tomllib is None:
        return list(DEFAULTS)
    data = tomllib.loads(cfg.read_text(encoding="utf-8"))
    out = []
    for sid, body in data.get("source", {}).items():
        out.append(Source(id=sid, **body))
    return out or list(DEFAULTS)


def resolve(src: Source, root: str | Path = ".") -> list[Path]:
    """Files this source points at, in sorted order."""
    if not src.path:
        return []
    root = Path(root)
    # Path may be a glob or a literal file.
    direct = root / src.path
    if direct.exists() and direct.is_file():
        return [direct]
    parent = Path(src.path).parent
    pattern = Path(src.path).name
    return sorted((root / parent).glob(pattern))
