import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../pipeline/store/db.ts";
import { FakeModel } from "../pipeline/model.ts";
import { Pipeline } from "../pipeline/run.ts";
import { buildApi } from "./api.ts";

const CELLS = ["informational", "mixed", "involved"].flatMap((v) => ["non-narrative", "mixed", "narrative"].map((m) => [v, m]));
const premises = `<premise><text>P1</text><probability>0.05</probability></premise><premise><text>P2</text><probability>0.02</probability></premise><premise><text>P3</text><probability>0.08</probability></premise><premise><text>P4</text><probability>0.03</probability></premise><premise><text>P5</text><probability>0.06</probability></premise>`;
const outline = `<section name="debt audit">a</section><section name="arithmetic">b</section><section name="custody">c</section>`;

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "fogbelt-api-"));
  const db = openDb(join(dir, "t.db"));
  db.exec(`INSERT INTO sources (id, path, reader, genre) VALUES ('scp', 'x', 'scp', 'horror'), ('d1', 'y', 'pdf', 'horror')`);
  db.exec(`INSERT INTO stories (id, source_id, ord, title, author, genre, words, text) VALUES ('scp/a', 'scp', 0, 'A', 'Ann', 'horror', 9000, 'x'), ('d1/b', 'd1', 0, 'B', 'Bob', 'horror', 9000, 'y')`);
  const ins = db.query("INSERT INTO passages (id, story_id, text, words, stratum, position, seed, first_seen, voice, mode) VALUES (?, ?, ?, 200, 0, 0, 0, 'now', ?, ?)");
  CELLS.forEach(([v, m], i) => { ins.run(`a${i}`, "scp/a", `passage a${i}`, v, m); ins.run(`b${i}`, "d1/b", `passage b${i}`, v, m); });
  db.exec(`INSERT INTO themes (id, text, attestation, stories, drafted_at) VALUES ('t1', 'A theme.', 1, '["scp/a"]', 'now')`);
  const model = new FakeModel({
    premises: () => premises, execute: (p: string) => `<vignette>${/Premise: (P\d)/.exec(p)?.[1]} ${"w ".repeat(400)}</vignette>`,
    outline: () => outline, jobs: () => "<job>one thing</job><job>another thing</job>",
    context: () => "<vignette>ctx</vignette>", ending: () => "<ending>end</ending>",
  });
  const pipeline = new Pipeline(db, model, { packetsDir: join(dir, "packets"), rng: () => 0.001 });
  const app = buildApi(db, pipeline);
  const j = async (method: "GET" | "POST", url: string, body?: unknown) => {
    const r = await app.inject({ method, url, payload: body as any });
    return { code: r.statusCode, body: r.json() };
  };
  return { db, app, pipeline, j };
}

describe("api", () => {
  test("queue, verdict, items and filters", async () => {
    const { j } = await setup();
    let q = await j("GET", "/api/queue?kind=example&n=2");
    expect(q.body.remaining).toBe(18);
    expect(q.body.items).toHaveLength(2);
    expect(new Set(q.body.items.map((i: any) => i.source))).toEqual(new Set(["scp", "d1"]));   // round-robin
    const first = q.body.items[0];
    const v = await j("POST", "/api/verdicts", { kind: "example", target_id: first.id, verdict: "pass", method: "queue" });
    expect(v.code).toBe(200);
    expect(v.body).toMatchObject({ kind: "example", target_id: first.id, verdict: "pass", artifact: false });
    q = await j("GET", "/api/queue?kind=example");
    expect(q.body.remaining).toBe(17);
    expect(q.body.items[0].id).not.toBe(first.id);
    await j("POST", "/api/verdicts", { kind: "example", target_id: "a1", verdict: "keep", artifact: true, note: "header" });
    expect((await j("GET", "/api/items?kind=example&verdict=pass")).body.total).toBe(1);
    expect((await j("GET", "/api/items?kind=example&artifact=true")).body.total).toBe(1);
    expect((await j("GET", "/api/items?kind=example&source=scp&verdict=unreviewed")).body.total).toBe(first.source === "scp" ? 7 : 8);
    expect((await j("GET", "/api/items?kind=example&cell=mixed/narrative")).body.total).toBe(2);
    expect((await j("GET", "/api/items?kind=example&author=Bob")).body.total).toBe(9);
    expect((await j("GET", "/api/items?kind=theme")).body.total).toBe(1);
    const bad = await j("POST", "/api/verdicts", { kind: "example", target_id: "x", verdict: "maybe" });
    expect(bad.code).toBe(400);
  });

  test("a passed story row hides its passages from queue, browser and draw", async () => {
    const { j } = await setup();
    const stories = await j("GET", "/api/items?kind=story");
    expect(stories.body.total).toBe(2);
    expect(stories.body.items[0]).toMatchObject({ id: "d1/b", text: "B", author: "Bob", source: "d1", passages: 9, latest: null });
    const v = await j("POST", "/api/verdicts", { kind: "story", target_id: "d1/b", verdict: "pass", method: "browse", note: "translation" });
    expect(v.code).toBe(200);
    expect(v.body).toMatchObject({ kind: "story", target_id: "d1/b", verdict: "pass", method: "browse" });
    expect((await j("GET", "/api/items?kind=example")).body.total).toBe(9);
    expect((await j("GET", "/api/items?kind=example&source=d1")).body.total).toBe(0);
    expect((await j("GET", "/api/items?kind=story&verdict=pass")).body.items.map((s: any) => s.id)).toEqual(["d1/b"]);
    const q = await j("GET", "/api/queue?kind=example&n=4");
    expect(q.body.remaining).toBe(9);
    expect(new Set(q.body.items.map((i: any) => i.source))).toEqual(new Set(["scp"]));
    const status = await j("GET", "/api/status");
    expect(status.body).toMatchObject({ stories_passed: 1, passages_eligible: 9 });
    const run = await j("POST", "/api/runs", { mode: "manual", genre: "horror" });
    expect(run.code).toBe(202);
    const detail = await j("GET", `/api/runs/${run.body.id}`);
    expect(new Set(detail.body.examples.map((e: any) => e.source))).toEqual(new Set(["scp"]));   // the draw skips the passed story
  });

  test("queue serves suspects first, only suspects, or a plain sample", async () => {
    const { j, db } = await setup();
    db.exec(`UPDATE passages SET suspect = '["hyphen"]' WHERE id IN ('a0', 'b0')`);
    db.exec(`UPDATE passages SET suspect = '["ocr","markup"]' WHERE id = 'a1'`);
    let q = await j("GET", "/api/queue?kind=example&n=5");
    expect(q.body).toMatchObject({ remaining: 18, suspects: 3 });
    expect(new Set(q.body.items.slice(0, 3).map((i: any) => i.id))).toEqual(new Set(["a0", "b0", "a1"]));
    expect(q.body.items[0].suspect).toEqual(expect.arrayContaining(["hyphen"]));
    expect(q.body.items[3].suspect).toEqual([]);
    q = await j("GET", "/api/queue?kind=example&n=5&suspect=true");
    expect(q.body.remaining).toBe(3);
    expect(q.body.items).toHaveLength(3);
    await j("POST", "/api/verdicts", { kind: "example", target_id: "a1", verdict: "keep", artifact: true, note: "ocr" });
    q = await j("GET", "/api/queue?kind=example&suspect=true");
    expect(q.body).toMatchObject({ remaining: 2, suspects: 2 });
    q = await j("GET", "/api/queue?kind=example&n=17&sample=true");
    expect(q.body.items).toHaveLength(17);
    expect(q.body.items.filter((i: any) => i.suspect.length)).toHaveLength(2);
    expect((await j("GET", "/api/items?kind=example&suspect=true")).body.total).toBe(3);
    expect((await j("GET", "/api/items?kind=example&suspect=false")).body.total).toBe(15);
  });

  test("start a manual run, read it, gate it, read the packet", async () => {
    const { j, pipeline } = await setup();
    const started = await j("POST", "/api/runs", { mode: "manual", genre: "horror" });
    expect(started.code).toBe(202);
    const id = started.body.id;
    expect(id).toBeTruthy();
    // wait for the fake model to reach the gate
    for (let i = 0; i < 50 && pipeline.run(id).status !== "awaiting_gate"; i++) await Bun.sleep(10);
    const r = await j("GET", `/api/runs/${id}`);
    expect(r.body.run.status).toBe("awaiting_gate");
    expect(r.body.examples).toHaveLength(6);
    expect(r.body.examples[0]).toMatchObject({ text: expect.stringMatching(/^passage/), source: expect.any(String), latest: null });
    const ex = r.body.examples[0];
    await j("POST", "/api/verdicts", { kind: "example", target_id: ex.id, verdict: "pass", method: "run" });
    const after = await j("GET", `/api/runs/${id}`);
    expect(after.body.examples[0].latest).toMatchObject({ verdict: "pass" });
    expect(r.body.steps.map((s: any) => s.stage).sort()).toEqual(["execute", "execute", "execute", "execute", "execute", "premises"]);
    expect(r.body.candidates.map((c: any) => c.probability)).toEqual([0.02, 0.03, 0.05, 0.06, 0.08]);
    const flag = await j("POST", `/api/runs/${id}/gate`, { action: "flag", note: "looks wrong" });
    expect(flag.body.flagged).toBe(1);
    const chosen = await j("POST", `/api/runs/${id}/gate`, { action: "choose", step_id: r.body.candidates[1].step_id });
    expect(chosen.code).toBe(202);
    for (let i = 0; i < 50 && pipeline.run(id).status !== "done"; i++) await Bun.sleep(10);
    const done = await j("GET", `/api/runs/${id}`);
    expect(done.body.run.status).toBe("done");
    expect(done.body.run.gate_method).toBe("manual");
    expect(done.body.artifacts.filter((a: any) => a.kind === "vignette")).toHaveLength(7);   // 5 executed + 2 context
    const gateAgain = await j("POST", `/api/runs/${id}/gate`, { action: "choose", step_id: r.body.candidates[0].step_id });
    expect(gateAgain.code).toBe(400);
    expect((await j("GET", "/api/runs")).body).toHaveLength(1);
    expect((await j("GET", "/api/runs/nope")).code).toBe(404);
  });

  test("reject at the gate creates a linked run", async () => {
    const { j, pipeline } = await setup();
    const { body: { id } } = await j("POST", "/api/runs", { mode: "manual", genre: "horror", seed: "typed seed" });
    for (let i = 0; i < 50 && pipeline.run(id).status !== "awaiting_gate"; i++) await Bun.sleep(10);
    const rej = await j("POST", `/api/runs/${id}/gate`, { action: "keep-seed", note: "flat" });
    expect(rej.code).toBe(202);
    expect(rej.body.superseded).toBe(id);
    expect(pipeline.run(id).status).toBe("rejected");
    expect(pipeline.run(rej.body.id).seed_text).toBe("typed seed");
  });

  test("a bad run request is a 400 with the reason", async () => {
    const { j, db } = await setup();
    db.exec("DELETE FROM passages WHERE story_id = 'd1/b'");
    db.exec("DELETE FROM passages WHERE id IN ('a0','a1','a2','a3')");
    const r = await j("POST", "/api/runs", { mode: "auto", genre: "horror" });
    expect(r.code).toBe(400);
    expect(r.body.error).toMatch(/only 5 eligible passages/);
  });
});
