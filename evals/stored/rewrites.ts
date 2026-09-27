/**
 * What set off each stored scene rewrite, and what the rewrites cost. No model
 * call: a rewrite's ask carries the lines it answers, so each line is read back
 * from the stored prompt.
 *
 * usage: bun evals/stored/rewrites.ts [since, default 2026-09-19]
 */
import { openDb } from "../../app/pipeline/store/db.ts";
import { STRUCTURE_RULES } from "../../app/pipeline/write.ts";
import { LENGTH_LINE, NUMERAL_LINE } from "../../app/pipeline/drafting.ts";

const since = process.argv[2] ?? "2026-09-19";
const db = openDb();
const LINES: [string, string][] = [["long sentences", LENGTH_LINE], ["numerals", NUMERAL_LINE],
  ...STRUCTURE_RULES.map((r) => [r.name, r.line] as [string, string])];

type Row = { draw_id: string; prompt: string; started_at: string; ended_at: string; usage: string | null; meta: string };
const rows = db.query(`SELECT s.draw_id, s.prompt, s.started_at, s.ended_at, s.usage, a.meta FROM steps s JOIN artifacts a ON a.step_id = s.id
  WHERE s.stage = 'scene' AND a.kind = 'scene' AND s.started_at >= ?`).all(since) as Row[];
const rewrites = rows.filter((r) => JSON.parse(r.meta).rewrite);
const drafts = new Set(rows.map((r) => r.draw_id)).size;

const by: Record<string, { n: number; alone: number }> = {};
let usd = 0, sec = 0;
for (const r of rewrites) {
  const hit = LINES.filter(([, line]) => r.prompt.includes(line)).map(([name]) => name);
  // two rules can share a line; count the line once under the first name
  const names = [...new Set(hit)];
  for (const n of names) { const x = (by[n] ??= { n: 0, alone: 0 }); x.n++; if (names.length === 1) x.alone++; }
  if (!names.length) (by["a finding (gate 2)"] ??= { n: 0, alone: 0 }).n++;
  usd += r.usage ? Number(JSON.parse(r.usage).cost_usd ?? 0) : 0;
  sec += (Date.parse(r.ended_at) - Date.parse(r.started_at)) / 1000;
}
console.log(JSON.stringify({
  since, drafts, scenes: rows.length, rewrites: rewrites.length, perDraft: +(rewrites.length / drafts).toFixed(1),
  sceneCallsOnly: { usd: +usd.toFixed(2), min: +(sec / 60).toFixed(1) },
  // `alone`: the rewrites this line was the only reason for, which a ceiling on it would remove
  triggers: Object.fromEntries(Object.entries(by).sort((a, b) => b[1].n - a[1].n)),
}, null, 1));
