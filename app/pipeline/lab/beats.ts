/**
 * L1: judging one beat against another.
 *
 * Two drafts that share a schedule have the same beat `k` — the same planned
 * job, the same place in the same story — so a pair of them varies only the
 * prose. That is what `cloudchamber branch` produces and what L2 cannot: at L2
 * two drafts of one arm differ about twice as much as two arms do, and almost
 * all of it is one draft telling a different story
 * (`evals/20260924-draft-variance-dominates.md`).
 *
 * Nothing here calls a model. It turns two draws into the passes the judge
 * client runs, and reads the results back.
 */
import type { Pipeline } from "../draw.ts";
import { chainOf } from "../chain.ts";
import type { PassAsk } from "./judge.ts";
import { beatAxes, type BeatPlan } from "./rubric.ts";

/** One beat of one draw: its plan, its prose, and what came before it. */
export type BeatText = { drawId: string; n: number; last: number; plan: BeatPlan; text: string; soFar: string };

/** The beats of a draft, in order, each with the story before it. */
export function beatsOf(p: Pipeline, drawId: string): BeatText[] {
  const chain = chainOf(p, drawId);
  const schedule = chain.schedule();
  if (!schedule) throw new Error(`draw ${drawId} has no schedule`);
  const scenes = chain.scenes();
  const last = schedule.beats.length;
  const out: BeatText[] = [];
  for (const b of schedule.beats) {
    const scene = scenes.find((s) => s.beat === b.n);
    if (!scene) continue;
    out.push({
      drawId, n: b.n, last,
      plan: { n: b.n, job: b.job, known: b.known, stakes: b.stakes },
      text: scene.text,
      soFar: scenes.filter((s) => s.beat < b.n).map((s) => s.text).join("\n\n"),
    });
  }
  return out;
}

/**
 * The beats two drafts share, by number. A pair is only a pair when both drafts
 * planned that beat the same way: a branch pins the schedule, so they do, and
 * two independent drafts of one brief do not. The job text is the test, because
 * that is what the judge is shown as the plan.
 */
export function sharedBeats(a: BeatText[], b: BeatText[]): { n: number; a: BeatText; b: BeatText }[] {
  const byN = new Map(b.map((x) => [x.n, x]));
  const out: { n: number; a: BeatText; b: BeatText }[] = [];
  for (const x of a) {
    const y = byN.get(x.n);
    if (y && y.plan.job === x.plan.job) out.push({ n: x.n, a: x, b: y });
  }
  return out;
}

/** Why a pair of drafts cannot be judged at L1, or null when it can. */
export function whyNotL1(a: BeatText[], b: BeatText[]): string | null {
  if (!a.length || !b.length) return "one of the drafts has no scenes";
  if (a[0]!.last !== b[0]!.last) return `the drafts have different schedules: ${a[0]!.last} beats against ${b[0]!.last}`;
  const shared = sharedBeats(a, b);
  if (!shared.length) return "the drafts share no beat with the same plan; L1 needs two drafts of one schedule (see `cloudchamber branch`)";
  if (shared.length < a[0]!.last) return `only ${shared.length} of ${a[0]!.last} beats share a plan; the drafts were not branched from one schedule`;
  return null;
}

/**
 * The passes to run for one beat pair: every judge, `passes` times, half in
 * each reading order. `ours` and `source` name the beat, not the draw, so a
 * result can be read back to the beat it judged.
 */
export function beatPasses(pair: { n: number; a: BeatText; b: BeatText }, judges: string[], passes = 4): PassAsk[] {
  return judges.flatMap((judge) =>
    Array.from({ length: passes }, (_, i) => ({
      ours: `${pair.a.drawId}#${pair.n}`,
      source: `${pair.b.drawId}#${pair.n}`,
      judge, pass: i + 1, flipped: i % 2 === 1,
    })));
}

/** The axes a beat pair's replies must answer, for `beatComplete`. */
export const axesFor = (pair: { n: number; a: BeatText }) => beatAxes(pair.n, pair.a.last);
