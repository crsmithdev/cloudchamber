import { describe, expect, test } from "bun:test";
import { bindDisagreement, referenceBind } from "./canon.ts";
import { fixture } from "../drafting.fixture.ts";
import { FakeModel } from "../model.ts";
import { Pipeline } from "../draw.ts";

function setupDraw(p: Pipeline): string {
  const draw = p.db.query(`INSERT INTO draws (id, name, genre, mode, seed_mode, seed_text, example_ids, sampling, status, created_at)
                           VALUES ('draw-canon-1', 'canon test', 'horror', 'manual', 'drawn', 'A seed.', '[]', 'listen', 'drafted', 'now') RETURNING *`).get() as any;

  // Outline step with brief artifact
  const stepOutline = p.recordStep(draw.id, null, "outline", "deterministic");
  p.artifact(stepOutline, "ledger", "LEDGER LINE 1: Cathal has three coins.\nLEDGER LINE 2: The pod is sealed.", { pass: "p1", sample: 1 });

  // Schedule step
  const stepSchedule = p.recordStep(draw.id, stepOutline.id, "schedule", "deterministic");

  // Scene 1 step and artifact
  const stepScene1 = p.recordStep(draw.id, stepSchedule.id, "scene", "deterministic");
  p.artifact(stepScene1, "scene", "Scene 1: Cathal had four coins in his pocket.", { beat: 1, words: 9, cap: 10, warnings: [] });

  // Scene 2 step and artifact
  const stepScene2 = p.recordStep(draw.id, stepScene1.id, "scene", "deterministic");
  p.artifact(stepScene2, "scene", "Scene 2: Cathal spent one coin at the gate.", { beat: 2, words: 9, cap: 10, warnings: [] });

  return draw.id;
}

describe("reference bind of the canon guard", () => {
  test("returns zero when draw has no scenes", async () => {
    const { db, dir } = fixture();
    const p = new Pipeline(db, new FakeModel({}), { briefsDir: dir });
    p.db.query(`INSERT INTO draws (id, name, genre, mode, seed_mode, seed_text, example_ids, status, created_at)
                VALUES ('d-empty', 'empty', 'horror', 'manual', 'drawn', 'seed', '[]', 'drafted', 'now')`).run();

    const res = await referenceBind(p, "d-empty");
    expect(res.beats).toBe(0);
    expect(res.contradictions).toBe(0);
    expect(res.ratePerBeat).toBe(0);
    expect(res.referenceDrawId).toBeNull();
  });

  test("screens scenes read-only against ledger and previous scene, counting contradictions on a separate draw", async () => {
    const { db, dir } = fixture();
    const promptsSeen: string[] = [];

    const fakeModel = new FakeModel({
      "reference-bind": (prompt: string) => {
        promptsSeen.push(prompt);
        if (prompt.includes("Scene 1:")) {
          return `<finding><span>four coins</span><statement>Cathal has four coins</statement><result>contradicts:Cathal has three coins</result><evidence>ledger line 1</evidence><invalidates>1</invalidates><replacement>Cathal had three coins</replacement></finding>`;
        }
        if (prompt.includes("Scene 2:")) {
          return `<finding><span>spent one coin</span><statement>Cathal spent one coin</statement><result>supported</result></finding>
<finding><span>spent one coin</span><statement>The pod was already unsealed</statement><result>contradicted</result></finding>
<finding><span>at the gate</span><statement>Not in scene; withdrawn.</statement><result>contradicts:none</result></finding>`;
        }
        return "";
      },
    });

    const p = new Pipeline(db, fakeModel, { briefsDir: dir });
    const drawId = setupDraw(p);

    const initialSteps = p.steps(drawId).length;
    const initialArtifacts = p.artifacts(drawId).length;

    const res = await referenceBind(p, drawId);

    // Prompt checks
    expect(promptsSeen).toHaveLength(2);
    // Scene 1 prompt has ledger but no previous scene
    expect(promptsSeen[0]).toContain("Cathal has three coins");
    expect(promptsSeen[0]).not.toContain("<previous-scene>");
    expect(promptsSeen[0]).toContain("Scene 1: Cathal had four coins");

    // Scene 2 prompt has ledger and previous scene containing Scene 1 text
    expect(promptsSeen[1]).toContain("Cathal has three coins");
    expect(promptsSeen[1]).toContain("<previous-scene>\nScene 1: Cathal had four coins in his pocket.\n</previous-scene>");
    expect(promptsSeen[1]).toContain("Scene 2: Cathal spent one coin");

    // Findings count
    expect(res.beats).toBe(2);
    expect(res.contradictions).toBe(2);
    expect(res.ratePerBeat).toBe(1.0);
    expect(res.findings).toHaveLength(2);

    // Target draw is completely untouched
    expect(p.steps(drawId).length).toBe(initialSteps);
    expect(p.artifacts(drawId).length).toBe(initialArtifacts);
    expect(p.draw(drawId).status).toBe("drafted");

    // Separate reference draw was created and recorded on
    expect(res.referenceDrawId).toBeTruthy();
    const refDraw = p.draw(res.referenceDrawId!);
    expect(refDraw).toBeDefined();
    expect(refDraw.branched_from).toBe(drawId);
    expect(p.steps(res.referenceDrawId!).length).toBe(2);
    expect(p.artifacts(res.referenceDrawId!).filter((a) => a.kind === "finding").length).toBe(2);
    expect(refDraw.status).toBe("done");
    expect(res.perBeat).toEqual({ 1: 1, 2: 1 });
  });

  test("bindDisagreement is the mean absolute difference by beat, so beats do not cancel", () => {
    const r = (perBeat: Record<number, number>) => ({ drawId: "d1", referenceDrawId: null, beats: 4, contradictions: 0, ratePerBeat: 0, perBeat, findings: [] });
    // the same total, two beats apart: a net count would read 0
    expect(bindDisagreement(r({ 1: 1, 2: 0, 3: 0, 4: 1 }), r({ 1: 0, 2: 1, 3: 1, 4: 0 }))).toBe(1);
    expect(bindDisagreement(r({ 1: 2, 2: 0, 3: 0, 4: 0 }), r({ 1: 1, 2: 0, 3: 0, 4: 0 }))).toBe(0.25);
    expect(bindDisagreement(r({ 1: 1, 2: 1 }), r({ 1: 1, 2: 1 }))).toBe(0);
  });
});
