/**
 * Best of N: draft one brief N times and keep the draft the panel prefers.
 *
 * The panel cannot resolve a prompt change of the size tried on 23 September,
 * because two drafts of one arm differ about as much as two arms do. It can rank
 * two drafts once each judge has 24 passes: `cut1` of the register cut never won
 * when read second, 0 of 72 (`evals/20260924-judged-at-24-passes.md`). So the
 * same variance that hides a prompt change is a quality lever: draft several,
 * judge every pair, keep the winner.
 *
 * A draft costs subscription time; a judged pair costs about $2 of OpenRouter at
 * 24 passes a judge.
 */
import type { Drafting } from "../drafting.ts";
import { draftView, renderStory } from "../drafts.ts";
import { treeVersion } from "../version.ts";
import { runPasses, judgeKey, judgePrompt, type PassAsk, type PassResult, type CallOpts } from "./judge.ts";
import { asRuns, recordJudgements, JUDGEMENT_LOG, type Judgement, type JudgementInput } from "./log.ts";
import { GAP_MARGIN, floorPairs, scoreGap } from "./pool.ts";

export const JUDGES = ["google/gemini-3.1-pro-preview", "openai/gpt-5.1", "z-ai/glm-4.7"];

export type BestOpts = {
  n?: number;
  /** Passes per judge per pair, half each way round. One pair against a source spread ±0.25 between halves at four (`evals/20260924-against-the-channels.md`). */
  passes?: number;
  judges?: string[];
  /** Calls in flight at once, over every pair. About 120 at once failed 114 of 360 passes. */
  concurrency?: number;
  log?: string;
  say?: (line: string) => void;
  call?: Pick<CallOpts, "fetch" | "key" | "tries">;
};

/** One draft's standing: its mean score gap over every pair it is in, and its gap against each other draft. */
export type Standing = { id: string; score: number; against: Record<string, number> };
export type Ranking = { standings: Standing[]; winner: string | null };
export type BestResult = Ranking & { experiment: string; drafts: string[]; cost_usd: number; failed: number; ms: { draft: number; judge: number } };

/** Why a best-of-N run is refused before it drafts or bills, or null. */
export function whyNotBest(o: { n: number; passes: number; judges: string[] }): string | null {
  if (!Number.isInteger(o.n) || o.n < 2) return `best of N needs N of at least 2, not ${o.n}`;
  if (!Number.isInteger(o.passes) || o.passes < 2 || o.passes % 2) return `passes must be even, so each judge reads each pair both ways round, not ${o.passes}`;
  if (!o.judges.length) return "no judges";
  return null;
}

/**
 * Rank drafts from the passes over their pairs, by the score gap: a pair's gap
 * is `ours` minus `source`, and the other draft gets its negative. The winner
 * is the top draft only when its gap against every other draft clears
 * `GAP_MARGIN`: a winner inside the margin against anyone is no winner.
 */
export function rank(ids: string[], rows: Pick<Judgement, "ours" | "source" | "judge" | "beat" | "overall" | "flipped" | "complete" | "followed_order" | "axes" | "scores">[]): Ranking {
  const against = new Map(ids.map((id) => [id, {} as Record<string, number>]));
  for (const [a, b] of floorPairs(ids)) {
    const mine = rows.filter((r) => (r.ours === a && r.source === b) || (r.ours === b && r.source === a));
    // every row is read as `a` against `b`: a row that names them the other way round has its scores swapped
    const asA = mine.map((r) => r.ours === a ? r : {
      ...r, ours: a, source: b,
      scores: Object.fromEntries(Object.entries(r.scores ?? {}).map(([k, v]) => [k, { ours: v!.source, source: v!.ours }])),
    });
    const { gap } = scoreGap(asRuns(asA as Judgement[]));
    if (Number.isNaN(gap)) continue;
    against.get(a)![b] = gap;
    against.get(b)![a] = -gap;
  }
  const standings = ids.map((id) => {
    const vs = Object.values(against.get(id)!);
    return { id, score: vs.length ? vs.reduce((t, x) => t + x, 0) / vs.length : NaN, against: against.get(id)! };
  }).sort((x, y) => y.score - x.score);
  const top = standings[0]!;
  const clear = ids.length > 1 && ids.every((id) => id === top.id || (top.against[id] ?? 0) > GAP_MARGIN);
  return { standings, winner: clear ? top.id : null };
}

/** Whether a draw already has a draft to count as one of the N. */
const drafted = (d: Drafting, id: string) => d.view(id).scenes.length > 0 && ["awaiting_draft_gate", "drafted"].includes(d.p.draw(id).status);

/**
 * Draft `drawId`'s brief until there are N drafts, judge every pair, log each
 * pass and rank the drafts. The source counts as one of the N when it is
 * already drafted. Refused before anything is drafted or billed when the run is
 * badly shaped or there is no key.
 */
export async function best(d: Drafting, drawId: string, o: BestOpts = {}): Promise<BestResult> {
  const n = o.n ?? 3, passes = o.passes ?? 8, judges = o.judges ?? JUDGES;
  const why = whyNotBest({ n, passes, judges });
  if (why) throw new Error(why);
  const key = o.call?.key ?? judgeKey();
  const say = o.say ?? (() => {});
  d.p.draw(drawId);

  const version = treeVersion();
  const experiment = `best-${drawId}-${Date.now().toString(36)}`;
  const t0 = Date.now();
  const have = drafted(d, drawId) ? [drawId] : [];
  say(`${have.length ? `${drawId} is drafted; ` : ""}drafting ${n - have.length} sibling${n - have.length === 1 ? "" : "s"}`);
  const made = await Promise.all(Array.from({ length: n - have.length }, async () => {
    const s = await d.sibling(drawId);
    say(`drafted ${s.id}`);
    return s.id;
  }));
  const drafts = [...have, ...made];
  const tDraft = Date.now() - t0;

  const text = new Map(drafts.map((id) => [id, renderStory(draftView(d.p, id), false)]));
  const asks: PassAsk[] = floorPairs(drafts).flatMap(([a, b]) => judges.flatMap((judge) =>
    Array.from({ length: passes }, (_, i) => ({ ours: a, source: b, judge, pass: i + 1, flipped: i % 2 === 1 }))));
  say(`judging ${asks.length} passes over ${floorPairs(drafts).length} pairs`);
  const t1 = Date.now();
  let done = 0;
  const results: PassResult[] = await runPasses(asks,
    (a) => a.flipped ? judgePrompt(text.get(a.source)!, text.get(a.ours)!) : judgePrompt(text.get(a.ours)!, text.get(a.source)!),
    { ...o.call, key, concurrency: o.concurrency ?? 12, onPass: (r) => { if (++done % 12 === 0 || !r.complete) say(`${done}/${asks.length}${r.complete ? "" : ` failed: ${r.error}`}`); } });
  const tJudge = Date.now() - t1;

  const rows: JudgementInput[] = results.map((r) => ({
    experiment, brief: drawId, level: "L2", kind: "rank", arm: r.ours, against: r.source, ours: r.ours, source: r.source,
    judge: r.judge, pass: r.pass, flipped: r.flipped, complete: r.complete, followed_order: r.followed_order,
    axes: r.parsed.axes, scores: r.parsed.scores, overall: r.parsed.overall, cost_usd: r.cost_usd, ms: r.ms, version,
    ...(r.error ? { error: r.error } : {}),
  }));
  const logged = recordJudgements(rows, o.log ?? JUDGEMENT_LOG);
  return {
    ...rank(drafts, logged), experiment, drafts,
    cost_usd: results.reduce((t, r) => t + (r.cost_usd ?? 0), 0),
    failed: results.filter((r) => !r.complete).length,
    ms: { draft: tDraft, judge: tJudge },
  };
}
