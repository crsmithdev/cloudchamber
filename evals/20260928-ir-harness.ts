/**
 * Head-to-head: today's check stage (gate 1, `runCheck`) against the new
 * S1+S2 IR checks (docs/specs/2026-09-28-story-ir.md), on the two stored
 * draws the design doc itself reads: `08aa` (the worked example, §3.3) and
 * `e33a` (its chain root, no replanned schedule).
 *
 * Every arm runs on a copy of the source's brief, held to the source's own
 * pinned ledger (`copyBrief`, as `evals/replay/run.ts` does), so nothing
 * about the stored draws changes and every run is against the exact ledger
 * gate 1 held them to. The new pipeline's L1/L2/L4 calls read the source's
 * stored schedule directly (no copy needed: they take it as data, not from
 * a chain), so branching does not touch the plan either.
 *
 * usage: bun evals/20260928-ir-harness.ts <out.json>
 */
import { openDb } from "../app/pipeline/store/db.ts";
import { Pipeline, newDrawId } from "../app/pipeline/draw.ts";
import { ClaudeCli } from "../app/pipeline/model.ts";
import { Drafting } from "../app/pipeline/drafting.ts";
import { copyBrief } from "../app/pipeline/branch.ts";
import { commit } from "../app/pipeline/lifecycle.ts";
import { chainOf } from "../app/pipeline/chain.ts";
import { lintS1 } from "../app/pipeline/ir/s1.ts";
import { l1Symbolize, l3Calendar, l4PlanVsLedger, l5Link } from "../app/pipeline/ir/s2.ts";

const out = process.argv[2];
if (!out) throw new Error("usage: bun evals/20260928-ir-harness.ts <out.json>");

const db = openDb();
const p = new Pipeline(db, new ClaudeCli());
// `d.check` resolves each copy draw's own config (the source's draft_config, carried by `copyBrief`'s `copyDraw`); the old
// arm needs no config of its own here.
const d = new Drafting(p);

const SOURCES = { "08aa": "20260928150655-08aa", e33a: "20260928025449-e33a" } as const;
const MODEL_ARMS: Record<string, string> = { "claude-opus-5 (default)": "claude-opus-5", "claude-sonnet-5 (cheaper)": "claude-sonnet-5" };

/** A fresh copy of `src`'s brief, held to its pinned ledger — a fresh brief for a fresh check pass, exactly `evals/replay/run.ts`'s setup. */
function copySource(srcId: string): { id: string; outlineStepId: string } {
  const src = p.draw(srcId);
  const newId = newDrawId();
  const oStep = copyBrief(p, src, newId);
  const base = p.artifacts(srcId).filter((a) => a.kind === "ledger").sort((a, b) => a.meta.pass.localeCompare(b.meta.pass))[0]!.content;
  db.query("UPDATE artifacts SET content = ? WHERE kind = 'ledger' AND step_id IN (SELECT id FROM steps WHERE draw_id = ?)").run(base, newId);
  commit(db, { id: newId, status: "done", ended: true });
  return { id: newId, outlineStepId: oStep.id };
}

/** Cost, wall time and the distinct models a copy draw's steps actually ran under. */
function usageOf(drawId: string, ms: number) {
  const steps = db.query("SELECT stage, model, usage FROM steps WHERE draw_id = ? AND status = 'done'").all(drawId) as { stage: string; model: string; usage: string | null }[];
  const cost = steps.reduce((a, s) => a + (s.usage ? JSON.parse(s.usage).cost_usd ?? 0 : 0), 0);
  return { ms, usd: +cost.toFixed(4), calls: steps.length, models: [...new Set(steps.map((s) => s.model))], stages: [...new Set(steps.map((s) => s.stage))] };
}

async function runOld(srcId: string) {
  const copy = copySource(srcId);
  const t0 = Date.now();
  const result = await d.check(copy.id);
  const ms = Date.now() - t0;
  const findings = result.findings.map((f) => ({ checkers: f.checkers, span: f.span, statement: f.statement, result: f.result }));
  const usage = usageOf(copy.id, ms);
  p.archive(copy.id);
  return { ...usage, findings };
}

async function runNew(srcId: string, model: string) {
  const srcChain = chainOf(p, srcId);
  const ledger = srcChain.ledger() ?? "";
  const schedule = srcChain.schedule();
  if (!schedule) throw new Error(`${srcId}: no schedule`);
  const copy = copySource(srcId);
  p.setModels(copy.id, { "ir-symbolize": model, "ir-plan-ledger": model, "check-claims-verify": model, "check-claims-confirm": model });

  const t0 = Date.now();
  const s1 = lintS1(schedule);
  const { step: l1step, symbols } = await l1Symbolize(p, copy.id, copy.outlineStepId, ledger, "harness");
  const l3 = l3Calendar(symbols);
  const { findings: l4 } = await l4PlanVsLedger(p, copy.id, l1step.id, symbols, schedule, "harness");
  l5Link(schedule); // $0, data only; not scored
  const ms = Date.now() - t0;

  const usage = usageOf(copy.id, ms);
  p.archive(copy.id);
  return {
    ...usage,
    s1: { count: s1.length, findings: s1 },
    symbols: symbols.map((s) => ({ id: s.id, kind: s.kind, from: s.from, resolved: s.resolved ?? null })),
    l3: { count: l3.length, findings: l3 },
    l4: { count: l4.length, findings: l4.map((f) => ({ span: f.span, statement: f.statement, result: f.result, evidence: f.evidence, invalidates: f.invalidates })) },
  };
}

const results: Record<string, unknown> = {};
for (const [label, srcId] of Object.entries(SOURCES)) {
  console.error(`${label}: old pipeline (gate 1, runCheck)...`);
  const old = await runOld(srcId);
  console.error(`${label}: old — ${old.calls} calls, $${old.usd}, ${Math.round(old.ms / 1000)}s, ${old.findings.length} findings`);

  const newArms: Record<string, unknown> = {};
  for (const [armLabel, model] of Object.entries(MODEL_ARMS)) {
    console.error(`${label}: new pipeline (S1+S2) under ${armLabel}...`);
    const arm = await runNew(srcId, model);
    console.error(`${label}: new/${armLabel} — ${arm.calls} calls, $${arm.usd}, ${Math.round(arm.ms / 1000)}s, s1=${arm.s1.count} l3=${arm.l3.count} l4=${arm.l4.count}`);
    newArms[armLabel] = arm;
  }
  results[label] = { old, new: newArms };
}

await Bun.write(out, JSON.stringify(results, null, 1));
console.error(`written to ${out}`);
