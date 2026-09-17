import { describe, expect, test } from "bun:test";
import { applyPatches, repairPlan } from "./repair.ts";

const f = (span: string, patch = "", invalidates = "none", id = span.slice(0, 6)) => ({ id, span, patch, invalidates, replacement: `${span} holds.` });

describe("patching a brief in place", () => {
  const text = "The director fires the reliquary at dawn.\nThe twelfth relic, the Verona clavicle, is dry.";

  test("a patched span is substituted and reported", () => {
    const r = applyPatches(text, [f("the Verona clavicle", "the Bruges clavicle")]);
    expect(r.text).toContain("the Bruges clavicle");
    expect(r.text).not.toContain("Verona");
    expect(r.applied.map((x) => x.span)).toEqual(["the Verona clavicle"]);
  });

  test("a span broken across a line break still lands", () => {
    const r = applyPatches("the relic is\n   dry today", [f("the relic is dry", "the relic is wet")]);
    expect(r.text).toBe("the relic is wet today");
  });

  test("a finding with no patch changes nothing", () => {
    const r = applyPatches(text, [f("the Verona clavicle")]);
    expect(r.text).toBe(text);
    expect(r.applied).toEqual([]);
  });

  test("a span that is not there changes nothing", () => {
    const r = applyPatches(text, [f("a span from another brief", "something else")]);
    expect(r.text).toBe(text);
    expect(r.applied).toEqual([]);
  });

  test("several patches apply in order", () => {
    const r = applyPatches(text, [f("at dawn", "at noon"), f("is dry", "is wet")]);
    expect(r.text).toContain("at noon");
    expect(r.text).toContain("is wet");
    expect(r.applied).toHaveLength(2);
  });

  test("the plan only regenerates the parts a patch cannot reach", () => {
    const vignette = "The director fires the reliquary.";
    const ending = "The count closes.";
    const contexts = ["Context one holds the silk.", "Context two holds the relic."];
    // every finding patchable: nothing is regenerated
    expect(repairPlan([f("fires the reliquary", "hands over the reliquary")], vignette, ending, contexts))
      .toEqual({ vignette: false, ending: false, context: [false, false] });
    // the same finding without a patch: the part it lands in is rewritten
    expect(repairPlan([f("fires the reliquary")], vignette, ending, contexts))
      .toEqual({ vignette: true, ending: false, context: [false, false] });
    expect(repairPlan([f("holds the silk")], vignette, ending, contexts))
      .toEqual({ vignette: false, ending: false, context: [true, false] });
    // arithmetic moves the mechanism, so an unpatched one re-derives the ending wherever it sits
    expect(repairPlan([f("holds the silk", "", "arithmetic")], vignette, ending, contexts).ending).toBe(true);
    expect(repairPlan([f("holds the silk", "holds the linen", "arithmetic")], vignette, ending, contexts).ending).toBe(false);
  });

  test("a patch whose span the text does not hold word for word is rewritten, not dropped", () => {
    const vignette = "She said, “Hold the reliquary” and left.";
    // the checker quoted straight quotes; the prose has curly ones, so the quote matches loosely and the substitution misses
    const miss = f(`said, "Hold the reliquary"`, `said, "Burn the reliquary"`);
    expect(applyPatches(vignette, [miss]).applied).toEqual([]);
    expect(repairPlan([miss], vignette, "The count closes.", []).vignette).toBe(true);
    expect(repairPlan([f(`said, "Hold the reliquary"`, "x", "arithmetic")], vignette, "The count closes.", []).ending).toBe(true);
  });
});
