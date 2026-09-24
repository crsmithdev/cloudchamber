/**
 * `bank/judgements.jsonl`: one line per judge pass, for ever.
 *
 * The runs of 22–23 September are the reason this exists. Their passes live in
 * a scratch directory under `~/.cloudchamber/ab/` that nothing backs up, their
 * arms are text files exported from stores that no longer exist, and they were
 * found again by searching the filesystem for a field name. The pooled numbers
 * survive only as prose in `evals/`.
 *
 * What the log is for decides what a row carries
 * (`docs/reviews/2026-09-24-loop-sequence.md`):
 *
 * - **Re-pool under a corrected rule.** Pooling is deterministic, so the row
 *   holds everything `pool()` reads and nothing it does not. A weight rule can
 *   then be changed and every past run re-read for nothing. This is free only
 *   over the pairs the log holds: the corrected floor rule cannot reach the
 *   runs of 23 September, because `cut2 v cut3` was never asked.
 * - **Reuse the arm, never the verdict.** A verdict is about two particular
 *   texts. So a row names the two **draw ids**, not paths and not text, and the
 *   runner looks for a stored arm before it drafts a baseline again.
 * - **Record what the panel has ruled on**, so a later session does not propose
 *   a clause that has already lost.
 *
 * A row also carries the tree it ran under, because an arm measured in a dirty
 * worktree is what published 409/211/6556 as a fact about `main` on 23
 * September.
 *
 * Append only. Nothing rewrites a line; a corrected reading is a new pooling of
 * the same lines, which is the point.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { BANK, now } from "../paths.ts";
import type { Axis, Pass, Run, Side } from "./pool.ts";

export const JUDGEMENT_LOG = join(BANK, "judgements.jsonl");

/** Which half of a run a pass belongs to: the arms against each other, or one arm against itself. */
export type PairKind = "comparison" | "floor";

/** One judge pass over one pair, as the log keeps it. */
export type Judgement = {
  id: string;
  /** The run this pass belongs to; every row of one `lab` invocation shares it. */
  experiment: string;
  /** The draw whose brief both arms were drafted from. */
  brief: string;
  level: "L1" | "L2";
  kind: PairKind;
  /** The arm under test and the arm it is read against; equal for a floor pair. */
  arm: string;
  against: string;
  /** The two drafts, by draw id. `ours` is the arm under test. */
  ours: string;
  source: string;
  /** The beat judged, at L1. Absent at L2, where the pair is the whole draft. */
  beat?: number;
  judge: string;
  /** Which pass of this pair, from 1. */
  pass: number;
  flipped: boolean;
  complete: boolean;
  followed_order: boolean;
  axes: Partial<Record<Axis, Side>>;
  scores: Partial<Record<Axis, { ours: number; source: number }>>;
  overall: Side | "?";
  /** What the call cost and how long it took, as the provider reported them. */
  cost_usd: number | null;
  ms: number | null;
  at: string;
  /** The tree the runner ran under: short sha, `+dirty` when the code differs from it. */
  version: string;
};

export type JudgementInput = Omit<Judgement, "id" | "at">;

const idOf = (j: JudgementInput, at: string) =>
  createHash("sha1").update([j.experiment, j.kind, j.ours, j.source, j.judge, j.pass, j.beat ?? "", at].join("|")).digest("hex").slice(0, 16);

/** Append one pass. Returns the row as it was written. */
export function recordJudgement(input: JudgementInput, log: string = JUDGEMENT_LOG): Judgement {
  const at = now();
  const row: Judgement = { id: idOf(input, at), ...input, at };
  mkdirSync(dirname(log), { recursive: true });
  appendFileSync(log, JSON.stringify(row) + "\n");
  return row;
}

/** Append a run of passes in one write, so a crash cannot split a pair across two runs of the file. */
export function recordJudgements(inputs: JudgementInput[], log: string = JUDGEMENT_LOG): Judgement[] {
  if (!inputs.length) return [];
  const at = now();
  const rows = inputs.map((i) => ({ id: idOf(i, at), ...i, at }));
  mkdirSync(dirname(log), { recursive: true });
  appendFileSync(log, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return rows;
}

/** Every pass the log holds, oldest first. A line that will not parse names itself and is skipped. */
export function readJudgements(log: string = JUDGEMENT_LOG): Judgement[] {
  if (!existsSync(log)) return [];
  const out: Judgement[] = [];
  readFileSync(log, "utf8").split("\n").forEach((raw, i) => {
    if (!raw.trim()) return;
    try { out.push(JSON.parse(raw) as Judgement); }
    catch { console.error(`${log}:${i + 1}: not JSON, skipped`); }
  });
  return out;
}

/**
 * Group logged passes back into the runs `pool()` reads, one per judge per
 * pair. The grouping is what a judge's weight is computed over, so it has to be
 * the same grouping the run used: a judge's passes over one pair, not its
 * passes over everything.
 */
export function asRuns(rows: Judgement[]): Run[] {
  const by = new Map<string, Run>();
  for (const r of rows) {
    const key = [r.judge, r.ours, r.source, r.beat ?? ""].join("|");
    let run = by.get(key);
    if (!run) by.set(key, (run = { model: r.judge, file: key, results: [] }));
    const p: Pass = {
      overall: r.overall, flipped: r.flipped, complete: r.complete,
      followed_order: r.followed_order, axes: r.axes, scores: r.scores,
    };
    run.results.push(p);
  }
  // each run's passes in the order they were judged, as a file of them would be
  for (const run of by.values()) run.results.sort((a, b) => Number(a.flipped) - Number(b.flipped));
  return [...by.values()];
}

/** The passes of one experiment, split into the halves a verdict is read from. */
export function experiment(rows: Judgement[], id: string): { comparison: Judgement[]; floor: Judgement[] } {
  const mine = rows.filter((r) => r.experiment === id);
  return { comparison: mine.filter((r) => r.kind === "comparison"), floor: mine.filter((r) => r.kind === "floor") };
}

/** Every experiment in the log, newest first, with what it judged and what it cost. */
export function experiments(rows: Judgement[]): { id: string; brief: string; level: string; passes: number; cost_usd: number; at: string }[] {
  const by = new Map<string, { id: string; brief: string; level: string; passes: number; cost_usd: number; at: string }>();
  for (const r of rows) {
    const e = by.get(r.experiment) ?? { id: r.experiment, brief: r.brief, level: r.level, passes: 0, cost_usd: 0, at: r.at };
    e.passes++;
    e.cost_usd += r.cost_usd ?? 0;
    if (r.at > e.at) e.at = r.at;
    by.set(r.experiment, e);
  }
  return [...by.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** The clauses a panel has already ruled on: what a later session checks before proposing one again. */
export function ruledOn(rows: Judgement[]): string[] {
  return [...new Set(rows.filter((r) => r.kind === "comparison").map((r) => r.arm))].sort();
}
