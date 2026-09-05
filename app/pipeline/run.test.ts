import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb, type Db } from "./store/db.ts";
import { FakeModel } from "./model.ts";
import { Pipeline, StepFailure } from "./run.ts";
import { checkTemplate } from "./prompts.ts";
import { loadStages } from "./config.ts";

const CELLS = ["informational", "mixed", "involved"].flatMap((v) => ["non-narrative", "mixed", "narrative"].map((m) => [v, m]));

function fixture(): { db: Db; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "fogbelt-run-"));
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
const outline = (extra: string[] = []) => ["debt audit", "arithmetic", "custody", ...extra].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n");
const script = (over: Record<string, any> = {}) => ({
  premises: [premises()],
  execute: (p: string) => vignette(Number(/Premise (\d)/.exec(p)?.[1] ?? 0)),
  outline: [outline()],
  jobs: ["<job>Test the first thing: scene one.</job><job>Test a second thing: scene two.</job>"],
  context: (p: string) => `<vignette>context for ${/Its job: (.*)/.exec(p)?.[1]}</vignette>`,
  ending: ["<ending>The last beat.</ending>"],
  ...over,
});

function pipe(db: Db, dir: string, s = script(), rng = () => 0.001) {
  const model = new FakeModel(s);
  return { model, p: new Pipeline(db, model, { rng, packetsDir: join(dir, "packets") }) };
}

describe("run graph", () => {
  test("auto run: draw, five executions, lowest probability, outline, jobs, siblings, packet", async () => {
    const { db, dir } = fixture();
    const { p, model } = pipe(db, dir);
    const run = await p.start({ mode: "auto", segment: { source: "scp" } });
    expect(run.status).toBe("done");
    expect(run.genre).toBe("horror");
    expect(run.seed_mode).toBe("drawn");
    expect(run.seed_theme_id).toBe("t1");
    expect(JSON.parse(run.example_ids)).toHaveLength(6);
    expect(new Set(JSON.parse(run.example_ids).map((id: string) => id[0]))).toEqual(new Set(["h"]));   // segment respected
    const stages = model.calls.map((c) => c.stage);
    expect(stages.filter((s) => s === "execute")).toHaveLength(5);
    expect(stages.indexOf("outline")).toBeGreaterThan(stages.lastIndexOf("execute"));
    expect(stages.filter((s) => s === "context")).toHaveLength(2);
    expect(stages.filter((s) => s === "ending")).toHaveLength(1);
    // prompt order: examples first, ask last; execute sees only its own premise
    const pr = model.calls.find((c) => c.stage === "premises")!;
    expect(pr.prompt.indexOf("horror passage")).toBeLessThan(pr.prompt.indexOf("Generate five premises"));
    expect(pr.prompt).toContain("A theme with a turn.");
    expect(pr.prompt).toContain("under 0.10");
    expect(pr.prompt).toMatch(/absurd/);
    const ex = model.calls.filter((c) => c.stage === "execute");
    expect(ex[0].prompt).toContain("Premise 1 text.");
    expect(ex[0].prompt).not.toContain("Premise 2 text.");
    // gate: lowest probability (0.03, tie between 2 and 4 → rng 0.001 picks the first)
    expect(run.gate_method).toBe("auto");
    const chosen = p.candidates(run.id).find((c) => c.step_id === run.chosen_step)!;
    expect(chosen.probability).toBe(0.03);
    // siblings see the outline and the chosen vignette, not each other
    const ctx = model.calls.filter((c) => c.stage === "context");
    expect(ctx[0].prompt).toContain("Section debt audit body.");
    expect(ctx[0].prompt).toContain("Its job: Test the first thing");
    expect(ctx[1].prompt).not.toContain("context for");
    const end = model.calls.find((c) => c.stage === "ending")!;
    expect(end.prompt).not.toContain("context for");
    // every step stored with model, system prompt, prompt, raw, parsed
    for (const s of p.steps(run.id)) {
      expect(s.status).toBe("done");
      expect(s.model).toBe(loadStages()[s.stage as keyof ReturnType<typeof loadStages>].model);
      expect(s.system_prompt.length).toBeGreaterThan(10);
      expect(s.raw_response).toBeTruthy();
      expect(s.parsed).toBeTruthy();
    }
    expect(p.steps(run.id).filter((s) => s.stage === "execute").every((s) => s.parent_id === p.steps(run.id).find((x) => x.stage === "premises")!.id)).toBe(true);
    // packet
    const dirP = join(dir, "packets", run.id);
    for (const f of ["vignette.md", "outline.md", "context-1.md", "context-2.md", "ending.md", "trail.md"]) expect(existsSync(join(dirP, f))).toBe(true);
    const trail = readFileSync(join(dirP, "trail.md"), "utf8");
    expect(trail).toContain("A theme with a turn.");
    expect(trail).toContain("← chosen");
    expect(trail).toContain("gate: auto");
    expect(trail.match(/^- \*\*0\.0\d\*\*/gm)).toHaveLength(5);
    expect(readFileSync(join(dirP, "vignette.md"), "utf8")).toContain("w2_0");
  });

  test("manual run stops at the gate; choose resumes; candidates sorted by probability", async () => {
    const { db, dir } = fixture();
    const { p } = pipe(db, dir);
    const run = await p.start({ mode: "manual", genre: "horror" });
    expect(run.status).toBe("awaiting_gate");
    expect(p.steps(run.id).map((s) => s.stage).sort()).toEqual(["execute", "execute", "execute", "execute", "execute", "premises"]);
    const cs = p.candidates(run.id);
    expect(cs.map((c) => c.probability)).toEqual([0.03, 0.03, 0.05, 0.06, 0.08]);
    const done = await p.choose(run.id, cs[4].step_id);
    expect(done.status).toBe("done");
    expect(done.gate_method).toBe("manual");
    expect(done.chosen_step).toBe(cs[4].step_id);
    await expect(p.choose(run.id, cs[0].step_id)).rejects.toThrow(/not awaiting_gate/);
  });

  test("reject: redraw and keep-seed create linked runs; flag starts nothing", async () => {
    const { db, dir } = fixture();
    const s = script({ premises: [premises(), premises(), premises()] });
    const { p } = pipe(db, dir, s);
    const run = await p.start({ mode: "manual", genre: "horror", seed: { mode: "typed", text: "a typed seed" } });
    const flagged = p.flag(run.id, "call looks wrong");
    expect(flagged.flagged).toBe(1);
    expect(flagged.status).toBe("awaiting_gate");
    const next = await p.reject(run.id, "keep-seed", "flat batch");
    expect(next.seed_text).toBe("a typed seed");
    expect(next.seed_mode).toBe("typed");
    expect(p.run(run.id).status).toBe("rejected");
    expect(p.run(run.id).superseded_by).toBe(next.id);
    expect(JSON.parse(next.example_ids)).toHaveLength(6);
    const third = await p.reject(next.id, "redraw");
    expect(third.seed_mode).toBe("drawn");
    expect(third.seed_text).toBe("A theme with a turn.");
    expect(p.run(next.id).superseded_by).toBe(third.id);
  });

  test("shape failures retry once on the same model then fail and flag the run", async () => {
    const { db, dir } = fixture();
    const bad = premises([0.05, 0.03, 0.12, 0.03, 0.06]);            // one over the ceiling
    const { p, model } = pipe(db, dir, script({ premises: [bad, "<premise>only one</premise>"] }));
    await expect(p.start({ mode: "auto", genre: "horror" })).rejects.toThrow(StepFailure);
    const run = p.runs()[0];
    expect(run.status).toBe("failed");
    expect(run.flagged).toBe(1);
    const steps = p.steps(run.id);
    expect(steps.map((s) => [s.stage, s.status, s.fail_reason, s.attempt])).toEqual([["premises", "failed", "shape", 1], ["premises", "failed", "shape", 2]]);
    expect(model.calls.every((c) => c.model === loadStages().premises.model)).toBe(true);
  });

  test("refusal reruns once on the fallback model and records both", async () => {
    const { db, dir } = fixture();
    const { p, model } = pipe(db, dir, script({ outline: [{ text: "API Error: safeguards", stop: "refusal" }, outline()] }));
    const run = await p.start({ mode: "auto", genre: "horror" });
    expect(run.status).toBe("done");
    const os = p.steps(run.id).filter((s) => s.stage === "outline");
    expect(os.map((s) => [s.status, s.fail_reason, s.model])).toEqual([["failed", "refusal", loadStages().outline.model], ["done", null, loadStages().outline.fallback]]);
    expect(model.calls.filter((c) => c.stage === "outline").map((c) => c.model)).toEqual([loadStages().outline.model, loadStages().outline.fallback]);
  });

  test("double refusal fails with reason refusal, never shape", async () => {
    const { db, dir } = fixture();
    const { p } = pipe(db, dir, script({ premises: [{ text: "", stop: "refusal" }, { text: "", stop: "refusal" }] }));
    const err = await p.start({ mode: "auto", genre: "horror" }).catch((e) => e);
    expect(err).toBeInstanceOf(StepFailure);
    expect(err.reason).toBe("refusal");
    expect(p.runs()[0].status).toBe("failed");
  });

  test("a setting appends its body after the examples, its hard rules last, and adds outline jobs", async () => {
    const { db, dir } = fixture();
    const { p, model } = pipe(db, dir, script({ outline: [outline(["matrix"])] }));
    const run = await p.start({ mode: "auto", genre: "horror", setting: "setting-a" });
    expect(run.status).toBe("done");
    const pr = model.calls.find((c) => c.stage === "premises")!.prompt;
    const iEx = pr.indexOf("horror passage"), iBody = pr.indexOf("The setting-a matrix is structural"), iAsk = pr.indexOf("Generate five premises"), iRules = pr.lastIndexOf("## Hard rules");
    expect(iEx).toBeLessThan(iBody);
    expect(iBody).toBeLessThan(iAsk);
    expect(iAsk).toBeLessThan(iRules);
    expect(pr.slice(iRules)).toContain("Nothing resolves");
    const ol = model.calls.find((c) => c.stage === "outline")!.prompt;
    expect(ol).toContain('<section name="matrix">');
    expect(readFileSync(join(dir, "packets", run.id, "outline.md"), "utf8")).toContain("## matrix");
  });

  test("unrestricted prompts carry nothing beyond passages, seed, ask and genre", async () => {
    const { db, dir } = fixture();
    const { p, model } = pipe(db, dir);
    await p.start({ mode: "auto", genre: "horror" });
    const pr = model.calls.find((c) => c.stage === "premises")!.prompt;
    expect(pr).not.toContain("Hard rules");
    expect(pr.split("\n\n").length).toBeLessThanOrEqual(6 + 3);   // six passages plus the ask block
  });

  test("draw fails naming the count when a segment is thin; genre must be given when examples span both", async () => {
    const { db, dir } = fixture();
    db.exec("DELETE FROM passages WHERE id IN ('h0','h1','h2','h3','h4')");
    const { p } = pipe(db, dir);
    await expect(p.start({ mode: "auto", segment: { source: "scp" } })).rejects.toThrow(/only 4 eligible passages.*6 needed/);
    await expect(p.start({ mode: "auto" })).rejects.toThrow(/span genres.*--genre/);
  });

  test("templates reject the forbidden vocabulary", () => {
    expect(() => checkTemplate("x", "Derive the structure.")).not.toThrow();
    expect(() => checkTemplate("x", "Reason backward from them.")).toThrow(/vocabulary rule/);
    expect(() => checkTemplate("x", "two sentences on how you arrived at it")).toThrow(/vocabulary rule/);
    expect(() => checkTemplate("x", "Think step by step.")).toThrow(/vocabulary rule/);
  });
});
