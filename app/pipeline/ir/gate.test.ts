import { describe, expect, test } from "bun:test";
import { planGateAuto } from "./gate.ts";
import type { Sym } from "./s2.ts";

const sym = (id: string, resolved?: Sym["resolved"]): Sym => ({ id, kind: "fact", from: "", attrs: {}, text: "", resolved });

describe("planGateAuto", () => {
  test("passes with no static error and no contradicted symbol", () => {
    expect(planGateAuto({ s1: [], symbols: [sym("a", "SUPPORTED"), sym("b")] })).toEqual({ pass: true });
  });

  test("holds on a static error alone", () => {
    const v = planGateAuto({ s1: [{ check: "monotonic", beat: 3, message: "backs up" }], symbols: [] });
    expect(v).toMatchObject({ pass: false, staticErrors: ["[monotonic] beat 3: backs up"], contradicted: [] });
  });

  test("holds on a contradicted symbol alone", () => {
    const v = planGateAuto({ s1: [], symbols: [sym("council", "CONTRADICTED")] });
    expect(v).toMatchObject({ pass: false, staticErrors: [], contradicted: ["council"] });
  });

  test("holds on both, and the reason counts each", () => {
    const v = planGateAuto({ s1: [{ check: "monotonic", beat: 2, message: "reads earlier than beat 1" }], symbols: [sym("x", "CONTRADICTED")] });
    expect(v).toMatchObject({ pass: false, reason: "1 static error(s), 1 contradicted symbol(s)" });
  });

  test("a model-assisted finding (L4) plays no part in the auto rule: it is not in the input shape at all", () => {
    // planGateAuto's input is s1 findings and symbols only; L4's findings go to the operator's pane, not here
    expect(planGateAuto({ s1: [], symbols: [sym("a", "SILENT")] })).toEqual({ pass: true });
  });
});
