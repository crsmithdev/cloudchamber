import { describe, expect, test } from "bun:test";
import { drawNames, nextName, seedSlug } from "./names.ts";

describe("draw names", () => {
  test("three salient seed words, in order", () => {
    expect(seedSlug("Survivors bury their guilt under concrete and amnestics, but the buried thing stays alive.")).toBe("survivors-guilt-concrete");
    expect(seedSlug("A weapon forged from stolen children answers only the man who built it.")).toBe("weapon-forged-stolen");
  });
  test("short seeds still get a name", () => {
    expect(seedSlug("The fog")).toBe("the-fog");
    expect(seedSlug("")).toBe("untitled");
  });
  test("the next name takes the first free suffix and never reuses one", () => {
    const seed = "A weapon forged from stolen children answers only the man who built it.";
    expect(nextName([], seed)).toBe("weapon-forged-stolen");
    expect(nextName(["weapon-forged-stolen"], seed)).toBe("weapon-forged-stolen-2");
    expect(nextName(["weapon-forged-stolen", "weapon-forged-stolen-2"], seed)).toBe("weapon-forged-stolen-3");
    // a gap left by a name that is no longer in the list is not filled again
    expect(nextName(["weapon-forged-stolen-5"], seed)).toBe("weapon-forged-stolen-6");
    // and another seed's names are none of its business
    expect(nextName(["the-fog", "the-fog-2"], seed)).toBe("weapon-forged-stolen");
  });

  test("draws sharing a seed are numbered by creation", () => {
    const names = drawNames([
      { id: "c", seed_text: "Survivors bury their guilt under concrete.", created_at: "2026-09-05T03:00:00Z" },
      { id: "a", seed_text: "Survivors bury their guilt under concrete.", created_at: "2026-09-05T01:00:00Z" },
      { id: "b", seed_text: "Another seed entirely, about fog.", created_at: "2026-09-05T02:00:00Z" },
    ]);
    expect(names.get("a")).toBe("survivors-guilt-concrete");
    expect(names.get("c")).toBe("survivors-guilt-concrete-2");
    expect(names.get("b")).toBe("another-entirely");
  });
});
