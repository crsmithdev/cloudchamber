import { describe, expect, test } from "bun:test";
import { loadDraftConfig } from "../draftconfig.ts";
import { parseSchedule } from "../write.ts";
import { lintS1, parseWhen, readsEarlier } from "./s1.ts";

const cfg = loadDraftConfig().config;

/**
 * A minimal schedule: the beats under test, then neutral filler beats up to 8
 * (`loadDraftConfig`'s defaults ask 5..10 beats of 400-800 words summing to
 * 5000 +/-20%, so 8 beats of 625 is the one count that always fits).
 */
function schedule(beats: { when?: string; withheld?: string; uses?: string }[], chronology = "linear") {
  const padded: typeof beats = [...beats, ...Array.from({ length: Math.max(0, 8 - beats.length) }, () => ({}))];
  const text = `<form>tense: past\nperson: first\nchronology: ${chronology}\ncontainer: prose</form>` + padded.map((b, i) => {
    const n = i + 1;
    return `<beat n="${n}" words="625"><job>Beat ${n}.</job>${b.when ? `<when>${b.when}</when>` : ""}<known>Thing ${n}.</known><withheld>${b.withheld ?? "none"}</withheld><stakes>x</stakes><absorbs>none</absorbs>${b.uses ? `<uses>${b.uses}</uses>` : ""}</beat>`;
  }).join("");
  return parseSchedule(text, cfg);
}

describe("parseWhen", () => {
  test("reads a day number from a digit or an ordinal word", () => {
    expect(parseWhen("Day 31, 3 April, 1400").day).toBe(31);
    expect(parseWhen("Ninth day, 11 March 1911, morning session").day).toBe(9);
    expect(parseWhen("Eleventh day, 14 March, eleventh hour, eighteen minutes").day).toEqual(11);
  });

  test("reads a date and a year", () => {
    expect(parseWhen("Ninth day, 11 March 1911, morning session").date).toEqual({ day: 11, month: 3 });
    expect(parseWhen("Ninth day, 11 March 1911, morning session").year).toBe(1911);
    expect(parseWhen("March 11, 1911").date).toEqual({ day: 11, month: 3 });
  });

  test("reads an hour from digits or an ordinal", () => {
    expect(parseWhen("Eleventh day, 14 March, eleventh hour").hour).toBe(11);
    expect(parseWhen("Day 31, 3 April, 1400").hour).toBe(14);
  });

  // 69c0 (1 Oct): a linear schedule counted on wristwatches, "hour zero to hour sixty-one"
  test("reads the story's hour count after `hour`, in digits or in words, apart from the clock hour", () => {
    expect(parseWhen("Hour sixty-one, day three, late in the second light")).toMatchObject({ elapsed: 61, day: 3, hour: null });
    expect(parseWhen("Hour zero, 13:52, 2 September 2019")).toMatchObject({ elapsed: 0, day: null, hour: 13, year: 2019 });
    expect(parseWhen("Day one, hours zero to three").elapsed).toBe(0);
    expect(parseWhen("Day three, about hour thirty-four").elapsed).toBe(34);
    expect(parseWhen("Day two, hour 20, four miles out").elapsed).toBe(20);
    // a duration is not a count, and neither is the clock
    expect(parseWhen("Day one into day two, through the nine-hour night").elapsed).toBeNull();
    expect(parseWhen("Later the same light, two hours out").elapsed).toBeNull();
    expect(parseWhen("Day 31, 3 April, 1400").elapsed).toBeNull();
  });

  test("a field the text does not state is null, independently of the others", () => {
    const w = parseWhen("late September 2026, with the pipes going");
    expect(w.day).toBeNull();
    expect(w.date).toBeNull();
    expect(w.year).toBe(2026);
  });

  // S1′ (§14.5): the bugs the stored run showed
  test("a hyphenated ordinal is read whole, not as its tail", () => {
    expect(parseWhen("12 September, fifty-second day of scream, evening").day).toBe(52);
    expect(parseWhen("5 September, the forty-eighth day").day).toBe(48);
    expect(parseWhen("12 October, seventy-third day, evening feeding hour").day).toBe(73);
  });

  test("a day count written as a word after `day` is read", () => {
    expect(parseWhen("day ten, and the eleventh day up to the tenth hour").day).toBe(10);
    expect(parseWhen("1–2 August, days one and two").day).toBe(1);
  });

  test("`Year N` is the story's own era, apart from a calendar year", () => {
    const w = parseWhen("Year 400, Day 40");
    expect(w.era).toBe(400);
    expect(w.day).toBe(40);
    expect(w.year).toBeNull();
    expect(w.hour).toBeNull();
  });

  test("an ISO date is a date and a year", () => {
    const w = parseWhen("1911-03-14 eleventh hour");
    expect(w.date).toEqual({ day: 14, month: 3 });
    expect(w.year).toBe(1911);
    expect(w.hour).toBe(11);
  });

  test("the year is not read as an hour, and a day number is not either", () => {
    expect(parseWhen("Ninth day, 11 March 1911, morning session").hour).toBeNull();
    expect(parseWhen("Year 399, Day 319").hour).toBeNull();
  });

  test("a range takes its first value", () => {
    expect(parseWhen("Days 5–11, the basement").day).toBe(5);
    expect(parseWhen("Tenth day into eleventh, 12–14 March, before the eleventh hour").date).toEqual({ day: 12, month: 3 });
  });
});

describe("readsEarlier", () => {
  test("a day number is never compared to a date", () => {
    expect(readsEarlier(parseWhen("3 March 1911, sixth hour"), parseWhen("Ninth day"))).toBeNull();
  });

  test("the era orders day numbers across it", () => {
    expect(readsEarlier(parseWhen("Year 399, Day 319"), parseWhen("Year 400, Day 40"))).toBe(false);
    expect(readsEarlier(parseWhen("Year 400, Day 40"), parseWhen("Year 399, Day 319"))).toBe(true);
  });

  test("a date with a year and one without compare within the year", () => {
    expect(readsEarlier(parseWhen("3 March 1911, sixth hour"), parseWhen("First day, 3 March, afternoon"))).toBe(false);
  });

  test("the story's hour count orders beats on one day, and across a beat that names no day", () => {
    expect(readsEarlier(parseWhen("Day one, hour seven, 20:52"), parseWhen("Day one, hour three, 16:52"))).toBe(true);
    expect(readsEarlier(parseWhen("Day one, hour three"), parseWhen("Day one, hour seven"))).toBe(false);
    expect(readsEarlier(parseWhen("Hour sixty-one, day three"), parseWhen("Hour zero, 13:52, 2 September 2019"))).toBe(true);
    // the day decides before the hour count, and the clock hour decides nothing
    expect(readsEarlier(parseWhen("Day two, hour nineteen"), parseWhen("Day three, hour four"))).toBe(false);
    expect(readsEarlier(parseWhen("Day 4, 11:40 on the plain"), parseWhen("Day 4, 09:12 Montréal time"))).toBe(false);
  });
});

describe("lintS1: the 08aa opening, and one offset per schedule", () => {
  test("08aa: beat 2 (3 March, no day number) is flagged against beat 1 (ninth day, 11 March), not beat 3 against beat 2", () => {
    const s = schedule([{ when: "Ninth day, 11 March 1911, morning session" }, { when: "3 March 1911, sixth hour" }, { when: "First day, 3 March, afternoon" }]);
    const f = lintS1(s).filter((x) => x.check === "monotonic");
    expect(f).toHaveLength(1);
    expect(f[0]!.beat).toBe(2);
  });

  test("beats that put day 1 on different dates raise one offset finding naming both groups", () => {
    const s = schedule([{ when: "Second day, 4 March" }, { when: "Third day, 5 March" }, { when: "Fourth day, 7 March" }, { when: "Fifth day, 8 March" }]);
    const f = lintS1(s).filter((x) => x.check === "offset");
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain("beats 1, 2 put day 1 on 3 March");
    expect(f[0]!.message).toContain("beats 3, 4 put day 1 on 4 March");
  });

  test("a beat that names two day numbers or two dates is not used for the offset", () => {
    expect(parseWhen("Logged day 31 morning; events of day 1, 4 March, 0917–1340").mentions).toEqual({ days: 2, dates: 1 });
    expect(parseWhen("Second to fifth day, 4–7 March").day).toBe(2);
    const s = schedule([{ when: "Day 31, 3 April, 0600" }, { when: "Logged day 31 morning; events of day 1, 4 March, 0917–1340" }]);
    expect(lintS1(s).filter((x) => x.check === "offset")).toHaveLength(0);
  });

  test("a schedule with one offset raises nothing", () => {
    const s = schedule([{ when: "Day 1, 3 March" }, { when: "Day 4, 6 March" }]);
    expect(lintS1(s).filter((x) => x.check === "offset")).toHaveLength(0);
  });
});

describe("lintS1: monotonic when under linear", () => {
  test("flags a beat that reads earlier in the story than the beat before it, under linear", () => {
    const s = schedule([{ when: "Ninth day, 3 March 1911" }, { when: "First day, 3 March 1911" }, { when: "Second day, 4 March 1911" }]);
    const findings = lintS1(s);
    expect(findings.filter((f) => f.check === "monotonic")).toHaveLength(1);
    expect(findings.find((f) => f.check === "monotonic")!.beat).toBe(2);
  });

  test("the same schedule under nonlinear raises nothing: a flashback is allowed", () => {
    const s = schedule([{ when: "Ninth day, 3 March 1911" }, { when: "First day, 3 March 1911" }], "nonlinear");
    expect(lintS1(s).filter((f) => f.check === "monotonic")).toHaveLength(0);
  });

  test("a non-decreasing schedule under linear raises nothing", () => {
    const s = schedule([{ when: "Day 1, 3 March" }, { when: "Day 1, 3 March" }, { when: "Day 4, 6 March" }]);
    expect(lintS1(s).filter((f) => f.check === "monotonic")).toHaveLength(0);
  });

  test("69c0: a linear schedule that opens at hour sixty-one and goes back to hour zero is flagged on the beat that goes back", () => {
    const s = schedule([
      { when: "Hour sixty-one, day three, late in the second light" }, { when: "Hour zero, 13:52, 2 September 2019" },
      { when: "Hour three, 16:52, day one" }, { when: "Hour seven, 20:52, day one" }, { when: "Hours nineteen to twenty, day two" },
    ]);
    const monotonic = lintS1(s).filter((f) => f.check === "monotonic");
    expect(monotonic.map((f) => f.beat)).toEqual([2]);
    expect(monotonic[0]!.message).toMatch(/beat 2 \("Hour zero.*reads earlier in the story than beat 1/);
  });
});

describe("lintS1: withheld consistency", () => {
  test("the same item given a different `until` in different beats is flagged", () => {
    const s = schedule([{ withheld: "the smear on plate seventeen — beat 4" }, { withheld: "the smear on plate seventeen — beat 5" }, { withheld: "none" }, { withheld: "none" }, { withheld: "none" }]);
    const f = lintS1(s).filter((x) => x.check === "withheld");
    expect(f.some((x) => /different `until`/.test(x.message))).toBe(true);
  });

  test("an item whose `until` moves is one finding, on the beat that moved it", () => {
    const s = schedule([
      { withheld: "the cost — beat 2" },
      { withheld: "the cost — beat 3" },
      { withheld: "none" },
    ]);
    const f = lintS1(s).filter((x) => x.check === "withheld");
    expect(f).toHaveLength(1);
    expect(f[0]!.beat).toBe(2);
    expect(f[0]!.message).toContain("beat 1 says 2; beat 2 says 3");
  });

  test("an item still listed withheld at or after its own reveal beat is one finding", () => {
    const s = schedule([{ withheld: "the cost — beat 2" }, { withheld: "the cost — beat 2" }, { withheld: "none" }]);
    const f = lintS1(s).filter((x) => x.check === "withheld");
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain("was due at beat 2 but beat 2 still lists it withheld");
  });

  test("08aa's one withheld defect, listed by eleven beats, is one finding", () => {
    const s = schedule([...Array.from({ length: 7 }, () => ({ withheld: "what comes up the stair — beat 8" })), { withheld: "what comes up the stair — never" }]);
    expect(lintS1(s).filter((x) => x.check === "withheld")).toHaveLength(1);
  });

  test("consistent withheld items raise nothing", () => {
    const s = schedule([{ withheld: "the cost — beat 3" }, { withheld: "the cost — beat 3" }, { withheld: "none" }]);
    expect(lintS1(s).filter((x) => x.check === "withheld")).toHaveLength(0);
  });
});

