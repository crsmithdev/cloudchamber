import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACTIONS, STATUSES, lifecycleView, stageTab, tabOf, waitsIn, whyNot, type Action } from "./lifecycle.ts";
import { STAGES } from "./config.ts";
import { FakeModel } from "./model.ts";
import { Pipeline } from "./draw.ts";
import { cleanSamples, derivationSamples, draftScript, drawn, fixture, ledgerSamples } from "./drafting.fixture.ts";

const draw = (status: string, over: Record<string, unknown> = {}) => ({ id: "d", status, chosen_step: "s1", repaired_from: null, ...over });
const allowed = (status: string) => ACTIONS.filter((a) => whyNot(draw(status), a) === null);

describe("the rules", () => {
  test("each status allows exactly its actions; flag, archive and unarchive are allowed everywhere", () => {
    const table: Record<string, Action[]> = {
      running: ["fork", "flag", "archive", "unarchive"],
      awaiting_gate: ["choose", "flag", "archive", "unarchive"],
      done: ["fork", "flag", "archive", "unarchive", "check", "auto", "draft"],
      checking: ["fork", "flag", "archive", "unarchive"],
      awaiting_check_gate: ["fork", "flag", "archive", "unarchive", "check", "auto", "accept", "dismiss", "hold", "draft"],
      repairing: ["fork", "flag", "archive", "unarchive"],
      repaired: ["fork", "flag", "archive", "unarchive"],
      drafting: ["fork", "flag", "archive", "unarchive"],
      awaiting_draft_gate: ["fork", "flag", "archive", "unarchive", "patch", "rewrite", "keep"],
      drafted: ["fork", "flag", "archive", "unarchive"],
      failed: ["fork", "flag", "archive", "unarchive"],
    };
    expect(Object.keys(table).sort()).toEqual([...STATUSES].sort());
    // a draw with a chosen candidate is never deletable, so delete appears in no row here
    for (const [status, actions] of Object.entries(table)) expect([status, allowed(status)]).toEqual([status, actions]);
  });

  test("a refusal says why, in the words the API returns", () => {
    expect(whyNot(draw("awaiting_draft_gate"), "check")).toBe("draw d is awaiting_draft_gate, not done | awaiting_check_gate");
    expect(whyNot(draw("awaiting_gate", { chosen_step: null }), "fork")).toBe("draw d is awaiting the gate; choose a candidate instead of forking");
    expect(whyNot(draw("failed", { chosen_step: null }), "fork")).toBe("draw d chose no candidate; there is nothing to fork from");
    expect(whyNot(draw("awaiting_gate", { chosen_step: null }), "delete")).toBeNull();
    expect(whyNot(draw("awaiting_gate", { chosen_step: null, referenced_by: ["e"] }), "delete")).toBe("draw d is referenced by e");
    expect(whyNot(draw("done"), "delete")).toBe("draw d developed a candidate; archive it instead of deleting it");
  });

  test("the view the UI reads: tab, running, waiting at a gate, and every action", () => {
    expect(lifecycleView(draw("checking"))).toMatchObject({ stage: "check", running: true, at_gate: false });
    expect(lifecycleView(draw("awaiting_draft_gate"))).toMatchObject({ stage: "write", running: false, at_gate: true });
    const v = lifecycleView(draw("awaiting_gate", { chosen_step: null }));
    expect([v.stage, v.at_gate, v.actions.choose, v.actions.delete]).toEqual(["ideate", true, null, null]);
    expect(Object.keys(v.actions).sort()).toEqual([...ACTIONS].sort());
    expect(tabOf({ status: "failed", chosen_step: null, repaired_from: "r" })).toBe("check");
    expect(["awaiting_gate", "done", "awaiting_check_gate", "awaiting_draft_gate", "checking"].map(waitsIn)).toEqual(["ideate", "check", "check", "write", null]);
  });

  test("every stage is placed in a tab, or placed outside every tab as a stage no draw runs", () => {
    // the page filters a draw's steps by this; a stage nobody placed would vanish from the list
    const placed = Object.fromEntries(STAGES.map((s) => [s, stageTab(s)]));
    expect(Object.entries(placed).filter(([, t]) => t === null).map(([s]) => s)).toEqual(["themes", "redundancy", "distill-map", "distill"]);
    expect(STAGES.filter((s) => stageTab(s) === "ideate")).toEqual(["premises", "execute", "outline", "jobs", "context", "ending"]);
    expect(stageTab("screen-slop")).toBe("write");   // recorded, but not one of STAGES
    expect(stageTab("nonesuch")).toBeNull();
  });
});

describe("a failed action puts the draw back where it stood", () => {
  test("a check that throws leaves the brief checkable with the reason, and the next success clears it", async () => {
    const script = draftScript({ "check-ledger": [] });                         // exhausted: every ledger sample fails
    const { d, p, draw, model } = await drawn(script);
    await expect(d.check(draw.id)).rejects.toThrow(/check-ledger failed/);
    expect(p.draw(draw.id)).toMatchObject({ status: "done", error: expect.stringMatching(/^check-ledger failed: error/) });
    (model as any).script["check-ledger"] = ledgerSamples();
    (model as any).script["check-derivation"] = derivationSamples();          // the failed pass spent these
    await d.check(draw.id);
    expect(p.draw(draw.id)).toMatchObject({ status: "awaiting_check_gate", error: null });
  });

  test("a choose that throws goes back to the gate, and a candidate can be chosen again", async () => {
    const script = draftScript({ outline: [] });
    const { db, dir } = fixture();
    const model = new FakeModel(script);
    const p = new Pipeline(db, model, { rng: () => 0.001, briefsDir: join(dir, "briefs") });
    const draw = await p.start({ mode: "manual", genre: "horror", seed: { mode: "typed", text: "a typed seed" } });
    const [c] = p.candidates(draw.id);
    await expect(p.choose(draw.id, c.step_id)).rejects.toThrow(/outline failed/);
    expect(p.draw(draw.id)).toMatchObject({ status: "awaiting_gate", chosen_step: null, error: expect.stringMatching(/^outline failed/) });
    (model as any).script.outline = draftScript().outline;
    expect(await p.choose(draw.id, c.step_id)).toMatchObject({ status: "done", error: null, chosen_step: c.step_id });
  });

  test("a gate-2 rewrite that throws stays at gate 2; a flag afterwards keeps the rewrite record for keep", async () => {
    const script = draftScript({
      "check-ledger": [...ledgerSamples(), ...cleanSamples()],
      "check-derivation": [...derivationSamples(), ...cleanSamples()],
    });
    const { d, p, draw, model, dir } = await drawn(script);
    await d.draft(draw.id);
    await d.rewrite(draw.id, 3);
    const scene = (model as any).script.scene;
    (model as any).script.scene = [];
    await expect(d.rewrite(draw.id, 4)).rejects.toThrow(/scene failed/);
    expect(p.draw(draw.id)).toMatchObject({ status: "awaiting_draft_gate", error: expect.stringMatching(/^scene failed/) });
    (model as any).script.scene = scene;
    p.flag(draw.id, "scene 4 reads oddly");
    expect(p.draw(draw.id)).toMatchObject({ flagged: 1, flag_note: "scene 4 reads oddly" });
    const { dir: out } = d.keep(draw.id);
    expect(out).toBe(join(dir, "drafts", draw.id));
    expect(readFileSync(join(out, "trail.md"), "utf8")).toContain("### gate 2\n\n- rewrite 3\n");
    expect(p.draw(draw.id)).toMatchObject({ status: "drafted", error: null });
  });

  test("a draw whose own first run fails is failed, since it stood nowhere before", async () => {
    const { db, dir } = fixture();
    const p = new Pipeline(db, new FakeModel(draftScript({ premises: [] })), { rng: () => 0.001, briefsDir: join(dir, "briefs") });
    await expect(p.start({ mode: "manual", genre: "horror" })).rejects.toThrow(/premises failed/);
    expect(p.draws()[0]).toMatchObject({ status: "failed", flagged: 0, error: expect.stringMatching(/^premises failed/) });
    expect(p.draws()[0].ended_at).toBeTruthy();
  });
});
