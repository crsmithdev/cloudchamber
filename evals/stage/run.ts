/**
 * Replay one stage's stored calls with a changed setting, and put the old and
 * the new answers side by side. The inputs are the stored system prompt and
 * prompt of each call, so the two answers differ only by the setting and by the
 * model's own variance; a chain replay also differs by every call before it.
 *
 * usage: bun evals/stage/run.ts <draw> <stage> <out.json> [--effort E] [--model M] [--at N]
 *
 * `--at` is how many calls run at once (default 6). Nothing is written to the
 * store: the new answers go to <out.json> only.
 *
 * A call that forked a session stored only its ask; its history is the
 * session's, so a fresh replay of it reads less than the call did. Replay
 * draws drafted before the scenes and the binds ran in sessions (0357305).
 */
import { parseArgs } from "node:util";

const { values: o, positionals: [draw, stage, out] } = parseArgs({
  args: process.argv.slice(2), allowPositionals: true,
  options: { effort: { type: "string" }, model: { type: "string" }, at: { type: "string", default: "6" } },
});
if (!draw || !stage || !out) throw new Error("usage: bun evals/stage/run.ts <draw> <stage> <out.json> [--effort E] [--model M] [--at N]");

const { openDb } = await import("../../app/pipeline/store/db.ts");
const { ClaudeCli, tags } = await import("../../app/pipeline/model.ts");

const db = openDb();
type Row = { id: string; model: string; system_prompt: string; prompt: string; tools: string | null; raw_response: string | null; usage: string | null };
// a base call that loads a forked session holds no ask of its own; replaying it answers nothing
const rows = (db.query(`SELECT id, model, system_prompt, prompt, tools, raw_response, usage FROM steps
  WHERE draw_id = ? AND stage = ? AND status = 'done' AND prompt != '' ORDER BY started_at, rowid`).all(draw, stage) as Row[])
  .filter((r) => !r.prompt.includes("<base/>"));
if (!rows.length) throw new Error(`no stored ${stage} calls on ${draw}`);

const text = (raw: string | null) => { try { return String(JSON.parse(raw ?? "").result ?? ""); } catch { return ""; } };
const spans = (t: string) => tags(t, "finding").map((f) => tags(f, "span")[0] ?? f.slice(0, 120));
const cost = (u: string | null) => (u ? Number(JSON.parse(u).cost_usd ?? 0) : 0);

const cli = new ClaudeCli();
const results: object[] = [];
let next = 0;
await Promise.all(Array.from({ length: Number(o.at) }, async () => {
  while (next < rows.length) {
    const r = rows[next++];
    const model = o.model ?? r.model;
    const res = await cli.call(stage, r.system_prompt, r.prompt, model, r.tools ?? "", o.effort);
    const was = text(r.raw_response);
    results.push({
      step: r.id, model,
      was: { usd: cost(r.usage), usage: r.usage ? JSON.parse(r.usage) : null, findings: spans(was) },
      now: { usd: res.usage?.cost_usd ?? 0, usage: res.usage ?? null, findings: spans(res.text), error: res.error },
    });
    console.error(`${stage} ${results.length}/${rows.length}`);
  }
}));

const sum = (k: "was" | "now", f: (x: any) => number) => results.reduce((a, r: any) => a + f(r[k]), 0);
const summary = {
  draw, stage, effort: o.effort ?? null, model: o.model ?? null, calls: results.length,
  usd: { was: +sum("was", (x) => x.usd).toFixed(2), now: +sum("now", (x) => x.usd).toFixed(2) },
  thinking: { was: sum("was", (x) => x.usage?.thinking ?? 0), now: sum("now", (x) => x.usage?.thinking ?? 0) },
  findings: { was: sum("was", (x) => x.findings.length), now: sum("now", (x) => x.findings.length) },
};
await Bun.write(out, JSON.stringify({ summary, results }, null, 1));
console.error(JSON.stringify(summary));
