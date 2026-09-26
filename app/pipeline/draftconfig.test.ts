import { describe, expect, test } from "bun:test";
import { loadDraftConfig, samplesFor, toToml } from "./draftconfig.ts";

describe("draft config", () => {
  test("defaults, a profile, then flags; overridden keys are listed and written as comments", () => {
    const d = loadDraftConfig();
    expect(d.config.length.words).toBe(5000);
    expect(d.config.beats).toEqual({ count: "auto", min: 5, max: 10, words_min: 400, words_max: 800 });
    expect(d.config.checks.enabled).toEqual(["claims", "derivation", "ledger", "structure", "resemblance"]);
    expect(d.overridden).toEqual([]);
    const f = loadDraftConfig("flash", { "form.tense": "past", "scenes.order": "parallel", "beats.count": "4" });
    expect(f.config.length.words).toBe(1500);
    expect(f.config.beats.count).toBe(4);
    expect(f.config.form.tense).toBe("past");
    expect(f.config.scenes.order).toBe("parallel");
    expect(f.overridden).toEqual(["length.words", "beats.count", "form.tense", "scenes.order"]);
    const toml = toToml(f);
    expect(toml).toContain("[length]\nwords = 1500   # overridden");
    expect(toml).toContain("[checks.structure]\nsamples = 1");
    expect(toml).toContain('tense = "past"   # overridden');
  });

  test("per-checker samples override the group and keep_if never exceeds samples", () => {
    const c = loadDraftConfig().config;
    expect(samplesFor(c.checks, "ledger")).toEqual({ samples: 2, keep_if: 2 });
    expect(samplesFor(c.checks, "structure")).toEqual({ samples: 1, keep_if: 1 });
    expect(samplesFor(c.screens, "structure")).toEqual({ samples: 1, keep_if: 1 });
    expect(samplesFor(c.screens, "ledger")).toEqual({ samples: 1, keep_if: 1 });
    // a per-name table still wins over the group
    const over = loadDraftConfig(undefined, { "checks.samples": 5, "checks.ledger.samples": 2 }).config;
    expect(samplesFor(over.checks, "ledger")).toEqual({ samples: 2, keep_if: 2 });
    expect(samplesFor(over.checks, "derivation")).toEqual({ samples: 5, keep_if: 2 });
  });

  test("bad values are refused naming the key", () => {
    expect(() => loadDraftConfig(undefined, { "form.tense": "future" })).toThrow(/form.tense must be auto or one of past \| present/);
    expect(() => loadDraftConfig(undefined, { "beats.count": "zero" })).toThrow(/beats.count must be a number/);
    expect(() => loadDraftConfig(undefined, { "scenes.order": "random" })).toThrow(/scenes.order/);
    expect(() => loadDraftConfig("epic")).toThrow(/no profile epic; have flash, novelette/);
  });

  test("screens.listen ceilings are typed, coerced, and validated", () => {
    const d = loadDraftConfig().config;
    expect(d.screens.listen).toEqual({ long_share_max: 0.12, numerals_max: 12 });

    // override coercion
    const over = loadDraftConfig(undefined, {
      "screens.listen.long_share_max": "0.18",
      "screens.listen.numerals_max": "10",
    }).config;
    expect(over.screens.listen?.long_share_max).toBe(0.18);
    expect(over.screens.listen?.numerals_max).toBe(10);

    // misspelt key is rejected naming the key
    expect(() => loadDraftConfig(undefined, { "screens.listen.long_max": "0.15" }))
      .toThrow(/unknown screens.listen key: long_max/);

    // out-of-range values are rejected
    expect(() => loadDraftConfig(undefined, { "screens.listen.long_share_max": "1.2" }))
      .toThrow(/screens.listen.long_share_max must be in \[0, 1\]/);
    expect(() => loadDraftConfig(undefined, { "screens.listen.numerals_max": "-5" }))
      .toThrow(/screens.listen.numerals_max must be non-negative/);
  });
});
