import { describe, expect, test } from "bun:test";
import { TEMPLATES } from "./prompts.ts";
import { words } from "./model.ts";

/**
 * What each drafting template is allowed to weigh. A template the model reads
 * on every beat is the expensive layer, so its size is a number we choose
 * rather than one that drifts.
 *
 * The budget forces the question, never the answer. It is not a rule that one
 * clause must leave whenever another arrives: the caps ablation of 23 Sep
 * (`evals/20260923-caps-ablation.md`) removed a clause that had never been
 * justified alone and lost on all three matched pairs, so a budget that forced
 * a deletion would have made the drafts worse. Raise a number here when a run
 * says the clause earns it, and name that run in the commit.
 */
const BUDGET: Record<string, number> = {
  scheduleListen: 386,
  scheduleSignal: 328,
  scheduleTold: 126,
  sceneSignal: 110,
  sceneTold: 77,
};

describe("drafting prompt budgets", () => {
  for (const [name, cap] of Object.entries(BUDGET)) {
    test(`${name} stays within ${cap} words`, () => {
      const t = (TEMPLATES as unknown as Record<string, string>)[name];
      expect(typeof t).toBe("string");
      expect(words(t)).toBeLessThanOrEqual(cap);
    });
  }

  test("every budgeted template still exists", () => {
    for (const name of Object.keys(BUDGET)) expect(TEMPLATES).toHaveProperty(name);
  });
});
