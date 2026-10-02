import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FakeModel, tag } from "./model.ts";
import { BODY_LINE, COST_LINE, Drafting, PRESENCE_LINE, rewritePlan } from "./drafting.ts";
import type { PdfPrinter } from "./report.ts";
import { EVENT_LINE, HOOK_LINE, THEME_LINE, VOICES_LINE } from "./write.ts";
import { movedIn, parseSchedule, scenePrompt, STRUCTURE_RULES, structureScreen } from "./write.ts";
import { NOT_IN_PROSE, parseVerdicts } from "./check.ts";
import { chunk } from "./scenesession.ts";
import { settingsFixture } from "./settings.fixture.ts";
import { LISTS, loadSetting } from "./settings.ts";
import { latest, readLog } from "./verdicts.ts";
import { TEMPLATES } from "./prompts.ts";
import { loadStages } from "./config.ts";
import { loadDraftConfig } from "./draftconfig.ts";
import { OUTPUT, VERDICT_LOG } from "./paths.ts";
import { ofKind } from "./artifacts.ts";
import { LEDGER, proseOutline, SCENE_3_PATCH, SPAN_A, draftScript, drawn, fixture, schedule, screenStructure, fromAsk, claimsExtract, claimVerify } from "./drafting.fixture.ts";
import { briefParts } from "./briefparts.ts";

/** The form the listen profile fixes: one narrator, told afterward, in order. */
const listenForm = "tense: past\nperson: first\nchronology: linear\ncontainer: prose";
import { chainOf } from "./chain.ts";
import { renderStory } from "./drafts.ts";
import { constraintsBlock } from "./repair.ts";

const stagesOf = (model: FakeModel, re: RegExp) => model.calls.filter((c) => re.test(c.stage)).map((c) => c.stage);

/** A draw drafted to the plan gate: its schedule checked, and the brief's text checks run beside it. */
const atPlan = async (script = draftScript()) => {
  const t = await drawn(script);
  await t.d.draft(t.draw.id, { plan: true });
  return t;
};
const DIR = "The ending leaves the safe open; the weight stays on the pier.";
const FACT = "The weights were last certified before the war.";

describe("the plan gate: the brief's checks, and an operator's instructions", () => {
  test("a draft that stops at the plan gate runs structure, resemblance and the reader beside the schedule; a draft that does not runs none", async () => {
    const { p, d, draw, model } = await atPlan();
    expect(p.draw(draw.id).status).toBe("awaiting_plan_gate");
    expect(stagesOf(model, /^check-/).sort()).toEqual(["check-reader", "check-reader", "check-reader", "check-resemblance", "check-structure"]);
    expect(p.artifacts(draw.id).filter((a) => a.kind === "profile").map((a) => a.meta.checker).sort()).toEqual(["resemblance", "structure"]);
    expect((d.findings(draw.id).profiles as any[]).map((x) => x.checker).sort()).toEqual(["resemblance", "structure"]);
    // gate 1's checkers are gone: the draft renders the ledger from the outline's table and runs no ledger, derivation or claims check on the brief
    expect(stagesOf(model, /^ledger-extract$/)).toEqual([]);
    expect(model.calls.find((c) => c.stage === "check-resemblance")!.prompt).toContain("3. The madman");
    // every brief check reads the brief from one system prompt, the same text on every stage
    const checks = p.steps(draw.id).filter((s) => /^check-/.test(s.stage));
    expect(checks[0].system_prompt).toContain('<vignette name="chosen">');
    for (const s of checks) { expect(s.tools).toBe(""); expect(s.system_prompt).toBe(checks[0].system_prompt); }

    const plain = await drawn();
    await plain.d.draft(plain.draw.id);
    expect(stagesOf(plain.model, /^check-/)).toEqual([]);
  });

  test("an instruction at the plan gate rewrites the parts it names as a new draw, which drafts on to the plan gate", async () => {
    const t = await drawn();
    await expect(t.d.instruct(t.draw.id, [{ text: DIR, parts: ["ending"], kind: "direction" }])).rejects.toThrow(/is done, not awaiting_plan_gate/);
    const { p, d, draw, model } = await atPlan();
    await expect(d.instruct(draw.id, [])).rejects.toThrow(/instructions required/);
    await expect(d.instruct(draw.id, [{ text: DIR, parts: ["coda"], kind: "direction" }])).rejects.toThrow(/part must be vignette \| ending \| context 1 \| context 2, got coda/);
    await expect(d.instruct(draw.id, [{ text: " ", parts: ["ending"], kind: "direction" }])).rejects.toThrow(/instruction text required/);
    await expect(d.instruct(draw.id, [{ text: DIR, parts: ["ending"], kind: "rule" as never }])).rejects.toThrow(/kind must be fact \| direction/);
    await expect(d.instruct(draw.id, [{ text: DIR, parts: [], kind: "direction" }])).rejects.toThrow(/instruction parts required/);
    expect(p.artifacts(draw.id).filter((a) => a.kind === "finding" && a.meta.source === "operator")).toHaveLength(0);   // a refused instruction stores nothing

    const next = await d.instruct(draw.id, [{ text: DIR, parts: ["ending"], kind: "direction" }, { text: FACT, parts: ["context 1"], kind: "fact" }], "by hand");
    expect(next.id).not.toBe(draw.id);
    expect(next).toMatchObject({ repaired_from: draw.id, status: "awaiting_plan_gate", draft_config: p.draw(draw.id).draft_config });
    expect(p.draw(draw.id)).toMatchObject({ status: "repaired", superseded_by: next.id });
    const by = (stage: string) => p.steps(next.id).filter((s) => s.stage === stage);
    // the vignette and context 2 are carried; the ending and context 1 are rewritten
    expect(by("repair-vignette").map((s) => s.model)).toEqual(["copied"]);
    expect(by("repair-context")).toHaveLength(1);
    expect(by("context").map((s) => s.model)).toEqual(["copied"]);
    expect(by("repair-ending")[0].model).not.toBe("copied");
    const ending = model.calls.find((c) => c.stage === "repair-ending")!.prompt;
    expect(ending).toContain(`<instructions>\n- ${DIR}\n</instructions>`);
    expect(ending).toContain("carries out every instruction.");
    expect(ending).not.toContain(`- ${FACT}\n</instructions>`);                 // the fact reaches the ending as a ledger amendment, not as an instruction for it
    expect(model.calls.find((c) => c.stage === "repair-context")!.prompt).toContain(`<instructions>\n- ${FACT}\n</instructions>`);
    // both are findings of the source, accepted by a person with the note given
    const mine = d.findings(draw.id).findings.filter((f) => f.source === "operator");
    expect(mine.map((f) => [f.statement, f.decision, f.parts, f.kind]).sort()).toEqual([[DIR, "accepted", ["ending"], "direction"], [FACT, "accepted", ["context 1"], "fact"]].sort());
    for (const f of mine) expect(latest(p.db, "finding", f.id)).toMatchObject({ verdict: "keep", note: "by hand" });
    const chain = chainOf(p, next.id);
    expect(chain.settled().map((sc) => [sc.replacement, sc.kind])).toEqual([[DIR, "direction"], [FACT, "fact"]]);
    expect(chain.ledger()).toContain(FACT);
    expect(chain.ledger()).not.toContain(DIR);
    // the new draw's plan is its own, checked; the brief's checks ran once for the chain and not again
    expect(chain.schedule()).toBeTruthy();
    expect(p.steps(next.id).filter((s) => s.stage === "schedule")).toHaveLength(1);
    expect(stagesOf(model, /^check-/).sort()).toEqual(["check-reader", "check-reader", "check-reader", "check-resemblance", "check-structure"]);
    await expect(d.instruct(draw.id, [{ text: DIR, parts: ["ending"], kind: "direction" }])).rejects.toThrow(/is repaired, not awaiting_plan_gate/);
  });

  test("a scene written from the repaired draw reads the chain's pinned ledger with the fact amended", async () => {
    const { p, d, draw, model } = await atPlan();
    const next = await d.instruct(draw.id, [{ text: FACT, parts: ["context 1"], kind: "fact" }]);
    expect(p.artifacts(next.id).filter((x) => x.kind === "ledger")).toHaveLength(0);   // one ledger, on the root
    await d.writeScenes(next.id);
    const scenes = model.calls.filter((c) => c.stage === "scene");
    expect(scenes.length).toBeGreaterThan(0);
    for (const c of scenes) expect(c.system).toContain("time: the fire was on the 3rd");
    expect(scenes[0].system).toContain(FACT);
  });

  test("a direction keeps the declared table; a fact amends the ledger past it, so L1 calls the model (T4)", async () => {
    const { d, draw, model } = await atPlan();
    expect(stagesOf(model, /^ir-symbolize$/)).toEqual([]);
    const next = await d.instruct(draw.id, [{ text: DIR, parts: ["ending"], kind: "direction" }]);
    expect(stagesOf(model, /^ir-symbolize$/)).toEqual([]);
    await d.instruct(next.id, [{ text: FACT, parts: ["context 1"], kind: "fact" }]);
    expect(stagesOf(model, /^ir-symbolize$/)).toEqual(["ir-symbolize"]);
  });

  test("archive acts on the whole repair chain, and unarchive brings it back", async () => {
    const { p, d, draw } = await atPlan();
    const next = await d.instruct(draw.id, [{ text: DIR, parts: ["ending"], kind: "direction" }]);
    expect(chainOf(p, next.id).rounds).toEqual([draw.id, next.id]);
    p.archive(next.id);
    expect([p.draw(draw.id).archived_at, p.draw(next.id).archived_at].map(Boolean)).toEqual([true, true]);
    p.archive(next.id, false);
    expect([p.draw(draw.id).archived_at, p.draw(next.id).archived_at]).toEqual([null, null]);
  });

  test("context-1.md holds job 1 however the context calls finish", async () => {
    let seen = 0;
    const script = draftScript({ context: (p: string) => { seen++; return `<vignette>context for ${/Its job: (.*)/.exec(p)?.[1]}</vignette>`; } });
    const { d, draw, dir } = await atPlan(script);
    const next = await d.instruct(draw.id, [{ text: DIR, parts: ["ending"], kind: "direction" }]);
    for (const id of [draw.id, next.id]) {
      expect(readFileSync(join(dir, "briefs", id, "context-1.md"), "utf8")).toContain("Test the first thing: scene one.");
      expect(readFileSync(join(dir, "briefs", id, "context-2.md"), "utf8")).toContain("Test a second thing: scene two.");
    }
    expect(seen).toBe(2);                                                      // the repair copied both, so no third call
  });

  test("a repair rewrites without the six example passages; a first draft keeps them", async () => {
    const { d, draw, model } = await atPlan();
    expect(model.calls.find((c) => c.stage === "execute")!.prompt).toContain("horror passage");
    await d.instruct(draw.id, [{ text: DIR, parts: ["ending", "vignette"], kind: "direction" }]);
    const rewrites = model.calls.filter((c) => c.stage === "repair-vignette" || c.stage === "repair-ending");
    expect(rewrites).toHaveLength(2);
    for (const c of rewrites) {
      expect(c.prompt).not.toContain("horror passage");
      expect(c.prompt).toContain(DIR);
    }
  });

  test("a repaired context vignette stays one: the next repair carries both with their jobs, and the brief lists both in job order", async () => {
    const { p, d, draw, model, dir } = await atPlan();
    const second = await d.instruct(draw.id, [{ text: "The first context holds.", parts: ["context 1"], kind: "direction" }]);
    expect(p.steps(second.id).filter((s) => s.stage === "repair-context")).toHaveLength(1);
    const third = await d.instruct(second.id, [{ text: DIR, parts: ["ending"], kind: "direction" }]);
    const stages = p.steps(third.id).map((s) => [s.stage, s.model]);
    expect(stages.filter(([s]) => s === "context" || s === "repair-context").map(([, m]) => m)).toEqual(["copied", "copied"]);
    expect(model.calls.filter((c) => c.stage === "context")).toHaveLength(2);   // the draw's own two contexts, nothing since
    const parts = briefParts(p, third.id);
    expect(parts.contexts[0]).toContain("rewritten context");
    expect(parts.contexts[1]).toBe("context for Test a second thing: scene two.");
    expect(readFileSync(join(dir, "briefs", third.id, "context-1.md"), "utf8")).toContain("*Job: Test the first thing: scene one.*");
    expect(readFileSync(join(dir, "briefs", third.id, "context-2.md"), "utf8")).toContain("context for Test a second thing: scene two.");
  });

  test("flag at the plan gate starts nothing and keeps the gate open", async () => {
    const { p, draw } = await atPlan();
    p.flag(draw.id, "looks wrong");
    expect(p.draw(draw.id)).toMatchObject({ status: "awaiting_plan_gate", flagged: 1, flag_note: "looks wrong" });
    expect(readLog(VERDICT_LOG).filter((v) => v.kind === "brief" && v.target_id === draw.id)).toHaveLength(0);
  });
});

describe("claims", () => {
  // gate 1's claims pass went with T3: the calls are the plan's (T1′, under a setting that is its own authority) and the claims screen's on the scenes
  test("claims: world runs extract then one search-enabled verify per claim; a contradiction gets a second reading with no search", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    const { p, d, draw, model } = await drawn(draftScript(), { id: "basin", dir: sdir, claims: "world" });
    await d.draft(draw.id);
    // under the world the plan's claims are not read: the scenes' are
    expect(stagesOf(model, /claims/)).toEqual(["check-claims-extract", "check-claims-verify", "check-claims-verify", "check-claims-confirm"]);
    const verify = model.calls.filter((c) => c.stage === "check-claims-verify");
    expect(verify.every((c) => c.tools === "WebSearch,WebFetch" && c.model === loadStages()["check-claims-verify"].model)).toBe(true);
    const confirm = model.calls.find((c) => c.stage === "check-claims-confirm")!;
    expect(confirm.tools).toBe("");
    expect(confirm.prompt).toContain("\"2,032 km by road\"");
    expect(model.calls.find((c) => c.stage === "check-claims-extract")!.tools).toBe("");
    expect(model.calls.find((c) => c.stage === "check-claims-extract")!.prompt).toContain("That a place, institution, product or person exists is not a claim");
    expect(p.artifacts(draw.id).filter((a) => a.kind === "claim").map((a) => a.meta.result).sort()).toEqual(["contradicted", "supported"]);
  });

  test("claims: a contradiction whose cited line gives no other value for the same thing is unverifiable", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    const { p, d, draw } = await drawn(draftScript({
      "check-claims-confirm": () => "<answer>no</answer><why>The line gives the distance by road, not the one the claim states.</why>",
    }), { id: "basin", dir: sdir, claims: "world" });
    await d.draft(draw.id);
    expect(p.artifacts(draw.id).filter((a) => a.kind === "claim").map((a) => a.meta.result).sort()).toEqual(["supported", "unverifiable"]);
    const art = p.artifacts(draw.id).find((a) => a.kind === "claim" && a.meta.result === "unverifiable")!;
    expect(art.meta).toMatchObject({ confirm: "The line gives the distance by road, not the one the claim states.", replacement: "none" });
  });

  test("claims: setting verifies against the whole distillate, every list, and asks for claims about the setting", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    const { p, d, draw, model } = await drawn(draftScript(), { id: "basin", dir: sdir, claims: "setting" });
    await d.draft(draw.id, { plan: true });
    // the extractor reads the setting too, so it pulls the claims the setting settles
    const extract = model.calls.find((c) => c.stage === "check-claims-extract")!.prompt;
    expect(extract).toContain("The Basin Recorder — indexes a deed");
    const verify = model.calls.filter((c) => c.stage === "check-claims-verify");
    expect(verify).toHaveLength(2);
    expect(verify.every((c) => c.tools === "")).toBe(true);
    const s = loadSetting("basin", sdir);
    for (const name of LISTS) for (const e of s.lists[name]) expect(verify[0].prompt).toContain(e);
    expect(verify[0].prompt).toContain("<setting>");
    expect(verify[0].prompt).toContain("Find the line in the setting above");
    expect(p.steps(draw.id).filter((s) => s.stage === "check-claims-verify").every((s) => s.tools === "")).toBe(true);
  });

  test("no claims key: no claims call runs", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    const { d, draw, model } = await drawn(draftScript(), { id: "basin", dir: sdir });
    await d.draft(draw.id, { plan: true });
    await d.writeScenes(draw.id);
    expect(stagesOf(model, /claims/)).toEqual([]);
  });

  test("a bad claims value fails lint", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    writeFileSync(join(sdir, "basin.md"), readFileSync(join(sdir, "basin.md"), "utf8").replace("claims: setting", "claims: everywhere"));
    const { lintFile } = await import("./settings.ts");
    expect(lintFile("basin", sdir).map((f) => f.reason)).toContain("claims must be world | setting, got everywhere");
  });

  test("a claim verified once is not verified again anywhere in the chain", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    const { p, d, draw, model } = await drawn(draftScript(), { id: "basin", dir: sdir, claims: "setting" });
    await d.draft(draw.id, { plan: true });
    const first = model.calls.filter((c) => c.stage === "check-claims-verify").length;
    expect(first).toBe(2);
    // the new draw's plan check extracts the same two claims and verifies neither again
    const next = await d.instruct(draw.id, [{ text: "The ending holds.", parts: ["ending"], kind: "direction" }]);
    expect(p.steps(next.id).filter((s) => s.stage === "check-claims-extract")).toHaveLength(1);
    expect(model.calls.filter((c) => c.stage === "check-claims-extract")).toHaveLength(2);
    expect(model.calls.filter((c) => c.stage === "check-claims-verify")).toHaveLength(first);
  });
});

describe("tag reading", () => {
  test("a tag written as a tool argument is read as the tag", () => {
    expect(tag('<verdict n="2">\n<parameter name="answer">keep</parameter>\n<why>x</why>\n</verdict>', "answer")).toBe("keep");
    expect(tag("<answer>drop</answer>", "answer")).toBe("drop");
    expect(tag("<why>x</why>", "answer")).toBeNull();
    expect(tag("<answer>drop</parameter>", "answer")).toBe("drop");
    expect(tag("<examined>I compared the decks", "examined")).toBeNull();
    const vs = parseVerdicts('<verdict n="1"><answer>keep</answer><why>a</why></verdict><verdict n="2"><parameter name="answer">drop</parameter><why>b</why></verdict>', 2);
    expect(vs.map((v) => v.answer)).toEqual(["keep", "drop"]);
  });
});

describe("draft: schedule, scenes, screens, gate 2", () => {
  test("the PDF is off the drafting path: no print during draft or rewrite, one started by keep", async () => {
    const { p, draw, dir } = await drawn();
    let calls = 0;
    let started: () => void = () => {};
    const printed = new Promise<void>((r) => { started = r; });
    const spy: PdfPrinter = async () => { calls++; started(); return false; };
    const d = new Drafting(p, { printPdf: spy, draftsDir: join(dir, "drafts") });
    d.configure(draw.id, { overrides: { "checks.samples": 3, "screens.samples": 3, "screens.keep_if": 2 } });
    await d.draft(draw.id, { overrides: { "screens.samples": 3, "screens.keep_if": 2 } });
    // the draft and every register rewrite inside it wrote the HTML and printed nothing
    expect(readFileSync(join(OUTPUT, draw.id, "report.html"), "utf8")).toContain("<h2>The story</h2>");
    expect(calls).toBe(0);
    await d.rewrite(draw.id, [1]);
    expect(calls).toBe(0);
    d.keep(draw.id);
    await printed;
    expect(calls).toBe(1);
  });

  test("a draft leaves its report: the story, its origins, the checks, the schedule, the screens and the cost", async () => {
    const { p, d, draw } = await drawn();
    await d.draft(draw.id, { overrides: { "screens.samples": 3, "screens.keep_if": 2 } });
    const dir = join(OUTPUT, draw.id);
    const html = readFileSync(join(dir, "report.html"), "utf8");
    for (const h of ["The story", "Where it came from", "The brief", "Checks and corrections", "The schedule", "Writing and screening, beat by beat", "What it cost"]) expect(html).toContain(`<h2>${h}</h2>`);
    const scenes = chainOf(p, draw.id).scenes();
    expect(html.split('class="beat"').length - 1).toBe(scenes.length);
    expect(html.split('class="premise').length - 1).toBe(5);
    // the preload turns the print off: a test starts no browser
    expect(existsSync(join(dir, "report.pdf"))).toBe(false);
  });

  test("sequential draft: schedule shape, scenes carry the text so far, screens per scene, slop, flags, status", async () => {
    const { p, d, draw, model, dir } = await drawn();
    // overrides re-resolve from the defaults, so the fixture's three screen samples are restated here
    const out = await d.draft(draw.id, { overrides: { "form.tense": "past", "screens.samples": 3, "screens.keep_if": 2 } });
    expect(out.status).toBe("awaiting_draft_gate");
    expect(JSON.parse(out.draft_config!).config.form.tense).toBe("past");
    expect(JSON.parse(out.draft_config!).overridden).toEqual(["form.tense", "screens.samples", "screens.keep_if"]);
    // schedule
    const sched = model.calls.find((c) => c.stage === "schedule")!;
    expect(sched.prompt).toContain("beats: between 5 and 10, each between 400 and 800 words, caps summing to about 5000");
    expect(sched.prompt).toContain("tense: past");
    expect(sched.prompt).toContain("form: derive person, chronology, container from the brief and state them");
    expect(sched.prompt).toContain("ending: the brief's ending is the last beat, in place");
    const sa = p.artifacts(draw.id).find((a) => a.kind === "schedule")!;
    expect(sa.meta.beats).toHaveLength(8);
    expect(sa.meta.form).toEqual({ tense: "past", person: "third", chronology: "linear", container: "prose" });
    expect(sa.meta.beats[0].withheld).toEqual([{ item: "the instrument's wording", until: 7 }, { item: "why she answers only Lauro", until: 6 }]);
    // scenes, in sequence, as turns of one session: each forks the one before, whose history holds the text so far
    const scenes = model.calls.filter((c) => c.stage === "scene");
    expect(scenes).toHaveLength(8);
    expect(scenes.every((c) => !c.prompt.includes("<story-so-far>"))).toBe(true);
    expect(scenes[0].session).toEqual({});
    const sceneIndex = model.calls.indexOf(scenes[0]);
    expect(scenes[1].session).toEqual({ resume: `fake-${sceneIndex + 1}` });
    expect(scenes.slice(1).every((c, i) => c.session?.resume === `fake-${model.calls.indexOf(scenes[i]) + 1}`)).toBe(true);
    // the examples, outline, ledger and schedule ride in the system prompt, the same on every beat, so the CLI reads them from its cache
    expect(scenes[0].system.indexOf("horror passage")).toBeLessThan(scenes[0].system.indexOf("<outline>"));
    expect(scenes[0].system).toContain("<ledger>\ndetail: the board of twelve\ntime: the fire was on the 3rd");
    expect(scenes[0].system).toContain("<schedule>");
    expect(scenes.every((c) => c.system === scenes[0].system)).toBe(true);
    expect(scenes[0].prompt).not.toContain("<outline>");
    expect(scenes[0].prompt).toContain("Under 625 words");
    expect(scenes[0].prompt).toContain("Form: tense past; person third; chronology linear; container prose");
    expect(scenes[0].prompt).toContain("Still withheld after it: the instrument's wording (beat 7); why she answers only Lauro (beat 6)");
    expect(scenes[2].prompt).toContain("<material>\nw2_0");                  // beat 3 absorbs the chosen vignette
    expect(scenes[7].prompt).toContain(`<material>\n${SPAN_A}`);             // beat 8 absorbs the ending
    expect(scenes[1].prompt).not.toContain("<material>");
    expect(scenes.every((c) => !/theme/i.test(c.prompt.slice(c.prompt.indexOf("Write beat"))))).toBe(true);   // nothing about theme in the ask
    const sceneArts = p.artifacts(draw.id).filter((a) => a.kind === "scene").map((a) => a.meta);
    expect(sceneArts.find((m) => m.beat === 2)!.warnings).toEqual(["over_cap"]);
    expect(sceneArts.find((m) => m.beat === 1)!.warnings).toEqual([]);
    // screens: ledger ×3 and structure ×1 per scene, slop once; the binds fork one base session that holds the ledger and the draft
    const binds = model.calls.filter((c) => c.stage === "screen-ledger");
    expect(binds.filter((c) => c.prompt.includes("<base/>"))).toHaveLength(1);
    expect(binds.filter((c) => !c.prompt.includes("<base/>"))).toHaveLength(24);
    const baseCall = binds.find((c) => c.prompt.includes("<base/>"))!;
    expect(baseCall.prompt).toContain("time: the fire was on the 3rd");
    expect(baseCall.prompt).toContain("Scene 8 opens.");
    const baseId = `fake-${model.calls.indexOf(baseCall) + 1}`;
    expect(binds.filter((c) => !c.prompt.includes("<base/>")).every((c) => c.session?.resume === baseId && !c.prompt.includes("time: the fire"))).toBe(true);
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
    const sl2 = model.calls.find((c) => c.stage === "screen-ledger" && c.prompt.startsWith(`The scene to check is <scene n="2">`))!;
    expect(sl2.prompt).toContain(`above, and the previous scene is <scene n="1">.`);
    expect(p.steps(draw.id).filter((s) => s.stage === "screen-slop").map((s) => s.model)).toEqual(["deterministic"]);
    const v = d.view(draw.id);
    expect(v.screenFindings.map((f) => [f.beat, f.screen, f.n, !!f.patch])).toEqual([[3, "ledger", 3, true], [4, "ledger", 3, false]]);
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
    // the flag-free render is the draft as a listener hears it: scenes and breaks, no screen note, no judge
    const clean = renderStory(d.view(draw.id), false);
    expect(clean).toContain("Scene 1 opens.");
    expect(clean).toContain("* * *");
    expect(clean).not.toContain("[screen-");
    expect(clean).not.toContain("judge and generator share a family");
    expect(existsSync(join(dir, "drafts", draw.id))).toBe(false);          // nothing exported before keep
  });

  test("the narrated profile: the schedule is asked for the told shape, every scene carries the register, the last beat is asked what it paid, and a beat that names no body is rewritten once", async () => {
    const toldForm = "tense: past\nperson: first\nchronology: linear\ncontainer: told";
    const { p, d, draw, model } = await drawn(draftScript({ schedule: () => schedule({ form: toldForm, cap: 875 }) }));
    await d.draft(draw.id, { profile: "narrated", overrides: { "screens.samples": 3, "screens.keep_if": 2, "screens.listen.long_share_max": 1 } });
    const sched = model.calls.find((c) => c.stage === "schedule")!;
    expect(sched.prompt).toContain("told afterward, by its narrator, to a listener");
    expect(sched.prompt).toContain("<set_piece>");
    expect(sched.prompt).toContain("container: told");
    expect(sched.prompt).toContain("target length: 7000 words");
    const scenes = model.calls.filter((c) => c.stage === "scene");
    expect(scenes.every((c) => c.prompt.includes("<register>"))).toBe(true);
    // eight beats, and beat 2 again: the fixture names no body in beat 2, and the told template pays for its register
    expect(scenes.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "2"]);
    expect(scenes[8].prompt).toContain("the narrator says what the body did before saying what it meant");
    // the fixture marks no beat, so the shaped default holds: the beat before the last is asked whether a presence arrived and a cost was paid
    const st7 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="7">/.test(c.prompt))!;
    expect(st7.prompt).toContain("presence-arrives:");
    expect(st7.prompt).toContain("resolved:");
    const st8 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="8">/.test(c.prompt))!;
    expect(st8.prompt).not.toContain("presence-arrives:");
    expect(st8.prompt).toContain("resolves-everything:");
    const st4 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="4">/.test(c.prompt))!;
    expect(st4.prompt).not.toContain("presence-arrives:");
    const v = d.view(draw.id);
    expect(v.profiles.find((x) => x.beat === 7)!.answers["cost-paid"]).toBeDefined();
    expect(v.profiles.find((x) => x.beat === 8)!.answers["cost-paid"]).toBeUndefined();
    expect(v.listen).not.toBeNull();
    expect(v.listen!.beats).toHaveLength(8);
    expect(p.draw(draw.id).status).toBe("awaiting_draft_gate");
    expect(JSON.parse(p.draw(draw.id).draft_config!).config.structure.template).toBe("told");
  });

  test("the signal profile asks for the mission shape, carries its register into every scene, and pays for it", async () => {
    const signalForm = "tense: past\nperson: third\nchronology: linear\ncontainer: prose";
    const { p, d, draw, model } = await drawn(draftScript({ schedule: () => schedule({ form: signalForm, cap: 1100 }) }));
    await d.draft(draw.id, { profile: "signal", overrides: { "beats.min": 8, "screens.listen.long_share_max": 1 } });
    const sched = model.calls.find((c) => c.stage === "schedule")!;
    expect(sched.prompt).toContain("follows one specialist, close");
    expect(sched.prompt).toContain("person: third");
    expect(sched.prompt).toContain("container: prose");
    expect(sched.prompt).toContain("target length: 10000 words");
    const scenes = model.calls.filter((c) => c.stage === "scene");
    expect(scenes.every((c) => c.prompt.includes("Name the feeling as it is felt"))).toBe(true);
    expect(scenes.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "2"]);
    expect(JSON.parse(p.draw(draw.id).draft_config!).config.structure.template).toBe("signal");
  });

  test("the listen profile states the requirements, fixes the chronology, the person and the tense, and pays for its register", async () => {
    const { p, d, draw, model } = await drawn(draftScript({ schedule: () => schedule({ cap: 1100, form: listenForm }) }));
    await d.draft(draw.id, { profile: "listen", overrides: { "beats.min": 8, "screens.listen.long_share_max": 1 } });
    const sched = model.calls.find((c) => c.stage === "schedule")!;
    expect(sched.prompt).toContain("Derive the shape from the brief");
    expect(sched.prompt).toContain("form: derive container from the brief and state it");
    expect(sched.prompt).toContain("tense: past");
    expect(sched.prompt).toContain("person: first");
    expect(sched.prompt).toContain("chronology: linear");
    expect(sched.prompt).toContain("so is the chronology unless the configuration fixes it");
    expect(sched.prompt).not.toContain("<register>");
    // the listen profile fixes the signal register whatever container the schedule derives; the body rewrite of beat 2 still runs
    const scenes = model.calls.filter((c) => c.stage === "scene");
    expect(scenes.every((c) => c.prompt.includes("Name the feeling as it is felt"))).toBe(true);
    expect(scenes.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "2"]);
    expect(JSON.parse(p.draw(draw.id).draft_config!).config.structure.template).toBe("listen");
  });

  test("a schedule that marks a beat <pays> moves the arrival screen to that beat", async () => {
    const withPays = schedule({ cap: 1100, form: listenForm }).replace(/(<beat n="5"[^>]*>)/, "$1<pays>yes</pays>");
    const { d, draw, model } = await drawn(draftScript({ schedule: () => withPays }));
    await d.draft(draw.id, { profile: "listen", overrides: { "beats.min": 8, "screens.listen.long_share_max": 1 } });
    const st5 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="5">/.test(c.prompt))!;
    expect(st5.prompt).toContain("presence-arrives:");
    const st7 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="7">/.test(c.prompt))!;
    expect(st7.prompt).not.toContain("presence-arrives:");
    expect(d.view(draw.id).profiles.find((x) => x.beat === 5)!.answers["cost-paid"]).toBeDefined();
  });

  test("a beat over the long-sentence ceiling and a paying beat that pays off the page are each rewritten once", async () => {
    const signalForm = "tense: past\nperson: third\nchronology: linear\ncontainer: prose";
    // every scene is written as one sentence, so every beat is over the default long-sentence ceiling
    const oneSentence = (prompt: string) => {
      const n = Number(fromAsk(prompt, /Write beat (\d+) of the story/, "the beat number"));
      const rewrite = /<constraints>/.test(prompt) ? " REWRITTEN" : "";
      return `<scene>Scene ${n} opens.${rewrite} ${Array.from({ length: 297 }, (_, i) => `s${n}w${i}`).join(" ")}</scene>`;
    };
    const { d, draw, model } = await drawn(draftScript({ schedule: () => schedule({ form: signalForm, cap: 1100 }), scene: oneSentence }));
    await d.draft(draw.id, { profile: "signal", overrides: { "beats.min": 8, "screens.listen.fix": "rewrite" } });
    const rewrites = model.calls.filter((c) => c.stage === "scene" && c.prompt.includes("<constraints>"));
    expect(rewrites.length).toBe(8);
    expect(rewrites.every((c) => c.prompt.includes("no sentence over thirty words"))).toBe(true);
    // beat 2 names no body: its rewrite carries the body line as well, once
    const two = rewrites.find((c) => /Write beat 2 /.test(c.prompt))!;
    expect(two.prompt).toContain("says what the body did before saying what it meant");
    expect(two.prompt.split("no sentence over thirty words").length).toBe(2);
  });

  test("under fix = edit, a beat owed only the length line has its long sentences edited in place, with no rewrite and no rebind", async () => {
    const signalForm = "tense: past\nperson: third\nchronology: linear\ncontainer: prose";
    const oneSentence = (prompt: string) => {
      const n = Number(fromAsk(prompt, /Write beat (\d+) of the story/, "the beat number"));
      return `<scene>Scene ${n} opens. ${Array.from({ length: 297 }, (_, i) => `s${n}w${i}`).join(" ")}</scene>`;
    };
    // each long sentence comes back split in two, word for word otherwise
    const split = (prompt: string) => [...prompt.matchAll(/<sentence>([\s\S]*?)<\/sentence>/g)]
      .map(([, s]) => `<edit><from>${s}</from><to>${s!.replace(/ (s\d+w150) /, ". $1 ")}</to></edit>`).join("");
    const { p, d, draw, model } = await drawn(draftScript({ schedule: () => schedule({ form: signalForm, cap: 1100 }), scene: oneSentence, "scene-edit": split }));
    await d.draft(draw.id, { profile: "signal", overrides: { "beats.min": 8 } });
    // beat 2 also names no body, so it owes a register line as well and is rewritten whole; the other seven are edited
    const rewrites = model.calls.filter((c) => c.stage === "scene" && c.prompt.includes("<constraints>"));
    expect(rewrites.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["2"]);
    const edits = model.calls.filter((c) => c.stage === "scene-edit");
    expect(edits).toHaveLength(7);
    expect(edits.every((c) => c.prompt.includes("no sentence over thirty words") && !c.prompt.includes("Scene 1 opens.</sentence>"))).toBe(true);
    const scenes = d.view(draw.id).scenes;
    const three = scenes.find((s) => s.beat === 3)!;
    expect(three.text).toContain("s3w149. s3w150");
    expect(p.artifacts(draw.id).find((a) => a.kind === "scene" && a.meta.beat === 3 && a.meta.edited)!.meta.edited).toEqual(["One thing per sentence, short enough to say aloud in one breath; no sentence over thirty words."]);
    // a split sentence changes no fact: the length edits are not bound again; beat 2's rewrite binds 2 and 3, one sample each
    expect(model.calls.filter((c) => c.stage === "screen-ledger" && !c.prompt.includes("<base/>"))).toHaveLength(8 + 2);
  });

  test("a paying beat where the thing only stands behind glass is rewritten once, and the thing acts", async () => {
    const signalForm = "tense: past\nperson: third\nchronology: linear\ncontainer: prose";
    const withPays = schedule({ form: signalForm, cap: 1100 }).replace(/(<beat n="5"[^>]*>)/, "$1<pays>yes</pays>");
    // on the paying beat the screen finds the thing present but not acting; a rewrite fixes it, and the screen then passes it
    const seen = new Set<string>();
    const glass = (prompt: string) => {
      const n = Number(fromAsk(prompt, /<scene n="(\d+)">/, "the scene number"));
      const out = screenStructure(prompt);
      if (n !== 5 || seen.has("5")) return out;
      seen.add("5");
      return out.replace(/(<question name="presence-in-room"><answer>)present/, "$1absent");
    };
    const { d, draw, model } = await drawn(draftScript({ schedule: () => withPays, "screen-structure": glass }));
    await d.draft(draw.id, { profile: "signal", overrides: { "beats.min": 8, "screens.listen.long_share_max": 1 } });
    const rewrites = model.calls.filter((c) => c.stage === "scene" && c.prompt.includes("<constraints>"));
    // beat 2 for the body, beat 5 for the presence; nothing else
    expect(rewrites.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["2", "5"]);
    const five = rewrites.find((c) => /Write beat 5 /.test(c.prompt))!;
    expect(five.prompt).toContain("it touches, moves, breaks or takes a person or a thing");
    expect(five.prompt).toContain("does not stand behind glass");
    // the screen asks for the harder bar, and the schedule asks the thing back for a second beat
    const st5 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="5">/.test(c.prompt))!;
    expect(st5.prompt).toContain("nothing between them: not glass, a screen, a channel");
    expect(st5.prompt).toContain("A thing that is seen, stands, or gestures and does nothing more is absent");
  });

  test("a late hook, one voice and a beat where nothing happens each send the beat back once, under their lines", async () => {
    const signalForm = listenForm;
    const seen = new Set<string>();
    const answer = (prompt: string) => {
      const n = Number(fromAsk(prompt, /<scene n="(\d+)">/, "the scene number"));
      let out = screenStructure(prompt);
      if (seen.has(String(n))) return out;
      seen.add(String(n));
      if (n === 1) out = out.replace(/(<question name="hook-late"><answer>)absent/, "$1present");
      if (n === 3) out = out.replace(/(<question name="one-voice"><answer>)absent/, "$1present");
      if (n === 4) out = out.replace(/(<question name="nothing-happens"><answer>)absent/, "$1present");
      return out;
    };
    const { d, draw, model } = await drawn(draftScript({ schedule: () => schedule({ form: signalForm, cap: 1100 }), "screen-structure": answer }));
    await d.draft(draw.id, { profile: "listen", overrides: { "beats.min": 8, "screens.listen.long_share_max": 1 } });
    const rewrites = model.calls.filter((c) => c.stage === "scene" && c.prompt.includes("<constraints>"));
    expect(rewrites.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["1", "2", "3", "4"]);
    expect(rewrites[0].prompt).toContain(HOOK_LINE);
    expect(rewrites[2].prompt).toContain(VOICES_LINE);
    expect(rewrites[3].prompt).toContain(EVENT_LINE);
    // the register carries the cast's voices and the signpost rule into every scene
    expect(model.calls.filter((c) => c.stage === "scene").every((c) => c.prompt.includes("Each person speaks the way the schedule's cast says they do"))).toBe(true);
  });

  test("the listen schedule asks the thing back for a second beat, and every shape asks it to do harm", async () => {
    const { d, draw, model } = await drawn(draftScript({ schedule: () => schedule({ cap: 1100, form: listenForm }) }));
    await d.draft(draw.id, { profile: "listen", overrides: { "beats.min": 8, "screens.listen.long_share_max": 1 } });
    const sched = model.calls.find((c) => c.stage === "schedule")!;
    expect(sched.prompt).toContain("does harm to that person or that place, and does not explain itself");
    expect(sched.prompt).toContain("in at least two more beats, before or after that one");
    expect(sched.prompt).toContain("says what is wrong inside its first 150 words");
    expect(sched.prompt).toContain("By the midpoint the person who knows has told someone");
    expect(sched.prompt).toContain("a <cast> tag: three or four named people who speak");
    // beat 1 alone is asked whether its hook came late; every beat is asked about its voices and whether anything happens
    const st1 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="1">/.test(c.prompt))!;
    expect(st1.prompt).toContain("hook-late:");
    expect(st1.prompt).toContain("one-voice:");
    expect(st1.prompt).toContain("nothing-happens:");
    const st2 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="2">/.test(c.prompt))!;
    expect(st2.prompt).not.toContain("hook-late:");
    expect(d.view(draw.id).profiles.find((x) => x.beat === 1)!.answers["hook-late"]).toBeDefined();
    expect(d.view(draw.id).profiles.find((x) => x.beat === 2)!.answers["hook-late"]).toBeUndefined();
    expect(sched.prompt).not.toContain("does not answer");
  });

  test("a beat over the numeral ceiling is rewritten once, and a beat under it is not", async () => {
    const signalForm = "tense: past\nperson: third\nchronology: linear\ncontainer: prose";
    // beat 3 carries 30 figures in 300 words; every other beat carries the one in "Scene N opens."
    const heavy = (prompt: string) => {
      const n = Number(fromAsk(prompt, /Write beat (\d+) of the story/, "the beat number"));
      const rewrite = /<constraints>/.test(prompt) ? " REWRITTEN" : "";
      const figures = n === 3 ? Array.from({ length: 30 }, (_, i) => `${1000 + i}`) : [];
      const filler = Array.from({ length: 297 - figures.length }, (_, i) => `s${n}w${i}`);
      return `<scene>Scene ${n} opens.${rewrite} ${[...figures, ...filler].join(" ")}</scene>`;
    };
    const { d, draw, model } = await drawn(draftScript({ scene: heavy, schedule: () => schedule({ form: signalForm, cap: 1100 }) }));
    await d.draft(draw.id, { profile: "signal", overrides: { "beats.min": 8, "screens.listen.long_share_max": 1, "screens.listen.fix": "rewrite" } });
    const rewrites = model.calls.filter((c) => c.stage === "scene" && c.prompt.includes("<constraints>"));
    // beat 2 names no body and is rewritten for that; beat 3 is rewritten for its figures alone
    expect(rewrites.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["2", "3"]);
    const three = rewrites.find((c) => /Write beat 3 /.test(c.prompt))!;
    expect(three.prompt).toContain("A listener cannot hold a figure");
    expect(three.prompt).not.toContain("no sentence over thirty words");
    const two = rewrites.find((c) => /Write beat 2 /.test(c.prompt))!;
    expect(two.prompt).not.toContain("A listener cannot hold a figure");
  });

  test("the rewrite plan is a function of the profiles, the scenes and the ceilings", () => {
    const cfg = loadDraftConfig("signal").config;
    const figures = Array.from({ length: 30 }, (_, i) => `${1000 + i}.`).join(" ");
    // no figures in words either: "one two three" would now count
    const short = Array.from({ length: 30 }, () => "a b c d e f g h i.").join(" ");
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ") + ".";
    const plan = rewritePlan(
      [{ beat: 2, flags: ["bodily-emotion"] }, { beat: 5, flags: ["theme-stated"] }, { beat: 7, flags: ["presence-in-room", "cost-in-scene", "presence-arrives"] }],
      [{ beat: 2, text: short }, { beat: 3, text: `${figures} ${short}` }, { beat: 4, text: long }, { beat: 5, text: short }, { beat: 7, text: short }],
      cfg);
    expect([...plan]).toEqual([[2, { register: [BODY_LINE], faults: [] }], [7, { register: [PRESENCE_LINE, COST_LINE], faults: [] }], [3, { register: [], faults: ["numerals"] }], [4, { register: [], faults: ["long"] }]]);
    expect(rewritePlan([], [{ beat: 4, text: long }], { ...cfg, screens: { ...cfg.screens, listen: { long_share_max: 1 } } }).size).toBe(0);
  });

  test("a rewrite that breaks another ceiling gets one more rewrite; a beat flagged again for the same line waits", async () => {
    const signalForm = "tense: past\nperson: third\nchronology: linear\ncontainer: prose";
    // every beat is short sentences; beat 3 carries 30 figures, and its numeral rewrite comes back as one long sentence
    const shortLines = (n: number, k: number) => Array.from({ length: k }, (_, i) => `s${n} w${i} a b c d e f g.`).join(" ");
    const scene = (prompt: string) => {
      const n = Number(fromAsk(prompt, /Write beat (\d+) of the story/, "the beat number"));
      const rewrite = /<constraints>/.test(prompt);
      if (n === 3 && rewrite && /cannot hold a figure/.test(prompt) && !/thirty words/.test(prompt)) return `<scene>Scene 3 opens. REWRITTEN ${Array.from({ length: 300 }, (_, i) => `s3w${i}`).join(" ")}</scene>`;
      const figures = n === 3 && !rewrite ? Array.from({ length: 30 }, (_, i) => `${1000 + i}.`).join(" ") + " " : "";
      return `<scene>Scene ${n} opens.${rewrite ? " REWRITTEN" : ""} ${figures}${shortLines(n, 30)}</scene>`;
    };
    const { d, draw, model } = await drawn(draftScript({ scene, schedule: () => schedule({ form: signalForm, cap: 1100 }) }));
    await d.draft(draw.id, { profile: "signal", overrides: { "beats.min": 8, "screens.listen.fix": "rewrite" } });
    const rewrites = model.calls.filter((c) => c.stage === "scene" && c.prompt.includes("<constraints>"));
    // round one: beat 2 for the body, beat 3 for its figures; round two: beat 3 again, now for its length. Beat 2 still names no body and is not sent back
    expect(rewrites.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["2", "3", "3"]);
    expect(rewrites[1].prompt).toContain("A listener cannot hold a figure");
    expect(rewrites[1].prompt).not.toContain("no sentence over thirty words");
    expect(rewrites[2].prompt).toContain("no sentence over thirty words");
    expect(rewrites[2].prompt).not.toContain("A listener cannot hold a figure");
    expect(d.view(draw.id).scenes[2].text).toContain("REWRITTEN s3 w0 a b c d e f g.");
  });

  test("the outline has four sections and the ending is derived from three of them", async () => {
    const { model } = await drawn();
    const outline = model.calls.find((c) => c.stage === "outline")!;
    expect(outline.prompt).toContain('<section name="arrival">');
    expect(model.calls.find((c) => c.stage === "ending")!.prompt).toContain("derived from the particulars, knowledge and arrival sections");
  });

  test("parallel order carries no text so far; a bad schedule fails shape and retries; fixed form is checked; template mode refused", async () => {
    const { p, d, draw, model } = await drawn(draftScript({ schedule: [schedule({ absorbsTwice: true }), schedule()] }));
    await expect(d.draft(draw.id, { overrides: { "structure.template": "frame" } })).rejects.toThrow(/structure.template must be auto, listen, told or signal, got frame/);
    expect(p.draw(draw.id).status).toBe("done");
    const out = await d.draft(draw.id, { overrides: { "scenes.order": "parallel" } });
    expect(out.status).toBe("awaiting_draft_gate");
    expect(p.steps(draw.id).filter((s) => s.stage === "schedule").map((s) => [s.status, s.fail_reason])).toEqual([["failed", "shape"], ["done", null]]);
    expect(p.steps(draw.id).find((s) => s.stage === "schedule" && s.status === "failed")!.error).toMatch(/chosen absorbed by beats 3 and 4/);
    const scenes = model.calls.filter((c) => c.stage === "scene");
    expect(scenes).toHaveLength(8);
    expect(scenes.every((c) => !c.prompt.includes("<story-so-far>"))).toBe(true);
    expect(d.view(draw.id).scenes.map((s) => s.beat)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("acts order writes three runs at once: each run's first beat reads the plan alone, the rest read their run's text so far", async () => {
    const { d, draw, model } = await drawn();
    const out = await d.draft(draw.id, { overrides: { "scenes.order": "acts" } });
    expect(out.status).toBe("awaiting_draft_gate");
    const scenes = model.calls.filter((c) => c.stage === "scene");
    expect(scenes).toHaveLength(8);
    // 8 beats in runs of 3, 3, 2: beats 1, 4 and 7 open a run, and none carries a story so far
    expect(scenes.filter((c) => !c.session?.resume).length).toBe(3);
    expect(d.view(draw.id).scenes.map((s) => s.beat)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("chunk cuts consecutive runs, the longer first", () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7, 8], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7, 8]]);
    expect(chunk([1, 2], 3)).toEqual([[1], [2]]);
  });

  test("a withheld item with no reveal beat is never revealed: it stays withheld past the last beat, and the screens say so", () => {
    const cfg = loadDraftConfig().config;
    const text = `<form>tense: past\nperson: first\nchronology: linear\ncontainer: prose</form>` + Array.from({ length: 8 }, (_, i) => {
      const n = i + 1;
      const withheld = n === 1 ? "whether the reductions have a floor — beat 7 (unresolved until then)\nwhat brought them across —\nwho sent the second pass — never\nthe name on the band" : "none";
      return `<beat n="${n}" words="625"><job>Beat ${n}.</job><known>Thing ${n}.</known><withheld>${withheld}</withheld><stakes>x</stakes><absorbs>none</absorbs></beat>`;
    }).join("");
    const s = parseSchedule(text, cfg);
    expect(s.beats[0].withheld).toEqual([
      { item: "whether the reductions have a floor", until: 7 },
      { item: "what brought them across", until: 9 },
      { item: "who sent the second pass", until: 9 },
      { item: "the name on the band", until: 9 },
    ]);
    expect(structureScreen(s, 1, "scene", "auto").prompt).toContain("what brought them across — never revealed");
    expect(structureScreen(s, 1, "scene", "auto").prompt).toContain("whether the reductions have a floor — beat 7");
    expect(() => parseSchedule(text.replace("the name on the band", " — "), cfg)).toThrow(/withheld line without an item/);
  });

  test("a beat the schedule puts at a new time is asked to place it; a beat that does not move is not, and a schedule without <when> moves nothing", () => {
    const cfg = loadDraftConfig().config;
    const whens = ["", "day one, ship-year 400", "day one, ship-year 400", "ship-year 393, below the line", "day four, ship-year 400", "day four, ship year 400", "", "day nine, ship-year 400"];
    const text = `<form>tense: past\nperson: first\nchronology: linear\ncontainer: prose</form>` + whens.map((w, i) => {
      const n = i + 1;
      return `<beat n="${n}" words="625"><job>Beat ${n}.</job>${w ? `<when>${w}</when>` : ""}<known>Thing ${n}.</known><withheld>none</withheld><stakes>x</stakes><absorbs>none</absorbs></beat>`;
    }).join("");
    const s = parseSchedule(text, cfg);
    expect(s.beats.map((b) => b.when)).toEqual(whens);
    // a schedule that closes <when> with a sibling's tag: the stray token is not part of the time (run 10)
    const strayed = parseSchedule(text.replace("<when>day four, ship-year 400</when>", "<when>day four, ship-year 400</known></when>"), cfg);
    expect(strayed.beats[4].when).toBe("day four, ship-year 400");
    // beat 4 leaves the present for the recursion and beat 5 comes back; beat 3 repeats beat 2's time and beat 6 only repunctuates it
    expect(s.beats.map((b, i) => movedIn(b, s.beats[i - 1]))).toEqual([false, false, false, true, true, false, false, false]);
    const moved = structureScreen(s, 4, "scene", "auto");
    expect(moved.names).toContain("time-unplaced");
    expect(moved.prompt).toContain("time-unplaced:");
    expect(moved.prompt).toContain("that one was day one, ship-year 400, this one is ship-year 393, below the line");
    expect(structureScreen(s, 3, "scene", "auto").names).not.toContain("time-unplaced");
    expect(structureScreen(s, 3, "scene", "auto").prompt).not.toContain("time-unplaced:");
    // a schedule written before <when> existed says nothing and constrains nothing
    expect(structureScreen(s, 8, "scene", "auto").prompt).not.toContain("time-unplaced:");
  });

  test("the structure screen asks in its prompt exactly the rules it names, at every beat and under either template", () => {
    const cfg = loadDraftConfig().config;
    const text = `<form>tense: past\nperson: first\nchronology: linear\ncontainer: prose</form>` + Array.from({ length: 8 }, (_, i) => {
      const n = i + 1;
      return `<beat n="${n}" words="625"><job>Beat ${n}.</job><when>${n === 4 ? "years before" : "that night"}</when><known>Thing ${n}.</known><withheld>none</withheld><stakes>x</stakes><absorbs>none</absorbs>${n === 5 ? "<pays>yes</pays>" : ""}</beat>`;
    }).join("");
    const s = parseSchedule(text, cfg);
    const asked = (prompt: string) => STRUCTURE_RULES.map((r) => r.name).filter((name) => new RegExp(`^${name}:`, "m").test(prompt));
    for (const template of ["auto", "signal"]) for (const b of s.beats) {
      const { prompt, names } = structureScreen(s, b.n, "scene", template);
      expect(asked(prompt).sort()).toEqual([...names].sort());
    }
    // the paying beat: the marked one under a shaped template, the last under auto
    expect(structureScreen(s, 5, "scene", "signal").names).toContain("cost-paid");
    expect(structureScreen(s, 8, "scene", "signal").names).not.toContain("cost-paid");
    expect(structureScreen(s, 8, "scene", "auto").names).toContain("cost-paid");
  });

  test("the scene ask carries the beat's time, and says to place the listener only when it moves", () => {
    const cfg = loadDraftConfig().config;
    const whens = ["day one", "day one", "ship-year 393", "day one", "day one", "day one", "day one", ""];
    const text = `<form>tense: past\nperson: first\nchronology: linear\ncontainer: prose</form>` + whens.map((w, i) =>
      `<beat n="${i + 1}" words="625"><job>Beat ${i + 1}.</job>${w ? `<when>${w}</when>` : ""}<known>Thing.</known><withheld>none</withheld><stakes>x</stakes><absorbs>none</absorbs></beat>`).join("");
    const s = parseSchedule(text, cfg);
    const parts = { examples: [], outline: "o", vignette: "v", contexts: [], ending: "e" } as never;
    const ask = (n: number) => scenePrompt(parts, s, s.beats[n - 1], []);
    expect(ask(2)).toContain("It happens at day one.");
    expect(ask(2)).not.toContain("places the listener in the new time");
    expect(ask(3)).toContain("It happens at ship-year 393; the beat before it happened at day one, so its opening places the listener in the new time before its events begin.");
    expect(ask(4)).toContain("places the listener in the new time");   // and back again
    expect(ask(8)).not.toContain("It happens at");
  });

  test("the listen profile fixes a linear chronology, and a nonlinear schedule does not pass for it", () => {
    const cfg = loadDraftConfig("listen").config;
    expect(cfg.form.chronology).toBe("linear");
    const text = (chronology: string) => `<form>tense: past\nperson: first\nchronology: ${chronology}\ncontainer: prose</form>` + Array.from({ length: 10 }, (_, i) =>
      `<beat n="${i + 1}" words="1000"><job>Beat ${i + 1}.</job><known>Thing.</known><withheld>none</withheld><stakes>x</stakes><absorbs>none</absorbs></beat>`).join("");
    expect(() => parseSchedule(text("linear, one strand, from the draw to the landing"), cfg)).not.toThrow();
    for (const said of ["nonlinear: opens at the second bell, then goes back", "non-linear", "opens on Deck Zero, goes back three days, then runs forward"])
      expect(() => parseSchedule(text(said), cfg)).toThrow(/chronology is fixed to linear/);
  });

  test("a schedule contradicting a fixed axis, or outside the beat bounds, fails shape", async () => {
    const { d, draw, p } = await drawn(draftScript({ schedule: [schedule(), schedule()] }));
    await expect(d.draft(draw.id, { overrides: { "form.tense": "present" } })).rejects.toThrow(/schedule failed: shape/);
    expect(p.steps(draw.id).filter((s) => s.stage === "schedule")[0].error).toMatch(/tense is fixed to present, schedule said past/);
    expect(p.draw(draw.id)).toMatchObject({ status: "done", error: expect.stringMatching(/^schedule failed: shape/) });   // back to the brief it was drafting
    const { d: d2, draw: draw2, p: p2 } = await drawn(draftScript({ schedule: [schedule({ beats: 3, cap: 800 }), schedule({ beats: 3, cap: 800 })] }));
    await expect(d2.draft(draw2.id)).rejects.toThrow(/shape/);
    expect(p2.steps(draw2.id).filter((s) => s.stage === "schedule")[0].error).toMatch(/3 beats; config asks 5\.\.10/);
    const { d: d3, draw: draw3 } = await drawn(draftScript({ schedule: () => schedule({ beats: 3, cap: 500 }) }));
    const out = await d3.draft(draw3.id, { profile: "flash" });
    expect(out.status).toBe("awaiting_draft_gate");
    expect(JSON.parse(out.draft_config!).profile).toBe("flash");
  });

  test("a draft pins the ledger the outline's table renders to, with no call, and L1 reads the table with none either (T4)", async () => {
    const { p, d, draw, model } = await drawn();
    const out = await d.draft(draw.id);
    expect(out.status).toBe("awaiting_draft_gate");
    expect(stagesOf(model, /^check-|^ledger-|^ir-symbolize$/)).toEqual([]);
    const ledgers = p.artifacts(draw.id).filter((a) => a.kind === "ledger");
    expect(ledgers.map((a) => a.content)).toEqual([LEDGER]);
    expect(p.steps(draw.id).filter((s) => s.stage === "ledger-extract" || s.stage === "ir-symbolize").map((s) => [s.stage, s.model])).toEqual([["ledger-extract", "deterministic"], ["ir-symbolize", "deterministic"]]);
    expect(d.view(draw.id).symbols.map((s) => s.id)).toEqual(["board", "fire", "dead", "vote", "director"]);
    expect(p.artifacts(draw.id).filter((a) => a.kind === "finding" && a.meta.source === "check")).toHaveLength(0);
  });

  test("a brief whose outline declares no table has its ledger extracted and lowered by L1, as before T4", async () => {
    const { p, d, draw, model } = await drawn();
    proseOutline(p, draw.id);
    await d.draft(draw.id);
    expect(stagesOf(model, /^ledger-extract$|^ir-symbolize$/)).toEqual(["ledger-extract", "ir-symbolize"]);
  });

  test("rewrite k regenerates one scene under the flag's replacement, binds k and k+1 to the ledger, re-screens both", async () => {
    const { p, d, draw, model } = await drawn();
    await d.draft(draw.id);
    const before = model.calls.length;
    // beat 3's flag carried a patch and was settled as the scene was written; beat 4's needs a rewrite
    const flag = d.view(draw.id).screenFindings.find((f) => f.decision === "open")!;
    expect(flag.beat).toBe(4);
    const slopBefore = d.view(draw.id).slop!.words;
    const out = await d.rewrite(draw.id, [4], { findings: [flag.id] });
    expect(out.status).toBe("awaiting_draft_gate");
    // the deterministic reports are the draft as it stands, not the pre-rewrite measurement
    expect(p.steps(draw.id).filter((s) => s.stage === "screen-slop")).toHaveLength(2);
    expect(d.view(draw.id).slop!.words).toBe(slopBefore + 1);
    const after = model.calls.slice(before);
    expect(after.map((c) => c.stage).sort()).toEqual(["scene", ...Array(6).fill("screen-ledger"), "screen-structure", "screen-structure"]);
    const sc = after.find((c) => c.stage === "scene")!;
    expect(sc.prompt).toContain("<constraints>\n- 1,106 died.\n</constraints>");
    expect(sc.prompt).toContain("Every line of the constraints holds.");
    expect(sc.prompt).toContain("Write beat 4 of the story");
    expect(sc.prompt).toContain("<story-so-far>\nScene 1 opens.");
    expect(sc.prompt).toContain(SCENE_3_PATCH);                              // the story so far is the patched text
    expect(sc.prompt).not.toContain("Scene 5 opens");
    expect(new Set(after.filter((c) => /^screen/.test(c.stage)).map((c) => /<scene n="(\d+)">/.exec(c.prompt)![1]))).toEqual(new Set(["4", "5"]));
    const v = d.view(draw.id);
    expect(v.scenes[3].text).toContain("Scene 4 opens. REWRITTEN");
    expect(v.scenes).toHaveLength(8);
    expect(after.find((c) => c.stage === "screen-ledger" && /<scene n="5">/.test(c.prompt))!.prompt).toContain("REWRITTEN");   // scene 5 is screened against the new scene 4
    const rewrites = p.artifacts(draw.id).filter((a) => a.kind === "scene" && a.meta.rewrite).map((a) => a.meta);
    expect(rewrites.map((m) => [m.beat, m.rewrite_finding])).toEqual([[4, flag.id]]);   // the gate-2 record is on the scene
    expect(p.draw(draw.id).flag_note).toBe("");
    await expect(d.rewrite(draw.id, [9])).rejects.toThrow(/beat 9 is not in 1\.\.8/);
    await expect(d.rewrite(draw.id, [2], { findings: ["f-nope"] })).rejects.toThrow(/no open flag f-nope on beat 2/);
    // rewriting the last beat re-screens it alone
    const b2 = model.calls.length;
    await d.rewrite(draw.id, [8]);
    expect(model.calls.slice(b2).map((c) => c.stage).sort()).toEqual(["scene", "screen-ledger", "screen-ledger", "screen-ledger", "screen-structure"]);
  });

  test("rewrite k carries the beat's structure flags as the lines their rules name; a rewrite for one finding is that finding alone", async () => {
    const { d, draw, model } = await drawn();
    await d.draft(draw.id);
    // the fixture states the theme on beat 5 and names no body on beat 2; neither is a finding, both are flags the gate can now act on
    expect(d.view(draw.id).profiles.find((x) => x.beat === 5)!.flags).toEqual(["theme-stated"]);
    await d.rewrite(draw.id, [5]);
    const five = model.calls.filter((c) => c.stage === "scene").at(-1)!;
    expect(five.prompt).toContain("Write beat 5 of the story");
    expect(five.prompt).toContain(`<constraints>\n- ${THEME_LINE}\n</constraints>`);
    await d.rewrite(draw.id, [2]);
    expect(model.calls.filter((c) => c.stage === "scene").at(-1)!.prompt).toContain(`- ${BODY_LINE}`);
    // named for the ledger finding on beat 4, the rewrite carries that finding and nothing structural
    const flag = d.view(draw.id).screenFindings.find((f) => f.beat === 4 && f.decision === "open")!;
    await d.rewrite(draw.id, [4], { findings: [flag.id] });
    expect(model.calls.filter((c) => c.stage === "scene").at(-1)!.prompt).toContain("<constraints>\n- 1,106 died.\n</constraints>");
  });

  test("ticked flags are a beat's only flags, each followed by its note; a beat named with none ticked carries all of its own", async () => {
    const { p, d, draw, model } = await drawn();
    await d.draft(draw.id);
    const flag = d.view(draw.id).screenFindings.find((f) => f.beat === 4 && f.decision === "open")!;
    const before = model.calls.length;
    await d.rewrite(draw.id, [5, 4], { findings: [flag.id], notes: { [flag.id]: "  The count is read aloud by the clerk.  " } });
    const scenes = model.calls.slice(before).filter((c) => c.stage === "scene");
    expect(scenes.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["4", "5"]);
    expect(scenes[0]!.prompt).toContain("<constraints>\n- 1,106 died.\n- The count is read aloud by the clerk.\n</constraints>");
    expect(scenes[1]!.prompt).toContain(`<constraints>\n- ${THEME_LINE}\n</constraints>`);   // beat 5: nothing ticked, so its structure line
    const meta = p.artifacts(draw.id).filter((a) => a.kind === "scene" && a.meta.rewrite).map((a) => [a.meta.beat, a.meta.rewrite_finding]);
    expect(meta).toEqual([[4, flag.id], [5, undefined]]);
    expect(d.view(draw.id).rewrittenUnder).toEqual([flag.id]);
    // a patch of the rewritten scene drops the gate-2 record from its meta; the mark stays on the flag
    const four = d.view(draw.id).scenes.find((sc) => sc.beat === 4)!;
    const step = p.recordStep(draw.id, four.step_id, "scene", "patched");
    p.artifact(step, "scene", four.text + " patched", { beat: 4, words: 1, cap: 1, warnings: [], patched: ["f-y"] });
    expect(d.view(draw.id).scenes.find((sc) => sc.beat === 4)!.text).toEndWith(" patched");
    expect(d.view(draw.id).rewrittenUnder).toEqual([flag.id]);
  });

  test("rewrite with an instruction writes each named beat under it, and a later rewrite of one of them carries it", async () => {
    const { p, d, draw, model } = await drawn();
    await d.draft(draw.id);
    const TOM = "Tom blames Ada before he blames the scale, and never says so outright.";
    const before = model.calls.length;
    await d.rewrite(draw.id, [6, 3], { instruction: `  ${TOM}  ` });
    const scenes = model.calls.slice(before).filter((c) => c.stage === "scene");
    // in beat order, each under the instruction as its last line
    expect(scenes.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["3", "6"]);
    for (const c of scenes) expect(c.prompt).toContain(`- ${TOM}\n</constraints>`);
    expect(d.view(draw.id).directions).toEqual([{ text: TOM, beats: [3, 6] }]);
    // the rewrite records it, and a ledger patch of the rewritten scene keeps it
    expect(p.artifacts(draw.id).filter((a) => a.kind === "scene" && a.meta.rewrite).map((a) => [a.meta.beat, a.meta.instruction])).toEqual([[3, TOM], [6, TOM]]);
    // a rewrite of beat 6 for its flags keeps the instruction; beat 5 was never given it
    await d.rewrite(draw.id, [6]);
    expect(model.calls.filter((c) => c.stage === "scene").at(-1)!.prompt).toContain(`- ${TOM}`);
    await d.rewrite(draw.id, [5]);
    expect(model.calls.filter((c) => c.stage === "scene").at(-1)!.prompt).not.toContain(TOM);
    await expect(d.rewrite(draw.id, [])).rejects.toThrow(/beat required/);
    await expect(d.rewrite(draw.id, [2, 3], { findings: ["f-x"] })).rejects.toThrow(/no open flag f-x/);
    // the kept draft's trail names the instruction
    const { dir } = d.keep(draw.id);
    expect(readFileSync(join(dir, "trail.md"), "utf8")).toContain(`- rewrite 3: ${TOM}`);
  });

  test("a flag's own patch lands as the scene is written, costs no model call, and settles the flag", async () => {
    const { p, d, draw, model } = await drawn();
    await d.draft(draw.id);
    expect(model.calls.filter((c) => c.stage === "scene")).toHaveLength(8);   // no call beyond the scenes and the screens
    expect(stagesOf(model, /^screen-ledger$/)).toHaveLength(25);   // 24 binds and their base
    const scene3 = d.view(draw.id).scenes.find((s) => s.beat === 3)!;
    expect(scene3.text).toContain(SCENE_3_PATCH);
    expect(scene3.text).not.toContain("Scene 3 opens.");
    expect(d.story(draw.id)).toContain(SCENE_3_PATCH);
    expect(p.steps(draw.id).filter((s) => s.stage === "scene" && s.model === "patched")).toHaveLength(1);
    expect(p.draw(draw.id).status).toBe("awaiting_draft_gate");
    // the patched flag is settled with a draw verdict; the one whose fix needs more than its span stays open for a rewrite
    const [f3, f4] = d.view(draw.id).screenFindings;
    expect([f3.beat, f3.decision, f3.note]).toEqual([3, "accepted", "patched as written"]);
    expect(latest(p.db, "finding", f3.id)).toMatchObject({ verdict: "keep", note: "patched as written" });
    expect([f4.beat, f4.decision, f4.patch]).toEqual([4, "open", ""]);
  });

  test("keep exports drafts/<draw>/ with story, schedule, findings, config and trail; pass records a draft verdict", async () => {
    const { p, d, draw, dir } = await drawn();
    await d.draft(draw.id);
    await d.rewrite(draw.id, [4]);
    const { draw: kept, dir: out } = d.keep(draw.id, "good enough");
    expect(kept.status).toBe("drafted");
    expect(out).toBe(join(dir, "drafts", draw.id));
    for (const f of ["story.md", "schedule.md", "findings.md", "config.toml", "trail.md"]) expect(existsSync(join(out, f))).toBe(true);
    const story = readFileSync(join(out, "story.md"), "utf8");
    expect(story).toContain("Scene 4 opens. REWRITTEN");
    expect(story).toContain(SCENE_3_PATCH);
    expect(story).not.toContain("[screen-");
    expect(readFileSync(join(out, "schedule.md"), "utf8")).toContain("## Beat 3 · 625 words · absorbs chosen");
    const findings = readFileSync(join(out, "findings.md"), "utf8");
    expect(findings).toContain("### Beat 5\n\n- structure theme-stated: quote theme-stated 5");
    expect(findings).toContain("## Slop");
    expect(readFileSync(join(out, "config.toml"), "utf8")).toContain("[length]\nwords = 5000");
    const trail = readFileSync(join(out, "trail.md"), "utf8");
    expect(trail).toContain("a typed seed");
    expect(trail).toContain("## draft");
    expect(trail).toContain("- rewrite 4");
    expect(trail).toContain("- scene: claude-opus-5");
    expect(latest(p.db, "draft", draw.id)).toMatchObject({ verdict: "keep", note: "good enough" });
    expect(() => d.keep(draw.id)).toThrow(/is drafted, not awaiting_draft_gate/);
  });

  test("the reader check asks once a chain, has its own verify, and leaves its questions to a person", async () => {
    const question = `<finding><span>context for Test the first thing: scene one.</span><statement>Why does the director keep the relic when he could sell it?</statement><result>unanswered</result><evidence>none</evidence><invalidates>knowledge</invalidates><replacement>The director cannot sell a relic the order holds.</replacement><patch>none</patch></finding><examined>why he keeps it</examined>`;
    const verifies: string[] = [];
    const script = draftScript({
      "check-reader": () => question,
      "check-verify": (p: string) => { verifies.push(p); return Array.from({ length: (p.match(/^\d+\. span:/gm) ?? []).length }, (_, i) => `<verdict n="${i + 1}"><answer>keep</answer><why>holds</why></verdict>`).join(""); },
    });
    const { d, draw, model } = await atPlan(script);
    const reader = d.findings(draw.id).findings.filter((f) => f.checkers.includes("reader"));
    expect(reader.map((f) => [f.statement, f.decision])).toEqual([["Why does the director keep the relic when he could sell it?", "open"]]);
    // read back by its own question, twice
    expect(verifies).toHaveLength(2);
    expect(verifies.every((v) => v.includes("questions a reader raised") && v.includes("Why does the director keep the relic"))).toBe(true);
    // the repaired draw's draft does not ask again
    await d.instruct(draw.id, [{ text: DIR, parts: ["ending"], kind: "direction" }]);
    expect(model.calls.filter((c) => c.stage === "check-reader")).toHaveLength(3);   // the first draft's three samples, and none after
  });

  test("a reader's question is dropped only on a quoted line the story says", async () => {
    const question = `<finding><span>context for Test the first thing: scene one.</span><statement>Why does the director keep the relic?</statement><result>unanswered</result><evidence>none</evidence><invalidates>knowledge</invalidates><replacement>The director cannot sell it.</replacement><patch>none</patch></finding>`;
    const run = async (why: string) => {
      const script = draftScript({
        "check-reader": () => question,
        "check-verify": (p: string) => p.includes("questions a reader raised")
          ? `<verdict n="1"><answer>drop</answer><why>${why}</why></verdict>`
          : Array.from({ length: (p.match(/^\d+\. span:/gm) ?? []).length }, (_, i) => `<verdict n="${i + 1}"><answer>keep</answer><why>holds</why></verdict>`).join(""),
      });
      const { d, draw } = await atPlan(script);
      return d.findings(draw.id).findings.filter((f) => f.checkers.includes("reader")).length;
    };
    // explained away by inference: the gap stands
    expect(await run("The reader infers he keeps it out of habit, a deliberate silence.")).toBe(1);
    // answered in a line the story says, quoted: dropped
    expect(await run(`The context says "context for Test a second thing: scene two." which answers it.`)).toBe(0);
    // the question's own span, quoted back, raises the question and does not answer it
    expect(await run(`The span "context for Test the first thing: scene one." says it all.`)).toBe(1);
  });

});

describe("templates and store", () => {
  test("every check and drafting template states a word cap and passes the vocabulary rule", () => {
    const names = ["checkStructure", "checkResemblance", "claimsExtract", "claimsVerifyWorld", "claimsVerifyReference", "readerVerify", "reviseVignette", "reviseEnding", "schedule", "sceneAsk", "screenLedgerAsk", "screenStructure"] as const;
    for (const n of names) {
      const t = (TEMPLATES as any)[n] as string;
      expect(t).toMatch(/Under \{?\w*\}? ?words|Under \d+ words|Under \{cap\} words/);
      expect(t).not.toMatch(/\b(reason|think)\b/i);
    }
  });

  test("every new stage names a model, and only the claims verifier declares tools", () => {
    const s = loadStages();
    const withTools = Object.entries(s).filter(([, c]) => c.tools).map(([n]) => n);
    expect(withTools).toEqual(["check-claims-verify"]);
    expect(s["check-claims-verify"].tools).toBe("WebSearch,WebFetch");
    for (const n of ["check-structure", "check-resemblance", "repair-vignette", "repair-outline", "repair-ending", "schedule", "scene", "screen-ledger", "screen-structure"]) expect((s as any)[n].model).toMatch(/^claude-/);
  });
});

describe("the verify pass", () => {
  test("a verdict drops only on the word drop; any other answer keeps, and a missing answer is a shape failure", () => {
    const v = (a: string) => parseVerdicts(`<verdict n="1"><answer>${a}</answer><why>w</why></verdict>`, 1)[0].answer;
    expect([v("keep"), v("Keep."), v("drop (loose wording)"), v("Drop"), v("underived"), v("Placeholder")]).toEqual(["keep", "keep", "drop", "drop", "keep", "keep"]);
    expect(() => parseVerdicts(`<verdict n="1"><why>w</why></verdict>`, 1)).toThrow(/no <answer>/);
    expect(() => parseVerdicts(`<verdict n="2"><answer>keep</answer></verdict>`, 2)).toThrow(/missing <verdict n="1">/);
  });
});

describe("what a reader sees", () => {
  test("a reader's question whose span is only in the outline is dropped with no model call", async () => {
    const outlineOnly = `<finding><span>Section particulars body</span><statement>Why is the sum what it is?</statement><result>unanswered</result><evidence>none</evidence><invalidates>particulars</invalidates><replacement>The sum holds.</replacement><patch>none</patch></finding>`;
    const { d, draw, model } = await atPlan(draftScript({ "check-reader": () => outlineOnly }));
    const all = d.findings(draw.id, { all: true }).findings;
    expect(all.find((f) => f.span === "Section particulars body")).toMatchObject({ reported: false, dropped: NOT_IN_PROSE });
    expect(stagesOf(model, /^check-verify$/)).toEqual([]);
  });
});

describe("the claims screen", () => {
  // a scene invents past the brief: the checkers never see what beat 3 says about the setting
  const sceneClaims = () => `<claim><span>s3w7 s3w8</span><statement>The basin holds nine wells.</statement></claim>`;
  const sceneVerify = () => `<finding><span>s3w7 s3w8</span><statement>The basin holds nine wells.</statement><result>contradicted</result><evidence>Places: "the basin holds three wells"</evidence><invalidates>none</invalidates><replacement>The basin holds three wells.</replacement><patch>none</patch></finding>`;

  test("a contradiction a scene makes about the setting is a flag on the beat that says it", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    let extracts = 0;
    const script = draftScript({
      // the scenes ride in the system prompt, where the cache reads them; the plan check sends the plan there instead
      "check-claims-extract": (_p: string, _m: string, system: string) => { extracts++; return system.includes("s3w7") ? sceneClaims() : claimsExtract(); },   // the scenes; beat 3 is patched, so its opening words are not a marker
      "check-claims-verify": (p: string) => (p.includes("nine wells") ? sceneVerify() : claimVerify(p)),
    });
    const { p, d, draw } = await drawn(script, { id: "basin", dir: sdir, claims: "setting" });
    await d.draft(draw.id);
    const flags = ofKind(p.artifacts(draw.id), "finding").filter((a) => a.meta.screen === "claims");
    expect(flags).toHaveLength(1);
    expect(flags[0].meta).toMatchObject({ beat: 3, invalidates: "3", source: "screen", screen: "claims", span: "s3w7 s3w8" });
    // the extract ran once on the plan (T1′) and once over the scenes
    expect(extracts).toBe(2);
    const steps = p.steps(draw.id).filter((s) => s.stage === "check-claims-extract");
    expect(steps).toHaveLength(2);
    const scenes = steps.find((s) => s.system_prompt?.includes("s3w7"))!;
    expect(scenes.prompt).not.toContain("<vignette");      // the scenes, not the brief
  });

  test("a draw with no setting runs no claims screen", async () => {
    const { p, d, draw } = await drawn(draftScript({}));
    await d.draft(draw.id);
    expect(p.steps(draw.id).filter((s) => s.stage === "check-claims-extract")).toHaveLength(0);
  });

  test("registerRewrites skips rebind and re-screen of k+1 when k+1 is due in the same round, and pins call counts", async () => {
    const seen = new Set<string>();
    const answer = (prompt: string) => {
      const n = Number(fromAsk(prompt, /<scene n="(\d+)">/, "the scene number"));
      let out = screenStructure(prompt);
      if (seen.has(String(n))) return out;
      seen.add(String(n));
      // Flag beat 3 with one-voice; beat 2 already flags for missing bodily-emotion
      if (n === 3) out = out.replace(/(<question name="one-voice"><answer>)absent/, "$1present");
      return out;
    };
    const { p, d, draw, model } = await drawn(draftScript({ schedule: () => schedule({ cap: 1100, form: listenForm }), "screen-structure": answer }));
    await d.draft(draw.id, { profile: "listen", overrides: { "beats.min": 8, "screens.listen.long_share_max": 1 } });

    // Both beat 2 and beat 3 were due in round 0:
    // Beat 2 rewrite did not rebind beat 3, and did not re-screen beat 3.
    // Beat 3 rewrite bound beat 3 and rebound beat 4, and re-screened beats 3 and 4.
    const scenes = model.calls.filter((c) => c.stage === "scene");
    expect(scenes).toHaveLength(10); // 8 initial + beat 2 + beat 3
    expect(scenes.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "2", "3"]);

    // screen-ledger: 8 initial binds (1 sample each).
    // Rewrites: beat 2 bound (1), beat 3 rebind skipped, beat 3 bound (1), beat 4 rebound (1) = 3 calls.
    // Total screen-ledger binds = 11 (would be 12 if beat 3 rebind was not skipped), and one base for the 8 initial binds;
    // the rewrites bind too few scenes to pay for a base.
    const ledgers = model.calls.filter((c) => c.stage === "screen-ledger" && !c.prompt.includes("<base/>"));
    expect(ledgers).toHaveLength(11);
    expect(model.calls.filter((c) => c.stage === "screen-ledger" && c.prompt.includes("<base/>"))).toHaveLength(1);

    // screen-structure: 8 initial screens (1 sample each).
    // Rewrites: beat 2 only (1, since beat 3 re-screen was skipped), beats 3 and 4 (2) = 3 calls.
    // Total screen-structure calls = 11 (would be 12 if beat 3 re-screen was not skipped).
    const structures = model.calls.filter((c) => c.stage === "screen-structure");
    expect(structures).toHaveLength(11);

    // Scene and bind prompts of beat 3 (k+1):
    // The scene prompt for beat 3 rewrite reads rewritten beat 2 in its story so far:
    const scene3 = scenes[9];
    expect(scene3.prompt).toContain("<story-so-far>");
    expect(scene3.prompt).toContain("Scene 2 opens. REWRITTEN");
    const chain = chainOf(p, draw.id);
    const sched = chain.schedule()!;
    const parts = briefParts(p, draw.id);
    const before3 = chain.scenes().filter((s) => s.beat < 3).map((s) => s.text);
    const cfg = JSON.parse(p.draw(draw.id).draft_config!).config;
    const expectedPrompt = scenePrompt(parts, sched, sched.beats[2], before3, constraintsBlock([{ replacement: VOICES_LINE }]), cfg.structure);
    expect(scene3.prompt).toBe(expectedPrompt);

    // The bind prompt for beat 3 bind reads rewritten beat 2 in previous-scene:
    const ledger3 = ledgers.find((c) => c.prompt.includes('<scene n="3">') && c.prompt.includes("Scene 2 opens. REWRITTEN"))!;
    expect(ledger3.prompt).toContain("<previous-scene>\nScene 2 opens. REWRITTEN");
  });

  test("gate 2 shows claims of the final text across beats after rewrites", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    let extracts = 0;
    // Beat 1 carries a contradicted setting claim
    const sceneClaims = () => `<claim><span>s1w7 s1w8</span><statement>The basin holds nine wells.</statement></claim>`;
    const sceneVerify = () => `<finding><span>s1w7 s1w8</span><statement>The basin holds nine wells.</statement><result>contradicted</result><evidence>Places: "the basin holds three wells"</evidence><invalidates>none</invalidates><replacement>The basin holds three wells.</replacement><patch>none</patch></finding>`;
    const script = draftScript({
      schedule: () => schedule({ cap: 1100, form: listenForm }),
      "check-claims-extract": (_p: string, _m: string, system: string) => { extracts++; return system.includes("s1w7") ? sceneClaims() : claimsExtract(); },
      "check-claims-verify": (p: string) => (p.includes("nine wells") ? sceneVerify() : claimVerify(p)),
    });
    const { p, d, draw } = await drawn(script, { id: "basin", dir: sdir, claims: "setting" });
    // Draft under listen profile: beat 2 is rewritten because it names no body
    await d.draft(draw.id, { profile: "listen", overrides: { "beats.min": 8, "screens.listen.long_share_max": 1 } });

    // Claims extraction ran only once during drafting (at the end of scenes), not during first pass or rewrites
    expect(extracts).toBe(2); // 1 on the plan, 1 over the scenes

    const chain = chainOf(p, draw.id);
    // Beat 2 was rewritten, so its screen pass is newer than beat 1's screen pass:
    expect(chain.screenPass(2)).not.toBe(chain.screenPass(1));

    // Gate 2 view shows beat 1's claims finding on the final text:
    const v = d.view(draw.id);
    const claimFindings = v.screenFindings.filter((f) => f.screen === "claims");
    expect(claimFindings).toHaveLength(1);
    expect(claimFindings[0]).toMatchObject({ beat: 1, span: "s1w7 s1w8", screen: "claims", result: "contradicted" });
    expect(chain.screenPass(1)).toBeDefined();
    expect(claimFindings[0].pass).toBe(chain.screenPass(1)!);

    // a gate-2 rewrite still screens claims, over the beats it re-screens only, so beat 1's flag stays one flag
    for (const n of [1, 2]) {
      await d.rewrite(draw.id, [2]);
      expect(extracts).toBe(2 + n);
      const afterClaims = d.view(draw.id).screenFindings.filter((f) => f.screen === "claims");
      expect(afterClaims.filter((f) => f.beat === 1)).toMatchObject([{ span: "s1w7 s1w8" }]);
      expect(new Set(afterClaims.map((f) => f.id)).size).toBe(afterClaims.length);
    }
  });
});
