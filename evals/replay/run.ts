/**
 * Replay auto on a copy of a chain's original brief, held to the root's own
 * first ledger. The stored rounds carry amendments that answer the findings a
 * replay is meant to test, and `copyBrief` carries them, so the ledger is
 * swapped back. The code under test is the checkout this file runs from.
 *
 * usage: bun evals/replay/run.ts <source draw> <label> <out.json>
 *
 * Verdicts go to a scratch bank unless CLOUDCHAMBER_BANK names one, and every
 * draw the replay made is archived when it ends, so neither lands in `bank/`
 * or the UI. A replay a call timeout kills is run again, not read.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [src, label, out] = process.argv.slice(2);
if (!src || !label || !out) throw new Error("usage: bun evals/replay/run.ts <source draw> <label> <out.json>");
// paths.ts reads the bank when it loads, so the scratch one is set first
process.env.CLOUDCHAMBER_BANK ??= mkdtempSync(join(tmpdir(), "replay-bank-"));

const { openDb } = await import("../../app/pipeline/store/db.ts");
const { Pipeline, newDrawId } = await import("../../app/pipeline/draw.ts");
const { ClaudeCli } = await import("../../app/pipeline/model.ts");
const { Drafting } = await import("../../app/pipeline/drafting.ts");
const { copyBrief } = await import("../../app/pipeline/branch.ts");
const { commit } = await import("../../app/pipeline/lifecycle.ts");
const { chainOf } = await import("../../app/pipeline/chain.ts");

const db = openDb();
const p = new Pipeline(db, new ClaudeCli());
const d = new Drafting(p);
const id = newDrawId();
copyBrief(p, p.draw(src), id);
const base = p.artifacts(src).filter((a) => a.kind === "ledger").sort((a, b) => a.meta.pass.localeCompare(b.meta.pass))[0]!.content;
db.query("UPDATE artifacts SET content = ? WHERE kind = 'ledger' AND step_id IN (SELECT id FROM steps WHERE draw_id = ?)").run(base, id);
commit(db, { id, status: "done", ended: true });
console.error(`${label}: copy ${id} of ${src}, bank ${process.env.CLOUDCHAMBER_BANK}`);

const t0 = Date.now();
const r = await d.autoRounds(id);
const ms = Date.now() - t0;
const rounds = r.rounds.map((x) => ({
  ...x,
  kept: chainOf(p, x.id).findings(true).filter((f) => f.reported)
    .map((f) => ({ checkers: f.checkers, score: f.score, decision: f.decision, statement: f.statement, span: f.span, result: f.result })),
}));
const draws = r.rounds.map((x) => x.id);
const cost = db.query(`SELECT round(sum(json_extract(usage, '$.cost_usd')), 2) usd FROM steps WHERE draw_id IN (${draws.map(() => "?").join(",")})`).get(...draws) as { usd: number };
await Bun.write(out, JSON.stringify({ label, src, copy: id, stopped: r.stopped, final: r.id, ms, usd: cost.usd, rounds }, null, 1));
p.archive(r.id);
console.error(`${label}: ${r.stopped} after ${r.rounds.length} rounds, ${Math.round(ms / 60000)} min, $${cost.usd}`);
