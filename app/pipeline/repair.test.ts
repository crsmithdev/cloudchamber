import { describe, expect, test } from "bun:test";
import { applyPatches } from "./repair.ts";

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
});
