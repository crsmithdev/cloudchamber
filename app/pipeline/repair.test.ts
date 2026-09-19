import { describe, expect, test } from "bun:test";
import { applyPatches, place } from "./repair.ts";

const f = (span: string, patch = "", invalidates = "none", id = span.slice(0, 6)) => ({ id, span, statement: `${span} is wrong.`, result: "", patch, invalidates, replacement: `${span} holds.` });

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

  test("a fix is placed once: patched where its span is, a constraint on the passage it lands in, a rewrite only where a patch cannot reach", () => {
    const passages = [
      { role: "vignette" as const, text: "The director fires the reliquary." },
      { role: "ending" as const, text: "The count closes." },
      { role: "context" as const, text: "Context one holds the silk." },
      { role: "context" as const, text: "Context two holds the relic." },
    ];
    const plan = (accepted: ReturnType<typeof f>[]) => place(accepted, passages).map((x) => [x.rewrite, x.applied.map((a) => a.id), x.constraints.map((a) => a.id)]);
    // every finding patchable: the vignette carries the patch, nothing is regenerated, and only the vignette is constrained
    expect(plan([f("fires the reliquary", "hands over the reliquary")])).toEqual([[false, ["fires "], ["fires "]], [false, [], []], [false, [], []], [false, [], []]]);
    expect(place([f("fires the reliquary", "hands over the reliquary")], passages)[0].text).toBe("The director hands over the reliquary.");
    // the same finding without a patch: the part it lands in is rewritten under it, and no other part sees the constraint
    expect(plan([f("fires the reliquary")])).toEqual([[true, [], ["fires "]], [false, [], []], [false, [], []], [false, [], []]]);
    expect(plan([f("holds the silk")])).toEqual([[false, [], []], [false, [], []], [true, [], ["holds "]], [false, [], []]]);
    // particulars moves the mechanism, so an unpatched one also rewrites the ending, under that constraint
    expect(plan([f("holds the silk", "", "particulars")])).toEqual([[false, [], []], [true, [], ["holds "]], [true, [], ["holds "]], [false, [], []]]);
    expect(plan([f("holds the silk", "holds the linen", "particulars")])[1]).toEqual([false, [], []]);
    // whatever the caller passes rides along with its placement
    expect(place([], [{ role: "vignette" as const, text: "x", stepId: "s1" }])[0].stepId).toBe("s1");
  });

  test("a patch whose span the text does not hold word for word is rewritten, not dropped", () => {
    const vignette = { role: "vignette" as const, text: "She said, “Hold the reliquary” and left." };
    const ending = { role: "ending" as const, text: "The count closes." };
    // the checker quoted straight quotes; the prose has curly ones, so the quote matches loosely and the substitution misses
    const miss = f(`said, "Hold the reliquary"`, `said, "Burn the reliquary"`);
    expect(applyPatches(vignette.text, [miss]).applied).toEqual([]);
    expect(place([miss], [vignette, ending])[0].rewrite).toBe(true);
    expect(place([f(`said, "Hold the reliquary"`, "x", "particulars")], [vignette, ending])[1].rewrite).toBe(true);
  });
});
