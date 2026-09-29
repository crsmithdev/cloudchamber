import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLAN_SPAN, draftScript, drawn, finding, planSymbols } from "../drafting.fixture.ts";
import { chainOf } from "../chain.ts";
import { draftView, renderStory } from "../drafts.ts";
import { PLAN_CAP } from "./s2.ts";

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
    const { d, draw, model } = await drawn();
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
