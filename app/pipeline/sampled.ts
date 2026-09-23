/**
 * Reading a stage more than once. A checker or a screen runs S samples of one
 * ask and the answers are pooled by recurrence: findings cluster and a cluster
 * is reported when it recurs in `keep_if` samples (ADR-0008), and a question's
 * answer is present when `keep_if` samples say so. The rule was written out at
 * each of its four call sites; it lives here, and the callers say what to run
 * and what to pool.
 */
import type { Pipeline, StepRow } from "./draw.ts";
import type { StageName } from "./config.ts";
import { samples } from "./model.ts";
import { cluster, type Cluster, type Finding } from "./recur.ts";

export type Sample<T> = { step: StepRow; value: T; sample: number };
export type SampleAsk<T> = {
  draw: string;
  parent: string | null;
  stage: StageName;
  prompt: string;
  parse: (text: string, sample: number) => T;
  samples: number;
  /** Text that leads the system prompt, so a run of calls reads it from the cache (ADR-0010). */
  context?: string;
  /** Held before a sample starts, so one call can fill the cache before the rest (check.ts's lead). */
  before?: (sample: number) => Promise<void> | void;
};

/** Run the ask `samples` times at once, and return each sample's step and parsed value. */
export async function runSamples<T>(p: Pipeline, ask: SampleAsk<T>): Promise<Sample<T>[]> {
  return samples(ask.samples, async (n) => {
    await ask.before?.(n);
    return p.invoke(ask.draw, ask.parent, ask.stage, ask.prompt, (t) => ask.parse(t, n), { context: ask.context });
  });
}

/** The findings of every sample, clustered by the recurrence rule. `scope` keys the finding ids: a draw, or a draw and a beat. */
export function clusterSamples<T>(rs: Sample<T>[], findingsOf: (value: T) => Finding[], keep_if: number, scope: string): Cluster[] {
  const all = rs.flatMap((r) => findingsOf(r.value).map((f) => ({ ...f, sample: r.sample })));
  return cluster(all, keep_if, scope);
}

/** One question's answer: present when `keep_if` samples say present, with the quote of the sample that decided it. */
export function voteAnswers<A extends { answer: string; quote: string }>(rs: Sample<Record<string, A>>[], names: string[], keep_if: number): Record<string, A> {
  const out: Record<string, A> = {};
  for (const q of names) {
    const present = rs.filter((r) => r.value[q].answer === "present");
    const decided = present.length >= keep_if;
    const pick = decided ? present[0] : rs.find((r) => r.value[q].answer === "absent") ?? rs[0];
    out[q] = { ...pick.value[q], answer: decided ? "present" : "absent" };
  }
  return out;
}
