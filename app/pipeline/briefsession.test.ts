import { describe, expect, test } from "bun:test";
import { BriefSession, sharedLine, stagesReadingTheBrief } from "./briefsession.ts";
import { loadStages } from "./config.ts";
import { drawn, draftScript } from "./drafting.fixture.ts";
import { briefParts } from "./briefparts.ts";

describe("the brief session", () => {
  // ADR-0010: a cache hit needs the whole system prompt to match, so these stages must carry one line
  test("every stage that reads the brief carries the shared stage line", () => {
    const stages = loadStages();
    for (const s of stagesReadingTheBrief) expect([s, stages[s].system]).toEqual([s, sharedLine]);
    // and no other stage carries it, so a stage added to the toml by that line alone is caught here
    const carrying = Object.entries(stages).filter(([, c]) => c.system === sharedLine).map(([s]) => s).sort();
    expect(carrying).toEqual([...stagesReadingTheBrief].sort());
  });

  test("its calls send the brief as the system prompt, the same on every one", async () => {
    const { p, model, draw } = await drawn(draftScript({}));
    const parts = briefParts(p, draw.id);
    const session = new BriefSession(p, draw.id, parts, "check-derivation");
    model.calls.length = 0;
    await session.call("check-structure", "ask one", (t) => t);
    await session.samples("check-derivation", "ask two", (t) => t, 2);
    expect(model.calls).toHaveLength(3);
    expect(model.calls[0].system).toContain('<vignette name="chosen">');
    expect(model.calls.every((c) => c.system === model.calls[0].system)).toBe(true);
    expect(model.calls.map((c) => c.prompt)).toEqual(["ask one", "ask two", "ask two"]);
  });

  test("the lead call goes first and the rest wait for it", async () => {
    const { p, draw } = await drawn(draftScript({}));
    const parts = briefParts(p, draw.id);
    let released = false;
    const slow = new BriefSession({ ...p, cacheLeadMs: 30 } as never, draw.id, parts, "ledger-extract");
    setTimeout(() => { released = true; }, 25);
    // the lead's own first call does not wait; another stage's does
    await (slow as never as { held: (s: string, n?: number) => Promise<void> }).held("ledger-extract", 1);
    expect(released).toBe(false);
    await (slow as never as { held: (s: string, n?: number) => Promise<void> }).held("check-ledger", 1);
    expect(released).toBe(true);
  });
});
