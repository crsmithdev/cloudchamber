import { describe, expect, test } from "bun:test";
import { drawn } from "./drafting.fixture.ts";
import { chainOf, NO_CALL } from "./chain.ts";
import { Lineage } from "./lineage.ts";

/** The overrides the fixture's canned screens are written for; a branch inherits them from the draw it develops. */
const OVERRIDES = { "screens.samples": 3, "screens.keep_if": 2 };

const scenesOf = (p: any, id: string) => chainOf(p, id).scenes();
const stagesOf = (model: any, from: number, re: RegExp) => model.calls.slice(from).filter((c: any) => re.test(c.stage)).map((c: any) => c.stage);

describe("branch a draft", () => {
  test("with no beat it carries the brief and the schedule, derives no plan of its own, and writes every scene again", async () => {
    const { p, d, draw, model } = await drawn();
    await d.check(draw.id);
    await d.draft(draw.id, { overrides: OVERRIDES });
    const before = model.calls.length;
    const src = scenesOf(p, draw.id);

    const b = await d.branch(draw.id);
    expect(b.status).toBe("awaiting_draft_gate");
    expect(b.branched_from).toBe(draw.id);
    expect(b.id).not.toBe(draw.id);

    // the plan is the source's, carried: no schedule call, and the same beats
    expect(stagesOf(model, before, /^schedule$/)).toEqual([]);
    const sched = chainOf(p, b.id).schedule()!;
    expect(sched.raw).toBe(chainOf(p, draw.id).schedule()!.raw);
    expect(b.branch_at).toBe(p.steps(draw.id).find((s: any) => s.stage === "schedule")!.id);

    // every scene is written again, and none of the source's text is carried
    expect(stagesOf(model, before, /^scene$/)).toHaveLength(8);
    const out = scenesOf(p, b.id);
    expect(out.map((x) => x.beat)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(out.every((x) => !src.some((s) => s.artifact_id === x.artifact_id))).toBe(true);

    // the block every scene ask carries is the one the source's scenes were written against, word for word
    const branchScenes = model.calls.slice(before).filter((c: any) => c.stage === "scene");
    const srcScenes = model.calls.slice(0, before).filter((c: any) => c.stage === "scene");
    expect(branchScenes[0].system).toBe(srcScenes[0].system);
  });

  test("at a beat it carries the scenes under it word for word, and the beat it writes reads them as the story so far", async () => {
    const { p, d, draw, model } = await drawn();
    await d.check(draw.id);
    await d.draft(draw.id, { overrides: OVERRIDES });
    const before = model.calls.length;
    const src = scenesOf(p, draw.id);

    const b = await d.branch(draw.id, { atBeat: 5 });
    const out = scenesOf(p, b.id);
    expect(out.map((x) => x.beat)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // 1..4 are the source's text; 5..8 are written again
    expect(out.slice(0, 4).map((x) => x.text)).toEqual(src.slice(0, 4).map((x) => x.text));
    expect(stagesOf(model, before, /^scene$/)).toHaveLength(4);
    const written = model.calls.slice(before).filter((c: any) => c.stage === "scene");
    expect(written[0].prompt).toContain("Write beat 5 of the story");
    expect(written[0].prompt).toContain(`<story-so-far>\n${src.slice(0, 4).map((x) => x.text).join("\n\n")}\n</story-so-far>`);

    // the branch points at the step of the last beat it carries
    expect(b.branch_at).toBe(src[3].step_id);
    // and the carried scenes cost nothing: every step under them stood in for a call
    const copied = p.steps(b.id).filter((s: any) => s.stage === "scene" && NO_CALL.includes(s.model));
    expect(copied).toHaveLength(4);
  });

  test("the carried beats are not screened or rewritten again; the written ones are", async () => {
    const { p, d, draw, model } = await drawn();
    await d.check(draw.id);
    await d.draft(draw.id, { overrides: OVERRIDES });
    const before = model.calls.length;

    const b = await d.branch(draw.id, { atBeat: 5 });
    // the structure screen runs once per written beat, the ledger screen three times
    expect(stagesOf(model, before, /^screen-structure$/)).toHaveLength(4);
    expect(stagesOf(model, before, /^screen-ledger$/)).toHaveLength(12);
    expect(chainOf(p, b.id).screenProfiles().map((x) => x.beat)).toEqual([5, 6, 7, 8]);
    // the deterministic reports cover the whole draft, carried beats included
    expect(d.view(b.id).slop!.paragraphs).toHaveLength(8);
  });

  test("the brief, the pinned ledger and the jobs are carried with no call, and the source is left as it stands", async () => {
    const { p, d, draw, model } = await drawn();
    await d.check(draw.id);
    await d.draft(draw.id, { overrides: OVERRIDES });
    const srcSteps = p.steps(draw.id).length;
    const before = model.calls.length;

    const b = await d.branch(draw.id);
    const srcChain = chainOf(p, draw.id), bChain = chainOf(p, b.id);
    expect(bChain.ledger()).toBe(srcChain.ledger());
    expect(bChain.outline()).toBe(srcChain.outline());
    expect(p.artifacts(b.id).filter((a: any) => a.kind === "job").map((a: any) => a.content))
      .toEqual(p.artifacts(draw.id).filter((a: any) => a.kind === "job").map((a: any) => a.content));
    // no check ran on the branch, so it has no pass of its own
    expect(bChain.pass()).toBeNull();
    // every carried step stood in for a call: the calls made are the scenes and their screens
    expect(stagesOf(model, before, /^(execute|outline|context|ending|ledger-extract|schedule)$/)).toEqual([]);
    // the source keeps its steps, its status and its scenes
    expect(p.steps(draw.id)).toHaveLength(srcSteps);
    expect(p.draw(draw.id).status).toBe("awaiting_draft_gate");
  });

  test("a branch is a draw the lineage follows back to the one that ran the premises", async () => {
    const { p, d, draw } = await drawn();
    await d.check(draw.id);
    await d.draft(draw.id, { overrides: OVERRIDES });
    const b = await d.branch(draw.id, { atBeat: 3 });

    const lineage = Lineage.all(p.db);
    expect(lineage.branches(draw.id)).toEqual([b.id]);
    expect(lineage.path(b.id)).toEqual([b.id, draw.id]);
    expect(lineage.origin(b.id)).toBe(draw.id);
    expect(lineage.referencedBy(draw.id)).toContain(b.id);
    // a branch heads a repair chain of its own: it repairs nothing
    expect(chainOf(p, b.id).ids).toEqual([b.id]);
    expect(p.draw(draw.id).superseded_by).toBeNull();
  });

  test("models named on a branch run its scenes and are not written to the draw it develops", async () => {
    const { p, d, draw } = await drawn();
    await d.check(draw.id);
    await d.draft(draw.id, { overrides: OVERRIDES });

    const b = await d.branch(draw.id, { models: { scene: "claude-sonnet-5" } });
    const wrote = p.steps(b.id).filter((s: any) => s.stage === "scene" && !NO_CALL.includes(s.model));
    expect(wrote).toHaveLength(8);
    expect(wrote.every((s: any) => s.model === "claude-sonnet-5")).toBe(true);
    expect(p.draw(draw.id).models).toBeNull();
    expect(JSON.parse(p.draw(b.id).models!)).toEqual({ scene: "claude-sonnet-5" });
  });

  test("a draw with no draft, and a beat outside the schedule, are refused before anything is written", async () => {
    const { p, d, draw } = await drawn();
    await d.check(draw.id);
    await expect(d.branch(draw.id)).rejects.toThrow(/is awaiting_check_gate, not awaiting_draft_gate \| drafted/);

    await d.draft(draw.id, { overrides: OVERRIDES });
    const draws = p.draws().length;
    await expect(d.branch(draw.id, { atBeat: 9 })).rejects.toThrow(/--at-beat is 1\.\.8, not 9/);
    await expect(d.branch(draw.id, { atBeat: 0 })).rejects.toThrow(/--at-beat is 1\.\.8, not 0/);
    expect(p.draws()).toHaveLength(draws);
  });
});
