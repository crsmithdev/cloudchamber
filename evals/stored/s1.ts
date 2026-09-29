/**
 * S1 read from the store: every draw with a schedule, linted for $0, no model
 * call, no draw touched. Confirms the design doc's own claim
 * (docs/specs/2026-09-28-story-ir.md §13.3: "S1 runs on stored schedules at
 * $0, per the doc's own claim") by actually running it, against the same
 * stored draws the doc's worked example and the plot-hole evals read.
 *
 * usage: bun evals/stored/s1.ts > out.json
 */
import { openDb } from "../../app/pipeline/store/db.ts";
import { chainOf } from "../../app/pipeline/chain.ts";
import { Pipeline } from "../../app/pipeline/draw.ts";
import { ClaudeCli } from "../../app/pipeline/model.ts";
import { lintS1 } from "../../app/pipeline/ir/s1.ts";

const db = openDb();
const p = new Pipeline(db, new ClaudeCli());

const draws = (db.query(`SELECT DISTINCT draw_id FROM steps s JOIN artifacts a ON a.step_id = s.id WHERE a.kind = 'schedule'`).all() as { draw_id: string }[])
  .map((r) => r.draw_id);

const t0 = Date.now();
const rows = draws.map((id) => {
  const chain = chainOf(p, id);
  const schedule = chain.schedule();
  const ledger = chain.ledger() ?? "";
  if (!schedule) return null;
  const findings = lintS1(schedule);
  const byCheck: Record<string, number> = {};
  for (const f of findings) byCheck[f.check] = (byCheck[f.check] ?? 0) + 1;
  return { draw: id, beats: schedule.beats.length, chronology: schedule.form.chronology, findings: findings.length, byCheck, detail: findings };
}).filter((r): r is NonNullable<typeof r> => r !== null);
const ms = Date.now() - t0;

const totals: Record<string, number> = {};
for (const r of rows) for (const [k, v] of Object.entries(r.byCheck)) totals[k] = (totals[k] ?? 0) + v;

console.log(JSON.stringify({
  schedules: rows.length, ms, cost_usd: 0,
  scheduleswithFindings: rows.filter((r) => r.findings > 0).length,
  totals,
  rows: rows.map(({ detail, ...r }) => r),
  detail: rows.filter((r) => r.findings > 0),
}, null, 1));
