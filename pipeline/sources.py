"""What to read, and what to take from it.

A source declares which of the two extractions it feeds. Not every source
feeds both: the academic literature yields themes and no passages (nobody
wants a verbatim paragraph of a psychology paper conditioning the prose), and
a setting like setting-c yields themes from online reference material
rather than from source fiction at all.

A setting is a different kind of thing: what a premise is seeded *under*. It
names a lore file (`lore/<id>.md`, nine fixed sections) that constrains the
seed, and the theme sources the seed is drawn from. Exactly one setting is the
default. The exemplar bank is register and does not vary by setting.

Config lives in `sources.toml` next to the repo root. The defaults below match
the current `sources/` layout and are used when no config file is present.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # py < 3.11
    try:
        import tomli as tomllib  # pip install tomli
    except ModuleNotFoundError:
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


@dataclass
class Setting:
    id: str
    lore: str  # path to the lore file, relative to repo root
    themes: list[str] = field(default_factory=list)  # source ids the seed draws from
    default: bool = False


DEFAULTS: list[Source] = [
    Source(
        id="scp",
        path="sources/texts/scp/*.md",
        reader="scp",
        passages=True,
        themes=True,
        kind="document",
        license="CC BY-SA 3.0",
        notes="Verbatim wikidot source. Attribution required on anything published.",
    ),
    Source(
        id="datlow",
        path="sources/texts/books/Ellen Datlow*.pdf",
        reader="pdf",
        passages=True,
        themes=True,
        kind="fiction",
        notes="Anthologies. Story splitting is best-effort; check attribution before quoting.",
    ),
    Source(
        id="evenson",
        path="sources/texts/books/Brian Evenson*.pdf",
        reader="pdf",
        author="Brian Evenson",
        kind="fiction",
    ),
    Source(
        id="langan",
        path="sources/texts/books/John Langan*.pdf",
        reader="pdf",
        author="John Langan",
        kind="fiction",
    ),
    Source(
        id="watts",
        path="sources/texts/books/Peter Watts*.pdf",
        reader="pdf",
        author="Peter Watts",
        kind="fiction",
        license="CC BY-NC-SA",
    ),
    Source(
        id="chiang",
        path="sources/texts/books/Ted Chiang*.pdf",
        reader="pdf",
        author="Ted Chiang",
        kind="fiction",
    ),
    Source(
        id="king",
        path="sources/texts/books/Stephen King*.pdf",
        reader="pdf",
        author="Stephen King",
        kind="fiction",
    ),
    Source(
        id="literature",
        path="research/literature.md",
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

SETTING_DEFAULTS: list[Setting] = [
    Setting(
        id="setting-a",
        lore="lore/setting-a.md",
        themes=["scp", "datlow", "evenson", "langan", "watts", "chiang", "king",
                "literature"],
        default=True,
    ),
    Setting(id="setting-b", lore="lore/setting-b.md",
            themes=["setting-b"]),
    Setting(id="setting-c", lore="lore/setting-c.md",
            themes=["setting-c"]),
]


def _config(root: Path) -> dict | None:
    cfg = root / "sources.toml"
    if not cfg.exists():
        return None
    if tomllib is None:
        # Silently falling back to DEFAULTS here means edits to sources.toml
        # do nothing and nobody finds out for hours. Say so.
        print(
            "  ! sources.toml is being IGNORED: no TOML parser on this Python "
            f"({sys.version_info.major}.{sys.version_info.minor}). "
            "Use Python 3.11+, or `pip install tomli`. Built-in defaults in use."
        )
        return None
    return tomllib.loads(cfg.read_text(encoding="utf-8"))


def load(root: str | Path = ".") -> list[Source]:
    data = _config(Path(root))
    if data is None:
        return list(DEFAULTS)
    out = [Source(id=sid, **body) for sid, body in data.get("source", {}).items()]
    return out or list(DEFAULTS)


def load_settings(root: str | Path = ".") -> list[Setting]:
    data = _config(Path(root))
    out = list(SETTING_DEFAULTS)
    if data is not None and data.get("setting"):
        out = [Setting(id=sid, **body) for sid, body in data["setting"].items()]
    defaults = [s.id for s in out if s.default]
    if len(defaults) != 1:
        raise SystemExit(
            "sources.toml: exactly one [setting.*] must carry `default = true`; "
            f"found {defaults or 'none'}"
        )
    return out


def setting(setting_id: str | None, root: str | Path = ".") -> Setting:
    """The setting a draw runs under: the id given, else the default.

    There is always one. An unknown id is an error that names the valid ones,
    because the alternative — quietly drawing under the default — would seed
    a setting-a premise in a call that thought it was constrained.
    """
    all_ = load_settings(root)
    if setting_id is None:
        return next(s for s in all_ if s.default)
    for s in all_:
        if s.id == setting_id:
            return s
    raise SystemExit(
        f"unknown setting {setting_id!r}; sources.toml declares: "
        + ", ".join(s.id for s in all_)
    )


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
    # A README inside a corpus directory documents the corpus; it is never
    # source. `sources/texts/scp/*.md` was matching one, and it reached the
    # pool as a passage.
    return sorted(f for f in (root / parent).glob(pattern)
                  if f.stem.lower() != "readme")
