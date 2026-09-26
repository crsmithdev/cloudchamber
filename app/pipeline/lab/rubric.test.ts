import { describe, expect, test } from "bun:test";
import { RUBRIC, complete, followedOrder, judgePrompt, parseVerdict, side } from "./rubric.ts";
import { AXES } from "./pool.ts";
import fixture from "./rubric.fixture.json";

/**
 * Ten real replies from the three judges of 22–23 September, one per family per
 * reading order, with what `judge.py` read out of each. The whole set of 252 was
 * re-parsed against `judge.py` on 2026-09-24 with no disagreement on any axis,
 * score, overall, completeness, why or needs; these ten hold that in the suite.
 */
type Fix = { model: string; flipped: boolean; raw: string; expect: { axes: Record<string, string>; scores: Record<string, { ours: number; source: number }>; overall: string; complete: boolean; whys: string[]; needs: string } };
const replies = fixture as Fix[];

describe("reading a judge's reply, against judge.py", () => {
  test("ten real replies parse to what judge.py read out of them", () => {
    expect(replies).toHaveLength(10);
    for (const r of replies) {
      const got = parseVerdict(r.raw, r.flipped);
      expect(got.axes).toEqual(r.expect.axes as any);
      expect(got.scores).toEqual(r.expect.scores as any);
      expect(got.overall).toBe(r.expect.overall as any);
      expect(got.whys).toEqual(r.expect.whys);
      expect(got.needs).toBe(r.expect.needs);
      expect(complete(got)).toBe(r.expect.complete);
    }
  });

  test("both reading orders are covered, and all three judge families", () => {
    expect(new Set(replies.map((r) => r.flipped))).toEqual(new Set([true, false]));
    expect(new Set(replies.map((r) => r.model.split("/")[0]))).toEqual(new Set(["google", "openai", "z-ai"]));
  });
});

describe("the reading order is undone on the way in", () => {
  test("One is ours when the order held, and the source when it was flipped", () => {
    expect(side("One", false)).toBe("ours");
    expect(side("Two", false)).toBe("source");
    expect(side("One", true)).toBe("source");
    expect(side("Two", true)).toBe("ours");
    expect(side("Tie", false)).toBe("tie");
    expect(side("tie", true)).toBe("tie");
  });

  test("a flipped pass swaps the per-axis scores with the answer", () => {
    const raw = `<verdict><axis name="hook" one="2" two="5">Two</axis><overall>Two</overall></verdict>`;
    expect(parseVerdict(raw, false).scores.hook).toEqual({ ours: 2, source: 5 });
    expect(parseVerdict(raw, true).scores.hook).toEqual({ ours: 5, source: 2 });
  });

  test("a pass that took the story it read first is marked either way round", () => {
    expect(followedOrder("ours", false)).toBe(true);
    expect(followedOrder("source", true)).toBe(true);
    expect(followedOrder("source", false)).toBe(false);
    expect(followedOrder("tie", false)).toBe(false);
  });
});

describe("an incomplete reply is a failed call, not a verdict", () => {
  test("a reply cut off before every axis is answered is not complete", () => {
    const short = `<verdict><axis name="hook" one="3" two="4">One</axis><overall>One</overall>`;
    const got = parseVerdict(short, false);
    expect(Object.keys(got.axes)).toHaveLength(1);
    expect(complete(got)).toBe(false);
  });

  test("every axis but no overall is not complete either", () => {
    const noOverall = AXES.map((a) => `<axis name="${a}" one="3" two="3">Tie</axis>`).join("");
    expect(complete(parseVerdict(noOverall, false))).toBe(false);
  });

  test("every axis and an overall is complete", () => {
    const full = AXES.map((a) => `<axis name="${a}" one="3" two="4">Two</axis>`).join("") + "<overall>Two</overall>";
    expect(complete(parseVerdict(full, false))).toBe(true);
  });
});

describe("the ask is the one the stored passes were judged under", () => {
  test("eight axes, in the rubric's order", () => {
    expect(RUBRIC.map(([k]) => k)).toEqual([...AXES]);
  });

  test("the prompt carries both stories unlabelled and asks for the shape the parser reads", () => {
    const p = judgePrompt("STORY ALPHA", "STORY BETA");
    expect(p).toContain("<story_one>\nSTORY ALPHA\n</story_one>");
    expect(p).toContain("<story_two>\nSTORY BETA\n</story_two>");
    expect(p).not.toMatch(/\bours\b|\bmine\b|\bbaseline\b/);
    for (const [k, q] of RUBRIC) expect(p).toContain(`${k}: ${q}`);
    expect(p).toContain(`<axis name="hook" one="N" two="N">One|Two|Tie</axis>`);
  });
});
