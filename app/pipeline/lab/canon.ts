/**
 * The reference bind of the canon guard.
 *
 * It reads a draft's final text once, read-only, with the bind's prompt, and
 * counts the contradictions that survive into the story. It runs on its own
 * stage, `reference-bind`, so an arm that changes `screen-ledger` does not
 * change the reader that judges it. Steps and findings go on a separate
 * reference draw; the draft itself is not touched.
 */
import type { Pipeline } from "../draw.ts";
import { draftView } from "../drafts.ts";
import { chainOf } from "../chain.ts";
import { commit } from "../lifecycle.ts";
import { fill } from "../prompts.ts";
import { findingId, parseFindings, type Finding } from "../recur.ts";

export type ReferenceBindOpts = {
  record?: boolean;
  referenceDrawId?: string;
  onScene?: (beat: number, total: number, contradictions: number) => void;
};

export type ReferenceBindResult = {
  drawId: string;
  referenceDrawId: string | null;
  beats: number;
  contradictions: number;
  ratePerBeat: number;
  /** Contradictions by beat number, for the disagreement between two readings. */
  perBeat: Record<number, number>;
  findings: Finding[];
};

/**
 * A contradiction that stands. The bind answers `contradicts:<quote>`; a reply
 * that withdraws its own finding answers `contradicts:none`, and is not one.
 */
export function isContradiction(f: Finding): boolean {
  const r = f.result.toLowerCase().trim();
  if (!r.startsWith("contradict")) return false;
  const quote = r.replace(/^contradict(s|ed)?:?/, "").trim();
  return quote !== "none";
}

export async function referenceBind(p: Pipeline, drawId: string, opts: ReferenceBindOpts = {}): Promise<ReferenceBindResult> {
  const v = draftView(p, drawId);
  const scenes = [...v.scenes].sort((a, b) => a.beat - b.beat);
  if (!scenes.length) return { drawId, referenceDrawId: null, beats: 0, contradictions: 0, ratePerBeat: 0, perBeat: {}, findings: [] };

  const ledger = chainOf(p, drawId).ledger() ?? "";

  let refDrawId: string | null = null;
  if (opts.record !== false) {
    refDrawId = opts.referenceDrawId ?? `ref-${drawId}-${Date.now().toString(36)}`;
    p.copyDraw(p.draw(drawId), refDrawId, { branched_from: drawId, branch_at: "reference-bind" }, null);
  }

  // each beat is read against the ledger and the final text of the beat before it, so the reads do not wait on each other
  const reads = await Promise.all(scenes.map((sc, i) => {
    const prev = i > 0 ? scenes[i - 1] : undefined;
    const prompt = fill("screenLedger", {
      ledger,
      previous: prev ? `<previous-scene>\n${prev.text}\n</previous-scene>\n\n` : "",
      n: String(sc.beat),
      scene: sc.text,
    });
    return p.invoke(refDrawId, null, "reference-bind", prompt, (text) => parseFindings(text, "ledger", 1));
  }));

  const found: Finding[] = [];
  const perBeat: Record<number, number> = {};
  scenes.forEach((sc, i) => {
    const res = reads[i]!;
    const contradictions = res.value.filter(isContradiction);
    perBeat[sc.beat] = contradictions.length;
    for (const c of contradictions) {
      found.push(c);
      if (refDrawId) {
        p.artifact(res.step, "finding", c.statement, {
          id: findingId("ledger", c.span, `${refDrawId}/${sc.beat}`), checkers: ["ledger"], samples: [1], n: 1,
          span: c.span, statement: c.statement, result: c.result, evidence: c.evidence, invalidates: String(sc.beat),
          replacement: c.replacement, patch: c.patch, pass: "reference", source: "screen", screen: "ledger", beat: sc.beat,
        });
      }
    }
    opts.onScene?.(i + 1, scenes.length, contradictions.length);
  });
  // the reference draw holds a reading, not a draft; it ends when the reading does
  if (refDrawId) commit(p.db, { id: refDrawId, status: "done", ended: true });

  return { drawId, referenceDrawId: refDrawId, beats: scenes.length, contradictions: found.length, ratePerBeat: found.length / scenes.length, perBeat, findings: found };
}

/**
 * How far two readings of one draft disagree: the mean, over beats, of the
 * absolute difference in contradictions. A net count would let one beat's
 * extra flag cancel another beat's missing one.
 */
export function bindDisagreement(r1: ReferenceBindResult, r2: ReferenceBindResult): number {
  const beats = [...new Set([...Object.keys(r1.perBeat), ...Object.keys(r2.perBeat)])].map(Number);
  if (!beats.length) return 0;
  return beats.reduce((t, b) => t + Math.abs((r1.perBeat[b] ?? 0) - (r2.perBeat[b] ?? 0)), 0) / beats.length;
}
