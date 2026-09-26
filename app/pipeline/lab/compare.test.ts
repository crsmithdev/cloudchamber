import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pipeline } from "../draw.ts";
import { Drafting } from "../drafting.ts";
import { fixture } from "../drafting.fixture.ts";
import { FakeModel } from "../model.ts";
import { readJudgements } from "./log.ts";
import { AXES, fmt2 } from "./pool.ts";
import { compare, findNarrationPath, formatComparison, loadStoryText, pairArms, whyNotCompare } from "./compare.ts";

const reply = (answer: string) =>
  AXES.map((a) => `<axis name="${a}" one="4" two="2">${answer}</axis><why>because</why>`).join("") +
  `<overall>${answer}</overall><needs>three sentences here</needs>`;

const judgeSays = (answer: string) =>
  (async () => ({
    json: async () => ({ choices: [{ message: { content: reply(answer) } }], usage: { cost: 0.01 } }),
  })) as unknown as typeof fetch;

const scratchLog = () => join(mkdtempSync(join(tmpdir(), "cc-compare-")), "judgements.jsonl");

describe("compare runner", () => {
  test("whyNotCompare refuses malformed runs before execution", () => {
    expect(whyNotCompare({ arms: [["a"]], passes: 8, judges: ["j"] })).toMatch(/at least two arms/);
    expect(whyNotCompare({ arms: [[], ["b"]], passes: 8, judges: ["j"] })).toMatch(/cannot be empty/);
    expect(whyNotCompare({ arms: [["a"], ["b"]], passes: 5, judges: ["j"] })).toMatch(/passes must be even/);
    expect(whyNotCompare({ arms: [["a"], ["b"]], passes: 0, judges: ["j"] })).toMatch(/passes must be even/);
    expect(whyNotCompare({ arms: [["a"], ["b"]], passes: 8, judges: [] })).toBe("no judges");
    expect(whyNotCompare({ arms: [["a"], ["b"]], passes: 8, judges: ["j"] })).toBeNull();
  });

  test("pairArms pairs many-to-one against single target, or one-to-many, or by source", () => {
    expect(pairArms(["d1", "d2", "d3"], ["source"])).toEqual([
      ["d1", "source"],
      ["d2", "source"],
      ["d3", "source"],
    ]);

    expect(pairArms(["source"], ["t1", "t2"])).toEqual([
      ["source", "t1"],
      ["source", "t2"],
    ]);

    // by source, whatever the order of the arms
    const src: Record<string, string> = { a1: "s1", a2: "s2", b1: "s2", b2: "s1" };
    expect(pairArms(["a1", "a2"], ["b1", "b2"], (id) => src[id]!)).toEqual([
      ["a1", "b2"],
      ["a2", "b1"],
    ]);
    // a draft with no match stops the run rather than pair by position
    expect(() => pairArms(["a1", "a2"], ["b1", "x"], (id) => src[id] ?? id)).toThrow("a1, x");
  });

  test("findNarrationPath finds files by ID or relative path and returns null for unknown", () => {
    const tmp = mkdtempSync(join(tmpdir(), "cc-narr-"));
    writeFileSync(join(tmp, "video123.json"), JSON.stringify({ snippets: [] }));
    expect(findNarrationPath("video123", tmp)).toBe(join(tmp, "video123.json"));
    expect(findNarrationPath("nonexistent", tmp)).toBeNull();
  });

  test("loadStoryText strips intro from narration JSON", () => {
    const tmp = mkdtempSync(join(tmpdir(), "cc-narr-"));
    const path = join(tmp, "story.json");
    writeFileSync(
      path,
      JSON.stringify({
        snippets: [
          { text: "Welcome to our channel. Subscribe now! Let's dive into today's story." },
          { text: "The fog rolled over the harbor." },
        ],
      }),
    );
    const { db, dir } = fixture();
    const d = new Drafting(new Pipeline(db, new FakeModel({}), { briefsDir: dir }));
    const text = loadStoryText(d, "story", tmp);
    expect(text).toBe("The fog rolled over the harbor.");
  });

  test("compare judges pairs across arms, logs passes, and pools comparison", async () => {
    const { db, dir } = fixture();
    const tmpNarr = mkdtempSync(join(tmpdir(), "cc-narr-"));
    writeFileSync(
      join(tmpNarr, "ref.json"),
      JSON.stringify({ snippets: [{ text: "The reference story text." }] }),
    );

    // Setup 2 draws
    const p = new Pipeline(db, new FakeModel({}), { briefsDir: dir });
    for (const id of ["draw-cmp-1", "draw-cmp-2"]) {
      p.db.query(`INSERT INTO draws (id, name, genre, mode, seed_mode, seed_text, example_ids, sampling, status, created_at)
                  VALUES (?, 'test', 'horror', 'manual', 'drawn', 'seed', '[]', 'listen', 'drafted', 'now')`).run(id);
      const stOut = p.recordStep(id, null, "outline", "deterministic");
      p.artifact(stOut, "ledger", "ledger text", { pass: "p1", sample: 1 });
      const stSch = p.recordStep(id, stOut.id, "schedule", "deterministic");
      const stSc = p.recordStep(id, stSch.id, "scene", "deterministic");
      p.artifact(stSc, "scene", `Story text for ${id}.`, { beat: 1, words: 5, cap: 10, warnings: [] });
    }

    const d = new Drafting(p);
    const log = scratchLog();
    const says: string[] = [];

    const res = await compare(d, {
      arms: [["draw-cmp-1", "draw-cmp-2"], ["ref"]],
      passes: 2,
      judges: ["test-judge"],
      log,
      narrationDir: tmpNarr,
      call: { fetch: judgeSays("One"), key: "test-key" },
      say: (line) => says.push(line),
    });

    expect(res.comparison.pairs).toHaveLength(2);
    expect(res.comparison.floor).toBeDefined();
    expect(res.comparison.floor!.pairs).toHaveLength(1);
    expect(res.cost_usd).toBeGreaterThan(0);
    expect(res.failed).toBe(0);

    const logged = readJudgements(log);
    // 2 comparison pairs * 1 judge * 2 passes = 4 passes
    // 1 floor pair * 1 judge * 2 passes = 2 passes
    // Total = 6 passes
    expect(logged).toHaveLength(6);
    expect(logged.filter((r) => r.kind === "comparison")).toHaveLength(4);
    expect(logged.filter((r) => r.kind === "floor")).toHaveLength(2);

    const formatted = formatComparison(res);
    expect(formatted).toContain("draw-cmp-1 v ref");
    expect(formatted).toContain("draw-cmp-2 v ref");
    expect(formatted).toContain("draw-cmp-1 v draw-cmp-2");
    expect(formatted).toContain("verdict:");
  });
});
