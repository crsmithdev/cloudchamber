import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drawn } from "../drafting.fixture.ts";
import { best, rank, whyNotBest } from "./best.ts";
import { readJudgements } from "./log.ts";
import { AXES, fmt2 } from "./pool.ts";

const OVERRIDES = { "screens.samples": 3, "screens.keep_if": 2 };
const reply = (answer: string) => AXES.map((a) => `<axis name="${a}" one="3" two="3">${answer}</axis><why>because</why>`).join("") + `<overall>${answer}</overall><needs>more</needs>`;
const judgeSays = (answer: string) => (async () => ({ json: async () => ({ choices: [{ message: { content: reply(answer) } }], usage: { cost: 0.01 } }) })) as unknown as typeof fetch;
const scratchLog = () => join(mkdtempSync(join(tmpdir(), "cc-best-")), "judgements.jsonl");

describe("rank", () => {
  // the register cut's three drafts, judged at 24 passes a judge on 24 September
  const logged = readJudgements(join(import.meta.dir, "../../../bank/judgements.jsonl"))
    .filter((r) => ["20260924-register-cut-x24", "20260924-l2-floor-cut2-cut3-x24"].includes(r.experiment) && r.kind === "floor");

  test("ranks the register cut's drafts by the score gap, with cut1 last and no clear winner", () => {
    expect(logged).toHaveLength(216);
    const r = rank(["cut1", "cut2", "cut3"], logged);
    const s = Object.fromEntries(r.standings.map((x) => [x.id, x]));
    expect(fmt2(s.cut1!.against.cut2!)).toBe("-0.22");
    expect(fmt2(s.cut1!.against.cut3!)).toBe("-0.39");
    expect(fmt2(s.cut2!.against.cut3!)).toBe("0.07");
    expect(r.standings.at(-1)!.id).toBe("cut1");
    // cut2 against cut3 is inside the margin, so neither is a winner
    expect(r.winner).toBeNull();
  });

  test("the order a pair is named in does not change the ranking", () => {
    const swapped = logged.map((r) => ({ ...r, ours: r.source, source: r.ours,
      scores: Object.fromEntries(Object.entries(r.scores).map(([k, v]) => [k, { ours: v!.source, source: v!.ours }])) }));
    expect(rank(["cut1", "cut2", "cut3"], swapped).standings.map((x) => [x.id, fmt2(x.score)]))
      .toEqual(rank(["cut1", "cut2", "cut3"], logged).standings.map((x) => [x.id, fmt2(x.score)]));
  });

  test("a draft that beats both others by more than the margin is the winner", () => {
    const rows = ["b", "c"].flatMap((other) => Array.from({ length: 4 }, (_, i) => ({
      ours: "a", source: other, judge: "j", overall: "ours" as const, flipped: i % 2 === 1, complete: true, followed_order: i % 2 === 0, axes: {},
      scores: { hook: { ours: 4, source: 3 }, cost: { ours: 3, source: 3 } },
    })));
    expect(rank(["a", "b", "c"], rows).winner).toBe("a");
  });
});

describe("best of N", () => {
  test("a badly shaped run is refused before anything is drafted", async () => {
    expect(whyNotBest({ n: 1, passes: 24, judges: ["j"] })).toMatch(/N of at least 2/);
    expect(whyNotBest({ n: 3, passes: 3, judges: ["j"] })).toMatch(/passes must be even/);
    expect(whyNotBest({ n: 3, passes: 24, judges: [] })).toBe("no judges");
    const { p, d, draw } = await drawn();
    await d.check(draw.id);
    const draws = p.draws().length;
    await expect(best(d, draw.id, { passes: 5, call: { key: "k" } })).rejects.toThrow(/passes must be even/);
    expect(p.draws()).toHaveLength(draws);
  });

  test("a drafted source counts as one draft; siblings make up N, every pair is judged, and every pass is logged", async () => {
    const { p, d, draw } = await drawn();
    await d.check(draw.id);
    await d.draft(draw.id, { overrides: OVERRIDES });
    const log = scratchLog();
    const r = await best(d, draw.id, { n: 3, passes: 4, judges: ["j1", "j2"], log, call: { key: "k", fetch: judgeSays("Tie") } });

    expect(r.drafts[0]).toBe(draw.id);
    expect(r.drafts).toHaveLength(3);
    expect(r.drafts.slice(1).every((id) => p.draw(id).branched_from === draw.id)).toBe(true);
    const rows = readJudgements(log);
    // three pairs, two judges, four passes each
    expect(rows).toHaveLength(24);
    expect(rows.every((x) => x.kind === "rank" && x.experiment === r.experiment && x.brief === draw.id)).toBe(true);
    // a panel that scores every pair level ranks nothing
    expect(r.standings.every((s) => s.score === 0)).toBe(true);
    expect(r.winner).toBeNull();
    expect(r.failed).toBe(0);
    expect(r.cost_usd).toBeCloseTo(0.24);
  });

  test("an undrafted brief is drafted N times", async () => {
    const { d, draw } = await drawn();
    await d.check(draw.id);
    d.configure(draw.id, { overrides: OVERRIDES });
    const r = await best(d, draw.id, { n: 2, passes: 2, judges: ["j"], log: scratchLog(), call: { key: "k", fetch: judgeSays("One") } });
    expect(r.drafts).toHaveLength(2);
    expect(r.drafts).not.toContain(draw.id);
  });
});
