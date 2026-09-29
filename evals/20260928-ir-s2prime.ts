/**
 * S2′ (docs/specs/2026-09-28-story-ir.md §14.5): repeat and plant.
 *
 *   A. `08aa`'s stored plan, five runs of L1 + L3 + L4 under claude-opus-5:
 *      does L4 name the delegation line each time?
 *   B. `e33a`'s stored plan with five planted conflicts in its <known>
 *      lines, five runs under claude-opus-5: recall on the six known
 *      conflicts (five planted, plus the plan's own "Holt's seat eleven
 *      feet from the leaf", §14.2), and every other finding printed for a
 *      person to read.
 *   C. L4 alone under claude-sonnet-5, three runs on run A1's symbol table:
 *      was the sonnet delegation miss the model or the finding cap (red
 *      team F2)? The calendar is out of L4's remit now (`irPlanLedger`), so
 *      the cap has room.
 *
 * Every run is on a fresh copy of the source's brief (`copyBrief`), archived
 * after; the stored draws are read, never written. L2 is not run (§14.4).
 *
 * usage: bun evals/20260928-ir-s2prime.ts <out.json>
 */
import { openDb } from "../app/pipeline/store/db.ts";
import { Pipeline, newDrawId } from "../app/pipeline/draw.ts";
import { ClaudeCli } from "../app/pipeline/model.ts";
import { copyBrief } from "../app/pipeline/branch.ts";
import { commit } from "../app/pipeline/lifecycle.ts";
import { chainOf } from "../app/pipeline/chain.ts";
import { lintS1 } from "../app/pipeline/ir/s1.ts";
import { l1Symbolize, l3Calendar, l4PlanVsLedger, type Sym } from "../app/pipeline/ir/s2.ts";
import type { Schedule } from "../app/pipeline/write.ts";

const out = process.argv[2];
if (!out) throw new Error("usage: bun evals/20260928-ir-s2prime.ts <out.json>");
const BUDGET_USD = 6;

const db = openDb();
const p = new Pipeline(db, new ClaudeCli());
const SRC = { "08aa": "20260928150655-08aa", e33a: "20260928025449-e33a" } as const;
const OPUS = "claude-opus-5", SONNET = "claude-sonnet-5";

function copySource(srcId: string): { id: string; outlineStepId: string } {
  const src = p.draw(srcId);
  const newId = newDrawId();
  const oStep = copyBrief(p, src, newId);
  const base = p.artifacts(srcId).filter((a) => a.kind === "ledger").sort((a, b) => a.meta.pass.localeCompare(b.meta.pass))[0]!.content;
  db.query("UPDATE artifacts SET content = ? WHERE kind = 'ledger' AND step_id IN (SELECT id FROM steps WHERE draw_id = ?)").run(base, newId);
  commit(db, { id: newId, status: "done", ended: true });
  return { id: newId, outlineStepId: oStep.id };
}

/** Cost by stage of one copy draw's model steps. */
function costOf(drawId: string): { usd: number; byStage: Record<string, number>; calls: number } {
  const steps = db.query("SELECT stage, usage FROM steps WHERE draw_id = ? AND status = 'done' AND stage LIKE 'ir-%'").all(drawId) as { stage: string; usage: string | null }[];
  const byStage: Record<string, number> = {};
  for (const s of steps) byStage[s.stage] = +((byStage[s.stage] ?? 0) + (s.usage ? JSON.parse(s.usage).cost_usd ?? 0 : 0)).toFixed(4);
  return { usd: +Object.values(byStage).reduce((a, b) => a + b, 0).toFixed(4), byStage, calls: steps.length };
}

let spent = 0;
const guard = () => { if (spent > BUDGET_USD) throw new Error(`budget: $${spent.toFixed(2)} spent, over $${BUDGET_USD}`); };

type Finding = { span: string; statement: string; result: string; evidence: string; invalidates: string };
const strip = (f: Finding) => ({ span: f.span, statement: f.statement, result: f.result, evidence: f.evidence, beat: f.invalidates });
const textOf = (f: Finding) => `${f.span} ${f.statement} ${f.evidence}`;

/** One run of L1 + L3 + L4 on `schedule`, under `model` for both calls; or L4 alone on `symbols` given. */
async function run(srcId: string, schedule: Schedule, model: string, symbols?: Sym[]) {
  const ledger = chainOf(p, srcId).ledger() ?? "";
  const copy = copySource(srcId);
  p.setModels(copy.id, { "ir-symbolize": model, "ir-plan-ledger": model });
  const t0 = Date.now();
  let syms = symbols, l1step: { id: string } | null = null;
  if (!syms) { const r = await l1Symbolize(p, copy.id, copy.outlineStepId, ledger, "s2prime"); syms = r.symbols; l1step = r.step; }
  const l3 = l3Calendar(syms, ledger);
  const { findings } = await l4PlanVsLedger(p, copy.id, l1step?.id ?? copy.outlineStepId, syms, schedule, "s2prime");
  const ms = Date.now() - t0;
  const cost = costOf(copy.id);
  spent += cost.usd; guard();
  p.archive(copy.id);
  return {
    copy: copy.id, model, ms, ...cost,
    symbols: syms.length, time: syms.filter((s) => s.kind === "time").length, counts: syms.filter((s) => s.kind === "count").map((s) => ({ id: s.id, attrs: s.attrs })),
    dace: syms.filter((s) => /dace/i.test(s.id) && s.kind === "person").map((s) => ({ id: s.id, member_of: s.attrs.member_of ?? null, role: s.attrs.role ?? null })),
    l3: l3.map((f) => ({ kind: f.kind, question: !!f.question, symbols: f.symbols, message: f.message })),
    l4: findings.map(strip), l4count: findings.length, capped: findings.length >= 10,
    _syms: syms,
  };
}

// --- A: 08aa, the delegation, five runs -------------------------------------------------
const DELEGATION = /delegation|capital|telephone|courier/i;
const s08 = chainOf(p, SRC["08aa"]).schedule()!;
const s1_08 = lintS1(s08, chainOf(p, SRC["08aa"]).ledger() ?? "");
const A: any[] = [];
for (let i = 1; i <= 5; i++) {
  console.error(`A${i}: 08aa, L1+L3+L4 under ${OPUS}...`);
  const r = await run(SRC["08aa"], s08, OPUS);
  const hit = r.l4.filter((f) => DELEGATION.test(textOf(f as Finding)));
  A.push({ ...r, delegation: hit.length > 0, delegationFindings: hit.length });
  console.error(`A${i}: $${r.usd} (${JSON.stringify(r.byStage)}), ${Math.round(r.ms / 1000)}s, syms=${r.symbols} time=${r.time} l3=${r.l3.length} l4=${r.l4count}${r.capped ? " CAPPED" : ""} delegation=${hit.length > 0}`);
}

// --- C: sonnet L4 alone on A1's symbol table, three runs ----------------------------------------
const C: any[] = [];
for (let i = 1; i <= 3; i++) {
  console.error(`C${i}: 08aa, L4 alone under ${SONNET} on A1's symbols...`);
  const r = await run(SRC["08aa"], s08, SONNET, A[0]._syms);
  const hit = r.l4.filter((f) => DELEGATION.test(textOf(f as Finding)));
  C.push({ ...r, delegation: hit.length > 0, delegationFindings: hit.length });
  console.error(`C${i}: $${r.usd}, ${Math.round(r.ms / 1000)}s, l4=${r.l4count}${r.capped ? " CAPPED" : ""} delegation=${hit.length > 0}`);
}

// --- B: e33a with five planted conflicts, five runs --------------------------------------------------
const PLANTS: { name: string; from: string; to: string; ledger: string; hit: RegExp }[] = [
  { name: "count: Wardens sixty on a shift", ledger: "forty on a standing shift (line 21)", from: "and the prohibition on saying so is older than the mission.", to: "and the sixty Wardens of the standing shift said nothing, the prohibition on saying so being older than the mission.", hit: /sixty/i },
  { name: "place: the recording room in the Hall", ledger: "a recording room under the Domus (line 22)", from: "and Pell logged probable instrument fault, tracking continues.", to: "and Pell, in the recording room kept in the Hall itself, logged probable instrument fault, tracking continues.", hit: /recording room|in the hall itself/i },
  { name: "custody: the trace in the Guild's keeping", ledger: "the Armoury holds plate seventeen (line 47)", from: "the Door's schedule, the trace, the transcript and the sixth night", to: "the Door's schedule, the trace in the Guild's keeping, the transcript and the sixth night", hit: /guild'?s keeping|trace.{0,40}guild|guild.{0,40}trace/i },
  { name: "role: Pell presides", ledger: "the Chamberlain presides (line 16); Pell is the Armoury's Deputy Recorder (line 18)", from: "in front of eleven colleagues and a stenographer.", to: "in front of eleven colleagues, the presiding Deputy Recorder Pell and a stenographer.", hit: /pell.{0,60}presid|presid.{0,60}pell/i },
  { name: "name: the twelfth seat is Ferrand's", ledger: "Mercer holds the twelfth seat (line 17)", from: "the twelfth seat is unspoken for", to: "the twelfth seat, Ferrand's, is unspoken for", hit: /ferrand.{0,60}(twelfth|seat)|(twelfth|seat).{0,60}ferrand/i },
];
const OWN = { name: "the plan's own: Holt's seat eleven feet from the leaf", hit: /holt.{0,80}eleven feet|eleven feet.{0,80}holt/i };

const sE = chainOf(p, SRC.e33a).schedule()!;
let raw = sE.raw;
const beats = sE.beats.map((b) => ({ ...b }));
for (const pl of PLANTS) {
  const n = raw.split(pl.from).length - 1;
  if (n !== 1) throw new Error(`plant "${pl.name}": span found ${n} times in the raw plan`);
  raw = raw.replace(pl.from, pl.to);
  const beat = beats.find((b) => b.known.includes(pl.from));
  if (!beat) throw new Error(`plant "${pl.name}": span not in any beat's known`);
  beat.known = beat.known.replace(pl.from, pl.to);
}
const planted: Schedule = { ...sE, raw, beats };
const B: any[] = [];
for (let i = 1; i <= 5; i++) {
  console.error(`B${i}: e33a planted, L1+L3+L4 under ${OPUS}...`);
  const r = await run(SRC.e33a, planted, OPUS);
  const recall = [...PLANTS, OWN].map((pl) => ({ name: pl.name, hit: r.l4.some((f) => pl.hit.test(textOf(f as Finding))) }));
  const other = r.l4.filter((f) => ![...PLANTS, OWN].some((pl) => pl.hit.test(textOf(f as Finding))));
  B.push({ ...r, recall, other: other.length });
  console.error(`B${i}: $${r.usd}, ${Math.round(r.ms / 1000)}s, syms=${r.symbols} l3=${r.l3.length} l4=${r.l4count}${r.capped ? " CAPPED" : ""} recall=${recall.filter((x) => x.hit).length}/6 other=${other.length}`);
}

const strip_ = (rows: any[]) => rows.map(({ _syms, ...r }) => r);
await Bun.write(out, JSON.stringify({ spent: +spent.toFixed(4), s1_08aa: s1_08, plants: PLANTS.map(({ hit, ...pl }) => ({ ...pl, hit: String(hit) })), A: strip_(A), C: strip_(C), B: strip_(B) }, null, 1));
console.error(`spent $${spent.toFixed(2)}; written to ${out}`);
