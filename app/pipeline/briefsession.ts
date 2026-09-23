/**
 * The calls that read a whole brief: the checkers, the ledger extraction, the
 * verify reading and the claims extraction.
 *
 * They share one cached system prompt (ADR-0010), and the cache has two rules
 * that are easy to break from a call site. A hit needs the system prompt to
 * match word for word, so every stage here must carry the same stage line —
 * `sharedLine` holds the one they share and `stagesReadingTheBrief` lists them,
 * which a test asserts against stages.toml. And a write is not readable by the
 * calls started beside it, so one call leads and the rest wait `cacheLeadMs`.
 *
 * A session holds the brief, the parent step and that lead, so a caller says
 * only what to ask.
 */
import type { Pipeline, StepRow } from "./draw.ts";
import type { StageName } from "./config.ts";
import { runSamples, type Sample } from "./sampled.ts";
import { briefBlock, type BriefParts } from "./briefparts.ts";

/** Every stage whose prompt is a whole brief, and which therefore shares the cached system prompt. */
export const stagesReadingTheBrief: StageName[] = [
  "ledger-extract", "check-derivation", "check-ledger", "check-verify", "check-structure", "check-resemblance", "check-claims-extract",
];
/** The one system line those stages carry, so their system prompts match. */
export const sharedLine = "You read a story brief and answer what is asked about it. Output only the tags asked for.";

export class BriefSession {
  readonly brief: string;
  private lead: Promise<void>;

  /** `leads` is the stage whose first call goes ahead of the rest to fill the cache. */
  constructor(readonly p: Pipeline, readonly drawId: string, private parts: BriefParts, private leads: StageName) {
    this.brief = briefBlock(parts);
    this.lead = Bun.sleep(p.cacheLeadMs);
  }

  /** Whether this call goes at once, or waits for the lead. */
  private held(stage: StageName, sample = 1): Promise<void> {
    return stage === this.leads && sample === 1 ? Promise.resolve() : this.lead;
  }

  /** One call on the brief. */
  async call<T>(stage: StageName, prompt: string, parse: (text: string) => T, opts: { parent?: string | null; tools?: string } = {}): Promise<{ step: StepRow; value: T }> {
    await this.held(stage);
    return this.p.invoke(this.drawId, opts.parent ?? this.parts.outlineStepId, stage, prompt, parse, { context: this.brief, tools: opts.tools });
  }

  /** The same ask, read `samples` times, for a checker that reports by recurrence. */
  samples<T>(stage: StageName, prompt: string, parse: (text: string, sample: number) => T, samples: number): Promise<Sample<T>[]> {
    return runSamples(this.p, {
      draw: this.drawId, parent: this.parts.outlineStepId, stage, prompt, parse, samples,
      context: this.brief, before: (n) => this.held(stage, n),
    });
  }
}
