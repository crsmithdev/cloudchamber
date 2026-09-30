/**
 * Stage 2: repair. A repair is a new draw linked to the one it repairs. The
 * chosen vignette, the ending and each context vignette survive as material
 * and are rewritten from themselves only when an operator's instruction names
 * them. The outline is never rewritten: the repaired draw carries the chain's
 * contract — the root's outline with every accepted fix appended. Nothing is
 * regenerated from the premise.
 */
import { type StageName } from "./config.ts";
import { newDrawId, type DrawRow, type Pipeline } from "./draw.ts";
import { fill } from "./prompts.ts";
import { writeBrief } from "./brief.ts";
import { act, commit } from "./lifecycle.ts";
import { briefParts, partOf, partsIn, partsOf, revisePart, type Part } from "./briefparts.ts";
import { chainOf, type FindingView, type Settled } from "./chain.ts";
import { same } from "./recur.ts";

/** What a repair needs of an operator's instruction: the parts it names and its text. */
export type Accepted = Pick<FindingView, "id" | "span" | "statement" | "replacement"> & { parts: string[] };

/** Where a span sits in a text — word for word first, then ignoring how its whitespace was broken — or null. */
function looseIndex(text: string, span: string): { from: number; to: number } | null {
  const exact = text.indexOf(span);
  if (exact >= 0) return { from: exact, to: exact + span.length };
  const words = span.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return null;
  const m = new RegExp(words.join("\\s+"), "i").exec(text);
  return m ? { from: m.index, to: m.index + m[0].length } : null;
}

/**
 * Apply the findings that carry a patch straight to the text, and report which
 * ones landed. A patch is the span rewritten to stand in its place, so this is
 * a substitution and costs no model call. The scene screen patches a scene
 * this way.
 */
export function applyPatches<T extends { span: string; patch: string }>(text: string, accepted: T[]): { text: string; applied: T[] } {
  let out = text;
  const applied: T[] = [];
  for (const f of accepted) {
    if (!f.patch.trim() || !f.span.trim()) continue;
    const at = looseIndex(out, f.span);
    if (!at) continue;
    out = out.slice(0, at.from) + f.patch + out.slice(at.to);
    applied.push(f);
  }
  return { text: out, applied };
}

export const constraintsBlock = (accepted: Pick<Accepted, "replacement">[]) => fill("constraints", { constraints: accepted.map((f) => `- ${f.replacement}`).join("\n") });

/** The fixes accepted in earlier rounds, which the repair must keep true rather than trade away. */
const settledBlock = (settled: Settled[]) =>
  settled.length ? fill("settled", { settled: settled.map((sc) => `- ${sc.replacement}`).join("\n") }) : "";

/**
 * Create the repaired draw and write its brief. Returns the new draw, a brief
 * not yet drafted. The source is marked repaired and superseded; the caller
 * drafts the new draw. A repair that fails leaves the source at the plan gate.
 */
export async function repair(p: Pipeline, drawId: string, accepted: Accepted[]): Promise<DrawRow> {
  const parts = briefParts(p, drawId);
  const src = parts.draw;
  const newId = newDrawId();
  p.copyDraw(src, newId, { repaired_from: drawId }, src.gate_method);
  // the new round and its source settle together: a crash between them left a chain with two tips
  await act(p.db, [{ id: drawId, during: "repairing", back: "awaiting_plan_gate" }, { id: newId, during: "running", back: "failed" }],
    () => develop(p, newId, parts, accepted),
    () => [{ id: newId, status: "done", ended: true }, { id: drawId, status: "repaired", ended: true, links: { superseded_by: newId } }]);
  return p.draw(newId);
}

type Keyed = Part & { key: string };

async function develop(p: Pipeline, newId: string, parts: ReturnType<typeof briefParts>, accepted: Accepted[]) {
  const src = partsOf(p, parts.draw.id);
  const contexts = partsIn(src, "context");
  const keyed = [{ ...partOf(src, "vignette")!, key: "vignette" }, { ...partOf(src, "ending")!, key: "ending" }, ...contexts.map((c) => ({ ...c, key: `context ${c.index}` }))];
  const [vignette, ending, ...keyedContexts] = keyed;
  const chain = chainOf(p, parts.draw.id);
  // the accepted set of this round is not the whole record: every earlier round's fix still holds.
  // A fix this round re-opens is this round's constraint, not also a settled line the repair must keep
  const settledLines = chain.settled().filter((sc) => !accepted.some((a) => same(a, sc)));
  const settled = settledBlock(settledLines);
  // the repair writes against the same pinned contract the check will hold it to
  const pinned = chain.ledger();
  const ledger = pinned ? fill("pinnedLedger", { ledger: pinned }) : "";
  const { setting } = p.loadDrawSetting(parts.draw);
  // a repair rewrites one passage against constraints it is given; the six example passages set
  // voice for a first draft and buy nothing here. repair-ending was the pipeline's largest prompt.
  const rewriteAsk = (stage: "execute" | "ending", ask: string) => {
    const slice = p.settingFor(stage, setting)?.slice;
    return slice ? `${slice}\n\n${ask}` : ask;
  };
  // the instructions that name a part, as the revise ask lists them
  const instructionsFor = (key: string) => accepted.filter((f) => f.parts.includes(key)).map((f) => `- ${f.replacement}`).join("\n");
  const passageAsk = (x: Keyed) => rewriteAsk("execute", fill("reviseVignette", { ledger, settled, vignette: x.text, instructions: instructionsFor(x.key) }));
  // one part of the repaired brief: rewritten from itself under the instructions that name it, carried otherwise
  const revise = (x: Keyed, o: { parent: string | null; rewrite: StageName; carry: StageName; prompt: (x: Keyed) => string; meta?: Record<string, unknown>; previous?: string }) =>
    revisePart(p, {
      drawId: newId, parent: o.parent, role: x.role, from: x.stepId, text: x.text, meta: o.meta ?? x.meta, previous: o.previous,
      rewrite: instructionsFor(x.key) ? { stage: o.rewrite, prompt: o.prompt(x) } : undefined, carry: { stage: o.carry },
    });

  // the chosen vignette first: the outline hangs from it
  const { step: vStep } = await revise(vignette, { parent: null, rewrite: "repair-vignette", carry: "repair-vignette", prompt: passageAsk });
  commit(p.db, { id: newId, links: { chosen_step: vStep.id } });

  // the outline is the chain's contract, carried: the root's with every accepted fix appended, the text the check
  // holds the prose to. Re-deriving it each round wrote lines no author wrote and no checker read, and on the pit
  // chain the next round rewrote the author's line to match one of them
  const { step: outlineStep, text: outline } = await revisePart(p, {
    drawId: newId, parent: vStep.id, role: "outline", from: parts.outlineStepId, text: chain.outline(),
    meta: { ...partOf(src, "outline")!.meta, constraints: accepted.map((f) => f.replacement), accepted: accepted.map((f) => f.id) },
    carry: { stage: "repair-outline" },
  });

  // the context vignettes keep their jobs: each is rewritten from itself when a finding lands in it, carried otherwise
  contexts.forEach((c, i) => p.artifact(outlineStep, "job", c.meta.job as string, { index: i + 1, copied: true }));
  await Promise.all([
    ...keyedContexts.map((x, i) => revise(x, { parent: outlineStep.id, rewrite: "repair-context", carry: "context", prompt: passageAsk, meta: { index: i + 1, job: x.meta.job } })),
    revise(ending, {
      parent: outlineStep.id, rewrite: "repair-ending", carry: "repair-ending", previous: parts.ending,
      prompt: (x) => rewriteAsk("ending", fill("reviseEnding", { ledger, settled, outline, ending: x.text, instructions: instructionsFor(x.key) })),
    }),
  ]);

  // this round's accepted findings are already listed under ## repaired_from
  const dir = writeBrief(p.db, newId, p.briefsDir, settledLines);
  p.artifact(outlineStep, "brief", dir, { repaired_from: parts.draw.id });
}
