/**
 * The comparison runner: compare two arms or a draw against a transcript.
 *
 * It pairs drafts across arms matched by source (or against a single transcript),
 * runs passes in both orders with the panel, records every pass to judgements.jsonl,
 * and reports the pooled score gap against within-arm floors.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Drafting } from "../drafting.ts";
import { draftView, renderStory } from "../drafts.ts";
import { Lineage } from "../lineage.ts";
import { NARRATION } from "../paths.ts";
import { treeVersion } from "../version.ts";
import { JUDGES } from "./best.ts";
import { judgeKey, judgePrompt, runPasses, type CallOpts, type PassAsk, type PassResult } from "./judge.ts";
import { JUDGEMENT_LOG, recordJudgements, type JudgementInput } from "./log.ts";
import { armPool, floorPairs, fmt2, type ArmComparison, type Run } from "./pool.ts";

export type CompareOpts = {
  arms: string[][];
  passes?: number;
  concurrency?: number;
  judges?: string[];
  log?: string;
  narrationDir?: string;
  say?: (line: string) => void;
  call?: Pick<CallOpts, "fetch" | "key" | "tries">;
};

export type CompareResult = {
  experiment: string;
  comparison: ArmComparison;
  cost_usd: number;
  failed: number;
  ms: number;
};

/** Locate a narration JSON file by exact path, relative path, or video ID under narration directory. */
export function findNarrationPath(idOrPath: string, narrationDir: string = NARRATION): string | null {
  if (existsSync(idOrPath)) return idOrPath;
  const direct = join(narrationDir, idOrPath.endsWith(".json") ? idOrPath : `${idOrPath}.json`);
  if (existsSync(direct)) return direct;
  try {
    const subdirs = readdirSync(narrationDir);
    for (const sub of subdirs) {
      const p = join(narrationDir, sub, idOrPath.endsWith(".json") ? idOrPath : `${idOrPath}.json`);
      if (existsSync(p)) return p;
    }
  } catch {}
  return null;
}

/** Resolve a draw ID by exact match or unique suffix/prefix. */
export function resolveDrawId(d: Drafting, id: string): string {
  if (d.p.db.query("SELECT id FROM draws WHERE id = ?").get(id)) return id;
  const matches = (d.p.db.query("SELECT id FROM draws WHERE id LIKE ? OR id LIKE ?").all(`%-${id}`, `${id}%`) as { id: string }[]).map((r) => r.id);
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) throw new Error(`ambiguous draw id "${id}": matches ${matches.join(", ")}`);
  throw new Error(`no draw or narration transcript found matching "${id}"`);
}

/** Load story text from either a narration transcript or a stored draw. */
export function loadStoryText(d: Drafting, id: string, narrationDir: string = NARRATION): string {
  const narrPath = findNarrationPath(id, narrationDir);
  if (narrPath) {
    const data = JSON.parse(readFileSync(narrPath, "utf8")) as { snippets?: { text: string }[] };
    const sn = data.snippets ?? [];
    let text = sn.map((s) => s.text).join(" ");
    const intro = text.indexOf("Let's dive into today's story");
    if (intro >= 0 && intro < 3000) text = text.slice(intro + 30);
    return text.trim();
  }
  const drawId = resolveDrawId(d, id);
  return renderStory(draftView(d.p, drawId), false);
}

/**
 * The draw a draft was branched from, or the draft itself: two arms' drafts of
 * one source are a matched pair. Not the lineage root, which a repair chain
 * shares across different briefs.
 */
export function sourceOf(lineage: Lineage | undefined, id: string): string {
  try { return lineage?.row(id).branched_from ?? id; } catch { return id; }
}

/**
 * Pair two arms. One draft or transcript against many pairs with each. Arms
 * of several drafts pair by source, and a draft with no match in the other
 * arm stops the run: pairing it by position would judge different stories.
 */
export function pairArms(armA: string[], armB: string[], source: (id: string) => string = (id) => id): [string, string][] {
  if (!armA.length || !armB.length) return [];
  if (armB.length === 1) return armA.map((a) => [a, armB[0]!]);
  if (armA.length === 1) return armB.map((b) => [armA[0]!, b]);
  const pairs: [string, string][] = [];
  const usedB = new Set<string>();
  for (const a of armA) {
    const b = armB.find((x) => !usedB.has(x) && source(x) === source(a));
    if (!b) continue;
    pairs.push([a, b]);
    usedB.add(b);
  }
  const lost = [...armA.filter((a) => !pairs.some(([x]) => x === a)), ...armB.filter((b) => !usedB.has(b))];
  if (lost.length) throw new Error(`no draft of the same source in the other arm for ${lost.join(", ")}`);
  return pairs;
}

/** Why a comparison run is refused before it bills or judges, or null. */
export function whyNotCompare(o: { passes: number; judges: string[]; arms: string[][] }): string | null {
  if (o.arms.length < 2) return `compare needs at least two arms, got ${o.arms.length}`;
  if (!o.arms[0]?.length || !o.arms[1]?.length) return "an arm cannot be empty";
  if (!Number.isInteger(o.passes) || o.passes < 2 || o.passes % 2) {
    return `passes must be even, so each judge reads each pair both ways round, not ${o.passes}`;
  }
  if (!o.judges.length) return "no judges";
  return null;
}

/**
 * Compare two arms: match pairs across arms, run panel passes in both orders,
 * log each pass, and return the pooled score gap against the within-arm floor.
 */
export async function compare(d: Drafting, o: CompareOpts): Promise<CompareResult> {
  const passes = o.passes ?? 8;
  const judges = o.judges ?? JUDGES;
  const why = whyNotCompare({ passes, judges, arms: o.arms });
  if (why) throw new Error(why);

  const key = o.call?.key ?? (o.call?.fetch ? "test-key" : judgeKey());
  const say = o.say ?? (() => {});
  const armA = o.arms[0]!;
  const armB = o.arms[1]!;

  let lineage: Lineage | undefined;
  try { lineage = Lineage.all(d.p.db); } catch {}

  const compPairs = pairArms(armA, armB, (id) => sourceOf(lineage, id));
  if (!compPairs.length) throw new Error("no comparison pairs could be formed between arms");

  // the first arm is the control: its drafts against each other are the floor, the spread the guard reads a change against
  const floorPairsList = armA.length >= 2 ? floorPairs(armA) : [];

  // Load texts for all distinct identifiers
  const allIds = [...new Set([...armA, ...armB])];
  const texts = new Map<string, string>();
  for (const id of allIds) {
    texts.set(id, loadStoryText(d, id, o.narrationDir));
  }

  // Build asks
  type AskWithKind = PassAsk & { kind: "comparison" | "floor" };
  const asks: AskWithKind[] = [];

  for (const [ours, source] of compPairs) {
    for (const judge of judges) {
      for (let i = 0; i < passes; i++) {
        asks.push({
          ours,
          source,
          judge,
          pass: i + 1,
          flipped: i % 2 === 1,
          kind: "comparison",
        });
      }
    }
  }

  for (const [a, b] of floorPairsList) {
    for (const judge of judges) {
      for (let i = 0; i < passes; i++) {
        asks.push({
          ours: a,
          source: b,
          judge,
          pass: i + 1,
          flipped: i % 2 === 1,
          kind: "floor",
        });
      }
    }
  }

  const expTag = `${armA[0]!.slice(-4)}-vs-${armB[0]!.slice(-4)}`;
  const experiment = `compare-${expTag}-${Date.now().toString(36)}`;
  const version = treeVersion();

  say(`judging ${asks.length} passes over ${compPairs.length} comparison pair${compPairs.length === 1 ? "" : "s"}${floorPairsList.length ? ` and ${floorPairsList.length} floor pair${floorPairsList.length === 1 ? "" : "s"}` : ""}`);

  const t0 = Date.now();
  let completed = 0;
  const results: (PassResult & { kind: "comparison" | "floor" })[] = (await runPasses(
    asks,
    (a) => (a.flipped ? judgePrompt(texts.get(a.source)!, texts.get(a.ours)!) : judgePrompt(texts.get(a.ours)!, texts.get(a.source)!)),
    {
      ...o.call,
      key,
      concurrency: o.concurrency ?? 12,
      onPass: (r) => {
        if (++completed % 12 === 0 || !r.complete) {
          say(`${completed}/${asks.length}${r.complete ? "" : ` failed: ${r.error}`}`);
        }
      },
    },
  )).map((r, i) => ({ ...r, kind: asks[i]!.kind }));

  const tJudge = Date.now() - t0;

  const rows: JudgementInput[] = results.map((r) => ({
    experiment,
    brief: sourceOf(lineage, r.ours),
    level: "L2",
    kind: r.kind,
    arm: r.ours,
    against: r.source,
    ours: r.ours,
    source: r.source,
    judge: r.judge,
    pass: r.pass,
    flipped: r.flipped,
    complete: r.complete,
    followed_order: r.followed_order,
    axes: r.parsed.axes,
    scores: r.parsed.scores,
    overall: r.parsed.overall,
    cost_usd: r.cost_usd,
    ms: r.ms,
    version,
    ...(r.error ? { error: r.error } : {}),
  }));

  const logged = recordJudgements(rows, o.log ?? JUDGEMENT_LOG);

  // Group logged passes back into Run[] per pair for armPool
  const compPairRuns = compPairs.map(([ours, source]) => ({
    ours,
    source,
    runs: pairAsRuns(logged.filter((r) => r.kind === "comparison" && r.ours === ours && r.source === source)),
  }));

  const floorPairRuns = floorPairsList.map(([a, b]) => ({
    a,
    b,
    runs: pairAsRuns(logged.filter((r) => r.kind === "floor" && r.ours === a && r.source === b)),
  }));

  const comparison = armPool(compPairRuns, floorPairRuns);

  return {
    experiment,
    comparison,
    cost_usd: results.reduce((t, r) => t + (r.cost_usd ?? 0), 0),
    failed: results.filter((r) => !r.complete).length,
    ms: tJudge,
  };
}

function pairAsRuns(rows: JudgementInput[]): Run[] {
  const by = new Map<string, Run>();
  for (const r of rows) {
    const key = [r.judge, r.ours, r.source, ""].join("|");
    let run = by.get(key);
    if (!run) by.set(key, (run = { model: r.judge, file: key, results: [] }));
    run.results.push({
      overall: r.overall,
      flipped: r.flipped,
      complete: r.complete,
      followed_order: r.followed_order,
      axes: r.axes,
      scores: r.scores,
    });
  }
  for (const run of by.values()) run.results.sort((a, b) => Number(a.flipped) - Number(b.flipped));
  return [...by.values()];
}

/** Format comparison results as a human-readable table. */
export function formatComparison(res: CompareResult): string {
  const lines: string[] = [];
  lines.push(`${"pair".padEnd(28)} ${"share".padStart(5)}  ${"gap".padStart(5)}  passes`);
  for (const p of res.comparison.pairs) {
    const name = `${p.ours} v ${p.source}`;
    lines.push(`${name.padEnd(28)} ${fmt2(p.share).padStart(5)}  ${fmt2(p.gap).padStart(5)}  ${String(p.passes).padStart(6)}`);
  }
  lines.push(`${"arm comparison".padEnd(28)} ${fmt2(res.comparison.share).padStart(5)}  ${fmt2(res.comparison.gap).padStart(5)}  ${String(res.comparison.passes).padStart(6)}`);

  if (res.comparison.floor) {
    lines.push("");
    lines.push(`${"floor".padEnd(28)} ${"share".padStart(5)}  ${"gap".padStart(5)}  ${"dist".padStart(5)}  passes`);
    for (const f of res.comparison.floor.pairs) {
      const name = `${f.a} v ${f.b}`;
      lines.push(`${name.padEnd(28)} ${fmt2(f.share).padStart(5)}  ${fmt2(f.gap).padStart(5)}  ${fmt2(f.distance).padStart(5)}  ${String(f.passes).padStart(6)}`);
    }
    lines.push(`floor mean: distance from 0.5 = ${fmt2(res.comparison.floor.meanDistance)}, mean abs gap = ${fmt2(res.comparison.floor.meanGap)}`);
  }

  lines.push("");
  lines.push(`verdict: ${res.comparison.verdict}`);
  lines.push(`experiment ${res.experiment} · $${res.cost_usd.toFixed(2)} · judging ${Math.round(res.ms / 1000)} s${res.failed ? ` · ${res.failed} passes failed` : ""}`);
  return lines.join("\n");
}
