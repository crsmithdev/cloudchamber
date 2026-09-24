import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { asRuns, experiment, experiments, readJudgements, recordJudgement, recordJudgements, ruledOn, type JudgementInput } from "./log.ts";
import { fmt2, pool, verdict, type Run } from "./pool.ts";
import fixture from "./pool.fixture.json";

const runs = (key: string): Run[] => (fixture as Record<string, Run[]>)[key]!;
const logFile = () => join(mkdtempSync(join(tmpdir(), "cloudchamber-log-")), "judgements.jsonl");

/** The stored passes of one run, written to the log as `lab` would write them. */
function rowsFor(name: string, kind: "comparison" | "floor", exp = name): JudgementInput[] {
  const out: JudgementInput[] = [];
  for (const run of runs(`${name}/${kind}`)) {
    // the fixture's file name is `<draft>.<judge>.json` for a comparison and `within.<a>-<b>.<judge>.json` for a floor
    const head = run.file.split(".")[0]!;
    const [ours, source] = kind === "floor" ? run.file.split(".")[1]!.split("-") : [head, head.replace(/\d$/, "") + "fix"];
    run.results.forEach((p, i) => out.push({
      experiment: exp, brief: "20260922134631-ad7c", level: "L2", kind,
      arm: name, against: kind === "floor" ? name : "fix",
      ours: ours!, source: source!, judge: run.model, pass: i + 1,
      flipped: p.flipped, complete: p.complete, followed_order: p.followed_order!,
      axes: p.axes ?? {}, scores: p.scores ?? {}, overall: p.overall,
      cost_usd: 0.04, ms: 90_000, version: "b6606a8",
    }));
  }
  return out;
}

describe("the log replays to the same numbers it recorded", () => {
  test.each([
    ["register-cut", 0.39, 0.29, "inside the floor, so this says nothing yet"],
    ["caps-ablation", 0.19, 0.52, "falls below the floor: the change loses"],
    ["presence", 0.39, 0.62, "falls below the floor: the change loses"],
  ])("%s pools the same out of the log as out of the runs", (name, share, floor, said) => {
    const log = logFile();
    recordJudgements(rowsFor(name, "comparison"), log);
    recordJudgements(rowsFor(name, "floor"), log);

    const rows = readJudgements(log);
    const { comparison, floor: floorRows } = experiment(rows, name);
    const c = pool(asRuns(comparison));
    const f = pool(asRuns(floorRows));

    expect(fmt2(c.share)).toBe(share.toFixed(2));
    expect(fmt2(f.share)).toBe(floor.toFixed(2));
    expect(verdict(c.share, f.share)).toBe(said as any);
    // and the same judges, with the same weights, as pooling the runs directly
    expect(c.judges).toEqual(pool(runs(`${name}/comparison`)).judges);
    expect(f.judges).toEqual(pool(runs(`${name}/floor`)).judges);
  });

  test("a judge's weight is computed over its passes on one pair, not over everything it judged", () => {
    const log = logFile();
    recordJudgements([...rowsFor("register-cut", "comparison"), ...rowsFor("caps-ablation", "comparison", "register-cut")], log);
    // three drafts a side means three pairs per judge, so nine runs, not three
    expect(asRuns(readJudgements(log))).toHaveLength(18);
  });
});

describe("the log itself", () => {
  const row = (over: Partial<JudgementInput> = {}): JudgementInput => ({
    experiment: "e1", brief: "20260922134631-ad7c", level: "L2", kind: "comparison",
    arm: "cut", against: "fix", ours: "cut1", source: "fix1", judge: "z-ai/glm-4.7", pass: 1,
    flipped: false, complete: true, followed_order: true, axes: { hook: "ours" },
    scores: { hook: { ours: 4, source: 3 } }, overall: "ours", cost_usd: 0.04, ms: 1000,
    version: "b6606a8", ...over,
  });

  test("one line per pass, appended, and read back as it was written", () => {
    const log = logFile();
    recordJudgement(row(), log);
    recordJudgement(row({ pass: 2, flipped: true }), log);
    expect(readFileSync(log, "utf8").trimEnd().split("\n")).toHaveLength(2);
    const back = readJudgements(log);
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({ experiment: "e1", ours: "cut1", source: "fix1", overall: "ours" });
    expect(back.every((r) => r.id && r.at)).toBe(true);
  });

  test("a line that will not parse is skipped rather than failing the read", () => {
    const log = logFile();
    recordJudgement(row(), log);
    Bun.write(log, readFileSync(log, "utf8") + "{not json\n");
    expect(readJudgements(log)).toHaveLength(1);
  });

  test("a run of passes lands in one write", () => {
    const log = logFile();
    const rows = recordJudgements([row(), row({ pass: 2 }), row({ pass: 3 })], log);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
    expect(readJudgements(log)).toHaveLength(3);
  });

  test("an empty write touches nothing", () => {
    const log = logFile();
    expect(recordJudgements([], log)).toEqual([]);
    expect(readJudgements(log)).toEqual([]);
  });

  test("the experiments and the arms already ruled on come back off the log", () => {
    const log = logFile();
    recordJudgements([row(), row({ pass: 2 }), row({ experiment: "e2", arm: "pres", ours: "pres1" })], log);
    const rows = readJudgements(log);
    // the two experiments land in the same second here, so compare as a set rather than on the newest-first order
    expect(experiments(rows).map((e) => `${e.id}:${e.passes}`).sort()).toEqual(["e1:2", "e2:1"]);
    expect(ruledOn(rows)).toEqual(["cut", "pres"]);
  });
});
