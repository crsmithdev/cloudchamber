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
import { latest, readLog, record } from "./verdicts.ts";
import { status } from "./status.ts";
import { TEMPLATES } from "./prompts.ts";
import { loadStages } from "./config.ts";
import { VERDICT_LOG } from "./paths.ts";
import { A, B, SPAN_A, SPAN_B, cleanSamples, derivationSamples, draftScript, ledgerSamples, schedule, vignette } from "./drafting.fixture.ts";

const CELLS = ["informational", "mixed", "involved"].flatMap((v) => ["non-narrative", "mixed", "narrative"].map((m) => [v, m]));

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "fogbelt-drafting-"));
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
  if (setting?.claims) writeFileSync(join(setting.dir, `${setting.id}.md`), readFileSync(join(setting.dir, `${setting.id}.md`), "utf8").replace("names: true", `names: true\nclaims: ${setting.claims}`));
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
    expect(f.judge).toBe("checked on fable; judge and generator share a family");
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
    expect(by("jobs")).toHaveLength(1);
    expect(by("context")).toHaveLength(2);
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
    expect(d.findings(next.id).judge).toBe("checked on fable; judge and generator share a family");
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
    const { p, d, draw, model } = await drawn(draftScript({ outline: () => ["debt audit", "arithmetic", "custody", "matrix"].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n") }), { id: "fog", dir: sdir, claims: "world" });
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

  test("claims: reference verifies against the pinned domains' reference files with no tools", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    const { p, d, draw, model } = await drawn(draftScript({ outline: () => ["debt audit", "arithmetic", "custody", "matrix"].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n") }), { id: "fog", dir: sdir, claims: "reference" });
    const r = await d.check(draw.id);
    expect(r.claims).toBe("reference");
    const verify = model.calls.filter((c) => c.stage === "check-claims-verify");
    expect(verify).toHaveLength(2);
    expect(verify.every((c) => c.tools === "")).toBe(true);
    expect(verify[0].prompt).toContain('<reference name="reference/land-and-title.md">');
    expect(verify[0].prompt).toContain('<reference name="reference/labour.md">');
    expect(verify[0].prompt).not.toContain("reference/death.md");
    expect(verify[0].prompt).toContain("Find the line in the reference material above");
    expect(p.steps(draw.id).filter((s) => s.stage === "check-claims-verify").every((s) => s.tools === "")).toBe(true);
  });

  test("no claims key: the checker does not run", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    const { d, draw, model } = await drawn(draftScript({ outline: () => ["debt audit", "arithmetic", "custody", "matrix"].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n") }), { id: "fog", dir: sdir });
    const r = await d.check(draw.id);
    expect(r.claims).toBe("off");
    expect(stagesOf(model, /claims/)).toEqual([]);
  });

  test("a bad claims value fails lint", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    writeFileSync(join(sdir, "fog.md"), readFileSync(join(sdir, "fog.md"), "utf8").replace("names: true", "names: true\nclaims: everywhere"));
    const { lintFile } = await import("./settings.ts");
    expect(lintFile("fog", sdir).map((f) => f.reason)).toContain("claims must be world | reference, got everywhere");
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
    expect(story.trimEnd().endsWith("checked on fable; judge and generator share a family")).toBe(true);
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
    expect(trail).toContain("- scene: claude-fable-5-1");
    expect(latest(p.db, "draft", draw.id)).toMatchObject({ verdict: "keep", note: "good enough" });
    expect(() => d.keep(draw.id)).toThrow(/is drafted, not awaiting_draft_gate/);
    // pass at gate 2 on another draw
    const { d: d2, draw: draw2, p: p2 } = await drawn();
    await d2.draft(draw2.id);
    expect(d2.passDraft(draw2.id, "flat").status).toBe("passed");
    expect(latest(p2.db, "draft", draw2.id)).toMatchObject({ verdict: "pass", note: "flat" });
  });

  test("--auto: accepts all-samples findings with evidence, dismisses the rest as auto, repairs, re-checks, drafts, stops at gate 2", async () => {
    const script = draftScript({ "check-ledger": [...ledgerSamples(), ...cleanSamples()], "check-derivation": [...derivationSamples(), ...cleanSamples()] });
    const { p, d, draw, model } = await drawn(script);
    const out = await d.draft(draw.id, { auto: true });
    expect(out.id).not.toBe(draw.id);
    expect(out.repaired_from).toBe(draw.id);
    expect(out.status).toBe("awaiting_draft_gate");
    expect(p.draw(draw.id).status).toBe("repaired");
    const first = d.findings(draw.id).findings;
    expect(first.map((f) => [f.n, f.decision, f.note])).toEqual([[3, "accepted", "auto"], [2, "dismissed", "auto"]]);
    expect((p.db.query("SELECT method FROM verdicts WHERE kind = 'finding'").all() as any[]).map((v) => v.method)).toEqual(["draw", "draw"]);
    expect(stagesOf(model, /^check-ledger$/)).toHaveLength(6);
    expect(stagesOf(model, /^scene$/)).toHaveLength(8);
    expect(out.draft_config).toBeTruthy();
    expect(JSON.parse(out.draft_config!).config.length.words).toBe(5000);
  });

  test("--auto never accepts structure or resemblance, and evidence-less findings are dismissed", async () => {
    const noEv = A().replace("<evidence>a second quote from the outline</evidence>", "<evidence>none</evidence>");
    const script = draftScript({ "check-ledger": ledgerSamples(noEv, B()), "check-derivation": derivationSamples(noEv) });
    const { p, d, draw } = await drawn(script);
    const out = await d.draft(draw.id, { auto: true });
    expect(out.id).toBe(draw.id);                                             // nothing accepted, no repair
    expect(d.findings(draw.id).findings.map((f) => f.decision)).toEqual(["dismissed", "dismissed"]);
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

  test("a version-3 store migrates to 7: finding and draft verdicts, repaired_from, draft_config, tools, forked_from, sampling, archived_at", () => {
    const dir = mkdtempSync(join(tmpdir(), "fogbelt-mig4-"));
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
    expect(SCHEMA_VERSION).toBe(7);
    expect(db.query("SELECT repaired_from, draft_config, forked_from, sampling, archived_at FROM draws WHERE id = 'r1'").get()).toEqual({ repaired_from: null, draft_config: null, forked_from: null, sampling: "tail", archived_at: null });
    expect(db.query("SELECT tools FROM steps WHERE id = 's1'").get()).toEqual({ tools: "" });
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
