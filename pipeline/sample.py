"""Draw a generation packet: some themes as a seed, some exemplars as register.

This is the step that runs when Chris says "come up with an idea". It is
deliberately dumb right now — mostly random over the kept set, because there
is not yet enough decision history to steer with, and a clever sampler built
on no data is just a bias with extra steps.

Two knobs exist so steering is possible later without a rewrite:

  --coverage     spread the draw across failure tags rather than sampling flat,
                 so a packet is not six passages all doing the same thing
  --temperature  0 = strictly highest-scoring, 1 = uniform over eligible

Every packet is written to `extracted/packets/` with the ids it drew. When a
premise from a packet turns out well, the packet says exactly what conditioned
it — which is the only way the sampler ever gets to stop being random.
"""

from __future__ import annotations

import json
import random
import time
from pathlib import Path

from .bank import THEME_DECISIONS, THEMES, Bank, _now


def _weighted(pool: list[dict], k: int, temperature: float, rng: random.Random) -> list[dict]:
    if k >= len(pool):
        return list(pool)
    if temperature >= 1.0:
        return rng.sample(pool, k)
    # Softmax-ish over score, sharpened as temperature falls.
    t = max(0.05, temperature)
    weights = [max(1e-6, p.get("score", 0.5)) ** (1.0 / t) for p in pool]
    chosen: list[dict] = []
    items = list(zip(pool, weights))
    for _ in range(k):
        total = sum(w for _, w in items)
        r = rng.uniform(0, total)
        acc = 0.0
        for idx, (p, w) in enumerate(items):
            acc += w
            if acc >= r:
                chosen.append(p)
                items.pop(idx)
                break
    return chosen


def _by_coverage(pool: list[dict], k: int, temperature: float, rng: random.Random) -> list[dict]:
    """One from each tag before any tag gets a second."""
    buckets: dict[str, list[dict]] = {}
    for p in pool:
        for t in p.get("tags") or ["(untagged)"]:
            buckets.setdefault(t, []).append(p)
    order = list(buckets)
    rng.shuffle(order)
    picked: list[dict] = []
    seen: set[str] = set()
    while len(picked) < k and order:
        progressed = False
        for t in list(order):
            candidates = [p for p in buckets[t] if p["id"] not in seen]
            if not candidates:
                order.remove(t)
                continue
            p = _weighted(candidates, 1, temperature, rng)[0]
            picked.append(p)
            seen.add(p["id"])
            progressed = True
            if len(picked) >= k:
                break
        if not progressed:
            break
    return picked


def draw(
    root: str | Path = ".",
    out: str | Path | None = None,
    n_exemplars: int = 6,
    n_themes: int = 2,
    temperature: float = 0.85,
    coverage: bool = True,
    include_unlabelled: bool = False,
    tag: str | None = None,
    seed: int | None = None,
    write: bool = True,
) -> dict:
    out_dir = Path(out or Path(root) / "extracted")
    rng = random.Random(seed if seed is not None else int(time.time() * 1000) % (2**31))

    bank = Bank(out_dir)
    pool = bank.kept()
    if include_unlabelled:
        pool += bank.unlabelled()
    if tag:
        pool = [p for p in pool if tag in (p.get("tags") or [])]

    if not pool:
        raise SystemExit(
            "No kept exemplars. Run `pipeline harvest` then `pipeline review` first, "
            "or pass --include-unlabelled to draw from the raw pool."
        )

    picker = _by_coverage if coverage else _weighted
    exemplars = picker(pool, n_exemplars, temperature, rng)

    tbank = Bank(out_dir, pool=THEMES, decisions=THEME_DECISIONS)
    tpool = tbank.kept() or tbank.unlabelled()
    themes = _weighted(tpool, n_themes, 1.0, rng) if tpool else []

    packet = {
        "drawn_at": _now(),
        "rng_seed": seed,
        "params": {
            "n_exemplars": n_exemplars,
            "n_themes": n_themes,
            "temperature": temperature,
            "coverage": coverage,
            "include_unlabelled": include_unlabelled,
            "tag": tag,
        },
        "exemplar_ids": [p["id"] for p in exemplars],
        "theme_ids": [t.get("id") for t in themes],
        "exemplars": exemplars,
        "themes": themes,
    }

    if write:
        out_dir = out_dir / "packets"
        out_dir.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
        path = out_dir / f"{stamp}.json"
        path.write_text(json.dumps(packet, ensure_ascii=False, indent=2), encoding="utf-8")
        packet["path"] = str(path)
    return packet


def render(packet: dict) -> str:
    """The packet as text, ready to sit in front of a generation call."""
    out = ["# SEED", ""]
    for t in packet.get("themes", []):
        out += [f"- **{t.get('label','theme')}** — {t.get('text','')}", ""]
    if not packet.get("themes"):
        out += ["*(no themes banked yet)*", ""]
    out += ["# REGISTER", "",
            "*Passages below are published human prose, verbatim. Match the "
            "register. Do not reuse their content.*", ""]
    for p in packet.get("exemplars", []):
        who = p.get("author") or p.get("source_id", "")
        tags = " ".join(f"[{t}]" for t in p.get("tags", []))
        out += [f"### {who} — {p.get('title','')}  {tags}", "", p.get("text", ""), ""]
    return "\n".join(out)
