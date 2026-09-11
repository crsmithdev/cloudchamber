import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { settingsFixture } from "./settings.fixture.ts";
import { words } from "./model.ts";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb, type Db } from "./store/db.ts";
import { FakeModel } from "./model.ts";
import { Pipeline, StepFailure } from "./draw.ts";
import { originOf, stageOf } from "./stage.ts";
import { record } from "./verdicts.ts";
import { checkTemplate } from "./prompts.ts";
import { loadStages } from "./config.ts";

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

function pipe(db: Db, dir: string, s = script(), rng = () => 0.001, settingsDir?: string) {
  const model = new FakeModel(s);
  return { model, p: new Pipeline(db, model, { rng, briefsDir: join(dir, "briefs"), settingsDir }) };
}

describe("draw graph", () => {
  test("auto draw: examples and seed drawn, five executions, lowest probability, outline, jobs, siblings, brief", async () => {
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
    // premises are numbered from the tail: #1 is the lowest probability (0.03, model's 2nd), ties keep model order
    const ex = model.calls.filter((c) => c.stage === "execute");
    expect(ex[0].prompt).toContain("Premise 2 text.");
    expect(ex[0].prompt).not.toContain("Premise 1 text.");
    expect(p.candidates(draw.id).map((c) => [c.index, c.probability])).toEqual([[1, 0.03], [2, 0.03], [3, 0.05], [4, 0.06], [5, 0.08]]);
    // gate: lowest probability (0.03, tie between 2 and 4 → rng 0.001 picks the first)
    expect(draw.gate_method).toBe("auto");
    const chosen = p.candidates(draw.id).find((c) => c.step_id === draw.chosen_step)!;
    expect(chosen.probability).toBe(0.03);
    // siblings see the outline and the chosen vignette, not each other
    const ctx = model.calls.filter((c) => c.stage === "context");
    expect(ctx[0].prompt).toContain("Section debt audit body.");
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
      jobs: Array(2).fill("<job>Test the first thing: scene one.</job><job>Test a second thing: scene two.</job>"),
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
    expect(steps.map((s) => s.stage).sort()).toEqual(["context", "context", "ending", "execute", "jobs", "outline"]);
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

  test("shape failures retry once on the same model then fail and flag the draw", async () => {
    const { db, dir } = fixture();
    const bad = premises([0.05, 0.03, 0.12, 0.03, 0.06]);            // one over the ceiling
    const { p, model } = pipe(db, dir, script({ premises: [bad, "<premise>only one</premise>"] }));
    await expect(p.start({ mode: "auto", genre: "horror" })).rejects.toThrow(StepFailure);
    const draw = p.draws()[0];
    expect(draw.status).toBe("failed");
    expect(draw.flagged).toBe(1);
    const steps = p.steps(draw.id);
    expect(steps.map((s) => [s.stage, s.status, s.fail_reason, s.attempt])).toEqual([["premises", "failed", "shape", 1], ["premises", "failed", "shape", 2]]);
    expect(model.calls.every((c) => c.model === loadStages().premises.model)).toBe(true);
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

  test("double refusal fails with reason refusal, never shape", async () => {
    const { db, dir } = fixture();
    const { p } = pipe(db, dir, script({ premises: [{ text: "", stop: "refusal" }, { text: "", stop: "refusal" }] }));
    const err = await p.start({ mode: "auto", genre: "horror" }).catch((e) => e);
    expect(err).toBeInstanceOf(StepFailure);
    expect(err.reason).toBe("refusal");
    expect(p.draws()[0].status).toBe("failed");
  });

  test("a setting is sliced by stage: two drawn domains, the loaded sections only, hard rules last, jobs on the outline", async () => {
    const { db, dir } = fixture();
    const sdir = settingsFixture(dir);
    const { p, model } = pipe(db, dir, script({ outline: [outline(["matrix"])] }), () => 0.001, sdir);
    const draw = await p.start({ mode: "auto", genre: "horror", setting: "fog" });
    expect(draw.status).toBe("done");
    expect(JSON.parse(draw.domains!)).toEqual(["land-and-title", "labour"]);     // rng 0.001 picks the first remaining twice
    const call = (stage: string) => model.calls.find((c) => c.stage === stage)!.prompt;
    const lastHeading = (pr: string) => [...pr.matchAll(/^#{2,4} .+$/gm)].pop()![0];
    const has = (pr: string, xs: string[]) => { for (const x of xs) expect(pr).toContain(x); };
    const hasNot = (pr: string, xs: string[]) => { for (const x of xs) expect(pr).not.toContain(x); };
    // premises: examples, Matrix, Do not build, Open ground, domain Frame/Mechanisms/Roles, ask, Hard rules last
    const pr = call("premises");
    expect(pr.indexOf("horror passage")).toBeLessThan(pr.indexOf("## Matrix"));
    expect(pr.indexOf("## Matrix")).toBeLessThan(pr.indexOf("Generate five premises"));
    has(pr, ["## Matrix", "## Do not build", "## Open ground", "### 1. Land and title", "### 6. Labour", "#### Frame", "#### Mechanisms", "#### Roles", "A boundary called to a willow", "the deputy"]);
    hasNot(pr, ["#### Institutions", "#### Instruments", "#### Clocks", "#### Places", "#### Vocabulary", "#### Sources", "## Jobs", "### 12. Death", "reference/", "Probate Code"]);
    expect(lastHeading(pr)).toBe("## Hard rules");
    expect(pr.slice(pr.indexOf("## Hard rules"))).toContain("Nothing resolves");
    // execute: nouns, not mechanisms
    const ex = call("execute");
    has(ex, ["## Matrix", "## Do not build", "#### Frame", "#### Roles", "#### Instruments", "#### Places", "#### Vocabulary", "the diseño"]);
    hasNot(ex, ["#### Mechanisms", "#### Institutions", "#### Clocks", "#### Sources", "## Open ground", "## Jobs"]);
    expect(lastHeading(ex)).toBe("## Hard rules");
    // outline: institutions, instruments, clocks; the setting job as a section ask; head first
    const ol = call("outline");
    expect(ol.indexOf("Seed:")).toBeLessThan(ol.indexOf("## Matrix"));
    expect(ol.indexOf("## Matrix")).toBeLessThan(ol.indexOf("Write one section per job"));
    has(ol, ["#### Frame", "#### Mechanisms", "#### Institutions", "#### Instruments", "#### Clocks", '<section name="matrix">', "The county recorder", "the weekly settlement sheet"]);
    hasNot(ol, ["#### Roles", "#### Places", "#### Vocabulary", "#### Sources", "## Open ground", "## Jobs"]);
    expect(lastHeading(ol)).toBe("## Hard rules");
    // jobs, context, ending: institutions, instruments, clocks, vocabulary after the head
    for (const stage of ["jobs", "context", "ending"]) {
      const t = call(stage);
      expect(t.indexOf("Section debt audit body.")).toBeLessThan(t.indexOf("## Matrix"));
      has(t, ["#### Frame", "#### Institutions", "#### Instruments", "#### Clocks", "#### Vocabulary"]);
      hasNot(t, ["#### Mechanisms", "#### Roles", "#### Places", "#### Sources", "## Open ground", "## Jobs"]);
      expect(lastHeading(t)).toBe("## Hard rules");
    }
    // the draw row, the brief
    expect(readFileSync(join(dir, "briefs", draw.id, "outline.md"), "utf8")).toContain("## matrix");
    const trail = readFileSync(join(dir, "briefs", draw.id, "trail.md"), "utf8");
    expect(trail).toContain("## domains\n\n- 1. Land and title\n- 6. Labour");
    expect(words(pr)).toBeLessThan(5000);
  });

  test("the domain draw is independent of the seed, pinnable, and refuses a bad slug or a draw over the count", async () => {
    const { db, dir } = fixture();
    const sdir = settingsFixture(dir);
    const twice = { premises: [premises(), premises()], outline: [outline(["matrix"]), outline(["matrix"])], jobs: [script().jobs[0], script().jobs[0]], ending: [script().ending[0], script().ending[0]] };
    const { p } = pipe(db, dir, script(twice), () => 0.001, sdir);
    const a = await p.start({ mode: "auto", genre: "horror", setting: "fog", seed: { mode: "typed", text: "one seed" } });
    const b = await p.start({ mode: "auto", genre: "horror", setting: "fog", seed: { mode: "typed", text: "another seed" } });
    expect(a.domains).toBe(b.domains);
    const { p: p2, model } = pipe(db, dir, script({ outline: [outline(["matrix"])] }), () => 0.001, sdir);
    const c = await p2.start({ mode: "auto", genre: "horror", setting: "fog", domains: ["labour", "death-and-its-administration"] });
    expect(JSON.parse(c.domains!)).toEqual(["labour", "death-and-its-administration"]);
    const pr = model.calls.find((x) => x.stage === "premises")!.prompt;
    expect(pr.indexOf("### 6. Labour")).toBeLessThan(pr.indexOf("### 12. Death and its administration"));
    expect(pr).not.toContain("### 1. Land and title");
    await expect(p2.start({ mode: "auto", genre: "horror", setting: "fog", domains: ["nope"] })).rejects.toThrow("setting fog: no domain nope");
    await expect(p2.start({ mode: "auto", genre: "horror", domains: ["labour"] })).rejects.toThrow(/--domains needs --setting/);
    writeFileSync(join(sdir, "fog.md"), readFileSync(join(sdir, "fog.md"), "utf8").replace("draw: 2", "draw: 4"));
    await expect(p2.start({ mode: "auto", genre: "horror", setting: "fog" })).rejects.toThrow("setting fog: draw 4 exceeds 3 domains");
    expect(p2.draws().filter((d) => d.status === "running")).toHaveLength(0);   // nothing inserted before the failure
  });

  test("a setting that fails lint is refused before any model call, naming the findings", async () => {
    const { db, dir } = fixture();
    const sdir = settingsFixture(dir);
    writeFileSync(join(sdir, "fog.md"), readFileSync(join(sdir, "fog.md"), "utf8").replace("#### Clocks\n\nnone\n\n#### Places", "#### Places"));
    const { p, model } = pipe(db, dir, script(), () => 0.001, sdir);
    await expect(p.start({ mode: "auto", genre: "horror", setting: "fog" })).rejects.toThrow(/land-and-title › Clocks: missing/);
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
      jobs: Array(2).fill("<job>Test the first thing: scene one.</job><job>Test a second thing: scene two.</job>"),
      ending: Array(2).fill("<ending>The last beat.</ending>"),
    });
    const { p } = pipe(db, dir, twice);
    const draw = await p.start({ mode: "manual", genre: "horror" });
    expect(stageOf(db, draw)).toBe("ideate");
    expect(originOf(p, draw.id)).toBeNull();                       // nothing chosen: it is only a batch
    const cs = p.candidates(draw.id);
    await p.choose(draw.id, cs[0].step_id);
    expect(stageOf(db, p.draw(draw.id))).toBe("check");            // check from the choice, not from the brief
    expect(originOf(p, draw.id)).toMatchObject({ id: draw.id, index: 1, probability: 0.03 });
    // a fork reports the candidate it develops, and the draw it came from
    const fork = await p.fork(draw.id, cs[1].step_id);
    expect(stageOf(db, fork)).toBe("check");
    expect(originOf(p, fork.id)).toMatchObject({ id: draw.id, name: draw.name, index: 2 });
    // gate 1 and gate 2 both write `passed`; the verdict says which gate it was
    db.query("UPDATE draws SET status = 'passed' WHERE id = ?").run(fork.id);
    expect(stageOf(db, p.draw(fork.id))).toBe("check");
    record(db, { kind: "draft", target_id: fork.id, verdict: "pass", method: "gate" });
    expect(stageOf(db, p.draw(fork.id))).toBe("write");
    // a repair sets chosen_step a few seconds in; the link to the brief it repairs holds the stage until then
    expect(stageOf(db, { id: "x", status: "running", chosen_step: null, repaired_from: draw.id })).toBe("check");
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
