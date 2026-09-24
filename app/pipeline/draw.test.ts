import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { settingsFixture } from "./settings.fixture.ts";
import { loadSetting } from "./settings.ts";
import { words } from "./model.ts";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb, type Db } from "./store/db.ts";
import { FakeModel } from "./model.ts";
import { Pipeline, StepFailure } from "./draw.ts";
import { originOf } from "./stage.ts";
import { ofKind } from "./artifacts.ts";
import { tabOf } from "./lifecycle.ts";
import { TEMPLATES, checkTemplate } from "./prompts.ts";
import { loadStages, STAGES } from "./config.ts";
import { treeVersion } from "./version.ts";

const CELLS = ["informational", "mixed", "involved"].flatMap((v) => ["non-narrative", "mixed", "narrative"].map((m) => [v, m]));

function fixture(): { db: Db; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "cloudchamber-draw-"));
  const db = openDb(join(dir, "t.db"));
  db.exec(`INSERT INTO sources (id, path, reader, genre) VALUES ('scp', 'x', 'scp', 'horror'), ('sf', 'y', 'pdf', 'scifi')`);
  db.exec(`INSERT INTO stories (id, source_id, ord, title, author, genre, words, text) VALUES
    ('scp/a', 'scp', 0, 'A', 'Ann', 'horror', 9000, 'x'), ('sf/b', 'sf', 0, 'B', 'Bob', 'scifi', 9000, 'y')`);
  const ins = db.query("INSERT INTO passages (id, story_id, text, words, stratum, position, seed, first_seen, voice, mode) VALUES (?, ?, ?, 200, 0, 0, 0, 'now', ?, ?)");
  CELLS.forEach(([v, m], i) => { ins.run(`h${i}`, "scp/a", `horror passage ${i} ${v} ${m}`, v, m); ins.run(`s${i}`, "sf/b", `scifi passage ${i}`, v, m); });
  db.exec(`INSERT INTO themes (id, text, attestation, stories, drafted_at) VALUES ('t1', 'A theme with a turn.', 1, '["scp/a"]', 'now')`);
  return { db, dir };
}

const premises = (probs = [0.05, 0.03, 0.08, 0.03, 0.06]) =>
  probs.map((p, i) => `<premise><text>Premise ${i + 1} text.</text><probability>${p}</probability></premise>`).join("\n");
const vignette = (n: number) => `<vignette>${Array.from({ length: 400 }, (_, i) => `w${n}_${i}`).join(" ")}</vignette>`;
const outline = (extra: string[] = []) => ["departure", "particulars", "knowledge", "arrival", ...extra].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n")
  + "\n<job>Test the first thing: scene one.</job><job>Test a second thing: scene two.</job>";
const script = (over: Record<string, any> = {}) => ({
  premises: [premises()],
  execute: (p: string) => vignette(Number(/Premise (\d)/.exec(p)?.[1] ?? 0)),
  outline: [outline()],
  context: (p: string) => `<vignette>context for ${/Its job: (.*)/.exec(p)?.[1]}</vignette>`,
  ending: ["<ending>The last beat.</ending>"],
  ...over,
});

function pipe(db: Db, dir: string, s = script(), rng = () => 0.001, settingsDir?: string) {
  const model = new FakeModel(s);
  return { model, p: new Pipeline(db, model, { rng, briefsDir: join(dir, "briefs"), settingsDir, backoffMs: [0, 0, 0], cacheLeadMs: 0 }) };
}

describe("draw graph", () => {
  test("auto draw: examples and seed drawn, one execution of the lowest probability, outline, jobs, siblings, brief", async () => {
    const { db, dir } = fixture();
    const { p, model } = pipe(db, dir);
    const draw = await p.start({ mode: "auto", segment: { source: "scp" } });
    expect(draw.status).toBe("done");
    expect(draw.genre).toBe("horror");
    expect(draw.seed_mode).toBe("drawn");
    expect(draw.seed_theme_id).toBe("t1");
    expect(JSON.parse(draw.example_ids)).toHaveLength(6);
    expect(new Set(JSON.parse(draw.example_ids).map((id: string) => id[0]))).toEqual(new Set(["h"]));   // segment respected
    const stages = model.calls.map((c) => c.stage);
    // the auto gate takes the lowest stated probability, so only that premise is executed
    expect(stages.filter((s) => s === "execute")).toHaveLength(1);
    expect(stages.indexOf("outline")).toBeGreaterThan(stages.lastIndexOf("execute"));
    expect(stages.filter((s) => s === "context")).toHaveLength(2);
    expect(stages.filter((s) => s === "ending")).toHaveLength(1);
    // prompt order: examples first, ask last; execute sees only its own premise
    const pr = model.calls.find((c) => c.stage === "premises")!;
    expect(pr.prompt.indexOf("horror passage")).toBeLessThan(pr.prompt.indexOf("Generate five premises"));
    expect(pr.prompt).toContain("A theme with a turn.");
    expect(pr.prompt).toContain("under 0.10");
    expect(pr.prompt).toMatch(/absurd/);
    // premises are numbered from the tail: #1 is the lowest probability (0.03, model's 2nd), ties keep model order
    const ex = model.calls.filter((c) => c.stage === "execute");
    expect(ex[0].prompt).toContain("Premise 2 text.");
    expect(ex[0].prompt).not.toContain("Premise 1 text.");
    expect(ofKind(p.artifacts(draw.id), "premise").map((a) => [a.meta.index, a.meta.probability])).toEqual([[1, 0.03], [2, 0.03], [3, 0.05], [4, 0.06], [5, 0.08]]);
    expect(p.candidates(draw.id).map((c) => [c.premise, c.probability])).toEqual([["Premise 2 text.", 0.03]]);
    // gate: lowest probability (0.03, tie between 2 and 4 → rng 0.001 picks the first)
    expect(draw.gate_method).toBe("auto");
    const chosen = p.candidates(draw.id).find((c) => c.step_id === draw.chosen_step)!;
    expect(chosen.probability).toBe(0.03);
    // siblings see the outline and the chosen vignette, not each other
    const ctx = model.calls.filter((c) => c.stage === "context");
    expect(ctx[0].prompt).toContain("Section departure body.");
    expect(ctx[0].prompt).toContain("Its job: Test the first thing");
    expect(ctx[1].prompt).not.toContain("context for");
    const end = model.calls.find((c) => c.stage === "ending")!;
    expect(end.prompt).not.toContain("context for");
    // every step stored with model, system prompt, prompt, raw, parsed
    for (const s of p.steps(draw.id)) {
      expect(s.status).toBe("done");
      expect(s.model).toBe(loadStages()[s.stage as keyof ReturnType<typeof loadStages>].model);
      expect(s.system_prompt.length).toBeGreaterThan(10);
      expect(s.raw_response).toBeTruthy();
      expect(s.parsed).toBeTruthy();
    }
    expect(p.steps(draw.id).filter((s) => s.stage === "execute").every((s) => s.parent_id === p.steps(draw.id).find((x) => x.stage === "premises")!.id)).toBe(true);
    // brief
    const dirP = join(dir, "briefs", draw.id);
    for (const f of ["vignette.md", "outline.md", "context-1.md", "context-2.md", "ending.md", "trail.md"]) expect(existsSync(join(dirP, f))).toBe(true);
    const trail = readFileSync(join(dirP, "trail.md"), "utf8");
    expect(trail).toContain("A theme with a turn.");
    expect(trail).toContain("← chosen");
    expect(trail).toContain("gate: auto");
    expect(trail.match(/^- \*\*0\.0\d\*\*/gm)).toHaveLength(5);
    expect(readFileSync(join(dirP, "vignette.md"), "utf8")).toContain("w2_0");
  });

  test("every step records the tree it ran from, so a measurement cannot be read against the wrong one", async () => {
    const { db, dir } = fixture();
    const { p } = pipe(db, dir);
    const draw = await p.start({ mode: "auto", segment: { source: "scp" } });
    const versions = new Set(p.steps(draw.id).map((s) => s.version));
    expect(versions.size).toBe(1);
    // the short sha of this checkout, or `dev` where git cannot answer, with `+dirty` when app/ or extract/ differ from it
    expect([...versions][0]).toMatch(/^([0-9a-f]{7,}|dev)(\+dirty)?$/);
    expect([...versions][0]).toBe(treeVersion());
  });

  test("manual draw stops at the gate; choose resumes; candidates sorted by probability", async () => {
    const { db, dir } = fixture();
    const { p } = pipe(db, dir);
    const draw = await p.start({ mode: "manual", genre: "horror" });
    expect(draw.status).toBe("awaiting_gate");
    expect(p.steps(draw.id).map((s) => s.stage).sort()).toEqual(["execute", "execute", "execute", "execute", "execute", "premises"]);
    const cs = p.candidates(draw.id);
    expect(cs.map((c) => c.probability)).toEqual([0.03, 0.03, 0.05, 0.06, 0.08]);
    const done = await p.choose(draw.id, cs[4].step_id);
    expect(done.status).toBe("done");
    expect(done.gate_method).toBe("manual");
    expect(done.chosen_step).toBe(cs[4].step_id);
    await expect(p.choose(draw.id, cs[0].step_id)).rejects.toThrow(/not awaiting_gate/);
  });

  test("fork develops a second candidate as a draw of its own", async () => {
    const { db, dir } = fixture();
    const twice = script({                                            // the fork develops a second time
      outline: [outline(), outline()],
      ending: Array(2).fill("<ending>The last beat.</ending>"),
    });
    const { p } = pipe(db, dir, twice);
    const draw = await p.start({ mode: "manual", genre: "horror", seed: { mode: "typed", text: "a typed seed" } });
    const cs = p.candidates(draw.id);
    await expect(p.fork(draw.id, cs[1].step_id)).rejects.toThrow(/awaiting the gate/);
    await p.choose(draw.id, cs[0].step_id);
    expect(p.forks(draw.id)).toEqual([]);
    const fork = await p.fork(draw.id, cs[1].step_id);
    expect(fork.status).toBe("done");
    expect(fork.forked_from).toBe(draw.id);
    expect(fork.seed_text).toBe("a typed seed");
    expect(fork.example_ids).toBe(p.draw(draw.id).example_ids);
    // the candidate crossed over without a model call, and the fork developed from it
    const steps = p.steps(fork.id);
    const execute = steps.find((s) => s.stage === "execute")!;
    expect(execute.model).toBe("copied");
    expect(fork.chosen_step).toBe(execute.id);
    expect(steps.map((s) => s.stage).sort()).toEqual(["context", "context", "ending", "execute", "outline"]);
    const dirF = join(dir, "briefs", fork.id);
    expect(readFileSync(join(dirF, "vignette.md"), "utf8").trim()).toBe(cs[1].vignette.trim());
    const trail = readFileSync(join(dirF, "trail.md"), "utf8");
    expect(trail).toContain("(forked)");
    expect(trail).toContain(`${draw.id}, its candidate 2`);
    // the source draw knows which candidates are developed and refuses to develop one twice
    expect(p.forks(draw.id)).toEqual([{ id: fork.id, status: "done", step_id: cs[1].step_id, index: 2 }]);
    await expect(p.fork(draw.id, cs[1].step_id)).rejects.toThrow(/already developed/);
    await expect(p.fork(draw.id, cs[0].step_id)).rejects.toThrow(/itself developed/);
  });

  test("like starts another draw on the same options and leaves the first open", async () => {
    const { db, dir } = fixture();
    const band = premises([0.12, 0.20, 0.30, 0.15, 0.25]);
    const { p } = pipe(db, dir, script({ premises: [band, band] }));
    const draw = await p.start({ mode: "manual", genre: "horror", sampling: "off-centre", seed: { mode: "typed", text: "a typed seed" } });
    const flagged = p.flag(draw.id, "call looks wrong");
    expect(flagged.flagged).toBe(1);
    expect(flagged.status).toBe("awaiting_gate");            // a flag closes nothing and starts nothing
    const again = await p.start(p.like(draw.id));
    expect([again.seed_text, again.seed_mode, again.sampling, again.genre]).toEqual(["a typed seed", "typed", "off-centre", "horror"]);
    expect(JSON.parse(again.example_ids)).toHaveLength(6);
    expect(p.draw(draw.id).status).toBe("awaiting_gate");    // the draw it came from is untouched
    expect(p.draw(draw.id).superseded_by).toBeNull();
    // a seed drawn from the bank comes back as the theme, so the copy is recorded as drawn too
    db.query(`INSERT INTO draws (id, name, genre, mode, seed_mode, seed_text, seed_theme_id, example_ids, sampling, status, created_at)
              VALUES ('d1', 'n', 'horror', 'auto', 'drawn', 'A theme with a turn.', 't1', '[]', 'tail', 'awaiting_gate', 'now')`).run();
    expect(p.like("d1").seed).toEqual({ mode: "picked", themeId: "t1" });
  });

  test("delete removes a draw that never developed, and refuses one that did", async () => {
    const { db, dir } = fixture();
    const { p } = pipe(db, dir, script({ premises: [premises(), premises()] }));
    const draw = await p.start({ mode: "manual", genre: "horror" });
    expect(p.steps(draw.id).length).toBeGreaterThan(0);
    expect(p.artifacts(draw.id).length).toBeGreaterThan(0);
    // a draw another draw points at keeps its links
    db.query("INSERT INTO draws (id, name, genre, mode, seed_mode, seed_text, example_ids, status, created_at, superseded_by) VALUES ('later', 'n', 'horror', 'manual', 'drawn', 'x', '[]', 'done', 'now', ?)").run(draw.id);
    expect(() => p.delete(draw.id)).toThrow(/referenced by later/);
    db.query("DELETE FROM draws WHERE id = 'later'").run();
    p.delete(draw.id);
    expect(() => p.draw(draw.id)).toThrow(/no draw/);
    expect(p.steps(draw.id)).toHaveLength(0);
    expect(p.artifacts(draw.id)).toHaveLength(0);
    expect(p.draws()).toHaveLength(0);
    // one that reached the gate and was chosen is part of the record on disk
    const kept = await p.start({ mode: "auto", genre: "horror" });
    expect(kept.chosen_step).toBeTruthy();
    expect(() => p.delete(kept.id)).toThrow(/archive it instead/);
  });

  test("shape failures retry once on the same model then fail the draw with the reason, and flag nothing", async () => {
    const { db, dir } = fixture();
    const bad = premises([0.05, 0.03, 0.12, 0.03, 0.06]);            // one over the ceiling
    const { p, model } = pipe(db, dir, script({ premises: [bad, "<premise>only one</premise>"] }));
    await expect(p.start({ mode: "auto", genre: "horror" })).rejects.toThrow(StepFailure);
    const draw = p.draws()[0];
    expect(draw.status).toBe("failed");
    expect(draw.flagged).toBe(0);                                      // a flag is a person's; the reason is the error
    expect(draw.error).toMatch(/^premises failed: shape/);
    const steps = p.steps(draw.id);
    expect(steps.map((s) => [s.stage, s.status, s.fail_reason, s.attempt])).toEqual([["premises", "failed", "shape", 1], ["premises", "failed", "shape", 2]]);
    expect(model.calls.every((c) => c.model === loadStages().premises.model)).toBe(true);
  });

  test("a stage's effort reaches the model call, and an effort stages.toml does not name is refused", () => {
    const { db, dir } = fixture();
    const stages = loadStages();
    const model = new FakeModel(script());
    const p = new Pipeline(db, model, { rng: () => 0.001, briefsDir: join(dir, "briefs"),
      stages: { ...stages, premises: { ...stages.premises, effort: "low" } } });
    return p.start({ mode: "auto", genre: "horror" }).then(() => {
      const calls = model.calls;
      expect(calls.find((c) => c.stage === "premises")!.effort).toBe("low");
      expect(calls.find((c) => c.stage === "outline")!.effort).toBeUndefined();   // unset leaves the CLI default
    });
  });

  test("stages.toml refuses an effort level the CLI does not take", () => {
    const good = { model: "claude-opus-5", fallback: "claude-sonnet-5", system: "s" };
    const toml = Object.fromEntries(STAGES.map((s) => [s, { ...good }]));
    expect(() => loadStages({ ...toml, scene: { ...good, effort: "low" } } as any).scene.effort).not.toThrow();
    expect(loadStages({ ...toml, scene: { ...good, effort: "low" } } as any).scene.effort).toBe("low");
    expect(() => loadStages({ ...toml, scene: { ...good, effort: "blazing" } } as any)).toThrow(/effort blazing/);
  });

  test("refusal reruns once on the fallback model and records both", async () => {
    const { db, dir } = fixture();
    const { p, model } = pipe(db, dir, script({ outline: [{ text: "API Error: safeguards", stop: "refusal" }, outline()] }));
    const draw = await p.start({ mode: "auto", genre: "horror" });
    expect(draw.status).toBe("done");
    const os = p.steps(draw.id).filter((s) => s.stage === "outline");
    expect(os.map((s) => [s.status, s.fail_reason, s.model])).toEqual([["failed", "refusal", loadStages().outline.model], ["done", null, loadStages().outline.fallback]]);
    expect(model.calls.filter((c) => c.stage === "outline").map((c) => c.model)).toEqual([loadStages().outline.model, loadStages().outline.fallback]);
  });

  test("an error the API reports on its own side is tried again, and each attempt keeps its step", async () => {
    const { db, dir } = fixture();
    const overloaded = { text: "", stop: "error", error: "API Error: 529 Overloaded. This is a server-side issue, usually temporary" };
    const internal = { text: "", stop: "error", error: "API Error: 500 Internal server error. This is a server-side issue, usually temporary" };
    const { p, model } = pipe(db, dir, script({ outline: [overloaded, internal, outline()] }));
    const draw = await p.start({ mode: "auto", genre: "horror" });
    expect(draw.status).toBe("done");
    expect(p.steps(draw.id).filter((s) => s.stage === "outline").map((s) => [s.status, s.fail_reason])).toEqual([["failed", "error"], ["failed", "error"], ["done", null]]);
    expect(model.calls.filter((c) => c.stage === "outline")).toHaveLength(3);
  });

  test("the retries run out, and an error of any other kind is not retried", async () => {
    const { db, dir } = fixture();
    const overloaded = { text: "", stop: "error", error: "API Error: 529 Overloaded." };
    const { p, model } = pipe(db, dir, script({ premises: [overloaded, overloaded, overloaded, overloaded] }));
    const err = await p.start({ mode: "auto", genre: "horror" }).catch((e) => e);
    expect(err.reason).toBe("error");
    expect(model.calls.filter((c) => c.stage === "premises")).toHaveLength(4);   // the first try and three retries
    const { db: db2, dir: dir2 } = fixture();
    const { p: p2, model: m2 } = pipe(db2, dir2, script({ premises: [{ text: "", stop: "error", error: "Unable to read managed policy settings." }, premises()] }));
    expect((await p2.start({ mode: "auto", genre: "horror" }).catch((e) => e)).reason).toBe("error");
    expect(m2.calls.filter((c) => c.stage === "premises")).toHaveLength(1);
  });

  test("a failed draw resumes from its finished calls: only the missing executes run, then the gate", async () => {
    const { db, dir } = fixture();
    let n = 0;
    const flaky = (p: string) => (++n === 3 ? { text: "", stop: "error", error: "Unable to read managed policy settings." } : vignette(Number(/Premise (\d)/.exec(p)?.[1] ?? 0)));
    const { p, model } = pipe(db, dir, script({ execute: flaky }));
    await expect(p.start({ mode: "manual", genre: "horror" })).rejects.toThrow(/execute failed/);
    const failed = p.draws()[0];
    expect(failed.status).toBe("failed");
    const draw = await p.resume(failed.id);
    expect(draw.status).toBe("awaiting_gate");
    expect(model.calls.filter((c) => c.stage === "premises")).toHaveLength(1);
    expect(model.calls.filter((c) => c.stage === "execute")).toHaveLength(6);   // five, then the one that failed
    expect(p.candidates(draw.id)).toHaveLength(5);
  });

  test("an auto draw whose one execute failed resumes with that execute, then takes it at the gate", async () => {
    const { db, dir } = fixture();
    let n = 0;
    const flaky = (p: string) => (++n === 1 ? { text: "", stop: "error", error: "Unable to read managed policy settings." } : vignette(Number(/Premise (\d)/.exec(p)?.[1] ?? 0)));
    const { p, model } = pipe(db, dir, script({ execute: flaky }));
    await expect(p.start({ mode: "auto", genre: "horror" })).rejects.toThrow(/execute failed/);
    const draw = await p.resume(p.draws()[0].id);
    expect(draw.status).toBe("done");
    expect(model.calls.filter((c) => c.stage === "execute")).toHaveLength(2);   // the failed one, then its retry
    expect(p.candidates(draw.id).map((c) => c.probability)).toEqual([0.03]);
  });

  test("a draw that failed before its premises runs them again from the same examples and seed", async () => {
    const { db, dir } = fixture();
    const { p, model } = pipe(db, dir, script({ premises: [{ text: "", stop: "error", error: "Unable to read managed policy settings." }, premises()] }));
    await expect(p.start({ mode: "auto", genre: "horror", shape: "listen", seed: { mode: "typed", text: "A typed seed." } })).rejects.toThrow(/premises failed/);
    const failed = p.draws()[0];
    const draw = await p.resume(failed.id);
    expect(draw.status).toBe("done");
    const [first, second] = model.calls.filter((c) => c.stage === "premises");
    expect(second.prompt).toBe(first.prompt);   // the same examples, seed and shape
    await expect(p.resume(draw.id)).rejects.toThrow(/is done; only a failed draw/);
  });

  test("double refusal fails with reason refusal, never shape", async () => {
    const { db, dir } = fixture();
    const { p } = pipe(db, dir, script({ premises: [{ text: "", stop: "refusal" }, { text: "", stop: "refusal" }] }));
    const err = await p.start({ mode: "auto", genre: "horror" }).catch((e) => e);
    expect(err).toBeInstanceOf(StepFailure);
    expect(err.reason).toBe("refusal");
    expect(p.draws()[0].status).toBe("failed");
  });

  test("a model call that throws fails its step with the reason, rather than leaving it running", async () => {
    const { db, dir } = fixture();
    const { p, model } = pipe(db, dir);
    model.call = async () => { throw new Error("Executable not found in $PATH: \"claude\""); };
    const err = await p.start({ mode: "auto", genre: "horror" }).catch((e) => e);
    expect(err).toBeInstanceOf(StepFailure);
    expect(err.reason).toBe("error");
    const [step] = p.steps(p.draws()[0].id);
    expect([step.status, step.fail_reason, step.error]).toEqual(["failed", "error", 'Executable not found in $PATH: "claude"']);
    expect(p.draws()[0].status).toBe("failed");
  });

  test("a setting is sliced by stage: whole lists, the loaded ones only, no rules, no prose", async () => {
    const { db, dir } = fixture();
    const sdir = settingsFixture(dir);
    const { p, model } = pipe(db, dir, script(), () => 0.001, sdir);
    const draw = await p.start({ mode: "auto", genre: "horror", setting: "basin" });
    expect(draw.status).toBe("done");
    const s = loadSetting("basin", sdir);
    const call = (stage: string) => model.calls.find((c) => c.stage === stage)!.prompt;
    const has = (pr: string, xs: string[]) => { for (const x of xs) expect(pr).toContain(x); };
    const hasNot = (pr: string, xs: string[]) => { for (const x of xs) expect(pr).not.toContain(x); };
    const whole = (pr: string, name: "Bodies" | "Instruments" | "Places" | "Terms") => {
      expect(pr).toContain(`## ${name} — the setting records these`);
      for (const e of s.lists[name]) expect(pr).toContain(e);     // whole, never a subset
    };
    // premises: examples, every Body, ask; no prose section of any kind
    const pr = call("premises");
    expect(pr.indexOf("horror passage")).toBeLessThan(pr.indexOf("## Bodies"));
    whole(pr, "Bodies");
    hasNot(pr, ["## Instruments", "## Places", "## Terms", "## Jobs", "## Matrix", "## Hard rules", "## Do not build"]);
    expect(pr.indexOf("## Bodies")).toBeLessThan(pr.indexOf("Generate five premises"));   // the ask is last; nothing follows it
    // execute: the nouns a page is made of, and no bodies
    const ex = call("execute");
    for (const n of ["Instruments", "Places", "Terms"] as const) whole(ex, n);
    hasNot(ex, ["## Bodies", "## Jobs", "## Matrix", "## Hard rules"]);
    // outline: head first, then bodies and instruments, then the three section asks and nothing a setting adds
    const ol = call("outline");
    expect(ol.indexOf("Seed:")).toBeLessThan(ol.indexOf("## Bodies"));
    expect(ol.indexOf("## Bodies")).toBeLessThan(ol.indexOf("Write one section per name"));
    whole(ol, "Bodies"); whole(ol, "Instruments");
    has(ol, ['<section name="departure">', '<section name="particulars">', '<section name="knowledge">', '<section name="arrival">']);
    hasNot(ol, ["## Places", "## Terms", "## Jobs", "## Matrix", '<section name="matrix">']);
    // jobs, context, ending after the head
    for (const [stage, want, gone] of [
      ["context", ["Instruments", "Places", "Terms"], ["## Bodies"]],
      ["ending", ["Bodies", "Instruments", "Terms"], ["## Places"]],
    ] as const) {
      const c = call(stage);
      expect(c.indexOf("Section departure body.")).toBeLessThan(c.indexOf(`## ${want[0]}`));   // the head, then the setting
      for (const n of want) whole(c, n);
      hasNot(c, [...gone, "## Hard rules"]);
    }
    // no heading below ##: nothing in a prompt a draw could have selected on
    for (const stage of ["premises", "execute", "outline", "context", "ending"]) expect(call(stage)).not.toMatch(/^### /m);
    expect(readFileSync(join(dir, "briefs", draw.id, "outline.md"), "utf8")).toContain("## departure");
    expect(readFileSync(join(dir, "briefs", draw.id, "trail.md"), "utf8")).not.toContain("## domains");
    expect(words(pr)).toBeLessThan(5000);
  });

  test("two draws under one setting carry the same setting text: the seed is what differs", async () => {
    const { db, dir } = fixture();
    const sdir = settingsFixture(dir);
    const twice = { premises: [premises(), premises()], outline: [outline(), outline()], ending: [script().ending[0], script().ending[0]] };
    const { p, model } = pipe(db, dir, script(twice), () => 0.001, sdir);
    await p.start({ mode: "auto", genre: "horror", setting: "basin", seed: { mode: "typed", text: "one seed" } });
    await p.start({ mode: "auto", genre: "horror", setting: "basin", seed: { mode: "typed", text: "another seed" } });
    const [a, b] = model.calls.filter((c) => c.stage === "premises").map((c) => c.prompt);
    const setting = (pr: string) => pr.slice(pr.indexOf("## Bodies"), pr.indexOf("Generate five premises"));
    expect(setting(a)).toBe(setting(b));
    expect(a).not.toBe(b);
  });

  test("a setting that fails lint is refused before any model call, naming the findings", async () => {
    const { db, dir } = fixture();
    const sdir = settingsFixture(dir);
    writeFileSync(join(sdir, "basin.md"), readFileSync(join(sdir, "basin.md"), "utf8").replace("## Places", "## Sources"));
    const { p, model } = pipe(db, dir, script(), () => 0.001, sdir);
    await expect(p.start({ mode: "auto", genre: "horror", setting: "basin" })).rejects.toThrow(/setting › Places: missing/);
    expect(model.calls).toHaveLength(0);
    expect(p.draws()).toHaveLength(0);
  });

  test("unrestricted prompts carry nothing beyond passages, seed, ask and genre", async () => {
    const { db, dir } = fixture();
    const { p, model } = pipe(db, dir);
    await p.start({ mode: "auto", genre: "horror" });
    const pr = model.calls.find((c) => c.stage === "premises")!.prompt;
    expect(pr).not.toContain("Hard rules");
    expect(pr.split("\n\n").length).toBeLessThanOrEqual(6 + 3);   // six passages plus the ask block
  });

  test("draw fails naming the count when a segment is thin; genre follows the examples when none is asked for", async () => {
    const { db, dir } = fixture();
    db.exec("DELETE FROM passages WHERE id IN ('h0','h1','h2','h3','h4')");
    const { p, model } = pipe(db, dir);
    await expect(p.start({ mode: "auto", segment: { source: "scp" } })).rejects.toThrow(/only 4 eligible passages.*6 needed/);
    db.exec("DELETE FROM passages WHERE id IN ('h5','h6')");            // four of the six drawn are now scifi
    const draw = await p.start({ mode: "auto" });
    expect(draw.genre).toBe("scifi");
    expect(model.calls.find((c) => c.stage === "premises")!.prompt).toContain("for a scifi story");
  });

  test("sampling moves the band and the register the premises are asked in", async () => {
    const { db, dir } = fixture();
    const { p, model } = pipe(db, dir, script({ premises: [premises([0.40, 0.55, 0.38, 0.62, 0.44])] }));
    const draw = await p.start({ mode: "manual", genre: "horror", sampling: "standard" });
    expect(draw.sampling).toBe("standard");
    const ask = model.calls.find((c) => c.stage === "premises")!.prompt;
    expect(ask).toContain("Sample from the centre of the distribution");
    expect(ask).toContain("over 0.35");
    expect(ask).not.toMatch(/absurd/);
    expect(p.candidates(draw.id).map((c) => c.probability)).toEqual([0.38, 0.40, 0.44, 0.55, 0.62]);
    // the band is enforced both ways: a tail premise is a shape failure under standard
    const { p: p2 } = pipe(db, dir, script({ premises: [premises([0.40, 0.55, 0.05, 0.62, 0.44]), premises([0.40, 0.55, 0.05, 0.62, 0.44])] }));
    await expect(p2.start({ mode: "auto", genre: "horror", sampling: "standard" })).rejects.toThrow(StepFailure);
    await expect(p2.start({ mode: "auto", genre: "horror", sampling: "middle" as any })).rejects.toThrow(/not tail \| off-centre \| standard/);
  });

  test("darkness adds one sentence to the premises, execute and ending asks, and nothing when unset", async () => {
    const { db, dir } = fixture();
    const sentence = TEMPLATES.darknessAsk.black;
    const { p, model } = pipe(db, dir, script({ premises: [premises(), premises()], outline: [outline(), outline()], ending: ["<ending>The last beat.</ending>", "<ending>The last beat.</ending>"] }));
    const draw = await p.start({ mode: "auto", genre: "horror", darkness: "black" });
    expect(draw.darkness).toBe("black");
    const withIt = model.calls.filter((c) => c.stage === "premises" || c.stage === "execute" || c.stage === "ending");
    expect(withIt).toHaveLength(3);   // the premises, the one auto execute, the ending
    for (const c of withIt) expect(c.prompt).toContain(sentence);
    for (const c of model.calls.filter((c) => c.stage === "outline" || c.stage === "context")) expect(c.prompt).not.toContain(sentence);
    expect(p.like(draw.id).darkness).toBe("black");
    expect(readFileSync(join(dir, "briefs", draw.id, "trail.md"), "utf8")).toContain("darkness: black");
    // unset: no level's sentence anywhere, and the asks keep their old joins
    model.calls.length = 0;
    const plain = await p.start({ mode: "auto", genre: "horror" });
    expect(plain.darkness).toBeNull();
    for (const c of model.calls) for (const s of Object.values(TEMPLATES.darknessAsk)) expect(c.prompt).not.toContain(s);
    expect(model.calls.find((c) => c.stage === "premises")!.prompt).toMatch(/absurdity\. Output only the five tags\./);
    await expect(p.start({ mode: "auto", genre: "horror", darkness: "pitch" as any })).rejects.toThrow(/not light \| grey \| dark \| black/);
  });

  test("a name is written once, and no later draw can change it", async () => {
    const { db, dir } = fixture();
    const { p } = pipe(db, dir, script({ premises: [premises(), premises(), premises()] }));
    const seed = { mode: "typed", text: "a covenant buried in a land grant" } as const;
    const a = await p.start({ mode: "manual", genre: "horror", seed });
    const b = await p.start({ mode: "manual", genre: "horror", seed });
    expect([a.name, b.name]).toEqual(["covenant-buried-grant", "covenant-buried-grant-2"]);
    // an archived draw keeps its name and its number: the next draw is 3, not 2 again
    p.archive(a.id);
    const c = await p.start({ mode: "manual", genre: "horror", seed });
    expect(c.name).toBe("covenant-buried-grant-3");
    expect(p.draw(a.id).name).toBe("covenant-buried-grant");
    expect(p.draw(b.id).name).toBe("covenant-buried-grant-2");
  });

  test("a draw's stage follows the work done to it, and its origin names the candidate", async () => {
    const { db, dir } = fixture();
    const twice = script({
      outline: [outline(), outline()],
      ending: Array(2).fill("<ending>The last beat.</ending>"),
    });
    const { p } = pipe(db, dir, twice);
    const draw = await p.start({ mode: "manual", genre: "horror" });
    expect(tabOf(draw)).toBe("ideate");
    expect(originOf(p, draw.id)).toBeNull();                       // nothing chosen: it is only a batch
    const cs = p.candidates(draw.id);
    await p.choose(draw.id, cs[0].step_id);
    expect(tabOf(p.draw(draw.id))).toBe("check");            // check from the choice, not from the brief
    expect(originOf(p, draw.id)).toMatchObject({ id: draw.id, index: 1, probability: 0.03 });
    // a fork reports the candidate it develops, and the draw it came from
    const fork = await p.fork(draw.id, cs[1].step_id);
    expect(tabOf(fork)).toBe("check");
    expect(originOf(p, fork.id)).toMatchObject({ id: draw.id, name: draw.name, index: 2 });
    // a repair sets chosen_step a few seconds in; the link to the brief it repairs holds the stage until then
    expect(tabOf({ status: "running", chosen_step: null, repaired_from: draw.id })).toBe("check");
  });

  test("archiving hides a draw from the list and changes nothing else about it", async () => {
    const { db, dir } = fixture();
    const { p } = pipe(db, dir);
    const ins = db.query("INSERT INTO draws (id, genre, mode, seed_mode, seed_text, example_ids, status, created_at) VALUES (?, 'horror', 'manual', 'drawn', 'A seed.', '[]', 'done', ?)");
    ins.run("one", "2026-09-08T12:00:00Z");
    ins.run("two", "2026-09-08T12:00:01Z");
    const archived = p.archive("two");
    expect(archived.archived_at).toBeTruthy();
    expect(archived.status).toBe("done");
    expect(p.draws().map((r) => r.id)).toEqual(["one"]);
    expect(p.draws(true).map((r) => r.id)).toEqual(["two", "one"]);
    expect(p.draw("two").id).toBe("two");                       // still reachable by id
    expect(p.archive("two", false).archived_at).toBeNull();
    expect(p.draws().map((r) => r.id)).toEqual(["two", "one"]);
    expect(() => p.archive("nope")).toThrow(/no draw nope/);
  });

  test("draws made in the same second list newest first", async () => {
    const { db, dir } = fixture();
    const { p } = pipe(db, dir);
    const at = "2026-09-08T12:00:00Z";
    for (const id of ["aaa", "zzz", "mmm"]) {
      db.query("INSERT INTO draws (id, genre, mode, seed_mode, seed_text, example_ids, status, created_at) VALUES (?, 'horror', 'manual', 'drawn', 'A seed.', '[]', 'done', ?)").run(id, at);
    }
    expect(p.draws().map((r) => r.id)).toEqual(["mmm", "zzz", "aaa"]);
  });

  test("a shaped draw asks the premises for a story told aloud, and an unknown shape is refused", async () => {
    const { db, dir } = fixture();
    const { p, model } = pipe(db, dir);
    await p.start({ mode: "manual", genre: "horror", shape: "listen" });
    const ask = model.calls.find((c) => c.stage === "premises")!.prompt;
    expect(ask).toContain("Each premise is for a story told aloud to a listener");
    expect(ask).toContain("pays, on the page, a cost that cannot be got back");
    await expect(p.start({ mode: "manual", genre: "horror", shape: "frame" as any })).rejects.toThrow(/shape frame is not listen/);
  });

  test("a draw's stage models override stages.toml for its own calls, follow it into a repair, and are set again at any gate action", async () => {
    const { db, dir } = fixture();
    const { p, model } = pipe(db, dir);
    const draw = await p.start({ mode: "manual", genre: "horror", models: { judgement: "claude-sonnet-5", execute: "claude-haiku-4-5" } });
    expect(JSON.parse(p.draw(draw.id).models!)).toMatchObject({ execute: "claude-haiku-4-5", "check-ledger": "claude-sonnet-5", "screen-structure": "claude-sonnet-5" });
    expect(model.calls.find((c) => c.stage === "premises")!.model).toBe(p.stages.premises.model);
    expect(model.calls.filter((c) => c.stage === "execute").every((c) => c.model === "claude-haiku-4-5")).toBe(true);
    expect(p.stageFor("check-ledger", draw.id).model).toBe("claude-sonnet-5");
    expect(p.stageFor("check-ledger", null).model).toBe(p.stages["check-ledger"].model);
    // a group set later merges over what the draw has; a name that is neither stage nor group is refused
    expect(p.setModels(draw.id, { scene: "claude-opus-5" })).toMatchObject({ execute: "claude-haiku-4-5", scene: "claude-opus-5" });
    expect(() => p.setModels(draw.id, { scenes: "claude-opus-5" })).toThrow(/not a stage or a group/);
    expect(p.like(draw.id).models).toMatchObject({ scene: "claude-opus-5" });
    // a repair or a fork copies the draw, models included
    p.copyDraw(p.draw(draw.id), "fork-1", { forked_from: draw.id }, null);
    expect(JSON.parse(p.draw("fork-1").models!)).toMatchObject({ execute: "claude-haiku-4-5", scene: "claude-opus-5" });
    expect(p.stageFor("scene", "fork-1").model).toBe("claude-opus-5");
    expect(db).toBeTruthy();
  });

  test("a step records the usage the CLI reported, and none when it reported none", async () => {
    const { db, dir } = fixture();
    const { p, model } = pipe(db, dir, script({ premises: () => ({ text: premises(), usage: { input: 10, cache_read: 500, cache_write: 20, output: 30, thinking: 5, cost_usd: 0.01 } }) }));
    const draw = await p.start({ mode: "manual", genre: "horror" });
    const steps = p.steps(draw.id);
    expect(JSON.parse(steps.find((s) => s.stage === "premises")!.usage!)).toEqual({ input: 10, cache_read: 500, cache_write: 20, output: 30, thinking: 5, cost_usd: 0.01 });
    expect(steps.find((s) => s.stage === "execute")!.usage).toBeNull();
    expect(model.calls.length).toBeGreaterThan(1);
  });

  test("a tail draw is what the default is, and says so", async () => {
    const { db, dir } = fixture();
    const { p, model } = pipe(db, dir);
    const draw = await p.start({ mode: "manual", genre: "horror" });
    expect(draw.sampling).toBe("tail");
    expect(model.calls.find((c) => c.stage === "premises")!.prompt).toContain("Sample from the tail of the distribution");
  });

  test("templates reject the forbidden vocabulary", () => {
    expect(() => checkTemplate("x", "Derive the structure.")).not.toThrow();
    expect(() => checkTemplate("x", "Reason backward from them.")).toThrow(/vocabulary rule/);
    expect(() => checkTemplate("x", "two sentences on how you arrived at it")).toThrow(/vocabulary rule/);
    expect(() => checkTemplate("x", "Think step by step.")).toThrow(/vocabulary rule/);
  });
});
