import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb, type Db } from "./store/db.ts";
import { FakeModel } from "./model.ts";
import { Pipeline } from "./draw.ts";
import { draftAll, draftStory, failures, fewshotLines, replayThemes, validateTheme, type Embedder } from "./themes.ts";
import { record } from "./verdicts.ts";

function fixture(): { db: Db; dir: string; log: string } {
  const dir = mkdtempSync(join(tmpdir(), "cloudchamber-themes-"));
  const db = openDb(join(dir, "t.db"));
  db.exec(`INSERT INTO sources (id, path, reader, genre) VALUES ('scp', 'x', 'scp', 'horror')`);
  db.exec(`INSERT INTO stories (id, source_id, ord, title, author, genre, words, text) VALUES
    ('scp/a', 'scp', 0, 'A', 'Ann', 'horror', 900, 'Story A text.'), ('scp/b', 'scp', 1, 'B', 'Bob', 'horror', 900, 'Story B text.')`);
  return { db, dir, log: join(dir, "themes.jsonl") };
}
/** Deterministic fake embedder: hashes the first word into a direction so 'same' texts land close. */
const fakeEmbed: Embedder = async (texts) => texts.map((t) => {
  const v = new Array(8).fill(0); const k = t.split(" ")[0].toLowerCase();
  v[k.charCodeAt(0) % 8] = 1; return v;
});
const themes = (...ts: string[]) => ts.map((t) => `<theme>${t}</theme>`).join("\n");

describe("theme validation", () => {
  test("rules", () => {
    expect(validateTheme("A binding sealed on its first draft and unamendable afterward, so every cruelty written in must be repaid on schedule.")).toEqual([]);
    expect(validateTheme("Too short a line.")).toEqual(["4 words"]);
    expect(validateTheme("This is a pointer that opens the sentence and keeps going for enough words to pass.")).toEqual(["deictic opener"]);
    expect(validateTheme("Those who hold blackmail as insurance are ruled by whoever stumbles onto it, so they hire strangers.")).toEqual([]);
    expect(validateTheme("Those kept on because they are useful learn that useful means spendable, and the spendable go first.")).toEqual([]);
    expect(validateTheme("A hunter that wears the skin of Marmaduke, so that rescue arrives in a friend's face and the party walks toward it.")).toEqual(["proper noun Marmaduke"]);
    expect(validateTheme("A site designated SCP-2845 keeps a god by convincing it that it has been overpowered, and pays on a calendar.")).toEqual(["designation"]);
    expect(validateTheme("One. Two. Three sentences here make this row too many for the grain we want to keep in the bank.")).toEqual(["3 sentences"]);
  });
});

describe("theme drafting", () => {
  test("zero-shot until twelve kept, rows validated, redundancy folds a restatement, log replays", async () => {
    const { db, dir, log } = fixture();
    const model = new FakeModel({
      themes: [
        themes("A refuge that survives by refusing entry must eventually send its own people out, and each expelled learns the wall faced them.",
               "It opens on a pointer and should be rejected by the validator for that reason alone, nothing else."),
        themes("A refuge that keeps its people by expelling them one at a time, until the wall is understood to face inward.",
               "Quarantine that judges by position rather than symptom converts whoever steps outside into a carrier by definition."),
      ],
      redundancy: (p: string) => /keeps its people by expelling/.test(p) ? `same: ${/\[([0-9a-f]{12})\]/.exec(p)![1]}` : "different",
    });
    const p = new Pipeline(db, model, { briefsDir: dir });
    const r1 = await draftStory(p, "scp/a", fakeEmbed, log);
    expect(r1).toMatchObject({ drafted: 2, banked: 1, attested: 0 });
    expect(r1.rejected[0].why).toEqual(["deictic opener"]);
    expect(model.calls[0].prompt).not.toContain("Examples of the shape");     // zero-shot
    expect(model.calls[0].prompt).toContain("under 30 words");
    expect(model.calls.filter((c) => c.stage === "redundancy")).toHaveLength(0); // empty bank, nothing to compare
    const r2 = await draftStory(p, "scp/b", fakeEmbed, log);
    expect(r2).toMatchObject({ drafted: 2, banked: 1, attested: 1 });
    const banked = db.query("SELECT id, text, attestation, stories FROM themes WHERE duplicate_of IS NULL ORDER BY drafted_at, rowid").all() as any[];
    expect(banked).toHaveLength(2);
    expect(banked[0].attestation).toBe(2);
    expect(JSON.parse(banked[0].stories)).toEqual(["scp/a", "scp/b"]);
    const dup = db.query("SELECT duplicate_of FROM themes WHERE duplicate_of IS NOT NULL").get() as any;
    expect(dup.duplicate_of).toBe(banked[0].id);
    expect((db.query("SELECT story_id FROM steps WHERE stage = 'themes' ORDER BY started_at").all() as any[]).map((s) => s.story_id)).toEqual(["scp/a", "scp/b"]);
    // draftAll skips drafted stories
    expect(await draftAll(p, {}, fakeEmbed, log)).toEqual([]);
    // the log replays into the same bank
    const lines = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.type)).toEqual(["bank", "attest", "bank"]);
    db.exec("DELETE FROM themes");
    db.exec("DELETE FROM theme_drafts");
    expect(replayThemes(db, log)).toBe(3);
    const again = db.query("SELECT id, attestation, stories FROM themes ORDER BY drafted_at").all() as any[];
    expect(again.map((t) => [t.id, t.attestation])).toEqual(banked.map((t) => [t.id, t.attestation]));
    // the replay marks the logged stories drafted, so draftAll still skips them
    const drafts = db.query("SELECT story_id, drafted, banked, attested, rejected FROM theme_drafts ORDER BY story_id").all() as any[];
    expect(drafts).toEqual([
      { story_id: "scp/a", drafted: 1, banked: 1, attested: 0, rejected: 0 },
      { story_id: "scp/b", drafted: 2, banked: 1, attested: 1, rejected: 0 },
    ]);
    expect(await draftAll(p, {}, fakeEmbed, log)).toEqual([]);
  });

  test("a story the model refuses is recorded, skipped and not retried", async () => {
    const { db, dir, log } = fixture();
    const model = new FakeModel({
      themes: (prompt: string) => /Story A text/.test(prompt)
        ? { stop: "refusal" as const, text: "safeguards flagged this message. Details: `[bio]`" }
        : themes("A quarantine that judges by position rather than symptom turns whoever steps outside into a carrier by definition."),
      redundancy: () => "different",
    });
    const p = new Pipeline(db, model, { briefsDir: dir });
    const reports = await draftAll(p, {}, fakeEmbed, log);
    expect(reports.map((r) => r.story)).toEqual(["scp/b"]);                    // the batch went on
    expect(model.calls.filter((c) => c.stage === "themes").map((c) => c.model))
      .toEqual(["claude-opus-5", "claude-sonnet-5", "claude-opus-5"]);        // refused, fell back, refused, then story B
    expect(db.query("SELECT story_id, stage, reason FROM theme_failures").all())
      .toEqual([{ story_id: "scp/a", stage: "themes", reason: "refusal" }]);
    expect(failures(db, "")).toHaveLength(1);
    expect(failures(db, "")[0]).toContain("SKIPPED scp/a: themes refusal");
    expect(await draftAll(p, {}, fakeEmbed, log)).toEqual([]);                 // neither story is retried
  });

  test("few-shot appears once twelve themes carry a keep verdict", () => {
    const { db, dir } = fixture();
    const ins = db.query("INSERT INTO themes (id, text, attestation, stories, drafted_at) VALUES (?, ?, 1, '[]', 'now')");
    for (let i = 0; i < 12; i++) ins.run(`t${i}`, `Theme number ${i} with a mechanism and a turn in it.`);
    expect(fewshotLines(db)).toEqual([]);
    for (let i = 0; i < 11; i++) record(db, { kind: "theme", target_id: `t${i}`, verdict: "keep", method: "queue" }, join(dir, "v.jsonl"));
    expect(fewshotLines(db)).toEqual([]);
    record(db, { kind: "theme", target_id: "t11", verdict: "keep", method: "queue" }, join(dir, "v.jsonl"));
    expect(fewshotLines(db)).toHaveLength(8);
  });
});
