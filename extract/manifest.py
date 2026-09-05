"""sources/manifest.toml -> Source records."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Source:
    id: str
    path: str                      # file or glob, relative to the repo root
    reader: str                    # pdf | scp
    genre: str
    author: str = ""
    license: str = ""
    dev: bool = False
    dev_only: list[str] = field(default_factory=list)   # file stems, for a glob source
    stories: list[dict] = field(default_factory=list)   # [{title, page}] override

    def files(self, root: Path, dev_only: bool = False) -> list[Path]:
        paths = sorted(root.glob(self.path)) if any(c in self.path for c in "*?[") else [root / self.path]
        if dev_only and self.dev_only:
            keep = set(self.dev_only)
            paths = [p for p in paths if p.stem in keep]
        return paths


READERS = ("pdf", "scp")


def load(root: Path) -> list[Source]:
    data = tomllib.loads((root / "sources" / "manifest.toml").read_text(encoding="utf-8"))
    out = []
    for sid, t in data.get("source", {}).items():
        if t.get("reader") not in READERS:
            raise SystemExit(f"manifest: source {sid!r} names reader {t.get('reader')!r}; known readers: {', '.join(READERS)}")
        out.append(Source(id=sid, **t))
    return out


def select(sources: list[Source], only: list[str] | None) -> list[Source]:
    """`only` names source ids; with none given, the dev subset."""
    if only:
        by = {s.id: s for s in sources}
        missing = [o for o in only if o not in by]
        if missing:
            raise SystemExit(f"manifest: unknown source id(s): {', '.join(missing)}")
        return [by[o] for o in only]
    return [s for s in sources if s.dev]
