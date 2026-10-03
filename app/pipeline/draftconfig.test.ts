import { describe, expect, test } from "bun:test";
import { loadDraftConfig, samplesFor, toToml } from "./draftconfig.ts";

describe("draft config", () => {
  test("defaults, a profile, then flags; overridden keys are listed and written as comments", () => {
    const d = loadDraftConfig();
    expect(d.config.length.words).toBe(5000);
    expect(d.config.beats).toEqual({ count: "auto", min: 5, max: 10, words_min: 400, words_max: 800 });
    expect(d.config.checks.enabled).toEqual(["structure", "resemblance", "reader"]);
    expect(d.overridden).toEqual([]);
    const f = loadDraftConfig("listen", { "form.tense": "past", "scenes.order": "parallel", "beats.count": "4" });
    expect(f.config.length.words).toBe(10000);
    expect(f.config.beats.count).toBe(4);
    expect(f.config.form.tense).toBe("past");
    expect(f.config.scenes.order).toBe("parallel");
    expect(f.overridden).toEqual(["length.words", "beats.min", "beats.max", "beats.words_max", "form.chronology", "form.ending", "structure.template", "structure.register", "form.tense", "scenes.order", "beats.count"]);
    const toml = toToml(f);
    expect(toml).toContain("[length]\nwords = 10000   # overridden");
    expect(toml).toContain("[checks.structure]\nsamples = 1");
    expect(toml).toContain('tense = "past"   # overridden');
  });

  test("the opening and clarity defaults are today's prompts; the three channel profiles set them", () => {
    const d = loadDraftConfig().config;
    expect(d.opening).toEqual({ mode: "scene", window: 150, echo_title: false });
    expect(d.clarity).toEqual({ signposts: "scene", focal: "auto", recap: false });
    expect(loadDraftConfig("listen").config.opening).toEqual(d.opening);
    expect(loadDraftConfig("listen").config.clarity).toEqual(d.clarity);
    const t = loadDraftConfig("testimony").config;
    expect(t.opening).toEqual({ mode: "promise", window: 40, echo_title: true });
    expect(t.clarity).toEqual({ signposts: "spoken", focal: 1, recap: false });
    expect([t.form.person, t.form.tense, t.structure.register]).toEqual(["first", "past", "teller"]);
    expect(loadDraftConfig("rules").config.form.container).toBe("rules");
    const s = loadDraftConfig("dossier").config;
    expect([s.form.person, s.structure.register, s.opening.mode, s.clarity.recap]).toEqual(["auto", "teller", "promise", true]);
  });

  test("the opening and clarity keys are coerced from flags and refused naming the key", () => {
    const c = loadDraftConfig(undefined, { "opening.mode": "cold", "opening.window": "60", "opening.echo_title": "true", "clarity.focal": "1", "clarity.recap": "true", "clarity.signposts": "spoken", "structure.register": "teller" }).config;
    expect(c.opening).toEqual({ mode: "cold", window: 60, echo_title: true });
    expect(c.clarity).toEqual({ signposts: "spoken", focal: 1, recap: true });
    expect(loadDraftConfig(undefined, { "clarity.focal": "auto" }).config.clarity.focal).toBe("auto");
    expect(() => loadDraftConfig(undefined, { "opening.mode": "loud" })).toThrow(/opening.mode must be scene, promise, cold or slow, got loud/);
    expect(() => loadDraftConfig(undefined, { "opening.window": "0" })).toThrow(/opening.window must be a positive whole number/);
    expect(() => loadDraftConfig(undefined, { "opening.window": "many" })).toThrow(/opening.window must be a number/);
    expect(() => loadDraftConfig(undefined, { "opening.echo_title": "yes" })).toThrow(/opening.echo_title must be true or false/);
    expect(() => loadDraftConfig(undefined, { "clarity.signposts": "loud" })).toThrow(/clarity.signposts must be scene or spoken/);
    expect(() => loadDraftConfig(undefined, { "clarity.focal": "2" })).toThrow(/clarity.focal must be auto or 1, got 2/);
    expect(() => loadDraftConfig(undefined, { "clarity.recap": "1" })).toThrow(/clarity.recap must be true or false/);
    expect(() => loadDraftConfig(undefined, { "structure.register": "diary" })).toThrow(/structure.register must be auto, none, told, signal or teller/);
    expect(loadDraftConfig(undefined, { "form.container": "rules" }).config.form.container).toBe("rules");
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
    expect(() => loadDraftConfig("epic")).toThrow(/no profile epic; have listen, testimony, rules, dossier/);
  });

  test("screens.listen ceilings are typed, coerced, and validated", () => {
    const d = loadDraftConfig().config;
    expect(d.screens.listen).toEqual({ long_share_max: 0.12, numerals_max: 24, fix: "edit" });

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
  test("a list override turns checkers and screens on or off for one run", () => {
    const c = loadDraftConfig(undefined, { "checks.enabled": "ledger, reader", "screens.enabled": "ledger,listen" }).config;
    expect(c.checks.enabled).toEqual(["ledger", "reader"]);
    expect(c.screens.enabled).toEqual(["ledger", "listen"]);
  });
});
