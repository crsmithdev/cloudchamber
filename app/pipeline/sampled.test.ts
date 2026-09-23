import { describe, expect, test } from "bun:test";
import { clusterSamples, runSamples, voteAnswers, type Sample } from "./sampled.ts";
import { fixture } from "./drafting.fixture.ts";
import { FakeModel } from "./model.ts";
import { Pipeline } from "./draw.ts";
import type { Finding } from "./recur.ts";

const finding = (span: string, statement: string): Finding => ({ checker: "ledger", sample: 1, span, statement, result: "contradicted", evidence: "e", invalidates: "1", replacement: "r", patch: "" });
const sample = <T>(value: T, n: number): Sample<T> => ({ step: { id: `s${n}` } as never, value, sample: n });

describe("reading a stage more than once", () => {
  test("every sample runs, each with its own number, after what the caller holds it behind", async () => {
    const { db, dir } = fixture();
    const model = new FakeModel({ "check-derivation": (p: string) => `<finding><span>${p.length}</span></finding>` });
    const p = new Pipeline(db, model, { briefsDir: dir, backoffMs: [0], cacheLeadMs: 0 });
    const order: number[] = [];
    const rs = await runSamples(p, {
      draw: null as never, parent: null, stage: "check-derivation", prompt: "ask", samples: 3,
      parse: (_t, n) => n, before: (n) => { order.push(n); },
    });
    expect(rs.map((r) => r.sample)).toEqual([1, 2, 3]);
    expect(rs.map((r) => r.value)).toEqual([1, 2, 3]);
    expect(order.sort()).toEqual([1, 2, 3]);
    expect(model.calls).toHaveLength(3);
  });

  // spans that overlap by half are one cluster, so the second finding here is deliberately unlike the first
  test("a finding is reported when it recurs in keep_if samples, and the scope keys its id", () => {
    const rs = [
      sample({ findings: [finding("the ring", "the ring is gold"), finding("a bell rang twice", "the bell rang at noon")] }, 1),
      sample({ findings: [finding("the ring!", "the ring is gold")] }, 2),
      sample({ findings: [finding("the ring", "the ring is gold")] }, 3),
    ];
    const clusters = clusterSamples(rs, (v) => v.findings, 2, "d1");
    const ring = clusters.find((c) => c.span.startsWith("the ring"))!;
    expect([ring.n, ring.reported]).toEqual([3, true]);
    const hour = clusters.find((c) => c.span === "a bell rang twice")!;
    expect([hour.n, hour.reported]).toEqual([1, false]);
    // the same defect on the same draw keeps its id; a different scope gives a different one
    expect(clusterSamples(rs, (v) => v.findings, 2, "d1")[0].id).toBe(ring.id);
    expect(clusterSamples(rs, (v) => v.findings, 2, "d1/7")[0].id).not.toBe(ring.id);
  });

  test("an answer is present only when keep_if samples say so, and keeps a quote that agrees with it", () => {
    const rs = [
      sample({ threat: { answer: "present", quote: "a knife" }, agency: { answer: "present", quote: "it moved" } }, 1),
      sample({ threat: { answer: "absent", quote: "nothing" }, agency: { answer: "present", quote: "it moved again" } }, 2),
      sample({ threat: { answer: "absent", quote: "nothing at all" }, agency: { answer: "absent", quote: "no" } }, 3),
    ];
    const out = voteAnswers(rs, ["threat", "agency"], 2);
    expect(out.threat).toEqual({ answer: "absent", quote: "nothing" });
    expect(out.agency).toEqual({ answer: "present", quote: "it moved" });
  });
});
