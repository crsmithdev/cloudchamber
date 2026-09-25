/**
 * Pooling the passes of a panel into one number, and reading it against a floor.
 *
 * The rules are `evals/tally.py`'s and do not change here; what changes is that
 * they stop being a script run by hand over loose files. `tally.py` stays as the
 * reference implementation, and `pool.test.ts` holds it and this module to the
 * same answers.
 *
 * Two rules carry the weight:
 *
 * **A judge that takes whichever story it read first counts for nothing.** Over
 * the runs of 22 September every judge took the first read in about four passes
 * in five, whether or not the drafts differed. So a judge's weight is
 * `1 - (passes it followed the order) / (its passes)`, and the pooled share is
 * the weighted mean of each judge's win rate.
 *
 * **A result is read against a floor, not against 0.5.** The floor is the same
 * panel over two drafts of one arm — the same code, the same brief — which is
 * the noise a real difference has to clear. A share within 0.1 of the floor says
 * nothing yet.
 */

/** The eight axes, in the order the rubric asks them. */
export const AXES = ["hook", "presence", "people", "feeling", "cost", "ending", "clarity", "momentum"] as const;
export type Axis = (typeof AXES)[number];

/** Which side a judge took. `ours` is the arm under test, `source` the one it is judged against. */
export type Side = "ours" | "source" | "tie";

/** One judge pass over one pair, as `judge.py` records it. */
export type Pass = {
  overall: Side | "?";
  flipped: boolean;
  complete: boolean;
  /** Whether the pass simply took the story it read first. Absent on runs recorded before judge.py wrote it. */
  followed_order?: boolean;
  axes?: Partial<Record<Axis, Side>>;
  scores?: Partial<Record<Axis, { ours: number; source: number }>>;
};

/** One judge's passes over one pair: the model, where it came from, and the passes themselves. */
export type Run = { model: string; file: string; results: Pass[] };

/** What a pass took, for runs written before `judge.py` recorded it. */
export const followedOrder = (p: Pass): boolean =>
  p.followed_order ?? (p.overall === (p.flipped ? "source" : "ours"));

/** A judge's share of the pooled number: how much it followed the reading order, and how often it took our side. */
export type JudgeRow = {
  model: string;
  passes: number;
  /** Ours counts 1 and a tie counts a half. */
  wins: number;
  followRate: number;
  weight: number;
  /** Passes where our draft was read second, and how many of those it still won: the order-free half of the run. */
  second: number;
  wonSecond: number;
};

/** Only a pass that answered every axis and gave an overall is pooled; `judge.py` retries the rest and records them. */
const scored = (runs: Run[]): Pass[] => runs.flatMap((r) => r.results).filter((p) => p.complete);

export function judgeRows(runs: Run[]): JudgeRow[] {
  const models = [...new Set(runs.map((r) => r.model))].sort();
  return models.map((model) => {
    const ps = runs.filter((r) => r.model === model).flatMap((r) => r.results).filter((p) => p.complete);
    const followed = ps.filter(followedOrder).length;
    const followRate = ps.length ? followed / ps.length : 0;
    const second = ps.filter((p) => p.flipped);
    return {
      model,
      passes: ps.length,
      wins: ps.filter((p) => p.overall === "ours").length + 0.5 * ps.filter((p) => p.overall === "tie").length,
      followRate,
      // rounded to two places before it weights anything, as tally.py rounds it
      weight: Math.round((1 - followRate) * 100) / 100,
      second: second.length,
      wonSecond: second.filter((p) => p.overall === "ours").length,
    };
  });
}

/** The mean score each axis gave each side, over every pass that scored it. */
export function axisScores(runs: Run[]): Partial<Record<Axis, { ours: number; source: number; n: number }>> {
  const out: Partial<Record<Axis, { ours: number; source: number; n: number }>> = {};
  const ps = runs.flatMap((r) => r.results);
  for (const a of AXES) {
    const got = ps.map((p) => p.scores?.[a]).filter((s): s is { ours: number; source: number } => !!s);
    if (!got.length) continue;
    out[a] = {
      ours: got.reduce((t, s) => t + s.ours, 0) / got.length,
      source: got.reduce((t, s) => t + s.source, 0) / got.length,
      n: got.length,
    };
  }
  return out;
}

export type Pooled = { share: number; passes: number; judges: JudgeRow[]; scores: ReturnType<typeof axisScores> };

/**
 * The weighted share of the passes that went to our side. `NaN` when every judge
 * took the first read in every pass: such a run carries no information, and a
 * number would hide that.
 */
export function pool(runs: Run[]): Pooled {
  const judges = judgeRows(runs);
  let weighted = 0, total = 0;
  for (const j of judges) {
    if (!j.passes) continue;
    weighted += (j.weight * j.wins) / j.passes;
    total += j.weight;
  }
  return { share: total ? weighted / total : NaN, passes: scored(runs).length, judges, scores: axisScores(runs) };
}

/**
 * Two places, rounding a half to the even digit, as Python's `%.2f` does and
 * `toFixed` does not. The pooled share of the presence floor is exactly 0.625:
 * `tally.py` prints 0.62 and `toFixed(2)` prints 0.63. The verdict reads the
 * raw number, so only what a person reads is at stake — and a write-up that
 * disagrees with the reference implementation over a digit costs an hour to
 * explain.
 */
export function fmt2(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  const scaled = x * 100;
  const floor = Math.floor(scaled);
  const rest = scaled - floor;
  const n = rest === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(scaled);
  return (n / 100).toFixed(2);
}

export type Verdict = "clears the floor" | "falls below the floor: the change loses" | "inside the floor, so this says nothing yet";

/** The threshold a share has to beat the floor by, in either direction, before the run says anything. */
export const FLOOR_MARGIN = 0.1;

/**
 * `tally.py` compares raw floats with `>`, and so does this. A gap of exactly a
 * tenth therefore turns on binary representation — `0.39 - 0.29` is over the
 * margin, `0.6 - 0.5` is under it — so never feed this printed numbers, only
 * the shares `pool` returned. The reference implementation behaves the same
 * way, and matching it matters more than tidying it; a run that lands this
 * close says nothing either way.
 */
export function verdict(share: number, floor: number): Verdict {
  const gap = share - floor;
  if (gap > FLOOR_MARGIN) return "clears the floor";
  if (gap < -FLOOR_MARGIN) return "falls below the floor: the change loses";
  return "inside the floor, so this says nothing yet";
}

/**
 * The within-arm pairs a floor has to be built from: every pairing of the arm's
 * drafts, never one draft against the others.
 *
 * Two runs on 23 September anchored both their floor pairs on draft 1. On the
 * register cut that anchor was the weakest of its three — 0.26 below its
 * siblings over all axes, and the shortest at 9,009 words against 10,116 and
 * 10,398 — so the floor came back at 0.29 rather than near 0.5 and the run could
 * not be read (`evals/20260923-register-cut.md`). The caps ablation used the
 * same shape and got 0.52 only because its anchor happened to be middling.
 */
export function floorPairs<T>(drafts: T[]): [T, T][] {
  if (drafts.length < 2) throw new Error(`a floor needs at least two drafts of the arm, got ${drafts.length}`);
  const out: [T, T][] = [];
  for (let i = 0; i < drafts.length; i++) for (let j = i + 1; j < drafts.length; j++) out.push([drafts[i]!, drafts[j]!]);
  return out;
}

/**
 * Whether a set of floor runs pairs the arm's drafts as `floorPairs` says, or
 * hangs them all off one draft. A floor that fails this is not a floor: it
 * measures its anchor.
 */
export function anchoredOn(pairs: [string, string][]): string | null {
  if (pairs.length < 2) return null;
  for (const candidate of new Set(pairs.flat())) {
    if (pairs.every((p) => p.includes(candidate))) return candidate;
  }
  return null;
}

/**
 * The mean score gap: `ours` minus `source`, over every axis a pass scored and
 * every pass that scored one, on the 1–5 scale. Positive favours `ours`.
 *
 * The overall call wastes most passes. The judges take the story they read
 * first on about 80% of them, the weighting in `pool` then gives those judges
 * little or no weight, and four passes a judge leave about one pass of signal.
 * The scores lean to the first story too (+0.37 on 24 September), but a run
 * reads each pair both ways round equally often, so the lean cancels, and
 * every pass carries eight graded answers instead of one call.
 *
 * On the register cut's six pairs, six disjoint sets of four passes a judge
 * each landed within about 0.15 of the 24-pass gap, where the overall call at
 * four passes read `cut2 v cut3` as 0.19 and it was a coin flip
 * (`evals/20260924-the-score-gap.md`).
 */
export function scoreGap(runs: Run[]): { gap: number; passes: number } {
  const gaps = runs.flatMap((r) => r.results).filter((p) => p.complete).flatMap((p) => {
    const s = Object.values(p.scores ?? {});
    return s.length ? [s.reduce((t, x) => t + (x!.ours - x!.source), 0) / s.length] : [];
  });
  return { gap: gaps.length ? gaps.reduce((t, x) => t + x, 0) / gaps.length : NaN, passes: gaps.length };
}

/** A score gap has to clear this, in either direction, before it says one draft is better. */
export const GAP_MARGIN = 0.15;
