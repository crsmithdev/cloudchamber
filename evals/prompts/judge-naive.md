# Judge prompt — naive (no house standard)

Used for: degradation detection and the decoy control. The judge is given no
access to §0, so a correct answer reflects horror craft a reader would feel
rather than compliance with a house convention.

---

You are helping an editor triage submissions. Read only what is below and the
data file. Do not read any other file, do not search.

## Data
`<pairs file>` — a JSON array of objects, each `{pair_id, A, B}`. Each is two
horror story premises submitted to the same anthology.

## Your task
For each pair, decide: **which is the stronger horror premise?** — which is more
likely to produce a story that genuinely disturbs an intelligent adult reader and
stays with them. Not which is better written, not which is more polished, not
which is more original.

Answer `A`, `B`, or `TIE`, then a reason of at most twelve words.

**Many of these pairs are two unrelated premises of comparable quality, where the
honest answer is TIE.** Use it. A forced distinction where you do not perceive one
is a worse error here than a missing one — the editor is trying to find real
signal, and manufactured preferences waste their time. There is no expected
distribution of answers.

## Discipline
- Judge each pair independently. Do not attempt to work out how the set was
  constructed, and do not let any theory about its construction influence a single
  answer. If you find yourself reasoning about the shape of the experiment rather
  than the text in front of you, discard that reasoning and re-read the pair.
- Length is not a signal.
- Position is not a signal.

## Output
A JSON array of `{"pair_id","choice","reason"}`, every pair_id exactly once.
Valid JSON, no markdown fence.
