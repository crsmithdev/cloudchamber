import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import { SCHEMA_VERSION, openDb, type Db } from "./store/db.ts";
import { eligibleIds, inherit, latest, passedStories, readLog, record, replay, tokenOverlap, validateLine } from "./verdicts.ts";
import { eligiblePassages, exportBank } from "./bank.ts";
import { readFileSync, writeFileSync } from "node:fs";

function fixture(): { db: Db; log: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "fogbelt-"));
  const db = openDb(join(dir, "t.db"));
  db.exec(`INSERT INTO sources (id, path, reader, genre) VALUES ('src', 'x.pdf', 'pdf', 'horror')`);
  db.exec(`INSERT INTO stories (id, source_id, ord, title, author, genre, words, text) VALUES ('src/a', 'src', 0, 'A', 'Ann', 'horror', 900, 'x'), ('src/b', 'src', 1, 'B', 'Bob', 'horror', 900, 'y')`);
  const ins = db.query("INSERT INTO passages (id, story_id, text, words, stratum, position, seed, first_seen, voice, mode) VALUES (?, ?, ?, ?, 0, 0, 0, 'now', 'mixed', 'narrative')");
  ins.run("p1", "src/a", words(200, "alpha"), 200);
  ins.run("p2", "src/a", words(200, "beta"), 200);
  ins.run("p3", "src/b", words(200, "gamma"), 200);
  return { db, log: join(dir, "verdicts.jsonl"), dir };
}
function words(n: number, stem: string) { return Array.from({ length: n }, (_, i) => `${stem}${i}`).join(" "); }

describe("verdict log", () => {
  test("record appends one line, latest wins, eligibility follows", () => {
    const { db, log } = fixture();
    record(db, { kind: "example", target_id: "p1", verdict: "pass", method: "queue" }, log);
    record(db, { kind: "example", target_id: "p2", verdict: "keep", method: "queue", artifact: true, note: "header leaked" }, log);
    record(db, { kind: "example", target_id: "p1", verdict: "keep", method: "browse" }, log);
    const lines = readFileSync(log, "utf8").trim().split("\n");
    expect(lines).toHaveLength(3);
    const first = JSON.parse(lines[0]);
    expect(first).toMatchObject({ kind: "example", target_id: "p1", verdict: "pass", artifact: false, method: "queue" });
    for (const k of ["id", "at", "by", "pipeline_version", "note"]) expect(first).toHaveProperty(k);
    expect(first.snapshot).toMatchObject({ story_id: "src/a" });
    expect(latest(db, "example", "p1")?.verdict).toBe("keep");
    expect([...eligibleIds(db, "example", ["p1", "p2", "p3"])].sort()).toEqual(["p1", "p3"]);   // p2 flagged
  });

  test("replay reproduces eligibility and a corrupt line fails by number", () => {
    const { db, log } = fixture();
    record(db, { kind: "example", target_id: "p1", verdict: "pass", method: "queue" }, log);
    record(db, { kind: "theme", target_id: "t1", verdict: "keep", method: "browse" }, log);
    db.exec("DELETE FROM verdicts");
    expect(replay(db, log)).toBe(2);
    expect([...eligibleIds(db, "example", ["p1", "p2"])]).toEqual(["p2"]);
    require("node:fs").appendFileSync(log, '{"id":"x","kind":"example"}\n');
    expect(() => replay(db, log)).toThrow(/line 3/);
    expect(() => validateLine("{}", 9)).toThrow(/line 9/);
  });

  test("inheritance attaches at 80% overlap and not at 70%", () => {
    const { db, log } = fixture();
    record(db, { kind: "example", target_id: "p1", verdict: "keep", method: "queue", note: "good" }, log);
    record(db, { kind: "example", target_id: "p3", verdict: "pass", method: "queue" }, log);
    // re-extraction: p1 shifted by 10% of tokens (overlap 0.9), p3 shifted by 35% (overlap 0.65)
    db.exec("DELETE FROM passages");
    const ins = db.query("INSERT INTO passages (id, story_id, text, words, stratum, position, seed, first_seen) VALUES (?, ?, ?, ?, 0, 0, 0, 'now')");
    const p1new = words(180, "alpha") + " " + words(20, "new");
    const p3new = words(130, "gamma") + " " + words(70, "other");
    ins.run("p1n", "src/a", p1new, 200);
    ins.run("p3n", "src/b", p3new, 200);
    expect(tokenOverlap(words(200, "alpha"), p1new)).toBeCloseTo(0.9, 2);
    expect(tokenOverlap(words(200, "gamma"), p3new)).toBeCloseTo(0.65, 2);
    const written = inherit(db, log);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ target_id: "p1n", verdict: "keep", note: "good", inherited_from: "p1" });
    expect(latest(db, "example", "p1n")?.inherited_from).toBe("p1");
    expect(latest(db, "example", "p3n")).toBeNull();
    expect(inherit(db, log)).toHaveLength(0);          // idempotent
  });
});

describe("story verdicts", () => {
  test("a passed story hides its passages from the bank whatever their own verdicts say", () => {
    const { db, log, dir } = fixture();
    record(db, { kind: "example", target_id: "p1", verdict: "keep", method: "queue" }, log);
    record(db, { kind: "story", target_id: "src/a", verdict: "pass", method: "browse", note: "translation" }, log);
    expect(passedStories(db)).toEqual(new Set(["src/a"]));
    expect(eligiblePassages(db).map((p) => p.id)).toEqual(["p3"]);
    expect(latest(db, "example", "p1")?.verdict).toBe("keep");           // the passage's own verdict is untouched
    expect(exportBank(db, join(dir, "bank")).passages).toBe(1);
    record(db, { kind: "story", target_id: "src/a", verdict: "keep", method: "browse" }, log);
    expect(passedStories(db).size).toBe(0);
    expect(eligiblePassages(db).map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    db.exec("DELETE FROM verdicts");
    replay(db, log);
    expect(passedStories(db).size).toBe(0);
    const lines = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[1]).toMatchObject({ kind: "story", target_id: "src/a", verdict: "pass", method: "browse" });
    expect(lines[1].snapshot).toBeUndefined();
  });
});

describe("store migration", () => {
  test("a version-0 store gains the story kind, the run method and the suspect column, and replays the log", () => {
    const dir = mkdtempSync(join(tmpdir(), "fogbelt-mig-"));
    const path = join(dir, "old.db"), log = join(dir, "verdicts.jsonl");
    const old = new Database(path);
    old.exec(`CREATE TABLE sources (id TEXT PRIMARY KEY, path TEXT NOT NULL, reader TEXT NOT NULL, genre TEXT NOT NULL, author TEXT NOT NULL DEFAULT '', license TEXT NOT NULL DEFAULT '', dev INTEGER NOT NULL DEFAULT 0, read_at TEXT);
      CREATE TABLE stories (id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), ord INTEGER NOT NULL, title TEXT NOT NULL, author TEXT NOT NULL DEFAULT '', genre TEXT NOT NULL, words INTEGER NOT NULL, text TEXT NOT NULL, locator TEXT NOT NULL DEFAULT '', split_by TEXT NOT NULL DEFAULT '');
      CREATE TABLE passages (id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id), text TEXT NOT NULL, words INTEGER NOT NULL, stratum INTEGER NOT NULL, position REAL NOT NULL, seed INTEGER NOT NULL, withheld INTEGER NOT NULL DEFAULT 0, d1 REAL, d2 REAL, d3 REAL, d4 REAL, d5 REAL, d6 REAL, voice TEXT, mode TEXT, first_seen TEXT NOT NULL);
      CREATE TABLE verdicts (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('example','theme','packet')), target_id TEXT NOT NULL, verdict TEXT NOT NULL CHECK (verdict IN ('keep','pass')), artifact INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', method TEXT NOT NULL CHECK (method IN ('queue','browse','gate','cli')), at TEXT NOT NULL, by TEXT NOT NULL, pipeline_version TEXT NOT NULL, inherited_from TEXT);
      INSERT INTO sources VALUES ('src', 'x', 'pdf', 'horror', '', '', 0, NULL);
      INSERT INTO stories VALUES ('src/a', 'src', 0, 'A', 'Ann', 'horror', 900, 'x', '', '');
      INSERT INTO passages (id, story_id, text, words, stratum, position, seed, first_seen) VALUES ('p1', 'src/a', 'one', 1, 0, 0, 0, 'now');`);
    expect((old.query("PRAGMA user_version").get() as any).user_version).toBe(0);
    old.close();
    const line = { id: "v1", kind: "example", target_id: "p1", verdict: "pass", artifact: false, note: "", method: "queue", at: "2026-09-05T00:00:00Z", by: "chris", pipeline_version: "abc" };
    writeFileSync(log, JSON.stringify(line) + "\n");
    const db = openDb(path, log);
    expect((db.query("PRAGMA user_version").get() as any).user_version).toBe(SCHEMA_VERSION);
    expect((db.query("PRAGMA table_info(passages)").all() as any[]).map((c) => c.name)).toContain("suspect");
    expect(db.query("SELECT text FROM passages WHERE id = 'p1'").get()).toEqual({ text: "one" });
    expect(latest(db, "example", "p1")?.verdict).toBe("pass");         // replayed from the log, not lost with the table
    expect(() => record(db, { kind: "story", target_id: "src/a", verdict: "pass", method: "run" }, log)).not.toThrow();
    const again = openDb(path, log);                                     // idempotent
    expect((again.query("PRAGMA user_version").get() as any).user_version).toBe(SCHEMA_VERSION);
    expect(again.query("SELECT count(*) AS n FROM verdicts").get()).toEqual({ n: 2 });
  });
});

describe("bank export", () => {
  test("omits passed and flagged items, segments by source", () => {
    const { db, log, dir } = fixture();
    db.exec(`INSERT INTO themes (id, text, attestation, stories, drafted_at) VALUES ('t1', 'A theme.', 1, '["src/a"]', 'now'), ('t2', 'Another.', 2, '["src/a","src/b"]', 'now')`);
    record(db, { kind: "example", target_id: "p1", verdict: "pass", method: "queue" }, log);
    record(db, { kind: "example", target_id: "p2", verdict: "keep", method: "queue", artifact: true }, log);
    record(db, { kind: "theme", target_id: "t2", verdict: "pass", method: "browse" }, log);
    const out = exportBank(db, join(dir, "bank"));
    expect(out.passages).toBe(1);
    expect(out.themes).toBe(1);
    const ex = readFileSync(join(dir, "bank", "examples", "src.md"), "utf8");
    expect(ex).toContain("p3");
    expect(ex).not.toContain("p1");
    expect(ex).not.toContain("p2");
    expect(ex).toContain("### B — Bob · horror · mixed/narrative · p3");
    const th = readFileSync(join(dir, "bank", "themes.md"), "utf8");
    expect(th).toContain("A theme.");
    expect(th).not.toContain("Another.");
  });
});
