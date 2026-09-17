import { describe, expect, test } from "bun:test";
import { cluster, excludeDismissed, findingId, merge, overlap, parseFindings, score, type Finding } from "./recur.ts";
import { parseVerdicts } from "./check.ts";

const f = (checker: string, sample: number, span: string, statement: string, over: Partial<Finding> = {}): Finding =>
  ({ checker, sample, span, statement, result: "contradicts:x", evidence: "a second quote", invalidates: "none", replacement: "It holds.", patch: "", ...over });

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

  test("a patch counts only when every sample of the cluster offered the same one", () => {
    const withPatch = (sample: number, patch: string) => f("ledger", sample, "the twelfth relic", "named twice", { patch });
    expect(cluster([withPatch(1, "the Bruges clavicle"), withPatch(2, "the Bruges clavicle")], 2)[0].patch).toBe("the Bruges clavicle");
    expect(cluster([withPatch(1, "the Bruges clavicle"), withPatch(2, "the Ghent clavicle")], 2)[0].patch).toBe("");
    expect(cluster([withPatch(1, "the Bruges clavicle"), withPatch(2, "")], 2)[0].patch).toBe("");
    expect(cluster([withPatch(1, "The   Bruges clavicle"), withPatch(2, "the bruges clavicle")], 2)[0].patch).toBe("The   Bruges clavicle");
  });

  test("parseVerdicts reads the first keep or drop word, and refuses an answer with neither", () => {
    const ok = `<verdict n="1"><answer>Keep.</answer><why>a</why></verdict><verdict n="2"><answer>drop (loose wording)</answer><why>b</why></verdict>`;
    expect(parseVerdicts(ok, 2).map((v) => v.answer)).toEqual(["keep", "drop"]);
    expect(() => parseVerdicts(`<verdict n="1"><answer>unsure</answer></verdict>`, 1)).toThrow(/keep or drop/);
    expect(() => parseVerdicts(ok, 3)).toThrow(/missing <verdict n="3">/);
  });

  test("parseFindings reads a patch and treats none as absent", () => {
    const t = `<finding><span>a quote</span><statement>s</statement><result>contradicted</result><evidence>e</evidence><invalidates>none</invalidates><replacement>r</replacement><patch>a better quote</patch></finding>`
      + `<finding><span>b quote</span><statement>s</statement><result>contradicted</result><evidence>e</evidence><invalidates>none</invalidates><replacement>r</replacement><patch>none</patch></finding>`
      + `<finding><span>c quote</span><statement>s</statement><result>contradicted</result><evidence>e</evidence><invalidates>none</invalidates><replacement>r</replacement></finding>`;
    expect(parseFindings(t, "ledger", 1).map((x) => x.patch)).toEqual(["a better quote", "", ""]);
  });

  test("score weighs recurrence, cross-checker agreement, severity, result kind and evidence", () => {
    const s = (over: Partial<Parameters<typeof score>[0]>, samples = 3, jobs: string[] = []) =>
      score({ n: 3, checkers: ["ledger"], invalidates: "none", result: "contradicted", evidence: "a quote", ...over }, samples, jobs);
    expect(s({ invalidates: "debt audit", checkers: ["ledger", "derivation"] })).toBe(9);    // 3 + 2 + 2 + 2
    expect(s({ invalidates: "arithmetic" })).toBe(6);                                       // 3 + 0 + 1 + 2: a sum alone does not reach the floor
    expect(s({ invalidates: "arithmetic", n: 2 })).toBe(5);                                 // one sample short
    expect(s({ invalidates: "arithmetic", n: 1 })).toBe(4);
    expect(s({ invalidates: "custody", result: "underived" })).toBe(5);                     // 3 + 0 + 1 + 1
    expect(s({ result: "supported" })).toBe(3);                                             // recurrence alone
    expect(s({ result: "unverifiable", evidence: "none" })).toBe(1);                        // and no evidence costs 2
    expect(s({ invalidates: "matrix" })).toBe(5);                                           // an unknown job is worth nothing
    expect(s({ invalidates: "matrix" }, 3, ["matrix"])).toBe(7);                            // a declared setting job is worth 2
    expect(s({ invalidates: "debt audit", checkers: ["ledger", "derivation"], result: "contradicts:the ledger says otherwise" })).toBe(9);
    expect(s({ n: 1 }, 1)).toBe(5);                                                          // one sample is full recurrence
    expect(s({ result: "supported", evidence: "none", n: 1 })).toBe(0);                      // never below zero
  });

  test("a hedge before a number makes an arithmetic finding worth no severity", () => {
    const s = (span: string, invalidates = "arithmetic") =>
      score({ n: 3, checkers: ["derivation"], invalidates, result: "contradicted", evidence: "a quote", span }, 3);
    expect(s("and back by 64: roughly 1,200 steps a day")).toBe(5);        // the narrator is estimating
    expect(s("about 40 kilos of ordnance")).toBe(5);
    expect(s("a thousand guavas or so")).toBe(5);
    expect(s("four hundred sixty-two kilos, 1,075 bomblets")).toBe(6);     // a stated figure keeps its severity
    expect(s("a story about the archive")).toBe(6);                        // "about" alone is not a hedge
    expect(s("roughly 1,200 steps a day", "debt audit")).toBe(7);          // the guard is arithmetic only
    // the outline's own sums are not estimates: a span quoted from it keeps its severity
    const outline = "## arithmetic\n\nFive nights × 3.8 is about 19 days, which is why residents take two to three weeks.";
    const ctx = { outline, prose: "about 19 days in the notebook, she wrote", ledger: "" };
    const inOutline = (span: string) => score({ n: 3, checkers: ["derivation"], invalidates: "arithmetic", result: "contradicted", evidence: "5 × 3.8 = 19, but a night is 8 h", span }, 3, [], ctx);
    expect(inOutline("Five nights × 3.8 is about 19 days")).toBe(7);       // 3 + 1 + 2 + 1: the outline's own sum, checked
    expect(inOutline("about 19 days in the notebook")).toBe(3);             // the same hedge in prose is still an estimate, and the sum quotes nothing
  });

  test("parseFindings reads the tag shape and drops findings without a span", () => {
    const t = `<finding><span>a quote</span><statement>s</statement><result>contradicted</result><evidence>none</evidence><invalidates>Debt Audit</invalidates><replacement>r</replacement></finding><finding><statement>no span</statement></finding>`;
    const fs = parseFindings(t, "ledger", 2);
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ checker: "ledger", sample: 2, span: "a quote", invalidates: "debt audit", evidence: "none" });
  });
});
