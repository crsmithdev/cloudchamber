import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SCHEMA_VERSION, openDb, type Db } from "./store/db.ts";
import { FakeModel } from "./model.ts";
import { Pipeline } from "./draw.ts";
import { Drafting } from "./drafting.ts";
import { settingsFixture } from "./settings.fixture.ts";
import { LISTS, loadSetting } from "./settings.ts";
import { latest, readLog, record } from "./verdicts.ts";
import { status } from "./status.ts";
import { TEMPLATES } from "./prompts.ts";
import { loadStages } from "./config.ts";
import { loadDraftConfig } from "./draftconfig.ts";
import { VERDICT_LOG } from "./paths.ts";
import { A, B, LEDGER, SPAN_A, SPAN_B, SPAN_C, cleanSamples, derivationSamples, draftScript, finding, ledgerSamples, schedule, vignette } from "./drafting.fixture.ts";

const CELLS = ["informational", "mixed", "involved"].flatMap((v) => ["non-narrative", "mixed", "narrative"].map((m) => [v, m]));

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "cloudchamber-drafting-"));
  const db = openDb(join(dir, "t.db"));
  db.exec(`INSERT INTO sources (id, path, reader, genre) VALUES ('scp', 'x', 'scp', 'horror')`);
  db.exec(`INSERT INTO stories (id, source_id, ord, title, author, genre, words, text) VALUES ('scp/a', 'scp', 0, 'A', 'Ann', 'horror', 9000, 'x')`);
  const ins = db.query("INSERT INTO passages (id, story_id, text, words, stratum, position, seed, first_seen, voice, mode) VALUES (?, ?, ?, 200, 0, 0, 0, 'now', ?, ?)");
  CELLS.forEach(([v, m], i) => ins.run(`h${i}`, "scp/a", `horror passage ${i} ${v} ${m}. Nothing here is strange, and the ledger holds.`, v, m));
  db.exec(`INSERT INTO themes (id, text, attestation, stories, drafted_at) VALUES ('t1', 'A theme with a turn.', 1, '["scp/a"]', 'now')`);
  return { db, dir };
}

async function drawn(script = draftScript(), setting?: { id: string; dir: string; claims?: string }) {
  const { db, dir } = fixture();
  const model = new FakeModel(script);
  const p = new Pipeline(db, model, { rng: () => 0.001, briefsDir: join(dir, "briefs"), settingsDir: setting?.dir });
  if (setting) {
    const path = join(setting.dir, `${setting.id}.md`);
    const text = readFileSync(path, "utf8");
    writeFileSync(path, setting.claims ? text.replace("claims: setting", `claims: ${setting.claims}`) : text.replace("claims: setting\n", ""));
  }
  const draw = await p.start({ mode: "auto", genre: "horror", setting: setting?.id, seed: { mode: "typed", text: "a typed seed" } });
  const d = new Drafting(p, { draftsDir: join(dir, "drafts") });
  return { db, dir, model, p, d, draw };
}

const stagesOf = (model: FakeModel, re: RegExp) => model.calls.filter((c) => re.test(c.stage)).map((c) => c.stage);

describe("check and gate 1", () => {
  test("K checkers × S samples, recurrence, cross-checker merge, ordering, profiles, examined lists, same-family line", async () => {
    const { model, p, d, draw } = await drawn();
    const r = await d.check(draw.id);
    expect(p.draw(draw.id).status).toBe("awaiting_check_gate");
    expect(stagesOf(model, /^check-/).sort()).toEqual(["check-derivation", "check-derivation", "check-derivation", "check-ledger", "check-ledger", "check-ledger", "check-resemblance", "check-structure"]);
    expect(r.claims).toBe("off");
    // A recurs 3/3 in both checkers and merges; B recurs 2/3; C (1/3) is not stored
    const f = d.findings(draw.id);
    expect(f.findings.map((x) => [x.checkers, x.n, x.invalidates, x.decision])).toEqual([[["derivation", "ledger"], 3, "debt audit", "open"], [["ledger"], 2, "arithmetic", "open"]]);
    expect(f.findings[0].replacement).toBe("Only the assembler can fire the reliquary.");
    expect(f.findings[1].samples).toEqual([1, 3]);
    expect(p.artifacts(draw.id).filter((a) => a.kind === "finding")).toHaveLength(2);
    expect(p.artifacts(draw.id).some((a) => a.kind === "finding" && a.content.includes("tears"))).toBe(false);
    expect(p.artifacts(draw.id).filter((a) => a.kind === "ledger")).toHaveLength(1);
    expect(p.artifacts(draw.id).filter((a) => a.kind === "profile").map((a) => JSON.parse(a.meta).checker).sort()).toEqual(["resemblance", "structure"]);
    expect(f.examined.filter((e) => e.stage === "check-ledger")).toHaveLength(3);
    expect(f.examined.find((e) => e.stage === "check-ledger")!.examined).toContain("ledger×chosen");
    expect(f.judge).toBe("checked on opus; judge and generator share a family");
    expect(f.claims).toEqual([]);
    // every check step stores no tools and the brief in its prompt
    for (const s of p.steps(draw.id).filter((s) => /^check-/.test(s.stage))) { expect(s.tools).toBe(""); expect(s.prompt).toContain('<vignette name="chosen">'); expect(s.parsed).toBeTruthy(); }
    expect(model.calls.find((c) => c.stage === "check-resemblance")!.prompt).toContain("3. The madman");
    await expect(d.check("nope")).rejects.toThrow(/no draw nope/);
    expect((status(p.db).draws as any[]).find((x) => x.status === "awaiting_check_gate").n).toBe(1);
  });

  test("dismiss is a finding verdict; a re-check does not raise the finding again; hold changes nothing", async () => {
    const { p, d, draw, model } = await drawn(draftScript({ "check-ledger": [...ledgerSamples(), ...ledgerSamples()], "check-derivation": [...derivationSamples(), ...derivationSamples()] }));
    await d.check(draw.id);
    const [a, b] = d.findings(draw.id).findings;
    const dis = d.dismiss(draw.id, b.id, "the seam is deliberate");
    expect(dis.decision).toBe("dismissed");
    expect(latest(p.db, "finding", b.id)).toMatchObject({ verdict: "pass", note: "the seam is deliberate" });
    expect(d.hold(draw.id).status).toBe("awaiting_check_gate");
    await d.check(draw.id);
    const again = d.findings(draw.id).findings;
    expect(again.map((x) => x.id)).toEqual([a.id]);
    expect(stagesOf(model, /^check-ledger$/)).toHaveLength(6);
    expect(() => d.dismiss(draw.id, "f-nothere")).toThrow(/no reported finding f-nothere/);
  });

  test("accept repairs into a linked draw: the ending holding the span is rewritten, the vignette copied, the outline re-derived under constraints, then re-checked", async () => {
    const { p, d, draw, model, dir } = await drawn(draftScript({ "check-ledger": [...ledgerSamples(), ...cleanSamples()], "check-derivation": [...derivationSamples(), ...cleanSamples()] }));
    await d.check(draw.id);
    const [a] = d.findings(draw.id).findings;
    const next = await d.accept(draw.id, [a.id]);
    expect(next.id).not.toBe(draw.id);
    expect(next.repaired_from).toBe(draw.id);
    expect(next.status).toBe("awaiting_check_gate");
    expect(next.seed_text).toBe("a typed seed");
    expect(next.example_ids).toBe(draw.example_ids);
    expect(p.draw(draw.id)).toMatchObject({ status: "repaired", superseded_by: next.id });
    expect(latest(p.db, "finding", a.id)).toMatchObject({ verdict: "keep" });
    const steps = p.steps(next.id);
    const by = (stage: string) => steps.filter((s) => s.stage === stage);
    expect(by("repair-vignette").map((s) => s.model)).toEqual(["copied"]);            // the span is not in the vignette
    expect(by("repair-ending")).toHaveLength(1);
    expect(by("repair-ending")[0].model).not.toBe("copied");                       // the span is in the ending
    expect(by("repair-outline")[0].prompt).toContain("<constraints>\n- Only the assembler can fire the reliquary.\n</constraints>");
    expect(by("repair-outline")[0].prompt).not.toContain("Reason");
    // no accepted finding lands in a context vignette, so both are carried over and no jobs call runs
    expect(by("jobs").map((s) => s.model)).toEqual(["copied"]);
    expect(by("context").map((s) => s.model)).toEqual(["copied", "copied"]);
    expect(model.calls.filter((c) => c.stage === "jobs" || c.stage === "context")).toHaveLength(3);   // the draw's own one and two, not the repair's
    expect(p.artifacts(next.id).filter((a) => a.kind === "job").map((a) => a.content)).toEqual(["Test the first thing: scene one.", "Test a second thing: scene two."]);
    expect(model.calls.find((c) => c.stage === "repair-ending")!.prompt).toContain(SPAN_A);
    expect(model.calls.find((c) => c.stage === "repair-ending")!.prompt).toContain("Rewrite the ending");
    expect(model.calls.filter((c) => c.stage === "execute")).toHaveLength(5);      // nothing regenerated from the premise
    // the new brief and its trail
    const bdir = join(dir, "briefs", next.id);
    for (const f of ["vignette.md", "outline.md", "context-1.md", "context-2.md", "ending.md", "ending.previous.md", "trail.md"]) expect(existsSync(join(bdir, f))).toBe(true);
    expect(readFileSync(join(bdir, "ending.previous.md"), "utf8")).toContain(SPAN_A);
    expect(readFileSync(join(bdir, "ending.md"), "utf8")).toContain("Only the assembler");
    expect(readFileSync(join(bdir, "vignette.md"), "utf8")).toContain("w2_0");
    expect(readFileSync(join(bdir, "outline.md"), "utf8")).toContain("Repaired debt audit body.");
    const trail = readFileSync(join(bdir, "trail.md"), "utf8");
    expect(trail).toContain("# Trail (repaired)");
    expect(trail).toContain(`## repaired_from\n\n${draw.id}\n\n- Only the assembler can fire the reliquary.`);
    // the re-check ran on the new draw and found nothing
    expect(p.steps(next.id).filter((s) => s.stage === "check-ledger")).toHaveLength(3);
    expect(d.findings(next.id).findings).toEqual([]);
    expect(d.findings(next.id).judge).toBe("checked on opus; judge and generator share a family");
    await expect(d.accept(draw.id, [a.id])).rejects.toThrow(/is repaired, not awaiting_check_gate/);
  });

  test("a finding whose span is inside the chosen vignette rewrites the vignette and copies the ending", async () => {
    const span = "the twelfth relic, the Verona clavicle";
    const script = draftScript({
      execute: (p: string) => vignette(Number(/Premise (\d)/.exec(p)?.[1] ?? 0), `Here lies ${span} on the silk.`),
      "check-ledger": [...ledgerSamples(B(span), B(span)), ...cleanSamples()],
      "check-derivation": [...cleanSamples(), ...cleanSamples()],
    });
    const { p, d, draw } = await drawn(script);
    await d.check(draw.id);
    const f = d.findings(draw.id).findings;
    expect(f).toHaveLength(1);
    expect(f[0].invalidates).toBe("arithmetic");
    const next = await d.accept(draw.id, [f[0].id]);
    const by = (stage: string) => p.steps(next.id).filter((s) => s.stage === stage);
    expect(by("repair-vignette")[0].model).not.toBe("copied");
    expect(by("repair-vignette")[0].prompt).toContain(span);
    // arithmetic invalidated: the ending is rewritten even though the span is not in it
    expect(by("repair-ending")[0].model).not.toBe("copied");
    expect(p.artifacts(next.id).find((a) => a.kind === "vignette" && a.step_id === next.chosen_step)!.content).toContain("rewritten vignette");
  });

  test("the clusters below keep_if are reported on request, scored, and can be accepted and dismissed", async () => {
    const { p, d, draw, model } = await drawn(draftScript({ "check-ledger": [...ledgerSamples(), ...cleanSamples()], "check-derivation": [...derivationSamples(), ...cleanSamples()] }));
    await d.check(draw.id);
    const calls = model.calls.length;
    const reported = d.findings(draw.id).findings;
    const all = d.findings(draw.id, { all: true }).findings;
    expect(reported.map((x) => x.span)).toEqual([SPAN_A, SPAN_B]);
    expect(model.calls).toHaveLength(calls);                                    // reconstructed from the steps, nothing re-run
    // C recurred in one sample of three: below the bar, still a reading
    const sub = all.filter((x) => !x.reported);
    expect(sub.map((x) => [x.span, x.n, x.samples_run, x.invalidates])).toEqual([[SPAN_C, 1, 3, "custody"]]);
    expect(all.map((x) => x.score)).toEqual([10, 7, 5]);                        // sorted, the sub-threshold one last
    expect(sub[0].artifact_id).toBe("");                                        // no artifact until it is decided on
    expect(p.artifacts(draw.id).filter((a) => a.kind === "finding")).toHaveLength(2);
    // dismissing one promotes it to an artifact, so a re-check does not raise it again
    d.dismiss(draw.id, sub[0].id, "the silk is meant to be wet");
    expect(p.artifacts(draw.id).filter((a) => a.kind === "finding")).toHaveLength(3);
    expect(latest(p.db, "finding", sub[0].id)).toMatchObject({ verdict: "pass" });
    // it stays on the gate as a record of the decision, still marked below the bar, and a re-check will not raise it
    const after = d.findings(draw.id, { all: true }).findings.find((x) => x.span === SPAN_C)!;
    expect([after.decision, after.reported]).toEqual(["dismissed", false]);
    expect(d.findings(draw.id).findings.filter((x) => x.reported)).toHaveLength(2);
  });

  test("context-1.md holds job 1 however the context calls finish", async () => {
    // the second context call returns first, so its artifact row lands first
    let seen = 0;
    const script = draftScript({
      context: (p: string) => { seen++; return `<vignette>context for ${/Its job: (.*)/.exec(p)?.[1]}</vignette>`; },
      "check-ledger": [...ledgerSamples(), ...cleanSamples()], "check-derivation": [...derivationSamples(), ...cleanSamples()],
    });
    const { d, draw, dir } = await drawn(script);
    await d.check(draw.id);
    const [a] = d.findings(draw.id).findings;
    const next = await d.accept(draw.id, [a.id]);
    for (const id of [draw.id, next.id]) {
      const one = readFileSync(join(dir, "briefs", id, "context-1.md"), "utf8");
      const two = readFileSync(join(dir, "briefs", id, "context-2.md"), "utf8");
      expect(one).toContain("Test the first thing: scene one.");
      expect(two).toContain("Test a second thing: scene two.");
    }
    expect(seen).toBe(2);                                                      // the repair copied both, so no third call
  });

  test("a sub-threshold finding can drive a repair", async () => {
    const { p, d, draw } = await drawn(draftScript({ "check-ledger": [...ledgerSamples(), ...cleanSamples()], "check-derivation": [...cleanSamples(), ...cleanSamples()] }));
    await d.check(draw.id);
    const sub = d.findings(draw.id, { all: true }).findings.filter((x) => !x.reported);
    expect(sub.length).toBeGreaterThan(0);
    const next = await d.accept(draw.id, [sub[0].id]);
    expect(next.repaired_from).toBe(draw.id);
    expect(p.steps(next.id).find((s) => s.stage === "repair-outline")!.prompt).toContain("The silk is dry.");
    expect(JSON.parse(p.artifacts(draw.id).find((a) => a.kind === "finding" && a.content.includes("tears"))!.meta).sub_threshold).toBe(true);
  });

  test("a finding inside one context vignette rewrites that one and carries the other over with its job", async () => {
    const span = "context for Test the first thing: scene one.";
    const inContext = () => finding(span, "context-1 contradicts the ledger", "custody", "The first context holds.", "a second quote from the outline");
    const script = draftScript({
      "check-ledger": [
        `<ledger>${LEDGER}</ledger>${inContext()}<examined>ledger×context-1</examined>`,
        `<ledger>${LEDGER}</ledger>${inContext()}<examined>ledger×context-1</examined>`,
        `<ledger>${LEDGER}</ledger>${inContext()}<examined>ledger×context-1</examined>`,
        ...cleanSamples(),
      ],
      "check-derivation": [...cleanSamples(), ...cleanSamples()],
    });
    const { p, d, draw, model } = await drawn(script);
    await d.check(draw.id);
    const f = d.findings(draw.id).findings;
    expect(f).toHaveLength(1);
    const next = await d.accept(draw.id, [f[0].id]);
    const by = (stage: string) => p.steps(next.id).filter((s) => s.stage === stage);
    expect(by("jobs").map((s) => s.model)).not.toEqual(["copied"]);              // a fresh job for the rewritten slot
    expect(by("context").map((s) => s.model === "copied")).toEqual([false, true]);
    // the carried-over vignette keeps its own job line; the rewritten one takes the fresh job
    const jobs = p.artifacts(next.id).filter((a) => a.kind === "job").sort((a, b) => JSON.parse(a.meta).index - JSON.parse(b.meta).index);
    expect(jobs.map((a) => JSON.parse(a.meta).copied)).toEqual([false, true]);
    expect(jobs[1].content).toBe("Test a second thing: scene two.");
    const ctx = p.artifacts(next.id).filter((a) => a.kind === "vignette" && by("context").some((s) => s.id === a.step_id))
      .sort((a, b) => JSON.parse(a.meta).index - JSON.parse(b.meta).index);
    expect(ctx[1].content).toBe("context for Test a second thing: scene two.");
    expect(model.calls.filter((c) => c.stage === "context")).toHaveLength(3);    // two on the draw, one on the repair
  });

  test("pass at gate 1 records a brief verdict and ends the draw; flag starts nothing", async () => {
    const { p, d, draw } = await drawn();
    await d.check(draw.id);
    p.flag(draw.id, "looks wrong");
    expect(p.draw(draw.id).status).toBe("awaiting_check_gate");
    const out = d.passBrief(draw.id, "not this one");
    expect(out.status).toBe("passed");
    expect(latest(p.db, "brief", draw.id)).toMatchObject({ verdict: "pass", note: "not this one" });
    expect(readLog(VERDICT_LOG).filter((v) => v.kind === "brief" && v.target_id === draw.id)).toHaveLength(1);
  });
});

describe("claims", () => {
  test("claims: world runs extract then one search-enabled verify per claim on sonnet; contradicted becomes a finding", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    const { p, d, draw, model } = await drawn(draftScript({ outline: () => ["debt audit", "arithmetic", "custody", "matrix"].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n") }), { id: "basin", dir: sdir, claims: "world" });
    const r = await d.check(draw.id);
    expect(r.claims).toBe("world");
    expect(stagesOf(model, /claims/)).toEqual(["check-claims-extract", "check-claims-verify", "check-claims-verify"]);
    const verify = model.calls.filter((c) => c.stage === "check-claims-verify");
    expect(verify.every((c) => c.tools === "WebSearch,WebFetch" && c.model === loadStages()["check-claims-verify"].model)).toBe(true);
    expect(p.steps(draw.id).filter((s) => s.stage === "check-claims-verify").every((s) => s.tools === "WebSearch,WebFetch")).toBe(true);
    expect(model.calls.find((c) => c.stage === "check-claims-extract")!.tools).toBe("");
    expect(model.calls.find((c) => c.stage === "check-claims-extract")!.prompt).toContain("That a place, institution, product or person exists is not a claim");
    const f = d.findings(draw.id);
    const claims = f.findings.filter((x) => x.checkers.includes("claims"));
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ n: 1, result: "contradicted", replacement: "Naples to Van is about 2,000 km." });
    expect(claims[0].evidence).toContain("https://example.org/distance");
    expect((f.claims as any[]).map((c) => c.result).sort()).toEqual(["contradicted", "supported"]);
    expect(f.judge).toBeNull();     // sonnet verified; not every judge shares the generator's family
  });

  test("claims: setting verifies against the whole distillate, every list, and asks for claims about the setting", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    const { p, d, draw, model } = await drawn(draftScript({ outline: () => ["debt audit", "arithmetic", "custody", "matrix"].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n") }), { id: "basin", dir: sdir, claims: "setting" });
    const r = await d.check(draw.id);
    expect(r.claims).toBe("setting");
    expect(model.calls.find((c) => c.stage === "check-claims-extract")!.prompt).toContain("claims about the setting the story is set in");
    const verify = model.calls.filter((c) => c.stage === "check-claims-verify");
    expect(verify).toHaveLength(2);
    expect(verify.every((c) => c.tools === "")).toBe(true);
    const s = loadSetting("basin", sdir);
    for (const name of LISTS) for (const e of s.lists[name]) expect(verify[0].prompt).toContain(e);
    expect(verify[0].prompt).toContain("<setting>");
    expect(verify[0].prompt).toContain("Find the line in the setting above");
    expect(p.steps(draw.id).filter((s) => s.stage === "check-claims-verify").every((s) => s.tools === "")).toBe(true);
  });

  test("no claims key: the checker does not run", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    const { d, draw, model } = await drawn(draftScript({ outline: () => ["debt audit", "arithmetic", "custody", "matrix"].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n") }), { id: "basin", dir: sdir });
    const r = await d.check(draw.id);
    expect(r.claims).toBe("off");
    expect(stagesOf(model, /claims/)).toEqual([]);
  });

  test("a bad claims value fails lint", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    writeFileSync(join(sdir, "basin.md"), readFileSync(join(sdir, "basin.md"), "utf8").replace("claims: setting", "claims: everywhere"));
    const { lintFile } = await import("./settings.ts");
    expect(lintFile("basin", sdir).map((f) => f.reason)).toContain("claims must be world | setting, got everywhere");
  });
});

describe("draft: schedule, scenes, screens, gate 2", () => {
  test("sequential draft: schedule shape, scenes carry the text so far, screens per scene, slop, flags, status", async () => {
    const { p, d, draw, model, dir } = await drawn();
    await d.check(draw.id);
    const out = await d.draft(draw.id, { overrides: { "form.tense": "past" } });
    expect(out.status).toBe("awaiting_draft_gate");
    expect(JSON.parse(out.draft_config!).config.form.tense).toBe("past");
    expect(JSON.parse(out.draft_config!).overridden).toEqual(["form.tense"]);
    // schedule
    const sched = model.calls.find((c) => c.stage === "schedule")!;
    expect(sched.prompt).toContain("beats: between 5 and 10, each between 400 and 800 words, caps summing to about 5000");
    expect(sched.prompt).toContain("tense: past");
    expect(sched.prompt).toContain("form: derive person, chronology, container from the brief and state them");
    expect(sched.prompt).toContain("ending: the brief's ending is the last beat, in place");
    const sa = p.artifacts(draw.id).find((a) => a.kind === "schedule")!;
    expect(JSON.parse(sa.meta).beats).toHaveLength(8);
    expect(JSON.parse(sa.meta).form).toEqual({ tense: "past", person: "third", chronology: "linear", container: "prose" });
    expect(JSON.parse(sa.meta).beats[0].withheld).toEqual([{ item: "the instrument's wording", until: 7 }, { item: "why she answers only Lauro", until: 6 }]);
    // scenes, in sequence, each carrying the text so far and its beat's material
    const scenes = model.calls.filter((c) => c.stage === "scene");
    expect(scenes).toHaveLength(8);
    expect(scenes[0].prompt).not.toContain("<story-so-far>");
    expect(scenes[1].prompt).toContain("<story-so-far>\nScene 1 opens.");
    expect(scenes[7].prompt).toContain("Scene 7 opens.");
    expect(scenes[0].prompt.indexOf("horror passage")).toBeLessThan(scenes[0].prompt.indexOf("<outline>"));
    expect(scenes[0].prompt).toContain("<ledger>\ntime: the fire was on the 3rd");
    expect(scenes[0].prompt).toContain("Under 625 words");
    expect(scenes[0].prompt).toContain("Form: tense past; person third; chronology linear; container prose");
    expect(scenes[0].prompt).toContain("Still withheld after it: the instrument's wording (beat 7); why she answers only Lauro (beat 6)");
    expect(scenes[2].prompt).toContain("<material>\nw2_0");                  // beat 3 absorbs the chosen vignette
    expect(scenes[7].prompt).toContain(`<material>\n${SPAN_A}`);             // beat 8 absorbs the ending
    expect(scenes[1].prompt).not.toContain("<material>");
    expect(scenes.every((c) => !/theme/i.test(c.prompt.slice(c.prompt.indexOf("Write beat"))))).toBe(true);   // nothing about theme in the ask
    const sceneArts = p.artifacts(draw.id).filter((a) => a.kind === "scene").map((a) => JSON.parse(a.meta));
    expect(sceneArts.find((m) => m.beat === 2).warnings).toEqual(["over_cap"]);
    expect(sceneArts.find((m) => m.beat === 1).warnings).toEqual([]);
    // screens: ledger ×3 and structure ×1 per scene, slop once
    expect(stagesOf(model, /^screen-ledger$/)).toHaveLength(24);
    expect(stagesOf(model, /^screen-structure$/)).toHaveLength(8);
    const st5 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="5">/.test(c.prompt))!;
    expect(st5.prompt).toContain("withheld after this beat: the instrument's wording — beat 7\nwhy she answers only Lauro — beat 6");   // until 6 > 5: still withheld after beat 5
    const st6 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="6">/.test(c.prompt))!;
    expect(st6.prompt).toContain("withheld after this beat: the instrument's wording — beat 7");
    expect(st6.prompt).not.toContain("Lauro");                               // until 6 is not > 6: beat 6's own reveal is not a leak
    const st7 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="7">/.test(c.prompt))!;
    expect(st7.prompt).toContain("withheld after this beat: none");           // the instrument's wording is revealed in beat 7
    expect(st5.prompt).toContain("resolved: the scene settles a question");
    const st8 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="8">/.test(c.prompt))!;
    expect(st8.prompt).toContain("resolves-everything:");
    expect(st8.prompt).not.toContain("resolved:");
    expect(st5.prompt).toContain("Implication and foreshadowing are not reveals");
    const sl2 = model.calls.find((c) => c.stage === "screen-ledger" && /<scene n="2">/.test(c.prompt))!;
    expect(sl2.prompt).toContain("<previous-scene>\nScene 1 opens.");
    expect(p.steps(draw.id).filter((s) => s.stage === "screen-slop").map((s) => s.model)).toEqual(["deterministic"]);
    const v = d.view(draw.id);
    expect(v.screenFindings.map((f) => [f.beat, f.screen, f.n])).toEqual([[3, "ledger", 3]]);
    expect(v.profiles.find((x) => x.beat === 5)!.flags).toEqual(["theme-stated"]);
    expect(v.profiles.find((x) => x.beat === 4)!.flags).toEqual([]);
    expect(v.slop!.words).toBeGreaterThan(2000);
    expect(v.slop!.paragraphs).toHaveLength(8);
    const story = d.story(draw.id);
    expect(story).toContain("Scene 1 opens.");
    expect(story).toContain("* * *");
    expect(story).toContain("[screen-ledger beat 3] Scene 3 opens → The fire was on the 3rd.");
    expect(story).toContain("[screen-structure beat 5] theme-stated: quote theme-stated 5");
    expect(story.trimEnd().endsWith("checked on opus; judge and generator share a family")).toBe(true);
    expect(existsSync(join(dir, "drafts", draw.id))).toBe(false);          // nothing exported before keep
  });

  test("parallel order carries no text so far; a bad schedule fails shape and retries; fixed form is checked; template mode refused", async () => {
    const { p, d, draw, model } = await drawn(draftScript({ schedule: [schedule({ absorbsTwice: true }), schedule()] }));
    await d.check(draw.id);
    await expect(d.draft(draw.id, { overrides: { "structure.template": "frame" } })).rejects.toThrow(/structure mode not built: frame/);
    expect(p.draw(draw.id).status).toBe("awaiting_check_gate");
    const out = await d.draft(draw.id, { overrides: { "scenes.order": "parallel" } });
    expect(out.status).toBe("awaiting_draft_gate");
    expect(p.steps(draw.id).filter((s) => s.stage === "schedule").map((s) => [s.status, s.fail_reason])).toEqual([["failed", "shape"], ["done", null]]);
    expect(p.steps(draw.id).find((s) => s.stage === "schedule" && s.status === "failed")!.error).toMatch(/chosen absorbed by beats 3 and 4/);
    const scenes = model.calls.filter((c) => c.stage === "scene");
    expect(scenes).toHaveLength(8);
    expect(scenes.every((c) => !c.prompt.includes("<story-so-far>"))).toBe(true);
    expect(d.view(draw.id).scenes.map((s) => s.beat)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("a schedule contradicting a fixed axis, or outside the beat bounds, fails shape", async () => {
    const { d, draw, p } = await drawn(draftScript({ schedule: [schedule(), schedule()] }));
    await expect(d.draft(draw.id, { overrides: { "form.tense": "present" } })).rejects.toThrow(/schedule failed: shape/);
    expect(p.steps(draw.id).filter((s) => s.stage === "schedule")[0].error).toMatch(/tense is fixed to present, schedule said past/);
    expect(p.draw(draw.id).status).toBe("failed");
    const { d: d2, draw: draw2, p: p2 } = await drawn(draftScript({ schedule: [schedule({ beats: 3, cap: 800 }), schedule({ beats: 3, cap: 800 })] }));
    await expect(d2.draft(draw2.id)).rejects.toThrow(/shape/);
    expect(p2.steps(draw2.id).filter((s) => s.stage === "schedule")[0].error).toMatch(/3 beats; config asks 5\.\.10/);
    const { d: d3, draw: draw3 } = await drawn(draftScript({ schedule: () => schedule({ beats: 3, cap: 500 }) }));
    const out = await d3.draft(draw3.id, { profile: "flash" });
    expect(out.status).toBe("awaiting_draft_gate");
    expect(JSON.parse(out.draft_config!).profile).toBe("flash");
  });

  test("a draft with accepted findings unrepaired is refused; a draft from done without a check extracts one ledger", async () => {
    const { p, d, draw, model } = await drawn();
    const out = await d.draft(draw.id);
    expect(out.status).toBe("awaiting_draft_gate");
    expect(stagesOf(model, /^check-/)).toEqual(["check-ledger"]);
    expect(p.artifacts(draw.id).filter((a) => a.kind === "ledger")).toHaveLength(1);
    expect(p.artifacts(draw.id).filter((a) => a.kind === "finding" && JSON.parse(a.meta).source === "check")).toHaveLength(0);
  });

  test("rewrite k regenerates one scene under the flag's replacement, re-screens k and k+1 only", async () => {
    const { p, d, draw, model } = await drawn();
    await d.check(draw.id);
    await d.draft(draw.id);
    const before = model.calls.length;
    const flag = d.view(draw.id).screenFindings[0];
    expect(flag.beat).toBe(3);
    const out = await d.rewrite(draw.id, 3, flag.id);
    expect(out.status).toBe("awaiting_draft_gate");
    const after = model.calls.slice(before);
    expect(after.map((c) => c.stage).sort()).toEqual(["scene", ...Array(6).fill("screen-ledger"), "screen-structure", "screen-structure"]);
    const sc = after.find((c) => c.stage === "scene")!;
    expect(sc.prompt).toContain("<constraints>\n- The fire was on the 3rd.\n</constraints>");
    expect(sc.prompt).toContain("Every line of the constraints holds.");
    expect(sc.prompt).toContain("Write beat 3 of the story");
    expect(sc.prompt).toContain("<story-so-far>\nScene 1 opens.");
    expect(sc.prompt).not.toContain("Scene 4 opens");
    expect(new Set(after.filter((c) => /^screen/.test(c.stage)).map((c) => /<scene n="(\d+)">/.exec(c.prompt)![1]))).toEqual(new Set(["3", "4"]));
    const v = d.view(draw.id);
    expect(v.scenes[2].text).toContain("Scene 3 opens. REWRITTEN");
    expect(v.scenes).toHaveLength(8);
    expect(after.find((c) => c.stage === "screen-ledger" && /<scene n="4">/.test(c.prompt))!.prompt).toContain("REWRITTEN");   // scene 4 is screened against the new scene 3
    expect(p.draw(draw.id).flag_note).toBe(`rewrite 3 ${flag.id}`);
    await expect(d.rewrite(draw.id, 9)).rejects.toThrow(/beat 9 is not in 1\.\.8/);
    await expect(d.rewrite(draw.id, 2, "f-nope")).rejects.toThrow(/no screen finding f-nope/);
    // rewriting the last beat re-screens it alone
    const b2 = model.calls.length;
    await d.rewrite(draw.id, 8);
    expect(model.calls.slice(b2).map((c) => c.stage).sort()).toEqual(["scene", "screen-ledger", "screen-ledger", "screen-ledger", "screen-structure"]);
  });

  test("keep exports drafts/<draw>/ with story, schedule, findings, config and trail; pass records a draft verdict", async () => {
    const { p, d, draw, dir } = await drawn();
    await d.check(draw.id);
    const [a, b] = d.findings(draw.id).findings;
    d.dismiss(draw.id, a.id, "she can fire it");
    d.dismiss(draw.id, b.id, "deliberate seam");
    await d.draft(draw.id);
    await d.rewrite(draw.id, 3);
    const { draw: kept, dir: out } = d.keep(draw.id, "good enough");
    expect(kept.status).toBe("drafted");
    expect(out).toBe(join(dir, "drafts", draw.id));
    for (const f of ["story.md", "schedule.md", "findings.md", "config.toml", "trail.md"]) expect(existsSync(join(out, f))).toBe(true);
    const story = readFileSync(join(out, "story.md"), "utf8");
    expect(story).toContain("Scene 3 opens. REWRITTEN");
    expect(story).not.toContain("[screen-");
    expect(readFileSync(join(out, "schedule.md"), "utf8")).toContain("## Beat 3 · 625 words · absorbs chosen");
    const findings = readFileSync(join(out, "findings.md"), "utf8");
    expect(findings).toContain(`**${a.id}** derivation+ledger ×3 [debt audit] dismissed: she can fire it`);
    expect(findings).toContain("### Beat 5\n\n- structure theme-stated: quote theme-stated 5");
    expect(findings).toContain("## Slop");
    expect(readFileSync(join(out, "config.toml"), "utf8")).toContain("[length]\nwords = 5000");
    const trail = readFileSync(join(out, "trail.md"), "utf8");
    expect(trail).toContain("a typed seed");
    expect(trail).toContain("## draft");
    expect(trail).toContain("- rewrite 3");
    expect(trail).toContain("- scene: claude-opus-5");
    expect(latest(p.db, "draft", draw.id)).toMatchObject({ verdict: "keep", note: "good enough" });
    expect(() => d.keep(draw.id)).toThrow(/is drafted, not awaiting_draft_gate/);
    // pass at gate 2 on another draw
    const { d: d2, draw: draw2, p: p2 } = await drawn();
    await d2.draft(draw2.id);
    expect(d2.passDraft(draw2.id, "flat").status).toBe("passed");
    expect(latest(p2.db, "draft", draw2.id)).toMatchObject({ verdict: "pass", note: "flat" });
  });

  test("--auto: accepts findings at or above the score floor, dismisses the rest, repairs, re-checks, drafts, stops at gate 2", async () => {
    const script = draftScript({ "check-ledger": [...ledgerSamples(), ...cleanSamples()], "check-derivation": [...derivationSamples(), ...cleanSamples()] });
    const { p, d, draw, model } = await drawn(script);
    const out = await d.draft(draw.id, { auto: true });
    expect(out.id).not.toBe(draw.id);
    expect(out.repaired_from).toBe(draw.id);
    expect(out.status).toBe("awaiting_draft_gate");
    expect(p.draw(draw.id).status).toBe("repaired");
    // A scores 10 and B 7, both at or above the floor; C recurred once, scores 5, and is dismissed with its number
    const first = d.findings(draw.id, { all: true }).findings;
    expect(first.map((f) => [f.score, f.decision])).toEqual([[10, "accepted"], [7, "accepted"], [5, "dismissed"]]);
    expect(first[2].note).toBe("auto: scored 5, under 7");
    expect((p.db.query("SELECT DISTINCT method FROM verdicts WHERE kind = 'finding'").all() as any[]).map((v) => v.method)).toEqual(["draw"]);
    expect(stagesOf(model, /^check-ledger$/)).toHaveLength(6);                // one round of repair, then a clean re-check ends it
    expect(stagesOf(model, /^scene$/)).toHaveLength(8);
    expect(out.draft_config).toBeTruthy();
    expect(JSON.parse(out.draft_config!).config.length.words).toBe(5000);
  });

  test("auto stops on the floor and reports every round and the lowest-scoring one", async () => {
    const script = draftScript({ "check-ledger": [...ledgerSamples(), ...cleanSamples()], "check-derivation": [...derivationSamples(), ...cleanSamples()] });
    const { p, d, draw } = await drawn(script);
    await d.check(draw.id);
    const r = await d.autoRounds(draw.id);
    expect(r.stopped).toBe("floor");
    expect(r.floor).toBe(7);
    expect(r.rounds.map((x) => [x.round, x.open, x.total, x.accepted])).toEqual([[1, 3, 22, 2], [2, 0, 0, 0]]);
    expect(r.best.round).toBe(2);
    expect(r.id).toBe(r.rounds[1].id);
    expect(r.id).not.toBe(draw.id);
    // the round table is stored on the brief auto stopped on, so the gate can render it
    const art = p.artifacts(r.id).find((a) => a.kind === "auto")!;
    expect(JSON.parse(art.content)).toMatchObject({ stopped: "floor", floor: 7 });
    expect(JSON.parse(art.meta)).toMatchObject({ rounds: 2, best: r.best.id });
  });

  test("auto stops on patience when the total score stops falling, and names the best round", async () => {
    // every pass reports the same findings, so after the first round no round improves
    const passes = Array.from({ length: 12 }, () => ledgerSamples()).flat();
    const derivations = Array.from({ length: 12 }, () => derivationSamples()).flat();
    const { d, draw } = await drawn(draftScript({ "check-ledger": passes, "check-derivation": derivations }));
    await d.check(draw.id);
    const r = await d.autoRounds(draw.id, { cfg: { ...loadDraftConfig().config, repair: { rounds: 9, stop_score: 7, patience: 2 } } });
    expect(r.stopped).toBe("patience");
    const totals = r.rounds.map((x) => x.total);
    expect(Math.min(...totals)).toBe(r.best.total);
    expect(totals.slice(-2)).toEqual([r.best.total, r.best.total]);            // two rounds at the floor with no fall ends it
    expect(r.rounds.length).toBeLessThan(9);                                   // patience, not the cap
  });

  test("auto stops on the round cap", async () => {
    const passes = Array.from({ length: 8 }, (_, i) => ledgerSamples(A(), B(`span number ${i} of the outline text here`))).flat();
    const derivations = Array.from({ length: 8 }, () => derivationSamples()).flat();
    const { d, draw } = await drawn(draftScript({ "check-ledger": passes, "check-derivation": derivations }));
    await d.check(draw.id);
    const r = await d.autoRounds(draw.id, { cfg: { ...loadDraftConfig().config, repair: { rounds: 2, stop_score: 7, patience: 9 } } });
    expect(r.stopped).toBe("cap");
    expect(r.rounds).toHaveLength(3);                                          // rounds 1 and 2 repair, the third is where it stops
  });

  test("--auto never accepts structure or resemblance, and evidence-less findings are dismissed however they score", async () => {
    const strip = (f: string) => f.replace("<evidence>a second quote from the outline</evidence>", "<evidence>none</evidence>");
    const noEv = strip(A());
    const script = draftScript({ "check-ledger": ledgerSamples(noEv, strip(B())), "check-derivation": derivationSamples(noEv) });
    const { p, d, draw } = await drawn(script);
    const out = await d.draft(draw.id, { auto: true });
    expect(out.id).toBe(draw.id);                                             // nothing accepted, no repair
    const fs = d.findings(draw.id).findings;
    expect(fs.map((f) => f.decision)).toEqual(["dismissed", "dismissed", "dismissed"]);
    expect(fs.map((f) => f.score)).toEqual([8, 5, 5]);
    expect(fs[0].note).toBe("auto: no evidence to read it against");          // 8 is over the floor; a person still has to read it
    expect(p.steps(draw.id).filter((s) => /^repair/.test(s.stage))).toHaveLength(0);
  });
});

describe("templates and store", () => {
  test("every check and drafting template states a word cap and passes the vocabulary rule", () => {
    const names = ["checkDerivation", "checkLedger", "checkStructure", "checkResemblance", "claimsExtract", "claimsVerifyWorld", "claimsVerifyReference", "repairVignette", "repairEnding", "schedule", "sceneAsk", "screenLedger", "screenStructure"] as const;
    for (const n of names) {
      const t = (TEMPLATES as any)[n] as string;
      expect(t).toMatch(/Under \{?\w*\}? ?words|Under \d+ words|Under \{cap\} words/);
      expect(t).not.toMatch(/\b(reason|think)\b/i);
    }
  });

  test("a version-3 store migrates to 9: the new columns arrive, the domains column goes, and the row survives", () => {
    const dir = mkdtempSync(join(tmpdir(), "cloudchamber-mig4-"));
    const path = join(dir, "v3.db"), log = join(dir, "verdicts.jsonl");
    writeFileSync(log, "");
    const old = new Database(path);
    old.exec(`CREATE TABLE verdicts (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('example','theme','brief','story')), target_id TEXT NOT NULL, verdict TEXT NOT NULL, artifact INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', method TEXT NOT NULL, at TEXT NOT NULL, by TEXT NOT NULL, pipeline_version TEXT NOT NULL, inherited_from TEXT);
      CREATE TABLE draws (id TEXT PRIMARY KEY, setting TEXT, genre TEXT NOT NULL, mode TEXT NOT NULL, segment TEXT, seed_mode TEXT NOT NULL, seed_text TEXT NOT NULL, seed_theme_id TEXT, example_ids TEXT NOT NULL, domains TEXT, status TEXT NOT NULL, gate_method TEXT, chosen_step TEXT, flagged INTEGER NOT NULL DEFAULT 0, flag_note TEXT NOT NULL DEFAULT '', superseded_by TEXT REFERENCES draws(id), created_at TEXT NOT NULL, ended_at TEXT);
      CREATE TABLE steps (id TEXT PRIMARY KEY, draw_id TEXT REFERENCES draws(id), story_id TEXT, parent_id TEXT REFERENCES steps(id), stage TEXT NOT NULL, model TEXT NOT NULL, system_prompt TEXT NOT NULL, prompt TEXT NOT NULL, raw_response TEXT, parsed TEXT, status TEXT NOT NULL, fail_reason TEXT, attempt INTEGER NOT NULL DEFAULT 1, started_at TEXT NOT NULL, ended_at TEXT, error TEXT);
      CREATE TABLE artifacts (id TEXT PRIMARY KEY, step_id TEXT NOT NULL REFERENCES steps(id), kind TEXT NOT NULL, content TEXT NOT NULL, meta TEXT NOT NULL DEFAULT '{}');
      INSERT INTO draws (id, genre, mode, seed_mode, seed_text, example_ids, status, created_at) VALUES ('r1', 'horror', 'manual', 'drawn', 'A seed.', '[]', 'done', 'now');
      INSERT INTO steps (id, draw_id, stage, model, system_prompt, prompt, status, started_at) VALUES ('s1', 'r1', 'outline', 'm', '', '', 'done', 'now');
      PRAGMA user_version = 3;`);
    old.close();
    const db: Db = openDb(path, log);
    expect((db.query("PRAGMA user_version").get() as any).user_version).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(9);
    expect(db.query("SELECT repaired_from, draft_config, forked_from, sampling, archived_at, name FROM draws WHERE id = 'r1'").get())
      .toEqual({ repaired_from: null, draft_config: null, forked_from: null, sampling: "tail", archived_at: null, name: "seed" });
    expect(db.query("SELECT tools FROM steps WHERE id = 's1'").get()).toEqual({ tools: "" });
    expect((db.query("PRAGMA table_info(draws)").all() as { name: string }[]).map((c) => c.name)).not.toContain("domains");
    expect(() => record(db, { kind: "finding", target_id: "f-abc", verdict: "pass", method: "gate", note: "x" }, log)).not.toThrow();
    expect(() => record(db, { kind: "draft", target_id: "r1", verdict: "keep", method: "gate" }, log)).not.toThrow();
    const again = openDb(path, log);
    expect(again.query("SELECT count(*) AS n FROM verdicts").get()).toEqual({ n: 2 });
  });

  test("every new stage names a model, and only the claims verifier declares tools", () => {
    const s = loadStages();
    const withTools = Object.entries(s).filter(([, c]) => c.tools).map(([n]) => n);
    expect(withTools).toEqual(["check-claims-verify"]);
    expect(s["check-claims-verify"].tools).toBe("WebSearch,WebFetch");
    for (const n of ["check-derivation", "check-ledger", "check-structure", "check-resemblance", "repair-vignette", "repair-outline", "repair-ending", "schedule", "scene", "screen-ledger", "screen-structure"]) expect((s as any)[n].model).toMatch(/^claude-/);
  });
});

describe("finding ids are scoped by draw", () => {
  test("two draws with the same span do not share verdicts; a repaired draw's re-check does not inherit its source's accepted findings", async () => {
    const { p, d, draw } = await drawn(draftScript({ "check-ledger": [...ledgerSamples(), ...ledgerSamples()], "check-derivation": [...derivationSamples(), ...derivationSamples()] }));
    await d.check(draw.id);
    const [a] = d.findings(draw.id).findings;
    const next = await d.accept(draw.id, [a.id]);
    // the repaired draw's re-check reports the same span again (same fixture); it must be open there, not accepted
    const again = d.findings(next.id).findings;
    expect(again.length).toBeGreaterThan(0);
    expect(again[0].span).toBe(a.span);
    expect(again[0].id).not.toBe(a.id);
    expect(again.every((f) => f.decision === "open")).toBe(true);
    const out = await d.draft(next.id);                                   // not "accepted findings pending repair"
    expect(out.status).toBe("awaiting_draft_gate");
    expect(p.draw(draw.id).status).toBe("repaired");
  });
});
