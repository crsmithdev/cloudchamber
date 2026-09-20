/**
 * Stage 2: repair. A repair is a new draw linked to the one it repairs. The
 * chosen vignette, the ending and each context vignette survive as material
 * and are rewritten from themselves only when an accepted finding lands in
 * them. The outline is never rewritten: the repaired draw carries the chain's
 * contract — the root's outline with every accepted fix appended — which is
 * the same text the check holds the prose to. Nothing is regenerated from the
 * premise.
 *
 * Every regenerated word is a new surface for the next check to find a
 * contradiction in, so a repair rewrites as little as the findings allow.
 */
import { RUN, type PartRole, type StageName } from "./config.ts";
import { newDrawId, type DrawRow, type Pipeline } from "./draw.ts";
import { fill } from "./prompts.ts";
import { writeBrief } from "./brief.ts";
import { settle, under } from "./lifecycle.ts";
import { briefParts, partOf, partsIn, partsOf, revisePart, type Part } from "./briefparts.ts";
import { chainOf, type FindingView, type Settled } from "./chain.ts";
import { quoted, quotesOf, same } from "./recur.ts";

/** What a repair needs of an accepted finding: where it is, what it says, what replaces it, and the patch when the fix is the span alone. */
export type Accepted = Pick<FindingView, "id" | "span" | "statement" | "result" | "invalidates" | "replacement" | "patch">;
export const hasPatch = (f: Pick<Accepted, "patch">): boolean => !!f.patch.trim();

// as loose as the checker that quoted it, so a span the verify pass kept is found here too
const inside = (span: string, text: string) => !span.trim() || quoted(text, span, 1);

/**
 * Whether a finding lands in a passage: its span is there, or, for a finding with
 * no patch, the second quote its result names is. A patch settles the conflict on
 * the span's side; without one the fix can need the other side, and on the fresh
 * draw of 2026-09-17 a constraint given only to the span's passage was met by
 * restating the span there while the conflicting half stayed in the ending.
 * Quotes in the evidence do not count: on the pit chain one of those carried a
 * registry row's fix into a notebook entry.
 */
export function landsIn(f: Accepted, text: string): boolean {
  if (inside(f.span, text)) return true;
  if (hasPatch(f)) return false;
  const second = quotesOf({ result: f.result, evidence: "" })[0];
  return !!second && quoted(text, second);
}

/** Where a span sits in a text — word for word first, then ignoring how its whitespace was broken — or null. */
export function looseIndex(text: string, span: string): { from: number; to: number } | null {
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
 * a substitution and costs no model call. Every word a repair regenerates is a
 * new surface for the next check to find a contradiction in, and a whole-brief
 * rewrite to fix a date is what kept a chain at 7 to 10 findings for eleven
 * rounds.
 */
export function applyPatches<T extends Accepted>(text: string, accepted: T[]): { text: string; applied: T[] } {
  let out = text;
  const applied: T[] = [];
  for (const f of accepted) {
    if (!hasPatch(f) || !f.span.trim()) continue;
    const at = looseIndex(out, f.span);
    if (!at) continue;
    out = out.slice(0, at.from) + f.patch + out.slice(at.to);
    applied.push(f);
  }
  return { text: out, applied };
}

const NAME = /\b\p{Lu}[\p{L}'’.-]{2,}/gu;
// case is folded: a header's BRIGHTWELL and a line's Brightwell are one name
const namesIn = (t: string) => new Set((t.match(NAME) ?? []).map((n) => n.toLowerCase()));

/**
 * A patch renames one mention. When it takes out a name that the rest of its
 * passage still uses and puts another in, the passage ends up with both: on a
 * fresh draw "Clearwater held the contract" became "Brightwell held the
 * contract" beside "the Clearwater cart". Such a patch is not applied, and the
 * finding repairs its passage as a whole.
 */
export function localPatch(f: Accepted, passages: string[]): boolean {
  if (!hasPatch(f)) return false;
  const passage = passages.find((t) => inside(f.span, t));
  if (!passage) return true;
  const before = namesIn(f.span), after = namesIn(f.patch);
  const added = [...after].filter((n) => !before.has(n));
  if (!added.length) return true;
  // the span comes out the way the patch would take it out, so a loosely quoted span reads the same here as there
  const at = looseIndex(passage, f.span);
  const rest = namesIn(at ? `${passage.slice(0, at.from)} ${passage.slice(at.to)}` : passage);
  return ![...before].some((n) => !after.has(n) && rest.has(n));
}

/** A passage a repair may rewrite: its role and its text, with whatever else the caller carries (a Part, in the repair). */
export type Passage = { role: PartRole; text: string };
/** The passage as the accepted findings place themselves in it: the text with its patches in, what landed, what constrains a rewrite, and whether one runs. */
export type Placed<P extends Passage = Passage> = P & { applied: Accepted[]; constraints: Accepted[]; rewrite: boolean };

/**
 * Where each accepted finding goes, decided once for every passage: patched
 * into the passage that holds its span, a constraint on every passage it lands
 * in, and a rewrite of any passage a patch could not settle. A finding that
 * invalidates one of the sections the ending is derived from moves the
 * mechanism, so the ending is rewritten under it wherever its span sits. The
 * passages come back in the order given, each with its placement.
 */
export function place<P extends Passage>(accepted: Accepted[], passages: P[]): Placed<P>[] {
  const texts = passages.map((x) => x.text);
  // a patch that would leave its passage with two names for one thing repairs the passage instead
  const usable = accepted.map((f) => (hasPatch(f) && !localPatch(f, texts) ? { ...f, patch: "" } : f));
  const patched = texts.map((t) => applyPatches(t, usable));
  const landed = new Set(patched.flatMap((x) => x.applied.map((f) => f.id)));
  // a patch whose span matches no text is a rewrite: the checker's quote matching is looser than the substitution
  const unpatchable = usable.filter((f) => !landed.has(f.id));
  const movesEnding = unpatchable.filter((f) => (RUN.endingJobs as readonly string[]).includes(f.invalidates.toLowerCase()));
  // a passage takes only the constraints that land in it: on the pit chain a vignette rewrite given a registry
  // row's constraint ("every haul, including number 219's") made Ruth number 219
  return passages.map((x, i) => {
    const extra = x.role === "ending" ? movesEnding : [];
    const own = usable.filter((f) => landsIn(f, texts[i]));
    return { ...x, text: patched[i].text, applied: patched[i].applied, constraints: [...own, ...extra.filter((f) => !own.includes(f))], rewrite: unpatchable.some((f) => landsIn(f, texts[i])) || extra.length > 0 };
  });
}

export const constraintsBlock = (accepted: Pick<Accepted, "replacement">[]) => fill("constraints", { constraints: accepted.map((f) => `- ${f.replacement}`).join("\n") });

/** The fixes accepted in earlier rounds, which the repair must keep true rather than trade away. */
export const settledBlock = (settled: Settled[]) =>
  settled.length ? fill("settled", { settled: settled.map((sc) => `- ${sc.replacement}`).join("\n") }) : "";

/**
 * Create the repaired draw and write its brief. Returns the new draw, a brief
 * nobody has checked yet. The source is marked repaired and superseded; the
 * caller runs the check. A repair that fails leaves the source at its gate.
 */
export async function repair(p: Pipeline, drawId: string, accepted: Accepted[]): Promise<DrawRow> {
  const parts = briefParts(p, drawId);
  const src = parts.draw;
  const newId = newDrawId();
  p.copyDraw(src, newId, { repaired_from: drawId }, src.gate_method);
  await under(p.db, drawId, "repairing", "awaiting_check_gate", () => under(p.db, newId, "running", "failed", () => develop(p, newId, parts, accepted)));
  settle(p.db, newId, "done", { ended: true });
  settle(p.db, drawId, "repaired", { ended: true });
  p.db.query("UPDATE draws SET superseded_by = ? WHERE id = ?").run(newId, drawId);
  return p.draw(newId);
}

async function develop(p: Pipeline, newId: string, parts: ReturnType<typeof briefParts>, accepted: Accepted[]) {
  const src = partsOf(p, parts.draw.id);
  const contexts = partsIn(src, "context");
  const [vignette, ending, ...placedContexts] = place(accepted, [partOf(src, "vignette")!, partOf(src, "ending")!, ...contexts]);
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
  const passageAsk = (x: Placed) => rewriteAsk("execute", fill("repairVignette", { ledger, settled, vignette: x.text, constraints: constraintsBlock(x.constraints) }));
  // one part of the repaired brief: rewritten from itself under its constraints when a finding lands in it, carried otherwise
  const revise = (x: Placed<Part>, o: { parent: string | null; rewrite: StageName; carry: StageName; prompt: (x: Placed) => string; meta?: Record<string, unknown>; previous?: string }) =>
    revisePart(p, {
      drawId: newId, parent: o.parent, role: x.role, from: x.stepId, text: x.text, applied: x.applied.map((f) => f.id), meta: o.meta ?? x.meta, previous: o.previous,
      rewrite: x.rewrite ? { stage: o.rewrite, prompt: o.prompt(x) } : undefined, carry: { stage: o.carry },
    });

  // the chosen vignette first: the outline hangs from it
  const { step: vStep } = await revise(vignette, { parent: null, rewrite: "repair-vignette", carry: "repair-vignette", prompt: passageAsk });
  p.db.query("UPDATE draws SET chosen_step = ? WHERE id = ?").run(vStep.id, newId);

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
    ...placedContexts.map((x, i) => revise(x, { parent: outlineStep.id, rewrite: "repair-context", carry: "context", prompt: passageAsk, meta: { index: i + 1, job: x.meta.job } })),
    revise(ending, {
      parent: outlineStep.id, rewrite: "repair-ending", carry: "repair-ending", previous: parts.ending,
      prompt: (x) => rewriteAsk("ending", fill("repairEnding", { ledger, settled, outline, ending: x.text, constraints: constraintsBlock(x.constraints) })),
    }),
  ]);

  // this round's accepted findings are already listed under ## repaired_from
  const dir = writeBrief(p.db, newId, p.briefsDir, settledLines);
  p.artifact(outlineStep, "brief", dir, { repaired_from: parts.draw.id });
}
