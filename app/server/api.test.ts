import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../pipeline/store/db.ts";
import { FakeModel } from "../pipeline/model.ts";
import { Pipeline } from "../pipeline/draw.ts";
import { buildApi } from "./api.ts";
import { settingsFixture } from "../pipeline/settings.fixture.ts";

const CELLS = ["informational", "mixed", "involved"].flatMap((v) => ["non-narrative", "mixed", "narrative"].map((m) => [v, m]));
const premises = `<premise><text>P1</text><probability>0.05</probability></premise><premise><text>P2</text><probability>0.02</probability></premise><premise><text>P3</text><probability>0.08</probability></premise><premise><text>P4</text><probability>0.03</probability></premise><premise><text>P5</text><probability>0.06</probability></premise>`;
const outline = `<section name="debt audit">a</section><section name="arithmetic">b</section><section name="custody">c</section>`;

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "cloudchamber-api-"));
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
  const pipeline = new Pipeline(db, model, { briefsDir: join(dir, "briefs"), rng: () => 0.001, settingsDir: settingsFixture(dir) });
  const app = buildApi(db, pipeline);
  const j = async (method: "GET" | "POST" | "DELETE", url: string, body?: unknown) => {
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
    const draw = await j("POST", "/api/draws", { mode: "manual", genre: "horror" });
    expect(draw.code).toBe(202);
    const detail = await j("GET", `/api/draws/${draw.body.id}`);
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
    // items can be ordered suspects-first, or shuffled stably under a seed
    const sus = (await j("GET", "/api/items?kind=example&order=suspects")).body.items;
    expect(sus.slice(0, 3).every((i: any) => i.suspect.length > 0)).toBe(true);
    expect(sus.slice(3).every((i: any) => i.suspect.length === 0)).toBe(true);
    const ids = (r: any) => r.body.items.map((i: any) => i.id);
    const s1 = ids(await j("GET", "/api/items?kind=example&order=shuffle&seed=7"));
    expect(ids(await j("GET", "/api/items?kind=example&order=shuffle&seed=7"))).toEqual(s1);
    expect(s1).not.toEqual(ids(await j("GET", "/api/items?kind=example")));
    expect([...s1].sort()).toEqual(ids(await j("GET", "/api/items?kind=example")).sort());
  });

  test("start a manual draw, read it, gate it, read the brief", async () => {
    const { j, pipeline } = await setup();
    const started = await j("POST", "/api/draws", { mode: "manual", genre: "horror" });
    expect(started.code).toBe(202);
    const id = started.body.id;
    expect(id).toBeTruthy();
    // wait for the fake model to reach the gate
    for (let i = 0; i < 50 && pipeline.draw(id).status !== "awaiting_gate"; i++) await Bun.sleep(10);
    const r = await j("GET", `/api/draws/${id}`);
    expect(r.body.draw.status).toBe("awaiting_gate");
    expect(r.body.examples).toHaveLength(6);
    expect(r.body.examples[0]).toMatchObject({ text: expect.stringMatching(/^passage/), source: expect.any(String), latest: null });
    const ex = r.body.examples[0];
    await j("POST", "/api/verdicts", { kind: "example", target_id: ex.id, verdict: "pass", method: "draw" });
    const after = await j("GET", `/api/draws/${id}`);
    expect(after.body.examples[0].latest).toMatchObject({ verdict: "pass" });
    expect(r.body.steps.map((s: any) => s.stage).sort()).toEqual(["execute", "execute", "execute", "execute", "execute", "premises"]);
    expect(r.body.candidates.map((c: any) => c.probability)).toEqual([0.02, 0.03, 0.05, 0.06, 0.08]);
    const flag = await j("POST", `/api/draws/${id}/gate`, { action: "flag", note: "looks wrong" });
    expect(flag.body.flagged).toBe(1);
    const chosen = await j("POST", `/api/draws/${id}/gate`, { action: "choose", step_id: r.body.candidates[1].step_id });
    expect(chosen.code).toBe(202);
    for (let i = 0; i < 50 && pipeline.draw(id).status !== "done"; i++) await Bun.sleep(10);
    const done = await j("GET", `/api/draws/${id}`);
    expect(done.body.draw.status).toBe("done");
    expect(done.body.draw.gate_method).toBe("manual");
    expect(done.body.artifacts.filter((a: any) => a.kind === "vignette")).toHaveLength(7);   // 5 executed + 2 context
    const gateAgain = await j("POST", `/api/draws/${id}/gate`, { action: "choose", step_id: r.body.candidates[0].step_id });
    expect(gateAgain.code).toBe(400);
    expect((await j("GET", "/api/draws")).body).toHaveLength(1);
    expect((await j("GET", "/api/draws/nope")).code).toBe(404);
  });

  test("a draw's options are readable for another like it, and a spent draw is deletable", async () => {
    const { j, pipeline } = await setup();
    const { body: { id } } = await j("POST", "/api/draws", { mode: "manual", genre: "horror", seed: "typed seed" });
    for (let i = 0; i < 50 && pipeline.draw(id).status !== "awaiting_gate"; i++) await Bun.sleep(10);
    const like = await j("GET", `/api/draws/${id}/like`);
    expect(like.code).toBe(200);
    expect(like.body).toMatchObject({ mode: "manual", genre: "horror", sampling: "tail", seed: { mode: "typed", text: "typed seed" } });
    expect((await j("GET", "/api/draws/nope/like")).code).toBe(404);
    expect((await j("POST", `/api/draws/${id}/gate`, { action: "keep-seed" })).code).toBe(400);
    const del = await j("DELETE", `/api/draws/${id}`);
    expect(del.body.deleted).toBe(id);
    expect((await j("GET", "/api/draws")).body).toHaveLength(0);
    expect((await j("DELETE", `/api/draws/${id}`)).code).toBe(400);
  });

  test("an archived draw leaves the list, keeps its name, and comes back", async () => {
    const { j, pipeline } = await setup();
    const { body: { id } } = await j("POST", "/api/draws", { mode: "manual", genre: "horror", seed: "one shared seed" });
    for (let i = 0; i < 50 && pipeline.draw(id).status !== "awaiting_gate"; i++) await Bun.sleep(10);
    pipeline.db.query("INSERT INTO draws (id, genre, mode, seed_mode, seed_text, example_ids, status, created_at) VALUES ('later', 'horror', 'manual', 'typed', 'one shared seed', '[]', 'done', '2027-01-01T00:00:00Z')").run();
    const named = (rows: any[]) => Object.fromEntries(rows.map((r) => [r.id, r.name]));
    const before = named((await j("GET", "/api/draws?archived=true")).body);
    expect((await j("POST", `/api/draws/${id}/gate`, { action: "archive" })).body.archived_at).toBeTruthy();
    const list = await j("GET", "/api/draws");
    expect(list.body.map((r: any) => r.id)).toEqual(["later"]);
    // names are deterministic over every draw, so hiding one must not renumber the others
    expect(named((await j("GET", "/api/draws?archived=true")).body)).toEqual(before);
    expect(named(list.body).later).toBe(before.later);
    expect((await j("GET", `/api/draws/${id}`)).code).toBe(200);
    await j("POST", `/api/draws/${id}/gate`, { action: "unarchive" });
    expect((await j("GET", "/api/draws")).body).toHaveLength(2);
  });

  test("a draw that sends domains is a 400", async () => {
    const { j } = await setup();
    const bad = await j("POST", "/api/draws", { mode: "manual", genre: "horror", setting: "basin", domains: "labour" });
    expect(bad.code).toBe(400);
    expect(bad.body.error).toBe("domains are gone; a setting loads whole lists");
  });

  test("a bad draw request is a 400 with the reason", async () => {
    const { j, db } = await setup();
    db.exec("DELETE FROM passages WHERE story_id = 'd1/b'");
    db.exec("DELETE FROM passages WHERE id IN ('a0','a1','a2','a3')");
    const r = await j("POST", "/api/draws", { mode: "auto", genre: "horror" });
    expect(r.code).toBe(400);
    expect(r.body.error).toMatch(/only 5 eligible passages/);
  });
});

describe("api: check, gate 1, draft, gate 2", () => {
  test("check → findings → dismiss → draft → story → keep, through the routes", async () => {
    const { draftScript } = await import("../pipeline/drafting.fixture.ts");
    const dir = mkdtempSync(join(tmpdir(), "cloudchamber-api-draft-"));
    const db = openDb(join(dir, "t.db"));
    db.exec(`INSERT INTO sources (id, path, reader, genre) VALUES ('scp', 'x', 'scp', 'horror')`);
    db.exec(`INSERT INTO stories (id, source_id, ord, title, author, genre, words, text) VALUES ('scp/a', 'scp', 0, 'A', 'Ann', 'horror', 9000, 'x')`);
    const ins = db.query("INSERT INTO passages (id, story_id, text, words, stratum, position, seed, first_seen, voice, mode) VALUES (?, ?, ?, 200, 0, 0, 0, 'now', ?, ?)");
    CELLS.forEach(([v, m], i) => ins.run(`a${i}`, "scp/a", `passage a${i}`, v, m));
    const model = new FakeModel(draftScript());
    const pipeline = new Pipeline(db, model, { briefsDir: join(dir, "briefs"), rng: () => 0.001 });
    const { Drafting } = await import("../pipeline/drafting.ts");
    const app = buildApi(db, pipeline, { drafting: new Drafting(pipeline, { draftsDir: join(dir, "drafts") }) });
    const j = async (method: "GET" | "POST", url: string, body?: unknown) => { const r = await app.inject({ method, url, payload: body as any }); return { code: r.statusCode, body: r.json() }; };
    const wait = async (id: string, status: string) => { for (let i = 0; i < 200 && pipeline.draw(id).status !== status; i++) await Bun.sleep(10); expect(pipeline.draw(id).status).toBe(status); };
    const draw = await pipeline.start({ mode: "auto", genre: "horror", seed: { mode: "typed", text: "seed" } });
    expect((await j("POST", `/api/draws/${draw.id}/draft`, { auto: false })).code).toBe(202);   // allowed from done; runs in the background
    await wait(draw.id, "awaiting_draft_gate");
    // a second draw goes through the check first
    const model2 = new FakeModel(draftScript());
    const p2 = new Pipeline(db, model2, { briefsDir: join(dir, "briefs"), rng: () => 0.001 });
    const app2 = buildApi(db, p2, { drafting: new Drafting(p2, { draftsDir: join(dir, "drafts") }) });
    const j2 = async (method: "GET" | "POST", url: string, body?: unknown) => { const r = await app2.inject({ method, url, payload: body as any }); return { code: r.statusCode, body: r.json() }; };
    const d2 = await p2.start({ mode: "auto", genre: "horror", seed: { mode: "typed", text: "seed two" } });
    const c = await j2("POST", `/api/draws/${d2.id}/check`, {});
    expect(c.code).toBe(202);
    for (let i = 0; i < 200 && p2.draw(d2.id).status !== "awaiting_check_gate"; i++) await Bun.sleep(10);
    const f = await j2("GET", `/api/draws/${d2.id}/findings`);
    expect(f.code).toBe(200);
    expect(f.body.findings).toHaveLength(2);
    expect(f.body.judge).toBe("checked on fable; judge and generator share a family");
    const dis = await j2("POST", `/api/draws/${d2.id}/gate`, { action: "dismiss", finding: f.body.findings[1].id, note: "fine" });
    expect(dis.code).toBe(200);
    expect(dis.body.decision).toBe("dismissed");
    expect((await j2("POST", `/api/draws/${d2.id}/gate`, { action: "accept" })).code).toBe(400);
    expect((await j2("POST", `/api/draws/${d2.id}/gate`, { action: "hold" })).body.status).toBe("awaiting_check_gate");
    expect((await j2("POST", `/api/draws/${d2.id}/draft`, { overrides: { "scenes.order": "parallel" } })).code).toBe(202);
    for (let i = 0; i < 200 && p2.draw(d2.id).status !== "awaiting_draft_gate"; i++) await Bun.sleep(10);
    expect(p2.draw(d2.id).status).toBe("awaiting_draft_gate");
    const story = await j2("GET", `/api/draws/${d2.id}/story`);
    expect(story.code).toBe(200);
    expect(story.body.text).toContain("Scene 1 opens.");
    expect(story.body.scenes).toHaveLength(8);
    expect(story.body.profiles.find((x: any) => x.beat === 5).flags).toEqual(["theme-stated"]);
    const rw = await j2("POST", `/api/draws/${d2.id}/gate`, { action: "rewrite", beat: 3 });
    expect(rw.code).toBe(202);
    for (let i = 0; i < 200 && p2.draw(d2.id).status !== "awaiting_draft_gate"; i++) await Bun.sleep(10);
    const kept = await j2("POST", `/api/draws/${d2.id}/gate`, { action: "keep", note: "ship it" });
    expect(kept.code).toBe(200);
    expect(kept.body.draw.status).toBe("drafted");
    expect(kept.body.dir).toBe(join(dir, "drafts", d2.id));
    expect((await j2("GET", `/api/draws/${d2.id}`)).body.draw.status).toBe("drafted");
    expect((await j2("POST", `/api/draws/${d2.id}/draft`, {})).code).toBe(400);
    expect((await j2("POST", `/api/draws/${d2.id}/gate`, { action: "sing" })).code).toBe(400);
  });
});

describe("api: draft config", () => {
  test("serves the drafting defaults and the profile names for the settings form", async () => {
    const { j } = await setup();
    const r = await j("GET", "/api/draft-config");
    expect(r.code).toBe(200);
    expect(r.body.defaults.length.words).toBe(5000);
    expect(r.body.defaults.beats).toMatchObject({ count: "auto", min: 5, max: 10 });
    expect(r.body.profiles).toEqual(["flash", "novelette"]);
  });
});
