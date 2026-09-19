import { describe, expect, test } from "bun:test";
import { drawn } from "./drafting.fixture.ts";
import { GATE_ACTIONS, gateCommand } from "./gate.ts";
import { ACTIONS } from "./lifecycle.ts";

describe("the gate commands", () => {
  test("every decision is one command: it refuses at once what it lacks or what the status forbids, and says whether the work runs on", async () => {
    const { p, d, draw } = await drawn();
    expect(GATE_ACTIONS).toBe(ACTIONS);
    // an argument it lacks
    expect(() => gateCommand(p, d, draw.id, "choose")).toThrow(/step_id required/);
    expect(() => gateCommand(p, d, draw.id, "accept")).toThrow(/findings required/);
    expect(() => gateCommand(p, d, draw.id, "dismiss")).toThrow(/finding required/);
    expect(() => gateCommand(p, d, draw.id, "rewrite")).toThrow(/beat required/);
    expect(() => gateCommand(p, d, draw.id, "sing")).toThrow(/action must be/);
    // a status that forbids it, and a draw that is never deletable once it has a chosen candidate
    expect(() => gateCommand(p, d, draw.id, "keep")).toThrow(/not awaiting_draft_gate/);
    expect(() => gateCommand(p, d, draw.id, "delete")).toThrow();
    // check runs on and answers with the pass; hold answers at once with the draw
    const c = gateCommand(p, d, draw.id, "check", { samples: 3 });
    expect([c.running, c.draw]).toEqual([true, draw.id]);
    expect(((await c.done) as { findings: unknown[] }).findings.length).toBeGreaterThan(0);
    const h = gateCommand(p, d, draw.id, "hold");
    expect([h.running, h.draw, ((await h.done) as { id: string }).id]).toEqual([false, draw.id, draw.id]);
    // draft runs on; from the check gate it is allowed, and its answer is the draw at gate 2
    const w = gateCommand(p, d, draw.id, "draft", { overrides: { "screens.samples": 3, "screens.keep_if": 2 } });
    expect(w.running).toBe(true);
    expect(((await w.done) as { status: string }).status).toBe("awaiting_draft_gate");
  });
});
