import { describe, expect, test } from "bun:test";
import { GAP_MARGIN, anchoredOn, armPool, floorPairs, fmt2, pool, scoreGap, verdict, type Run, type Verdict } from "./pool.ts";
import { pairRuns, readJudgements } from "./log.ts";
import { join } from "node:path";
import fixture from "./pool.fixture.json";

/**
 * The passes of the three judged runs of 23 September, reduced to what pooling
 * reads. They are the only copy of those runs inside the repository: the
 * originals sit in a scratch directory under `~/.cloudchamber/ab/`, which
 * nothing backs up, and the write-ups in `evals/` quote the pooled numbers but
 * not the passes under them.
 *
 * `evals/tally.py` was the reference implementation. Every share below was read
 * off it against the same files on 2026-09-24.
 */
const runs = (key: string): Run[] => (fixture as Record<string, Run[]>)[key]!;

describe("pooling a panel, against tally.py", () => {
  test.each([
    ["register-cut", 0.39, 0.29, "inside the floor, so this says nothing yet"],
    ["caps-ablation", 0.19, 0.52, "falls below the floor: the change loses"],
    ["presence", 0.39, 0.62, "falls below the floor: the change loses"],
  ] as [string, number, number, Verdict][])("%s pools to %p against a floor of %p", (name, share, floor, said) => {
    const c = pool(runs(`${name}/comparison`));
    const f = pool(runs(`${name}/floor`));
    expect(fmt2(c.share)).toBe(share.toFixed(2));
    expect(fmt2(f.share)).toBe(floor.toFixed(2));
    expect(verdict(c.share, f.share)).toBe(said);
  });

  test("a judge's weight is how little it follows the reading order, and a judge that always follows counts for nothing", () => {
    const p = pool(runs("presence/comparison"));
    const glm = p.judges.find((j) => j.model.includes("glm"))!;
    // glm took the story it read first in all twelve of its passes on this run
    expect(glm.followRate).toBe(1);
    expect(glm.weight).toBe(0);
    expect(glm.wonSecond).toBe(0);
    // so its 6 wins do not move the share; the two judges that sometimes looked past the order decide it
    expect(p.judges.map((j) => j.weight)).toEqual([0.17, 0.33, 0]);
    expect(p.passes).toBe(36);
  });

  test("the floor of 23 September was thin where it was judged thin", () => {
    // the presence floor ran two judges over one pair, and one of them followed the order every time
    const f = pool(runs("presence/floor"));
    expect(f.passes).toBe(8);
    expect(f.judges).toHaveLength(2);
    expect(f.judges.filter((j) => j.weight === 0)).toHaveLength(1);
  });

  test("the axis means come back per side", () => {
    const s = pool(runs("caps-ablation/comparison")).scores;
    // the caps ablation's finding: the ending axis fell although the last beat got more words
    expect(s.ending!.ours).toBeLessThan(s.ending!.source);
    expect(s.ending!.n).toBeGreaterThan(30);
  });
});

describe("the floor is built from every pairing of an arm", () => {
  test("three drafts make three pairs, and none is the anchor of all of them", () => {
    expect(floorPairs(["a", "b", "c"])).toEqual([["a", "b"], ["a", "c"], ["b", "c"]]);
    expect(anchoredOn(floorPairs(["a", "b", "c"]))).toBeNull();
  });

  test("the shape 23 September used is refused: both pairs hang off one draft", () => {
    // evals/20260923-register-cut.md: cut1 v cut2 and cut1 v cut3, and cut1 was the weakest of the three
    expect(anchoredOn([["cut1", "cut2"], ["cut1", "cut3"]])).toBe("cut1");
  });

  test("a floor needs at least two drafts", () => {
    expect(() => floorPairs(["only"])).toThrow(/at least two drafts/);
  });
});

describe("reading a share against a floor", () => {
  test("the margin is greater than a tenth, in either direction", () => {
    expect(verdict(0.65, 0.5)).toBe("clears the floor");
    expect(verdict(0.35, 0.5)).toBe("falls below the floor: the change loses");
  });

  test("the verdict reads the raw shares, and a gap near a tenth turns on digits a printed number has lost", () => {
    // the register cut printed 0.39 against 0.29 and was reported inside the floor; its raw gap is under a tenth
    const c = pool(runs("register-cut/comparison")).share, f = pool(runs("register-cut/floor")).share;
    expect(verdict(c, f)).toBe("inside the floor, so this says nothing yet");
    // the same two numbers as printed sit the other side of the threshold, because 0.39 - 0.29 is over 0.1 in binary
    expect(verdict(0.39, 0.29)).toBe("clears the floor");
  });

  test("two places, rounding a half to the even digit as tally.py prints it", () => {
    expect(fmt2(0.625)).toBe("0.62");
    expect(fmt2(0.635)).toBe("0.64");
    expect(fmt2(0.39)).toBe("0.39");
    expect(fmt2(NaN)).toBe("NaN");
  });
});

describe("the score gap", () => {
  const { readJudgements, asRuns } = require("./log.ts");
  const logged = readJudgements(require("node:path").join(import.meta.dir, "../../../bank/judgements.jsonl"))
    .filter((r: any) => ["20260924-register-cut-x24", "20260924-l2-floor-cut2-cut3-x24"].includes(r.experiment));
  const pair = (a: string, b: string, maxPass = 24, minPass = 1) =>
    scoreGap(asRuns(logged.filter((r: any) => r.ours === a && r.source === b && r.pass >= minPass && r.pass <= maxPass)));

  test("reads the register cut's pairs at 24 passes a judge", () => {
    expect(fmt2(pair("cut2", "cut3").gap)).toBe("0.07");
    expect(fmt2(pair("cut1", "cut2").gap)).toBe("-0.22");
    expect(fmt2(pair("cut1", "cut3").gap)).toBe("-0.39");
    expect(fmt2(pair("cut1", "fix1").gap)).toBe("-0.40");
    expect(fmt2(pair("cut2", "fix2").gap)).toBe("0.03");
    expect(fmt2(pair("cut3", "fix3").gap)).toBe("-0.28");
  });

  test("four passes a judge land on the same side of the margin as 24, where the overall call did not", () => {
    for (const [a, b] of [["cut1", "cut3"], ["cut1", "fix1"], ["cut3", "fix3"]]) {
      for (let i = 0; i < 6; i++) expect(pair(a!, b!, i * 4 + 4, i * 4 + 1).gap).toBeLessThan(-GAP_MARGIN);
    }
    // the pair the overall call read as 0.19 at four passes is inside the margin at four
    expect(Math.abs(pair("cut2", "cut3", 4).gap)).toBeLessThan(GAP_MARGIN);
  });
});

describe("arm pooling of stored runs", () => {
  const allRows = readJudgements(join(import.meta.dir, "../../../bank/judgements.jsonl"));

  test("register-cut-x24 re-pools to its published numbers", () => {
    const rows = allRows.filter((r) => ["20260924-register-cut-x24", "20260924-l2-floor-cut2-cut3-x24"].includes(r.experiment));
    const compPairs = [["cut1", "fix1"], ["cut2", "fix2"], ["cut3", "fix3"]].map(([ours, source]) => ({
      ours: ours!, source: source!, runs: pairRuns(rows, ours!, source!),
    }));
    const floorPairsList = [["cut1", "cut2"], ["cut1", "cut3"], ["cut2", "cut3"]].map(([a, b]) => ({
      a: a!, b: b!, runs: pairRuns(rows, a!, b!),
    }));

    const result = armPool(compPairs, floorPairsList);

    // Published overall comparison numbers
    expect(fmt2(result.share)).toBe("0.35");
    expect(fmt2(result.gap)).toBe("-0.22");
    expect(result.passes).toBe(211);
    expect(result.lands).toBe(false);
    expect(result.verdict).toBe("falls below -GAP_MARGIN: the change loses");

    // Published matched pair numbers
    const p1 = result.pairs.find((p) => p.ours === "cut1" && p.source === "fix1")!;
    expect(fmt2(p1.share)).toBe("0.19");
    expect(fmt2(p1.gap)).toBe("-0.40");

    const p2 = result.pairs.find((p) => p.ours === "cut2" && p.source === "fix2")!;
    expect(fmt2(p2.share)).toBe("0.65");
    expect(fmt2(p2.gap)).toBe("0.03");

    const p3 = result.pairs.find((p) => p.ours === "cut3" && p.source === "fix3")!;
    expect(fmt2(p3.share)).toBe("0.22");
    expect(fmt2(p3.gap)).toBe("-0.28");

    // Published floor numbers
    expect(result.floor).toBeDefined();
    expect(fmt2(result.floor!.meanDistance)).toBe("0.16");
    expect(fmt2(result.floor!.meanGap)).toBe("0.23");

    const f12 = result.floor!.pairs.find((f) => f.a === "cut1" && f.b === "cut2")!;
    expect(fmt2(f12.share)).toBe("0.33");
    expect(fmt2(f12.gap)).toBe("-0.22");

    const f13 = result.floor!.pairs.find((f) => f.a === "cut1" && f.b === "cut3")!;
    expect(fmt2(f13.share)).toBe("0.23");
    expect(fmt2(f13.gap)).toBe("-0.39");

    const f23 = result.floor!.pairs.find((f) => f.a === "cut2" && f.b === "cut3")!;
    expect(fmt2(f23.share)).toBe("0.55");
    expect(fmt2(f23.gap)).toBe("0.07");
  });

  test("vof-before-after re-pools to its published numbers", () => {
    const rows = allRows.filter((r) => r.experiment === "20260924-vof-before-after");
    const oldPairs = [
      ["20260920010309-f8ab", "vs-hIS0zHK8"],
      ["20260920142033-d83e", "vs-hIS0zHK8"],
      ["20260920224712-7797", "vs-hIS0zHK8"],
      ["20260921145735-c933", "vs-hIS0zHK8"],
    ].map(([ours, source]) => ({ ours: ours!, source: source!, runs: pairRuns(rows, ours!, source!) }));

    const newPairs = [
      ["20260924223235-d0fd", "vs-hIS0zHK8"],
      ["20260924223235-3cee", "vs-hIS0zHK8"],
      ["20260924223235-b7e7", "vs-hIS0zHK8"],
      ["20260924223235-686f", "vs-hIS0zHK8"],
    ].map(([ours, source]) => ({ ours: ours!, source: source!, runs: pairRuns(rows, ours!, source!) }));

    const oldResult = armPool(oldPairs);
    const newResult = armPool(newPairs);

    // Old pairs
    expect(fmt2(oldResult.pairs[0]!.gap)).toBe("0.31");
    expect(fmt2(oldResult.pairs[1]!.gap)).toBe("0.54");
    expect(fmt2(oldResult.pairs[2]!.gap)).toBe("0.73");
    expect(fmt2(oldResult.pairs[3]!.gap)).toBe("0.10");
    expect(fmt2(oldResult.gap)).toBe("0.42");

    // New pairs
    expect(fmt2(newResult.pairs[0]!.gap)).toBe("0.09");
    expect(fmt2(newResult.pairs[1]!.gap)).toBe("0.44");
    expect(fmt2(newResult.pairs[2]!.gap)).toBe("0.67");
    expect(fmt2(newResult.pairs[3]!.gap)).toBe("0.09");
    expect(fmt2(newResult.gap)).toBe("0.32");

    // Mean change
    expect(fmt2(newResult.gap - oldResult.gap)).toBe("-0.10");
  });

  test("tc-vs-vox-mortis re-pools to its published numbers", () => {
    const rows = allRows.filter((r) => r.experiment === "20260924-tc-vs-vox-mortis");
    const tcPairs = [
      ["20260924224048-f20a", "N3-KWeuzKko"],
      ["20260924224759-9c02", "N3-KWeuzKko"],
      ["20260924224759-9c02", "n6Oe2iRVRnA"],
      ["20260924225119-de03", "N3-KWeuzKko"],
    ].map(([ours, source]) => ({ ours: ours!, source: source!, runs: pairRuns(rows, ours!, source!) }));

    const result = armPool(tcPairs);

    expect(fmt2(result.pairs[0]!.gap)).toBe("2.58");
    expect(fmt2(result.pairs[1]!.gap)).toBe("2.70");
    expect(fmt2(result.pairs[2]!.gap)).toBe("2.76");
    expect(fmt2(result.pairs[3]!.gap)).toBe("2.60");
  });
});


describe("armPool with nothing to read", () => {
  test("no complete pass is its own verdict, and does not land", () => {
    const r = armPool([{ ours: "a", source: "b", runs: [] }]);
    expect(r.verdict).toBe("no complete passes");
    expect(r.lands).toBe(false);
  });
});
