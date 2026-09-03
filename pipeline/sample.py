"""Draw a generation packet: some themes as a seed, some examples as register.

This is the step that runs when Chris says "come up with an idea". It is
deliberately dumb right now — mostly random over the kept set, because there
is not yet enough decision history to steer with, and a clever sampler built
on no data is just a bias with extra steps.

Three knobs exist so steering is possible later without a rewrite:

  --coverage     spread the draw across the facet grid rather than sampling
                 flat, so a packet is not six passages all doing the same thing
  --temperature  0 = strictly highest-scoring, 1 = uniform over eligible
  --order-by     what order the drawn set is rendered in

And one constraint:

  --setting      which lore file the seed is drawn under. Themes come only
                 from that setting's sources, and the lore file's §9 is pasted
                 into the packet last, immediately before the ask. There is
                 always a setting; the default is the setting-a.

Coverage sampling is "clustering retrieval" — cluster, then take one per
cluster — which is an established diversity method for in-context
demonstrations (`research/tagging.md` §4). The design was always right; the
buckets used to be the six invented failure tags and are now the 9-cell
voice x mode grid from `biber.py`, which is fitted to the corpus.

Order is not cosmetic. The ICL literature reports demonstration order moving
results "from near-random to state-of-the-art", and this file used to emit
whatever order the picker happened to produce and record nothing. It is now an
explicit parameter and the realised order is written into the packet.

Every packet is written to `extracted/packets/` with the ids it drew. When a
premise from a packet turns out well, the packet says exactly what conditioned
it — which is the only way the sampler ever gets to stop being random.
"""

from __future__ import annotations

import json
import random
import re
import time
from pathlib import Path

from . import sources as sources_mod
from .bank import THEME_DECISIONS, THEMES, Bank, _now
from .biber import cell, matches


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
    """One from each facet cell before any cell gets a second."""
    buckets: dict[str, list[dict]] = {}
    for p in pool:
        buckets.setdefault(cell(p.get("facets")), []).append(p)
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


# `-d1` would be the natural spelling for descending, but argparse reads a
# leading dash as the start of the next option. Suffix instead.
ORDERINGS = tuple(
    [f"d{i}{suffix}" for i in range(1, 7) for suffix in ("", "-desc")]
    + ["score", "score-desc", "random", "picked"]
)


def _ordered(rows: list[dict], order_by: str, rng: random.Random) -> list[dict]:
    """Render order for the drawn set. `picked` keeps whatever the picker did."""
    if order_by == "picked":
        return rows
    if order_by == "random":
        out = list(rows)
        rng.shuffle(out)
        return out
    desc = order_by.endswith("-desc")
    key = order_by[:-5] if desc else order_by
    if key.startswith("d") and key[1:].isdigit():
        def val(r):
            return (r.get("facets") or {}).get(key, 0.0)
    else:
        def val(r):
            return r.get(key, 0.0)
    return sorted(rows, key=val, reverse=desc)


CANON_SECTION = 9


def lore_section(path: Path, number: int = CANON_SECTION) -> str:
    """One numbered `## N.` section of a lore file, body only.

    The lore files share nine fixed sections so this can be lifted by heading
    rather than by a marker somebody has to remember to keep. `sources/settings/README.md`
    is the schema.
    """
    if not path.exists():
        raise SystemExit(f"lore file missing: {path}")
    text = path.read_text(encoding="utf-8")
    head = re.search(rf"^## {number}\.[^\n]*\n", text, re.M)
    if not head:
        raise SystemExit(f"{path}: no `## {number}.` section — see sources/settings/README.md")
    rest = text[head.end():]
    nxt = re.search(r"^## ", rest, re.M)
    return (rest[:nxt.start()] if nxt else rest).strip()


def draw(
    root: str | Path = ".",
    out: str | Path | None = None,
    n_examples: int = 6,
    n_themes: int = 2,
    temperature: float = 0.85,
    coverage: bool = True,
    include_unlabelled: bool = False,
    facet: str | None = None,
    order_by: str = "d1",
    seed: int | None = None,
    setting: str | None = None,
    write: bool = True,
) -> dict:
    root = Path(root)
    out_dir = Path(out or root / "extracted")
    rng = random.Random(seed if seed is not None else int(time.time() * 1000) % (2**31))

    where = sources_mod.setting(setting, root)
    canon = lore_section(root / where.lore)

    bank = Bank(out_dir)
    pool = bank.kept()
    if include_unlabelled:
        pool += bank.unlabelled()
    if facet:
        pool = [p for p in pool if matches(p.get("facets"), facet)]

    if not pool:
        raise SystemExit(
            "No kept examples. Run `pipeline harvest` then `pipeline review` first, "
            "or pass --include-unlabelled to draw from the raw pool."
        )

    picker = _by_coverage if coverage else _weighted
    examples = _ordered(picker(pool, n_examples, temperature, rng), order_by, rng)

    tbank = Bank(out_dir, pool=THEMES, decisions=THEME_DECISIONS)
    tpool = tbank.kept() or tbank.unlabelled()
    # The seed is the one thing a setting changes. Drawing a theme from
    # outside its sources would put a setting-a mechanism under a call that
    # believed itself constrained, so an empty pool is a stop, not a fallback.
    tpool = [t for t in tpool if t.get("source_id") in where.themes]
    if not tpool:
        raise SystemExit(
            f"No themes banked for setting {where.id!r} (sources: "
            f"{', '.join(where.themes)}). Run `pipeline themes --brief "
            f"{where.themes[0]}`, draft against it, then `--ingest`."
        )
    themes = _weighted(tpool, n_themes, 1.0, rng)

    packet = {
        "drawn_at": _now(),
        "rng_seed": seed,
        "params": {
            "n_examples": n_examples,
            "n_themes": n_themes,
            "temperature": temperature,
            "coverage": coverage,
            "include_unlabelled": include_unlabelled,
            "facet": facet,
            "order_by": order_by,
            "setting": where.id,
        },
        # Order matters and is therefore recorded: this list is the sequence
        # the examples were actually rendered in, not a set.
        "example_ids": [p["id"] for p in examples],
        "example_order": [
            {"id": p["id"], "cell": cell(p.get("facets")),
             **{d: v for d, v in (p.get("facets") or {}).items()
                if d.startswith("d") and d[1:].isdigit()}}
            for p in examples
        ],
        "theme_ids": [t.get("id") for t in themes],
        "examples": examples,
        "themes": themes,
        "lore": where.lore,
        # Recorded verbatim so the packet says what the call was held to,
        # even after the lore file moves on.
        "canon": canon,
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
    """The packet as text, ready to sit in front of a generation call.

    Register first, seed second, canon last. Instruction force decays with
    distance from the point of generation while register conditioning does
    not, so the examples open and the constraints sit immediately before the
    ask — the order the seed-premises skill and `research/generation.md`
    §3.3-§3.4 both specify. The canon block is the one part of the packet that
    is a constraint rather than conditioning, which is why it goes last of all.
    This file used to emit the seed first, which put six passages of prose
    between the constraints and the call.
    """
    out = ["# REGISTER", "",
           "*Passages below are published human prose, verbatim. Match the "
           "register. Do not reuse their content.*", ""]
    for p in packet.get("examples", []):
        who = p.get("author") or p.get("source_id", "")
        out += [f"### {who} — {p.get('title','')}  [{cell(p.get('facets'))}]",
                "", p.get("text", ""), ""]

    out += ["# SEED", ""]
    for t in packet.get("themes", []):
        out += [f"- {t.get('text','')}", ""]
    if not packet.get("themes"):
        out += ["*(no themes banked yet — `pipeline themes --brief <source>`)*", ""]

    if packet.get("canon"):
        setting = (packet.get("params") or {}).get("setting", "")
        out += ["# CANON", "",
                f"*Setting: {setting}. Every premise in the batch holds to these.*", "",
                packet["canon"], ""]
    return "\n".join(out)
