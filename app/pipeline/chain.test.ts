import { describe, expect, test } from "bun:test";
import { fixture } from "./drafting.fixture.ts";
import { FakeModel } from "./model.ts";
import { Pipeline, type StepRow } from "./draw.ts";
import { chainOf } from "./chain.ts";
import { record } from "./verdicts.ts";

/** A draw row with nothing generated, and a pipeline over it: the chain is read from rows laid down by hand. */
function bare() {
  const { db } = fixture();
  db.query("INSERT INTO draws (id, genre, mode, seed_mode, seed_text, example_ids, status, created_at) VALUES ('d1', 'horror', 'manual', 'typed', 'a seed', '[]', 'drafting', 'now')").run();
  const p = new Pipeline(db, new FakeModel({}));
  return { db, p };
}

describe("the chain answers the write half from one load", () => {
  test("scenes: the latest artifact per beat wins, in beat order; a patched scene stands in for the one it patches", () => {
    const { p } = bare();
    const sched = p.recordStep("d1", null, "schedule", "copied");
    p.artifact(sched, "schedule", "raw", { form: { tense: "past" }, beats: [{ n: 1 }, { n: 2 }], words: 10 });
    const s2 = p.recordStep("d1", sched.id, "scene", "copied");
    p.artifact(s2, "scene", "beat two", { beat: 2, words: 2, cap: 5, warnings: [] });
    const s1 = p.recordStep("d1", sched.id, "scene", "copied");
    p.artifact(s1, "scene", "beat one", { beat: 1, words: 2, cap: 5, warnings: [] });
    const s1p = p.recordStep("d1", s1.id, "scene", "patched");
    const patchedId = p.artifact(s1p, "scene", "beat one, patched", { beat: 1, words: 3, cap: 5, warnings: [], patched: ["f1"] });
    const chain = chainOf(p, "d1");
    expect(chain.scenes().map((s) => [s.beat, s.text, s.artifact_id === patchedId])).toEqual([[1, "beat one, patched", true], [2, "beat two", false]]);
    expect(chain.schedule()).toMatchObject({ form: { tense: "past" }, raw: "raw" });
    expect(chain.schedule()!.beats).toHaveLength(2);
    expect(chain.lastStep()!.id).toBe(s1p.id);
    expect(chain.latest("scene")!.id).toBe(patchedId);
    expect(chain.artifact(patchedId)!.meta.patched).toEqual(["f1"]);
    expect(chain.slop()).toBeNull();
    expect(chain.auto()).toBeNull();
  });

  test("screen findings and profiles: each beat's latest pass only, a flag's verdict read with it", () => {
    const { p, db } = bare();
    const step = p.recordStep("d1", null, "scene", "copied");
    const finding = (id: string, beat: number, pass: string, patch = "") =>
      p.artifact(step, "finding", `statement ${id}`, { id, checkers: ["ledger"], samples: [1], n: 1, span: `span ${id}`, statement: `statement ${id}`, result: "contradicts:x", evidence: "x", invalidates: String(beat), replacement: "r", patch, pass, source: "screen", screen: "ledger", beat });
    const profile = (beat: number, pass: string, flags: string[]) =>
      p.artifact(step, "profile", "{}", { pass, source: "screen", screen: "structure", beat, answers: {}, flags, samples: 1 });
    // beat 1 was screened twice: only the second pass's flag and profile stand. beat 2 once, with a flag that was patched
    finding("old", 1, "p1"); profile(1, "p1", ["theme-stated"]);
    finding("new", 1, "p2"); profile(1, "p2", []);
    finding("done", 2, "p1", "a patch"); profile(2, "p1", ["resolved"]);
    record(db, { kind: "finding", target_id: "done", verdict: "keep", method: "draw", note: "patched as written" });
    const chain = chainOf(p, "d1");
    expect(chain.screenPass(1)).toBe("p2");
    expect(chain.screenPass(2)).toBe("p1");
    expect(chain.screenPass(3)).toBeUndefined();
    expect(chain.screenProfiles().map((x) => [x.beat, x.pass, x.flags])).toEqual([[1, "p2", []], [2, "p1", ["resolved"]]]);
    expect(chain.screenFindings().map((f) => [f.id, f.beat, f.decision, f.note])).toEqual([["new", 1, "open", ""], ["done", 2, "accepted", "patched as written"]]);
    // a screen flag is not a check pass: the chain has none
    expect(chain.pass()).toBeNull();
  });
});
