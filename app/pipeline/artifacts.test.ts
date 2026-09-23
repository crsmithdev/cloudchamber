import { describe, expect, test } from "bun:test";
import { latestOf, ofKind, readArtifacts, writeArtifact } from "./artifacts.ts";
import { fixture } from "./drafting.fixture.ts";
import { openDb } from "./store/db.ts";
import { join } from "node:path";

function store() {
  const { db, dir } = fixture();
  db.exec(`INSERT INTO draws (id, name, genre, mode, seed_mode, seed_text, example_ids, sampling, status, created_at)
           VALUES ('d1', 'n', 'horror', 'manual', 'typed', 'seed', '[]', 'tail', 'done', '2026-01-01T00:00:00Z')`);
  const step = (id: string, stage: string, at: string) =>
    db.exec(`INSERT INTO steps (id, draw_id, stage, model, system_prompt, prompt, status, attempt, started_at) VALUES ('${id}', 'd1', '${stage}', 'm', 's', 'p', 'done', 1, '${at}')`);
  step("s1", "execute", "2026-01-01T00:00:01Z");
  step("s2", "scene", "2026-01-01T00:00:02Z");
  return { db, dir, path: join(dir, "t.db") };
}

describe("the artifact store", () => {
  test("a write keeps its kind's meta, and a read parses it once with the step's stage", () => {
    const { db } = store();
    const id = writeArtifact(db, "s1", "vignette", "the prose", { index: 2, probability: 0.07, premise: "a premise", warnings: [] });
    expect(id.startsWith("vignette-")).toBe(true);
    const [a] = readArtifacts(db, { draw: "d1" });
    expect(a).toMatchObject({ id, step_id: "s1", kind: "vignette", content: "the prose", stage: "execute" });
    expect(a.meta).toEqual({ index: 2, probability: 0.07, premise: "a premise", warnings: [] });
  });

  test("a read by step sees that step alone; a read by draw sees every step, oldest first", () => {
    const { db } = store();
    writeArtifact(db, "s1", "vignette", "one", { index: 1 });
    writeArtifact(db, "s2", "scene", "two", { beat: 1, words: 2, cap: 500, warnings: [] });
    writeArtifact(db, "s2", "scene", "three", { beat: 2, words: 3, cap: 500, warnings: [] });
    expect(readArtifacts(db, { step: "s2" }).map((a) => a.content)).toEqual(["two", "three"]);
    expect(readArtifacts(db, { draw: "d1" }).map((a) => a.content)).toEqual(["one", "two", "three"]);
  });

  test("ofKind narrows to one kind and latestOf takes the newest", () => {
    const { db } = store();
    writeArtifact(db, "s1", "vignette", "one", { index: 1 });
    writeArtifact(db, "s2", "scene", "first beat", { beat: 1, words: 2, cap: 500, warnings: [] });
    writeArtifact(db, "s2", "scene", "second beat", { beat: 2, words: 2, cap: 500, warnings: [] });
    const arts = readArtifacts(db, { draw: "d1" });
    expect(ofKind(arts, "scene").map((a) => a.meta.beat)).toEqual([1, 2]);
    expect(latestOf(arts, "scene")!.content).toBe("second beat");
    expect(latestOf(arts, "ledger")).toBeUndefined();
  });

  test("a store reopened from disk reads back what was written", () => {
    const { db, path } = store();
    writeArtifact(db, "s1", "premise", "a premise", { index: 1, probability: 0.04, warnings: [] });
    db.close();
    const again = openDb(path);
    expect(readArtifacts(again, { draw: "d1" })[0].meta).toEqual({ index: 1, probability: 0.04, warnings: [] });
  });
});
