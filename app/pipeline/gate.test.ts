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
    expect(() => gateCommand(p, d, draw.id, "instruct")).toThrow(/instructions required/);
    expect(() => gateCommand(p, d, draw.id, "rewrite")).toThrow(/beat required/);
    expect(() => gateCommand(p, d, draw.id, "sing")).toThrow(/action must be/);
    // gate 1 went with T3 (IR spec §15): its actions are no commands at all
    for (const a of ["check", "accept", "auto", "dismiss", "hold"]) expect(() => gateCommand(p, d, draw.id, a)).toThrow(/action must be/);
    // a status that forbids it, and a draw that is never deletable once it has a chosen candidate
    expect(() => gateCommand(p, d, draw.id, "keep")).toThrow(/not awaiting_draft_gate/);
    expect(() => gateCommand(p, d, draw.id, "delete")).toThrow();
    // draft runs on; from the brief it is allowed, and its answer is the draw at gate 2
    const w = gateCommand(p, d, draw.id, "draft", { overrides: { "screens.samples": 3, "screens.keep_if": 2 } });
    expect(w.running).toBe(true);
    expect(((await w.done) as { status: string }).status).toBe("awaiting_draft_gate");
  });
});
