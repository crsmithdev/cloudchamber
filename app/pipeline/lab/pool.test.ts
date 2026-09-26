import { describe, expect, test } from "bun:test";
import { GAP_MARGIN, anchoredOn, floorPairs, fmt2, pool, scoreGap, verdict, type Run, type Verdict } from "./pool.ts";
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
