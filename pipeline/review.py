"""The cull. Chris reads passages and says keep or pass.

Every verdict appends to `extracted/decisions.jsonl` and nothing is ever
overwritten, because the decisions are the training data. A pass is as
informative as a keep — arguably more so, since the pool is mostly passes and
a discriminator needs negatives.

**The interface is the bottleneck, not the taxonomy.** 944 passages at 30-60s
of careful reading each is 8-15 hours, and the pool grows several-fold once
the PDFs are harvested. Three modes, in descending order of how much reading
they save:

  --triage    first ~40 words only. `p` pass, `x` expand, `k` keep. Most
              rejects are obvious in one sentence, and paying 400 words to say
              no is the single largest waste in the loop. Run this over
              everything first, then a careful pass over the survivors.
  --compare   five at a time, pick the best one or two, ties allowed and
              encouraged. ~190 screens instead of 944, and it yields ranking
              data rather than a binary. People are faster and more consistent
              comparing than rating in isolation.
  (default)   one at a time, full text.

`--order cluster` puts consecutive passages in the same facet cell, which
holds calibration steady instead of making every screen a register switch.

Keys: k keep, p pass, m maybe, s skip (no verdict), b back, q quit.
Anything typed after the letter is kept as a note on that verdict.
"""

from __future__ import annotations

import random
import textwrap
from pathlib import Path

from .bank import THEME_DECISIONS, THEMES, Bank
from .biber import CELLS, cell

WRAP = 96
RULE = "─" * WRAP
TRIAGE_WORDS = 40
COMPARE_WORDS = 60
ORDERS = ("score", "random", "source", "cluster", "d1", "d1-desc", "d2",
          "d2-desc")


# --- shared ---------------------------------------------------------------


def _head(p: dict) -> str:
    return (
        f"{p.get('title', '?')}"
        f"{'  — ' + p['author'] if p.get('author') else ''}"
    )


def _meta(p: dict) -> str:
    f = p.get("facets") or {}
    facet = (
        f"{cell(f)}  d1 {f.get('d1', 0):+.2f}  d2 {f.get('d2', 0):+.2f}"
        if f else "(no facets — run `pipeline facets`)"
    )
    flag = "  [withheld]" if p.get("withheld") else ""
    return (
        f"score {p.get('score', 0):.3f}   {p.get('words', 0)}w   "
        f"pos {p.get('position', 0):.2f}   {p.get('source_id', '')}\n{facet}{flag}"
    )


def _body(p: dict) -> str:
    return "\n".join(
        textwrap.fill(para, WRAP) for para in p.get("text", "").split("\n\n")
    )


def _opening(p: dict, n: int) -> str:
    words = p.get("text", "").split()
    text = " ".join(words[:n])
    return textwrap.fill(text + ("…" if len(words) > n else ""), WRAP)


def _queue(bank: Bank, facet: str | None, order: str, limit: int,
           min_score: float, withheld: bool) -> list[dict]:
    pool = bank.load()
    done = bank.verdicts()
    queue = [p for pid, p in pool.items() if pid not in done]

    if facet:
        queue = [
            p for p in queue
            if facet in (cell(p.get("facets")),
                         (p.get("facets") or {}).get("voice"),
                         (p.get("facets") or {}).get("mode"))
        ]
    if withheld:
        queue = [p for p in queue if p.get("withheld")]
    queue = [p for p in queue if p.get("score", 0) >= min_score]

    if order == "score":
        queue.sort(key=lambda p: -p.get("score", 0))
    elif order == "random":
        random.shuffle(queue)
    elif order == "source":
        queue.sort(key=lambda p: (p.get("source_id", ""), -p.get("score", 0)))
    elif order == "cluster":
        # Blocked by facet cell: same register for a run of screens, best
        # first within each. Cells in the grid's own order so the sequence is
        # reproducible.
        rank = {c: i for i, c in enumerate(CELLS)}
        queue.sort(key=lambda p: (rank.get(cell(p.get("facets")), len(CELLS)),
                                  -p.get("score", 0)))
    elif order.removesuffix("-desc") in ("d1", "d2"):
        key = order.removesuffix("-desc")
        queue.sort(key=lambda p: (p.get("facets") or {}).get(key, 0.0),
                   reverse=order.endswith("-desc"))

    return queue[:limit] if limit else queue


def _progress(bank: Bank) -> str:
    s = bank.stats()
    rates = s["keep_rate"]
    tail = "  ".join(f"{r:.0%}" for r in rates[-6:]) if rates else "—"
    return (f"keep {s['keep']}  pass {s['pass']}  maybe {s['maybe']}  "
            f"unlabelled {s['unlabelled']}  of {s['pool']}\n"
            f"keep rate per 50: {tail}")


# --- one at a time --------------------------------------------------------


def _one_at_a_time(bank: Bank, queue: list[dict], triage: bool) -> None:
    method = "triage" if triage else "manual"
    keys = ("k=keep  p=pass  x=expand  m=maybe  s=skip  b=back  q=quit"
            if triage else "k=keep  p=pass  m=maybe  s=skip  b=back  q=quit")
    print(f"{len(queue)} to review.  {keys}")

    i = 0
    expanded = False
    while 0 <= i < len(queue):
        p = queue[i]
        text = _body(p) if (expanded or not triage) else _opening(p, TRIAGE_WORDS)
        print(f"\n{RULE}\n[{i + 1}/{len(queue)}]  {_head(p)}\n{_meta(p)}\n"
              f"{RULE}\n\n{text}\n\n{RULE}")
        try:
            ans = input("> ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print("\nstopped.")
            break

        if ans in ("q", "quit"):
            break
        if ans in ("b", "back"):
            i, expanded = max(0, i - 1), False
            continue
        if triage and ans[:1] == "x":
            expanded = True
            continue
        if ans in ("s", "skip", ""):
            i, expanded = i + 1, False
            continue

        verdict = {"k": "keep", "p": "pass", "m": "maybe"}.get(ans[:1])
        if not verdict:
            print("  ? " + keys)
            continue
        # A verdict given after expanding is a full read, not a triage call.
        bank.record(p["id"], verdict, note=ans[1:].strip(),
                    method="manual" if expanded else method)
        i, expanded = i + 1, False
        if triage and i % 50 == 0:
            print(f"\n  {_progress(bank)}\n")

    print(f"\n{_progress(bank)}")


# --- five at a time -------------------------------------------------------


def _compare(bank: Bank, queue: list[dict], batch: int) -> None:
    screens = (len(queue) + batch - 1) // batch
    print(f"{len(queue)} to review in {screens} screens of {batch}.")
    print("Type the numbers worth keeping — ties encouraged. "
          "Enter = none.  x<n> expand n.  s skip screen.  q quit.")

    stopped = False
    for screen in range(screens):
        if stopped:
            break
        group = queue[screen * batch:(screen + 1) * batch]
        shown = {i: COMPARE_WORDS for i in range(1, len(group) + 1)}

        while True:
            print(f"\n{RULE}\n[screen {screen + 1}/{screens}]\n{RULE}")
            for i, p in enumerate(group, 1):
                text = (_body(p) if shown[i] is None
                        else _opening(p, shown[i]))
                print(f"\n {i}. {_head(p)}   [{cell(p.get('facets'))}]  "
                      f"{p.get('words', 0)}w  score {p.get('score', 0):.3f}")
                print(textwrap.indent(text, "    "))
            print(f"\n{RULE}")

            try:
                ans = input("> ").strip().lower()
            except (EOFError, KeyboardInterrupt):
                print("\nstopped.")
                stopped = True
                break

            if ans in ("q", "quit"):
                stopped = True
                break
            if ans in ("s", "skip"):
                break
            if ans.startswith("x"):
                want = _numbers(ans[1:], len(group))
                if not want:
                    print("  ? x1, or x1 3")
                    continue
                for i in want:
                    shown[i] = None
                continue

            picks = _numbers(ans, len(group))
            if ans and not picks:
                print("  ? numbers, or Enter for none")
                continue

            gid = f"{bank.decisions_path.stem}-s{screen + 1}-{group[0]['id'][:6]}"
            for i, p in enumerate(group, 1):
                bank.record(
                    p["id"],
                    "keep" if i in picks else "pass",
                    method="compare",
                    extra={"group": gid, "group_size": len(group),
                           "picked": len(picks)},
                )
            break

    print(f"\n{_progress(bank)}")


def _numbers(s: str, hi: int) -> set[int]:
    out = set()
    for token in s.replace(",", " ").split():
        if token.isdigit() and 1 <= int(token) <= hi:
            out.add(int(token))
    return out


# --- entry point ----------------------------------------------------------


def review(
    root: str | Path = ".",
    out: str | Path | None = None,
    facet: str | None = None,
    order: str = "score",
    limit: int = 0,
    min_score: float = 0.0,
    mode: str = "full",
    batch: int = 5,
    withheld: bool = False,
) -> None:
    bank = Bank(out or Path(root) / "extracted")
    queue = _queue(bank, facet, order, limit, min_score, withheld)
    if not queue:
        print("Nothing unlabelled matches. `pipeline stats` for the state of the bank.")
        return

    if mode == "compare":
        _compare(bank, queue, batch)
    else:
        _one_at_a_time(bank, queue, triage=(mode == "triage"))


# --- themes ---------------------------------------------------------------


def review_themes(
    root: str | Path = ".",
    out: str | Path | None = None,
    per_screen: int = 20,
    limit: int = 0,
) -> None:
    """A dense multi-select list, not the passage reviewer.

    432 themes of one or two sentences each. One-at-a-time is the wrong shape
    for them: the screen is mostly empty and every verdict costs a round trip.
    Twenty to a screen, keep by number, everything unnamed passes. The whole
    set is half an hour.
    """
    bank = Bank(out or Path(root) / "extracted", pool=THEMES,
                decisions=THEME_DECISIONS)
    done = bank.verdicts()
    queue = [t for tid, t in bank.load().items() if tid not in done]
    if limit:
        queue = queue[:limit]
    if not queue:
        print("No unlabelled themes. `pipeline stats` for the state of the bank.")
        return

    screens = (len(queue) + per_screen - 1) // per_screen
    print(f"{len(queue)} themes in {screens} screens of {per_screen}.")
    print("Type the numbers worth keeping. Enter = none.  s skip screen.  q quit.")

    for screen in range(screens):
        group = queue[screen * per_screen:(screen + 1) * per_screen]
        print(f"\n{RULE}\n[screen {screen + 1}/{screens}]\n{RULE}")
        for i, t in enumerate(group, 1):
            text = " ".join((t.get("text") or "").split())
            label = t.get("label") or t.get("source_id", "")
            print(textwrap.fill(f"{i:>3}. {label}: {text}", WRAP,
                                subsequent_indent="     "))
        print(RULE)

        try:
            ans = input("> ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print("\nstopped.")
            break
        if ans in ("q", "quit"):
            break
        if ans in ("s", "skip"):
            continue

        picks = _numbers(ans, len(group))
        if ans and not picks:
            print("  ? numbers, or Enter for none")
            continue
        for i, t in enumerate(group, 1):
            bank.record(t["id"], "keep" if i in picks else "pass",
                        method="multiselect")

    s = bank.stats()
    print(f"\nkeep {s['keep']}  pass {s['pass']}  unlabelled {s['unlabelled']} "
          f"of {s['pool']}")


# --- export ---------------------------------------------------------------


def export(root: str | Path = ".", out: str | Path | None = None,
           path: str | Path | None = None) -> Path:
    """Write the kept set to `extracted/exemplars.md` in the documented format."""
    out_dir = Path(out or Path(root) / "extracted")
    bank = Bank(out_dir)
    kept = sorted(bank.kept(), key=lambda p: (cell(p.get("facets")),
                                              -p.get("score", 0)))
    dest = Path(path) if path else out_dir / "exemplars.md"

    lines = [
        "# EXEMPLARS — register conditioning",
        "",
        "*Generated by `pipeline export`. Chris's keeps from "
        "`exemplars.jsonl`; do not hand-edit — edit the decisions instead.*",
        "",
        f"{len(kept)} passages.",
        "",
    ]
    for p in kept:
        src = p.get("title", "?")
        who = p.get("author") or p.get("source_id", "")
        facet = f"`[{cell(p.get('facets'))}]`"
        if p.get("withheld"):
            facet += " `[withheld]`"
        lines += [f"### {who} — {src}", facet, "", p.get("text", ""), ""]
        if p.get("license"):
            lines += [f"<!-- {p['license']}; {p.get('origin','')} -->", ""]
    dest.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {dest} ({len(kept)} passages)")
    return dest
