import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLAN_SPAN, draftScript, drawn, finding, planSymbols } from "../drafting.fixture.ts";
import { chainOf } from "../chain.ts";
import { draftView, renderStory } from "../drafts.ts";
import { PLAN_CAP } from "./s2.ts";
import { editBeat } from "../drafting.ts";
import { ofKind } from "../artifacts.ts";
import { fixture } from "../drafting.fixture.ts";
import { settingsFixture } from "../settings.fixture.ts";
import { gateCommand } from "../gate.ts";
import { draftView as viewOf } from "../drafts.ts";

/**
 * The plan check at gate 2 (docs/specs/2026-09-28-story-ir.md §14.5, S3′): a
 * draft stores the schedule's findings against the ledger as `plan` findings,
 * apart from the screens, and every gate 2 view labels them as the plan's.
 */
describe("the plan check at gate 2", () => {
  test("a draft stores plan findings apart from the screens, and the story, the export and the report label them", async () => {
    const { p, d, draw } = await drawn();
    const drafted = await d.draft(draw.id);
    expect(drafted.status).toBe("awaiting_draft_gate");
    const chain = chainOf(p, drafted.id);
    const plan = chain.planFindings();

    // S1: the fixture's beats 6 and 7 each list their own reveal as still withheld; L3: the vote's named voter belongs to another
    // body; L4: the contradicted finding is stored and the one the table has no value for is not
    expect(plan.map((f) => f.screen).sort()).toEqual(["plan-ledger", "plan-membership", "plan-static", "plan-static"]);
    expect(plan.find((f) => f.screen === "plan-ledger")).toMatchObject({ beat: 2, span: PLAN_SPAN, result: "contradicted", source: "plan", decision: "open" });
    expect(plan.find((f) => f.screen === "plan-membership")).toMatchObject({ question: true, result: "question" });
    expect(plan.find((f) => f.screen === "plan-membership")!.statement).toContain("director votes but is a member of order, not of board");
    expect(plan.find((f) => f.screen === "plan-static")!.statement).toContain("was due at beat 6 but beat 6 still lists it withheld");
    expect(plan.every((f) => f.pass === plan[0]!.pass)).toBe(true);

    // apart from the screens: the bind's own flags stand and no plan finding is among them
    expect(chain.screenFindings().length).toBeGreaterThan(0);
    expect(chain.screenFindings().every((f) => f.source === "screen")).toBe(true);
    expect(p.artifacts(drafted.id).filter((a) => a.kind === "finding" && (a.meta as { source?: string }).source === "plan")).toHaveLength(4);

    // the steps: a deterministic step for S1, then the two calls, all done
    const ir = p.steps(drafted.id).filter((s) => s.stage.startsWith("ir-")).map((s) => [s.stage, s.model, s.status]);
    expect(ir).toEqual(expect.arrayContaining([["ir-static", "deterministic", "done"], ["ir-symbolize", expect.any(String), "done"], ["ir-plan-ledger", expect.any(String), "done"]]));
    expect(ir).toHaveLength(3);

    // the story: the draft-wide question before the story, beat 2's finding after its scene, nothing of the unverifiable one
    const story = d.story(drafted.id);
    expect(story.startsWith("[plan-membership, a question] vote: director votes but is a member of order, not of board")).toBe(true);
    expect(story).toContain("[plan-ledger beat 2] beat 2 puts the reliquary in the archive → The reliquary stays in the director's office.");
    expect(story).not.toContain("clerk");
    expect(renderStory(draftView(p, drafted.id), false)).not.toContain("[plan");
    expect(d.view(drafted.id).planCapped).toBe(false);

    // the export: a Plan section, the trail's count, and each screen flag under the screen that raised it
    const { dir } = d.keep(drafted.id);
    const findings = readFileSync(join(dir, "findings.md"), "utf8");
    expect(findings).toContain("## Plan");
    expect(findings).toContain("- plan-ledger beat 2: beat 2 puts the reliquary in the archive → The reliquary stays in the director's office.");
    expect(findings).toContain("- plan-membership, a question: vote: director votes");
    expect(findings).toMatch(/- ledger: Scene 3 opens → /);
    expect(findings).not.toContain("- ledger: plan");
    expect(readFileSync(join(dir, "trail.md"), "utf8")).toContain("plan findings: 4 (1 questions)");
  });

  test("the view carries the symbol table, and a ticked plan finding is its beat's constraint at a rewrite", async () => {
    const { p, d, draw, model } = await drawn();
    const drafted = await d.draft(draw.id);
    const v = d.view(drafted.id);
    expect(v.symbols.length).toBeGreaterThan(0);
    expect(v.symbols.every((s) => s.id && s.kind)).toBe(true);
    const pf = v.planFindings.find((f) => f.screen === "plan-ledger")!;
    const before = model.calls.length;
    await d.rewrite(drafted.id, [2], { findings: [pf.id] });
    const scene = model.calls.slice(before).find((c) => c.stage === "scene")!;
    expect(scene.prompt).toContain("<constraints>\n- The reliquary stays in the director's office.\n</constraints>");
    expect(d.view(drafted.id).rewrittenUnder).toEqual([pf.id]);
    // the rewrite settles it, and a settled plan finding is not a brief fix that later rounds must keep
    const after = d.view(drafted.id).planFindings.find((f) => f.id === pf.id)!;
    expect([after.decision, after.note]).toEqual(["accepted", "rewritten under it"]);
    expect(chainOf(p, drafted.id).settled()).toEqual([]);
    await expect(d.rewrite(drafted.id, [2], { findings: [pf.id] })).rejects.toThrow(/no open flag/);
  });

  test("a symbolise call that fails leaves the $0 findings and the draft", async () => {
    // an exhausted script: the fake throws on the call, as a failed call does
    const { p, d, draw } = await drawn(draftScript({ "ir-symbolize": [] }));
    const drafted = await d.draft(draw.id);
    expect(drafted.status).toBe("awaiting_draft_gate");
    expect(chainOf(p, drafted.id).planFindings().map((f) => f.screen)).toEqual(["plan-static", "plan-static"]);
    expect(p.steps(drafted.id).some((s) => s.stage === "ir-symbolize" && s.status === "failed")).toBe(true);
    expect(p.steps(drafted.id).some((s) => s.stage === "ir-plan-ledger")).toBe(false);
  });

  test("with `plan` off in screens.enabled nothing runs and the views are empty", async () => {
    const { p, d, draw, model } = await drawn();
    d.configure(draw.id, { overrides: { "screens.enabled": "ledger,structure,slop,listen,claims", "screens.samples": 3, "screens.keep_if": 2 } });
    const drafted = await d.draft(draw.id);
    expect(model.calls.some((c) => c.stage.startsWith("ir-"))).toBe(false);
    expect(p.steps(drafted.id).some((s) => s.stage.startsWith("ir-"))).toBe(false);
    expect(chainOf(p, drafted.id).planFindings()).toEqual([]);
    expect(d.story(drafted.id)).not.toContain("[plan");
  });

  test("a plan reading that returns the cap marks the view and the story says the list may be short", async () => {
    const capped = Array.from({ length: PLAN_CAP }, (_, i) => finding(`Beat ${(i % 8) + 1} does its thing in the archive.`, `conflict ${i + 1}`, String((i % 8) + 1), "none", "director", "contradicted")).join("");
    const { p, d, draw } = await drawn(draftScript({ "ir-symbolize": () => planSymbols(), "ir-plan-ledger": () => capped }));
    const drafted = await d.draft(draw.id);
    expect(chainOf(p, drafted.id).planFindings().filter((f) => f.screen === "plan-ledger")).toHaveLength(PLAN_CAP);
    expect(d.view(drafted.id).planCapped).toBe(true);
    expect(d.story(drafted.id)).toContain(`[plan] the plan reading returned its maximum of ${PLAN_CAP} findings; the list may be short`);
  });
});

/** The plan gate (docs/specs/2026-09-28-story-ir.md §6, S3): a draft asked to stops after its plan is checked, before any scene. */
describe("the plan gate", () => {
  const stages = (model: any, from: number) => model.calls.slice(from).map((c: any) => c.stage);

  test("a draft under `plan` stops with the plan checked and no scene; write takes it to gate 2 without checking again", async () => {
    const { p, d, draw, model } = await drawn();
    const at = await d.draft(draw.id, { plan: true });
    expect(at.status).toBe("awaiting_plan_gate");
    expect(stages(model, 0)).not.toContain("scene");
    expect(chainOf(p, at.id).planFindings().map((f) => f.screen)).toContain("plan-ledger");
    const before = model.calls.length;
    const written = await d.writeScenes(at.id);
    expect(written.status).toBe("awaiting_draft_gate");
    expect(stages(model, before)).toContain("scene");
    expect(stages(model, before).filter((s: string) => s.startsWith("ir-"))).toEqual([]);
    await expect(d.replan(at.id, 1, "x")).rejects.toThrow(/awaiting_draft_gate/);
  });

  test("at gate 2, apply fixes the plan and writes again only the beats whose plan changed", async () => {
    const { p, d, draw, model } = await drawn();
    const at = await d.draft(draw.id);
    expect(at.status).toBe("awaiting_draft_gate");
    const pf = chainOf(p, at.id).planFindings().find((f) => f.screen === "plan-ledger")!;
    const before = model.calls.length;
    const NOTE = "Beat 2 keeps the reliquary in the director's office.";
    const after = await d.applyPlan(at.id, { findings: [pf.id], notes: { [pf.id]: NOTE }, edits: [{ beat: 3, field: "stakes", text: "The office stays shut." }] });
    expect(after.status).toBe("awaiting_draft_gate");
    const scenes = model.calls.slice(before).filter((c: any) => c.stage === "scene");
    // beats 2 and 3 changed; beat 1 and the beats after 3 stand
    expect(scenes.map((c: any) => Number(/Write beat (\d+) /.exec(c.prompt)?.[1])).sort()).toEqual([2, 3]);
    expect(scenes.find((c: any) => /Write beat 2 /.test(c.prompt))!.prompt).toContain(NOTE);
    expect(stages(model, before)).not.toContain("schedule");
    const chain = chainOf(p, at.id);
    expect(chain.decision(pf.id).decision).toBe("accepted");
    // the rewrite of beat 2 is under the finding: gate 2 reads it as rewritten under it
    const beat2 = ofKind(p.artifacts(at.id), "scene").filter((a) => a.meta.beat === 2).at(-1)!;
    expect(beat2.meta).toMatchObject({ rewrite: true, rewrite_finding: pf.id });
  });

  test("apply puts the operator's note, or the finding's patch, in the plan, settles the finding, and checks the new plan", async () => {
    const { p, d, draw, model } = await drawn();
    const at = await d.draft(draw.id, { plan: true });
    const pf = chainOf(p, at.id).planFindings().find((f) => f.screen === "plan-ledger")!;
    // the fixture's finding has no patch: without a note there is nothing to put in its place
    await expect(d.applyPlan(at.id, { findings: [pf.id] })).rejects.toThrow(/has no patch/);
    const before = model.calls.length;
    const NOTE = "Beat 2 keeps the reliquary in the director's office.";
    const after = await d.applyPlan(at.id, { findings: [pf.id], notes: { [pf.id]: NOTE } });
    expect(after.status).toBe("awaiting_plan_gate");
    const chain = chainOf(p, at.id);
    expect(chain.schedule()!.raw).toContain(NOTE);
    expect(chain.schedule()!.raw).not.toContain(PLAN_SPAN);
    expect(chain.schedule()!.beats[1]!.job).toContain(NOTE);
    expect(stages(model, before)).toEqual(expect.arrayContaining(["ir-symbolize", "ir-plan-ledger"]));
    expect(stages(model, before)).not.toContain("schedule");
    // the finding is settled, and the scenes are written from the plan as it now stands
    expect(chain.decision(pf.id).decision).toBe("accepted");
    await d.writeScenes(at.id);
    const beat2 = model.calls.filter((c: any) => c.stage === "scene").find((c: any) => /Write beat 2 /.test(c.prompt))!;
    expect(beat2.prompt).toContain(NOTE);
  });

  test("an edit replaces one field of one beat; replan plans again from a beat; both leave the draw at the plan gate", async () => {
    const { p, d, draw, model } = await drawn();
    const at = await d.draft(draw.id, { plan: true });
    await d.applyPlan(at.id, { edits: [{ beat: 3, field: "when", text: "the third morning" }] });
    expect(chainOf(p, at.id).schedule()!.beats[2]!.when).toBe("the third morning");
    await expect(d.applyPlan(at.id, { edits: [{ beat: 99, field: "job", text: "x" }] })).rejects.toThrow(/no beat 99/);
    await expect(d.applyPlan(at.id, {})).rejects.toThrow(/nothing to apply/);
    const before = model.calls.length;
    const re = await d.replan(at.id, 4, "The director is absent from beat 4 on.");
    expect(re.status).toBe("awaiting_plan_gate");
    expect(stages(model, before)).toEqual(expect.arrayContaining(["schedule", "ir-plan-ledger"]));
    // the beats under 4 are the edited plan's: the replan keeps them
    expect(chainOf(p, at.id).schedule()!.beats[2]!.when).toBe("the third morning");
  });
});

describe("the plan's claims about the setting (T1′)", () => {
  const CLAIM = "The archive in beat 2 lies beyond the gate.";
  const script = () => draftScript({
    "check-claims-extract": () => `<claim><span>${PLAN_SPAN}</span><statement>${CLAIM}</statement></claim>`,
    "check-claims-verify": () => finding(PLAN_SPAN, CLAIM, "none", "Beat 2 does its thing in the chapel.", "the setting · \"the archive stands inside the gate\"", "contradicted"),
  });

  test("under a setting that is its own authority, a contradicted claim in the plan is a plan finding on its beat, and apply can take its fix", async () => {
    const sdir = settingsFixture(fixture().dir);
    const { p, d, draw, model } = await drawn(script(), { id: "basin", dir: sdir, claims: "setting" });
    const at = await d.draft(draw.id, { plan: true });
    const extract = model.calls.find((c: any) => c.stage === "check-claims-extract")!;
    expect(extract.system + extract.prompt).toContain(PLAN_SPAN);
    const f = chainOf(p, at.id).planFindings().find((x) => x.screen === "plan-claims")!;
    expect(f).toMatchObject({ beat: 2, span: PLAN_SPAN, source: "plan", replacement: "Beat 2 does its thing in the chapel." });
    await d.applyPlan(at.id, { findings: [f.id], notes: { [f.id]: "Beat 2 does its thing in the chapel." } });
    expect(chainOf(p, at.id).schedule()!.raw).toContain("in the chapel");
  });

  test("without a setting, or under `world`, the plan check reads no claims", async () => {
    const { d, draw, model } = await drawn(script());
    await d.draft(draw.id, { plan: true });
    expect(model.calls.some((c: any) => c.stage.startsWith("check-claims"))).toBe(false);
    const sdir = settingsFixture(fixture().dir);
    const w = await drawn(script(), { id: "basin", dir: sdir, claims: "world" });
    await w.d.draft(w.draw.id, { plan: true });
    expect(w.model.calls.some((c: any) => c.stage.startsWith("check-claims"))).toBe(false);
  });
});

describe("no gate 1 stop for a person's draw (T2)", () => {
  test("a manual choose builds the brief and drafts on to the plan gate, with no gate 1 check", async () => {
    const { p, d, draw, model } = await drawn(draftScript(), undefined, "manual");
    expect(p.draw(draw.id).status).toBe("awaiting_gate");
    const step = p.candidates(draw.id)[0]!.step_id;
    const out = (await gateCommand(p, d, draw.id, "choose", { step_id: step }).done) as { status: string };
    expect(out.status).toBe("awaiting_plan_gate");
    // only the brief's text checks run, beside the schedule (T3); gate 1's ledger and derivation checkers are gone
    expect([...new Set(model.calls.map((c: any) => c.stage).filter((s: string) => s.startsWith("check-")))].sort()).toEqual(["check-reader", "check-resemblance", "check-structure"]);
    expect(model.calls.map((c: any) => c.stage)).toEqual(expect.arrayContaining(["schedule", "ir-symbolize", "ir-plan-ledger"]));
    expect(model.calls.some((c: any) => c.stage === "scene")).toBe(false);
  });

  test("an auto draw still stops at its brief", async () => {
    const { p, draw } = await drawn();
    expect(p.draw(draw.id).status).toBe("done");
  });
});

describe("reading a plan finding (step 5)", () => {
  test("mark records real or not beside the finding; the finding stays open; the view shows the reading", async () => {
    const { p, d, draw } = await drawn();
    const at = await d.draft(draw.id, { plan: true });
    const f = chainOf(p, at.id).planFindings()[0]!;
    await gateCommand(p, d, at.id, "mark", { finding: f.id, real: false }).done;
    expect(viewOf(p, at.id).readings[f.id]).toBe("not real");
    await gateCommand(p, d, at.id, "mark", { finding: f.id, real: true }).done;
    expect(viewOf(p, at.id).readings[f.id]).toBe("real");
    expect(chainOf(p, at.id).decision(f.id).decision).toBe("open");
    expect(() => gateCommand(p, d, at.id, "mark", { finding: f.id })).toThrow(/real required/);
    expect(() => gateCommand(p, d, at.id, "mark", { finding: "f-nope", real: true })).toThrow(/no plan finding/);
  });
});

describe("re-plan under other settings", () => {
  test("a profile or an override plans again from beat 1 under the new configuration; from another beat it is refused", async () => {
    const { p, d, draw, model } = await drawn();
    const at = await d.draft(draw.id, { plan: true });
    await expect(d.replan(at.id, 2, "", { overrides: { "scenes.order": "parallel" } })).rejects.toThrow(/from beat 1/);
    const before = model.calls.length;
    const re = await d.replan(at.id, 1, "", { overrides: { "scenes.order": "parallel" } });
    expect(re.status).toBe("awaiting_plan_gate");
    expect(JSON.parse(p.draw(at.id).draft_config!).config.scenes.order).toBe("parallel");
    const sched = model.calls.slice(before).find((c: any) => c.stage === "schedule")!;
    expect(sched.prompt).not.toMatch(/kept word for word|beats 1 to/i);
    await expect(d.replan(at.id, 1, "")).rejects.toThrow(/instruction required/);
  });
});

describe("editBeat", () => {
  const RAW = `<form>tense: past</form>\n<beat n="1" words="500">\n<job>One.</job>\n<when>dawn</when>\n</beat>\n<beat n="2" words="500">\n<job>Two.</job>\n<when>noon</when>\n</beat>`;
  test("replaces the field in the named beat only, and adds one the beat lacks", () => {
    const out = editBeat(RAW, { beat: 2, field: "when", text: "dusk $1" });
    expect(out).toContain(`<beat n="1" words="500">\n<job>One.</job>\n<when>dawn</when>`);
    expect(out).toContain("<when>dusk $1</when>");
    expect(editBeat(RAW, { beat: 1, field: "stakes", text: "x" })).toContain(`<when>dawn</when>\n<stakes>x</stakes>\n</beat>`);
  });
});
