import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SCHEMA_VERSION, openDb } from "./db.ts";

const columns = (db: Database, table: string) => (db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
const version = (db: Database) => (db.query("PRAGMA user_version").get() as any).user_version;

/** A store as version 12 left it: the current schema without what 13 adds, and a draw and a step in it. */
function at12(path: string) {
  const db = openDb(path);
  db.exec("INSERT INTO draws (id, genre, mode, seed_mode, seed_text, example_ids, status, created_at) VALUES ('d1', 'horror', 'auto', 'typed', 'a seed', '[]', 'done', 'now')");
  db.exec("INSERT INTO steps (id, draw_id, stage, model, system_prompt, prompt, status, started_at) VALUES ('s1', 'd1', 'outline', 'm', '', '', 'done', 'now')");
  db.exec("ALTER TABLE draws DROP COLUMN branched_from");
  db.exec("ALTER TABLE draws DROP COLUMN branch_at");
  db.exec("ALTER TABLE steps DROP COLUMN version");
  db.exec("ALTER TABLE steps DROP COLUMN pid");
  db.exec("ALTER TABLE draws DROP COLUMN hold_back");
  db.exec("ALTER TABLE draws DROP COLUMN hold_undo");
  db.exec("ALTER TABLE steps DROP COLUMN pass");
  db.exec("ALTER TABLE verdicts DROP COLUMN reason");
  db.exec("PRAGMA user_version = 12");
  db.close();
}

describe("store version", () => {
  test("a store older than the migrations that are left is refused, and says how to open it", () => {
    const dir = mkdtempSync(join(tmpdir(), "cloudchamber-old-"));
    const path = join(dir, "v10.db");
    const old = new Database(path);
    // enough of a store to be taken for one: openDb tells a fresh file from an existing one by the verdicts table
    old.exec(`CREATE TABLE verdicts (id TEXT PRIMARY KEY, kind TEXT NOT NULL, target_id TEXT NOT NULL, verdict TEXT NOT NULL, artifact INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', method TEXT NOT NULL, at TEXT NOT NULL, by TEXT NOT NULL, pipeline_version TEXT NOT NULL, inherited_from TEXT);
      PRAGMA user_version = 10;`);
    old.close();
    expect(() => openDb(path)).toThrow(/is at schema 10, and this build reads 17 only/);
    expect(() => openDb(path)).toThrow(/git checkout 7978c4d/);
  });

  test("a store at 11 climbs to the current schema in one open: every arm runs in order", () => {
    const dir = mkdtempSync(join(tmpdir(), "cloudchamber-v11-"));
    const path = join(dir, "v11.db");
    const eleven = new Database(path);
    eleven.exec(`CREATE TABLE verdicts (id TEXT PRIMARY KEY, kind TEXT NOT NULL, target_id TEXT NOT NULL, verdict TEXT NOT NULL, artifact INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', method TEXT NOT NULL, at TEXT NOT NULL, by TEXT NOT NULL, pipeline_version TEXT NOT NULL, inherited_from TEXT);
      CREATE TABLE draws (id TEXT PRIMARY KEY, genre TEXT NOT NULL, mode TEXT NOT NULL, seed_mode TEXT NOT NULL, seed_text TEXT NOT NULL, example_ids TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE steps (id TEXT PRIMARY KEY, draw_id TEXT, stage TEXT NOT NULL, model TEXT NOT NULL, system_prompt TEXT NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL);
      CREATE TABLE artifacts (id TEXT PRIMARY KEY, step_id TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL, meta TEXT NOT NULL DEFAULT '{}');
      PRAGMA user_version = 11;`);
    eleven.close();

    const migrated = openDb(path);
    expect(version(migrated)).toBe(SCHEMA_VERSION);
    expect(columns(migrated, "steps")).toContain("usage");      // 11 → 12
    expect(columns(migrated, "draws")).toContain("models");
    expect(columns(migrated, "steps")).toContain("version");    // 12 → 13
    expect(columns(migrated, "draws")).toContain("branched_from");
    expect(columns(migrated, "steps")).toContain("pid");         // 13 → 14
    expect(columns(migrated, "draws")).toContain("hold_back");   // 14 → 15
    expect(columns(migrated, "draws")).toContain("hold_undo");
    expect(columns(migrated, "steps")).toContain("pass");        // 15 → 16
    expect(columns(migrated, "verdicts")).toContain("reason");   // 16 → 17
    migrated.close();
  });

  test("12 migrates in place to 13, adding the branch link and the step's tree, and keeps its rows", () => {
    const path = join(mkdtempSync(join(tmpdir(), "cloudchamber-v12-")), "t.db");
    at12(path);

    const db = openDb(path);
    expect(version(db)).toBe(SCHEMA_VERSION);
    expect(columns(db, "draws")).toContain("branched_from");
    expect(columns(db, "draws")).toContain("branch_at");
    expect(columns(db, "steps")).toContain("version");
    expect(columns(db, "steps")).toContain("pid");
    expect(columns(db, "draws")).toContain("hold_back");
    expect(db.query("SELECT id FROM draws").all()).toEqual([{ id: "d1" }]);
    expect(db.query("SELECT branched_from FROM draws WHERE id = 'd1'").get()).toEqual({ branched_from: null });
    expect(db.query("SELECT version FROM steps WHERE id = 's1'").get()).toEqual({ version: null });
  });

  test("15 → 16 gives each check step the latest pass of its draw that began at or before it", () => {
    const path = join(mkdtempSync(join(tmpdir(), "cloudchamber-v15-")), "t.db");
    at12(path);
    openDb(path).close();
    const db = new Database(path);
    db.exec("ALTER TABLE steps DROP COLUMN pass");
    db.exec("ALTER TABLE verdicts DROP COLUMN reason");
    db.exec("PRAGMA user_version = 15");
    const step = db.query("INSERT INTO steps (id, draw_id, stage, model, system_prompt, prompt, status, started_at) VALUES (?, 'd1', ?, 'm', '', '', 'done', ?)");
    const art = db.query("INSERT INTO artifacts (id, step_id, kind, content, meta) VALUES (?, ?, ?, '', ?)");
    const P1 = "2026-09-20T10:00:00.000Z-001", P2 = "2026-09-21T10:00:00.000Z-002";
    step.run("a", "check-ledger", "2026-09-20T10:00:05Z"); art.run("x1", "a", "pass", JSON.stringify({ pass: P1 }));
    step.run("b", "check-ledger", "2026-09-20T10:00:06Z");
    step.run("c", "check-derivation", "2026-09-21T10:00:01Z"); art.run("x2", "c", "finding", JSON.stringify({ pass: P2, source: "check" }));
    step.run("d", "scene", "2026-09-21T10:00:02Z");
    step.run("e", "check-ledger", "2026-09-19T00:00:00Z");
    db.close();

    const migrated = openDb(path);
    const passOf = (id: string) => (migrated.query("SELECT pass FROM steps WHERE id = ?").get(id) as { pass: string | null }).pass;
    expect([passOf("a"), passOf("b"), passOf("c"), passOf("d"), passOf("e")]).toEqual([P1, P1, P2, null, null]);
  });

  test("a fresh store opens at the current schema, and opening it again changes nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "cloudchamber-fresh-"));
    const path = join(dir, "new.db");
    const db = openDb(path);
    expect(version(db)).toBe(SCHEMA_VERSION);
    db.close();
    const again = openDb(path);
    expect(version(again)).toBe(SCHEMA_VERSION);
  });
});
