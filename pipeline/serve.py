"""`pipeline serve` — the cull, in a browser, on localhost.

The terminal reviewer works and is staying. This exists because the thing under
judgement is *prose register*, and register cannot be judged fairly in a 15px
monospace column: the passage has to be set as prose, at a reading measure, in
a face built for running text. That is not decoration, it is the difference
between reading a passage and scanning it.

Three modes, in the order they should be run — the funnel:

  ledger   404 themes, 20 to a screen, keep by number. One sitting.
  deck     947 passages, first 40 words, expandable. Two hours. A filter.
  bench    the survivors, full text and all six dimensions. The actual read.

A fourth mode, forced choice over five at a time, is designed but not built:
it answers "which of these is better" rather than "is this good", and it is
worth having only once there are verdicts to check its rankings against.

Every verdict goes through `Bank.record`, so it lands in the same append-only
`decisions.jsonl` as a terminal verdict and carries a `method` saying which
mode produced it. Nothing here can rewrite or prune that file.

Standard library only. No build step, no framework, no network access: the
page is one file served from disk, and the only origin it talks to is this
process. Binding is loopback-only and there is no authentication, because
there is no non-local listener to authenticate.
"""

from __future__ import annotations

import json
import mimetypes
import socket
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import biber
from .bank import THEME_DECISIONS, THEMES, Bank

UI = Path(__file__).parent / "ui"
MODES = ("ledger", "deck", "bench")
# Page size for the passage queues. The pool is a couple of megabytes of prose
# in full; a screenful at a time keeps the first paint immediate.
PAGE = 120


def _passage(row: dict) -> dict:
    """Trim a bank row down to what the page actually renders."""
    facets = row.get("facets") or {}
    out = {
        "id": row["id"],
        "title": row.get("title", "?"),
        "author": row.get("author", ""),
        "source": row.get("source_id", ""),
        "words": row.get("words", 0),
        "score": row.get("score", 0.0),
        "withheld": bool(row.get("withheld")),
        "facets": {biber.LABELS[d][0]: facets.get(biber.LABELS[d][0], "")
                   for d in biber.ALL_DIMENSIONS if biber.LABELS[d][0] in facets},
        "dims": {d: facets[d] for d in biber.ALL_DIMENSIONS if d in facets},
        "cell": biber.cell(facets),
    }
    # Always the whole text, even in deck mode, which shows 40 words of it:
    # expanding has to be free, and that means it cannot be a round trip.
    out["text"] = row.get("text", "")
    return out


def _theme(row: dict) -> dict:
    return {
        "id": row["id"],
        "text": row.get("text", ""),
        # Drafted themes carry a note saying what they abstract; the mined
        # rows they replaced carried a label. Either can sit in the same slot.
        "label": row.get("note") or row.get("label", ""),
        "source": row.get("source_id", ""),
        "title": row.get("title", ""),
        "score": row.get("score", 0.0),
    }


class Cull:
    """Everything the handler needs, so the handler stays a thin adapter."""

    def __init__(self, out_dir: Path):
        self.out = out_dir
        self.lock = threading.Lock()

    def passages(self) -> Bank:
        return Bank(self.out)

    def themes(self) -> Bank:
        return Bank(self.out, pool=THEMES, decisions=THEME_DECISIONS)

    def queue(self, mode: str, order: str = "score", limit: int = PAGE) -> dict:
        if mode == "ledger":
            bank = self.themes()
            items = [_theme(t) for t in bank.unlabelled()]
            items.sort(key=lambda t: -t["score"])
            total = len(items)
            return {"mode": mode, "total": total, "items": items[:limit]}

        bank = self.passages()
        rows = bank.unlabelled() if mode == "deck" else bank.survivors()
        items = [_passage(r) for r in rows]
        if order == "cluster":
            rank = {c: i for i, c in enumerate(biber.CELLS)}
            items.sort(key=lambda p: (rank.get(p["cell"], 99), -p["score"]))
        elif order in biber.ALL_DIMENSIONS:
            items.sort(key=lambda p: p["dims"].get(order, 0.0))
        else:
            items.sort(key=lambda p: -p["score"])
        return {"mode": mode, "total": len(items), "items": items[:limit]}

    def record(self, rows: list[dict]) -> dict:
        """Append verdicts. One lock, because two tabs is a normal accident."""
        if not rows:
            return {"written": 0}
        with self.lock:
            written = 0
            for r in rows:
                verdict = r.get("verdict")
                if verdict not in ("keep", "pass", "maybe"):
                    raise ValueError(f"bad verdict {verdict!r}")
                bank = self.themes() if r.get("bank") == "themes" else self.passages()
                extra = {k: v for k, v in (r.get("extra") or {}).items()
                         if isinstance(k, str)}
                bank.record(r["id"], verdict, note=(r.get("note") or "").strip(),
                            method=r.get("method") or "manual", extra=extra or None)
                written += 1
        return {"written": written}

    def stats(self, target: int = 8) -> dict:
        p = self.passages().stats(target_per_cell=target)
        t = self.themes().stats()
        return {
            "passages": {k: p[k] for k in
                         ("pool", "keep", "pass", "maybe", "unlabelled", "keep_rate")},
            "cells_short": p.get("cells_short", {}),
            "kept_by_facet": p.get("kept_by_facet", {}),
            "survivors": len(self.passages().survivors()),
            "themes": {k: t[k] for k in
                       ("pool", "keep", "pass", "maybe", "unlabelled")},
            "backend": biber.BACKEND,
        }


class Handler(BaseHTTPRequestHandler):
    cull: Cull = None  # set by serve()
    server_version = "fogbelt-cull"

    def log_message(self, fmt, *args):  # quieter than the default
        if not self.path.startswith("/api/"):
            return
        print(f"  {self.command} {self.path}")

    # --- helpers ---

    def _json(self, obj, code: int = 200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _file(self, name: str):
        # Serve only the files shipped in pipeline/ui, by exact name. No path
        # arithmetic reaches the filesystem.
        path = UI / name
        if name not in {p.name for p in UI.iterdir() if p.is_file()} or not path.exists():
            return self._json({"error": "not found"}, 404)
        body = path.read_bytes()
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", f"{ctype}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    # --- routes ---

    def do_GET(self):
        url = urlparse(self.path)
        q = parse_qs(url.query)
        if url.path in ("/", "/index.html"):
            return self._file("app.html")
        if url.path == "/api/queue":
            mode = (q.get("mode") or ["deck"])[0]
            if mode not in MODES:
                return self._json({"error": f"mode must be one of {MODES}"}, 400)
            try:
                limit = max(1, min(1000, int((q.get("limit") or [PAGE])[0])))
            except ValueError:
                limit = PAGE
            order = (q.get("order") or ["score"])[0]
            return self._json(self.cull.queue(mode, order=order, limit=limit))
        if url.path == "/api/stats":
            return self._json(self.cull.stats())
        if url.path.startswith("/ui/"):
            return self._file(url.path[4:])
        return self._json({"error": "not found"}, 404)

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/api/verdict":
            return self._json({"error": "not found"}, 404)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > 1_000_000:
                return self._json({"error": "payload too large"}, 413)
            payload = json.loads(self.rfile.read(n) or b"{}")
        except (ValueError, json.JSONDecodeError) as e:
            return self._json({"error": f"bad json: {e}"}, 400)
        rows = payload if isinstance(payload, list) else [payload]
        try:
            result = self.cull.record(rows)
        except (ValueError, KeyError) as e:
            return self._json({"error": str(e)}, 400)
        result["stats"] = self.cull.stats()
        return self._json(result)


def _free_port(start: int) -> int:
    for port in range(start, start + 40):
        with socket.socket() as s:
            # Match what the server itself will do. HTTPServer sets
            # allow_reuse_address, so without this the probe rejects a port
            # left in TIME_WAIT by the previous run and walks to the next one
            # — the URL moves every restart for no reason.
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise SystemExit(f"no free port in {start}-{start + 40}")


def serve(root: str | Path = ".", out: str | Path | None = None,
          port: int = 3002, open_browser: bool = True) -> None:
    out_dir = Path(out or Path(root) / "extracted")
    cull = Cull(out_dir)

    pool = cull.passages().load()
    if not pool:
        raise SystemExit(f"{out_dir} has no pool. Run `pipeline harvest` first.")
    if not any(p.get("facets") for p in pool.values()):
        print("  ! no facets in the pool. Run `pipeline facets` — the bench "
              "mode has nothing to show without them.")

    port = _free_port(port)
    Handler.cull = cull
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}/"

    s = cull.stats()
    print(f"cull server on {url}   (backend: {s['backend']})")
    print(f"  themes    {s['themes']['unlabelled']} unlabelled  of {s['themes']['pool']}")
    print(f"  passages  {s['passages']['unlabelled']} unlabelled  of {s['passages']['pool']}")
    print(f"  survivors {s['survivors']} waiting on the bench")
    print(f"  writing to {out_dir / 'decisions.jsonl'} — append only")
    print("  ctrl-c to stop")
    if open_browser:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped.")
    finally:
        httpd.server_close()
