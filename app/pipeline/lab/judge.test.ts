import { describe, expect, test } from "bun:test";
import { runPass, runPasses, type PassAsk } from "./judge.ts";
import { AXES } from "./pool.ts";

const full = (answer = "Two") => AXES.map((a) => `<axis name="${a}" one="3" two="4">${answer}</axis><why>because</why>`).join("") + `<overall>${answer}</overall><needs>more</needs>`;

/** A stand-in for OpenRouter: each call returns the next scripted reply. */
function fakeRouter(replies: (string | Error)[], seen: any[] = []) {
  let i = 0;
  const f = (async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    seen.push(body);
    const r = replies[Math.min(i++, replies.length - 1)]!;
    if (r instanceof Error) return { json: async () => ({ error: { message: r.message } }) } as any;
    return { json: async () => ({ choices: [{ message: { content: r } }], usage: { cost: 0.0123 } }) } as any;
  }) as unknown as typeof fetch;
  return { f, seen, calls: () => i };
}

const ask = (over: Partial<PassAsk> = {}): PassAsk => ({ ours: "d1", source: "d2", judge: "z-ai/glm-4.7", pass: 1, flipped: false, ...over });
const texts = { ours: "OURS TEXT", source: "SOURCE TEXT" };

describe("one pass", () => {
  test("a complete reply is parsed, costed and timed", async () => {
    const { f } = fakeRouter([full("Two")]);
    const r = await runPass(ask(), texts, { key: "k", fetch: f });
    expect(r.complete).toBe(true);
    expect(r.parsed.overall).toBe("source");   // Two, unflipped, is the other side
    expect(r.cost_usd).toBe(0.0123);
    expect(r.attempts).toBe(1);
    expect(r.ms).toBeGreaterThanOrEqual(0);
    expect(r.error).toBeUndefined();
  });

  test("the reading order swaps the stories in the prompt and is undone in the answer", async () => {
    const { f, seen } = fakeRouter([full("One")]);
    const r = await runPass(ask({ flipped: true }), texts, { key: "k", fetch: f });
    const prompt = seen[0].messages[1].content;
    // flipped: the source is read first
    expect(prompt.indexOf("SOURCE TEXT")).toBeLessThan(prompt.indexOf("OURS TEXT"));
    // and One, read flipped, is the source
    expect(r.parsed.overall).toBe("source");
    expect(r.followed_order).toBe(true);
  });

  test("an incomplete reply is tried again, and recorded incomplete when the tries run out", async () => {
    const short = `<axis name="hook" one="3" two="4">One</axis><overall>One</overall>`;
    const { f, calls } = fakeRouter([short, short, short]);
    const r = await runPass(ask(), texts, { key: "k", fetch: f, tries: 3 });
    expect(calls()).toBe(3);
    expect(r.complete).toBe(false);
    expect(r.error).toMatch(/incomplete: 1\/8 axes/);
  });

  test("a reply that completes on the second try stops there", async () => {
    const { f, calls } = fakeRouter([`<overall>One</overall>`, full("One")]);
    const r = await runPass(ask(), texts, { key: "k", fetch: f, tries: 3 });
    expect(calls()).toBe(2);
    expect(r.complete).toBe(true);
    expect(r.attempts).toBe(2);
  });

  test("an error from the provider is carried, not thrown", async () => {
    const { f } = fakeRouter([new Error("rate limited")]);
    const r = await runPass(ask(), texts, { key: "k", fetch: f, tries: 1 });
    expect(r.complete).toBe(false);
    expect(r.error).toMatch(/rate limited/);
  });

  test("the system line and the model are what the panel was run under", async () => {
    const { f, seen } = fakeRouter([full()]);
    await runPass(ask({ judge: "google/gemini-3.1-pro-preview" }), texts, { key: "k", fetch: f });
    expect(seen[0].model).toBe("google/gemini-3.1-pro-preview");
    expect(seen[0].messages[0].content).toBe("You judge stories for listeners. Output only the tags asked for.");
    expect(seen[0].messages[0].role).toBe("system");
  });
});

describe("a run of passes", () => {
  test("every pass runs, and the results come back in the order asked", async () => {
    const { f } = fakeRouter([full()]);
    const asks = [ask({ pass: 1 }), ask({ pass: 2, flipped: true }), ask({ pass: 3, judge: "openai/gpt-5.1" })];
    const rs = await runPasses(asks, (id) => `text of ${id}`, { key: "k", fetch: f, concurrency: 3 });
    expect(rs).toHaveLength(3);
    expect(rs.map((r) => r.pass)).toEqual([1, 2, 3]);
    expect(rs.map((r) => r.judge)).toEqual(["z-ai/glm-4.7", "z-ai/glm-4.7", "openai/gpt-5.1"]);
    expect(rs.every((r) => r.complete)).toBe(true);
  });

  test("concurrency is a ceiling, not a requirement", async () => {
    const { f } = fakeRouter([full()]);
    const asks = Array.from({ length: 5 }, (_, i) => ask({ pass: i + 1 }));
    const rs = await runPasses(asks, () => "t", { key: "k", fetch: f, concurrency: 2 });
    expect(rs).toHaveLength(5);
    expect(rs.every((r) => r?.complete)).toBe(true);
  });

  test("the texts are fetched by draw id, so nothing here knows where prose lives", async () => {
    const { f, seen } = fakeRouter([full()]);
    await runPasses([ask({ ours: "A", source: "B" })], (id) => `<<${id}>>`, { key: "k", fetch: f });
    expect(seen[0].messages[1].content).toContain("<<A>>");
    expect(seen[0].messages[1].content).toContain("<<B>>");
  });

  test("each finished pass is reported as it lands", async () => {
    const { f } = fakeRouter([full()]);
    const seenPasses: number[] = [];
    await runPasses([ask({ pass: 1 }), ask({ pass: 2 })], () => "t", { key: "k", fetch: f, onPass: (r) => seenPasses.push(r.pass) });
    expect(seenPasses.sort()).toEqual([1, 2]);
  });
});
