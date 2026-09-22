import { describe, expect, test } from "bun:test";
import { Lineage } from "./lineage.ts";
import type { DrawRow } from "./draw.ts";

const row = (id: string, over: Partial<DrawRow> = {}) => ({ id, repaired_from: null, forked_from: null, superseded_by: null, ...over }) as DrawRow;

describe("lineage", () => {
  // root ← r1 ← r2, and r1 repaired a second time as r1b; f forks r1; x replaced root afresh
  const l = new Lineage([
    row("root", { superseded_by: "r1" }), row("r1", { repaired_from: "root", superseded_by: "r2" }), row("r2", { repaired_from: "r1" }),
    row("r1b", { repaired_from: "r1" }), row("f", { forked_from: "r1" }), row("old", { superseded_by: "x" }), row("x"),
  ]);

  test("a chain runs back to its root, and its rounds run forward", () => {
    expect(l.chain("r2")).toEqual(["r2", "r1", "root"]);
    expect(l.root("r2")).toBe("root");
    expect(l.rounds("r2")).toEqual(["root", "r1", "r2"]);
  });

  test("a draw repaired twice heads two chains, and only a draw nothing repairs is a tip", () => {
    expect(l.repairs("r1").sort()).toEqual(["r1b", "r2"]);
    expect(l.tips("root").sort()).toEqual(["r1b", "r2"]);
    expect([l.isTip("r1"), l.isTip("r2"), l.isTip("f")]).toEqual([false, true, true]);
  });

  test("what points at a draw, and how it was superseded", () => {
    expect(l.referencedBy("r1").sort()).toEqual(["f", "r1b", "r2", "root"]);   // root names r1 as what superseded it
    expect(l.superseded("r1")).toEqual({ by: "r2", how: "repaired" });
    expect(l.superseded("old")).toEqual({ by: "x", how: "redrawn" });
    expect(l.superseded("r2")).toBeNull();
  });

  test("a path runs through forks and repairs to the draw that ran the premises", () => {
    const forked = new Lineage([row("a"), row("b", { forked_from: "a" }), row("c", { repaired_from: "b" })]);
    expect(forked.path("c")).toEqual(["c", "b", "a"]);
    expect(forked.origin("c")).toBe("a");
  });

  test("a link that loops ends the walk instead of running forever", () => {
    const loop = new Lineage([row("p", { repaired_from: "q" }), row("q", { repaired_from: "p" })]);
    expect(loop.chain("p")).toEqual(["p", "q"]);
    expect(loop.path("p")).toEqual(["p", "q"]);
  });

  test("rows it lacks are loaded on the way back", () => {
    const lazy = new Lineage([], (id) => ({ c: row("c", { repaired_from: "b" }), b: row("b", { repaired_from: "a" }), a: row("a") })[id]!);
    expect(lazy.chain("c")).toEqual(["c", "b", "a"]);
  });
});
