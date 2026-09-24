import { describe, expect, test } from "bun:test";
import { beatPasses, sharedBeats, whyNotL1, type BeatText } from "./beats.ts";

const beat = (drawId: string, n: number, job: string, last = 3): BeatText =>
  ({ drawId, n, last, plan: { n, job, known: "k", stakes: "s" }, text: `${drawId} beat ${n}`, soFar: "" });

const pinned = (id: string, last = 3) => [beat(id, 1, "open", last), beat(id, 2, "turn", last), beat(id, 3, "pay", last)];

describe("a beat pair needs one schedule", () => {
  test("two drafts branched from one schedule share every beat", () => {
    const shared = sharedBeats(pinned("a"), pinned("b"));
    expect(shared.map((s) => s.n)).toEqual([1, 2, 3]);
    expect(whyNotL1(pinned("a"), pinned("b"))).toBeNull();
  });

  test("two drafts that each derived their own schedule share nothing, and are refused", () => {
    const other = [beat("b", 1, "a different opening"), beat("b", 2, "somewhere else"), beat("b", 3, "another cost")];
    expect(sharedBeats(pinned("a"), other)).toEqual([]);
    expect(whyNotL1(pinned("a"), other)).toMatch(/share no beat with the same plan/);
  });

  test("a partial overlap is refused too, and says how many matched", () => {
    const half = [beat("b", 1, "open"), beat("b", 2, "elsewhere"), beat("b", 3, "pay")];
    expect(whyNotL1(pinned("a"), half)).toMatch(/only 2 of 3 beats share a plan/);
  });

  test("different beat counts are refused before the plans are compared", () => {
    expect(whyNotL1(pinned("a", 3), pinned("b", 4).slice(0, 3).map((x) => ({ ...x, last: 4 })))).toMatch(/different schedules: 3 beats against 4/);
  });

  test("an empty draft is refused", () => {
    expect(whyNotL1([], pinned("b"))).toMatch(/no scenes/);
  });
});

describe("the passes a beat pair runs", () => {
  test("every judge, both orders, named so a result reads back to its beat", () => {
    const pair = sharedBeats(pinned("a"), pinned("b"))[1]!;
    const asks = beatPasses(pair, ["google/gemini-3.1-pro-preview", "z-ai/glm-4.7"], 4);
    expect(asks).toHaveLength(8);
    expect(asks.filter((x) => x.flipped)).toHaveLength(4);
    expect(new Set(asks.map((x) => x.judge)).size).toBe(2);
    expect(asks[0]!.ours).toBe("a#2");
    expect(asks[0]!.source).toBe("b#2");
  });

  test("the reading order alternates so half of each judge's passes read ours second", () => {
    const pair = sharedBeats(pinned("a"), pinned("b"))[0]!;
    const asks = beatPasses(pair, ["one"], 4);
    expect(asks.map((x) => x.flipped)).toEqual([false, true, false, true]);
  });
});
