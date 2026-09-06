import { describe, expect, test } from "bun:test";
import { cluster, excludeDismissed, findingId, merge, overlap, parseFindings, type Finding } from "./recur.ts";

const f = (checker: string, sample: number, span: string, statement: string, over: Partial<Finding> = {}): Finding =>
  ({ checker, sample, span, statement, result: "contradicts:x", evidence: "a second quote", invalidates: "none", replacement: "It holds.", ...over });

describe("recurrence", () => {
  test("overlap is shared tokens over the smaller set", () => {
    expect(overlap("the director fires the reliquary", "the director fires the reliquary at dawn")).toBe(1);
    expect(overlap("one two three four", "three four five six")).toBe(0.5);
    expect(overlap("", "anything")).toBe(0);
  });

  test("a cluster is reported at keep_if distinct samples; spans at 0.5 or statements at 0.6 join", () => {
    const fs = [
      f("ledger", 1, "the director fires the reliquary", "the director fires it", { invalidates: "debt audit" }),
      f("ledger", 2, "director fires the reliquary herself", "the director is said to fire it"),
      f("ledger", 3, "the director fires the reliquary", "the director fires it"),
      f("ledger", 1, "twelfth relic named the Verona clavicle", "the relic is named twice", { invalidates: "arithmetic" }),
      f("ledger", 3, "the twelfth relic named the Verona clavicle", "the relic is named twice"),
      f("ledger", 2, "tears on the silk", "the tears were cut", { invalidates: "custody" }),
      f("ledger", 2, "an unrelated span entirely", "the relic is named twice in two vignettes"),   // statement overlap ≥ 0.6 joins the relic cluster
    ];
    const cs = cluster(fs, 2);
    // the relic cluster gathers samples 1 and 3 by span and sample 2 by statement overlap
    expect(cs.map((c) => [c.n, c.invalidates, c.reported])).toEqual([[3, "debt audit", true], [3, "arithmetic", true], [1, "custody", false]]);
    expect(cs[1].samples).toEqual([1, 2, 3]);
    expect(cluster(fs.slice(0, 6), 2).map((c) => [c.n, c.reported])).toEqual([[3, true], [2, true], [1, false]]);
    expect(cs[0].id).toBe(findingId("ledger", "the director fires the reliquary"));
    expect(findingId("ledger", "The   director fires the reliquary")).toBe(cs[0].id);   // whitespace and case do not change the id
  });

  test("ordering is n descending then debt audit, arithmetic, custody, setting jobs, none", () => {
    const fs = [f("d", 1, "a a a", "s1", { invalidates: "none" }), f("d", 1, "b b b", "s2", { invalidates: "custody" }), f("d", 1, "c c c", "s3", { invalidates: "matrix" }), f("d", 1, "d d d", "s4", { invalidates: "debt audit" }), f("d", 1, "e e e", "s5", { invalidates: "arithmetic" }), f("d", 2, "a a a", "s1", { invalidates: "none" })];
    expect(cluster(fs, 1, ["matrix"]).map((c) => c.invalidates)).toEqual(["none", "debt audit", "arithmetic", "custody", "matrix"]);
  });

  test("merge across checkers keeps one cluster, lists both, takes the greater n", () => {
    const a = cluster([f("ledger", 1, "the director fires the reliquary", "x"), f("ledger", 2, "the director fires the reliquary", "x")], 2);
    const b = cluster([f("derivation", 1, "director fires the reliquary", "y"), f("derivation", 2, "director fires the reliquary", "y"), f("derivation", 3, "director fires the reliquary", "y")], 2);
    const m = merge([...a, ...b]);
    expect(m).toHaveLength(1);
    expect(m[0].checkers).toEqual(["derivation", "ledger"]);
    expect(m[0].n).toBe(3);
  });

  test("dismissed findings are excluded by the same rule", () => {
    const cs = cluster([f("ledger", 1, "the director fires the reliquary", "x"), f("ledger", 1, "tears on the silk", "y")], 1);
    expect(excludeDismissed(cs, [{ span: "director fires the reliquary", statement: "" }]).map((c) => c.span)).toEqual(["tears on the silk"]);
  });

  test("parseFindings reads the tag shape and drops findings without a span", () => {
    const t = `<finding><span>a quote</span><statement>s</statement><result>contradicted</result><evidence>none</evidence><invalidates>Debt Audit</invalidates><replacement>r</replacement></finding><finding><statement>no span</statement></finding>`;
    const fs = parseFindings(t, "ledger", 2);
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ checker: "ledger", sample: 2, span: "a quote", invalidates: "debt audit", evidence: "none" });
  });
});
