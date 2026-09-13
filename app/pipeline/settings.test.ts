import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FIXTURE_SETTING, settingsFixture } from "./settings.fixture.ts";
import { formatFinding, lintSetting, loadSetting, parseDomains, parseSetting, replaceSection, slug } from "./settings.ts";

const exists = () => true;
const lint = (text: string, fileExists: (rel: string) => boolean = exists) => lintSetting(text, "basin", fileExists).map(formatFinding);

describe("setting lint", () => {
  test("the fixture is clean and parses into five sections, one job and three domains", () => {
    expect(lint(FIXTURE_SETTING)).toEqual([]);
    const s = parseSetting(FIXTURE_SETTING, "basin");
    expect(s.draw).toBe(2);
    expect(s.names).toBe(true);
    expect(s.jobs).toEqual([{ name: "matrix", description: "Close the regional element. Name the instrument and show that removing it removes a mechanism." }]);
    expect(s.domains.map((d) => d.slug)).toEqual(["land-and-title", "labour", "death-and-its-administration"]);
    expect(s.domains[0].sections.Clocks).toBe("none");
    expect(s.sections.Matrix).toBe("Take the regional element out and a mechanism goes with it.");
    expect(slug("### 12. Death and its administration".replace(/^### /, ""))).toBe("death-and-its-administration");
  });

  test("front matter: unknown keys and a bad draw", () => {
    expect(lint(FIXTURE_SETTING.replace("names: true", "names: true\nhard_rules: Hard rules"))).toEqual(["front matter › hard_rules: unknown key hard_rules"]);
    expect(lint(FIXTURE_SETTING.replace("draw: 2", "draw: two"))).toEqual(["front matter › draw: draw must be a non-negative integer, got two"]);
    expect(lint(FIXTURE_SETTING.replace("draw: 2", "draw: -1"))).toEqual(["front matter › draw: draw must be a non-negative integer, got -1"]);
    expect(lint(FIXTURE_SETTING.replace("draw: 2", "draw: 0"))).toEqual([]);   // a setting that takes no domain unless one is pinned
  });

  test("setting-wide sections: missing and empty", () => {
    expect(lint(FIXTURE_SETTING.replace("## Open ground\n\n- An interval getting shorter as the spine.\n\n", ""))).toEqual(["setting › Open ground: missing"]);
    expect(lint(FIXTURE_SETTING.replace("- An interval getting shorter as the spine.\n", ""))).toEqual(["setting › Open ground: empty sections hold the line none"]);
    expect(lint(FIXTURE_SETTING.slice(0, FIXTURE_SETTING.indexOf("## Domains")))).toEqual(["setting › Domains: missing"]);
    expect(lint(FIXTURE_SETTING.slice(0, FIXTURE_SETTING.indexOf("### 1. Land")))).toEqual(["setting › Domains: at least one domain"]);
    expect(lint(FIXTURE_SETTING.slice(0, FIXTURE_SETTING.indexOf("### 1. Land")).replace("draw: 2", "draw: 0"))).toEqual([]);   // draw 0 needs no domain to draw from
  });

  test("parseDomains: absent draws at random, `none` is a pin of nothing, slugs keep their order", () => {
    expect(parseDomains(undefined)).toBeUndefined();
    expect(parseDomains("")).toBeUndefined();
    expect(parseDomains(" , ")).toBeUndefined();
    expect(parseDomains("none")).toEqual([]);
    expect(parseDomains(" none ")).toEqual([]);
    expect(parseDomains("labour,land-and-title")).toEqual(["labour", "land-and-title"]);
    expect(parseDomains("none,labour")).toEqual(["none", "labour"]);   // only `none` alone is the sentinel; this fails on the slug
  });

  test("domain sections: missing, out of order, empty, frame lines", () => {
    expect(lint(FIXTURE_SETTING.replace("#### Clocks\n\nnone\n\n", ""))).toEqual(["land-and-title › Clocks: missing"]);
    const swapped = FIXTURE_SETTING.replace("#### Clocks\n\nnone\n\n#### Places\n\n- the recorder's counter, where the book is amended by appending\n\n",
      "#### Places\n\n- the recorder's counter, where the book is amended by appending\n\n#### Clocks\n\nnone\n\n");
    expect(lint(swapped)).toEqual(["land-and-title › Places: out of order"]);   // the first section that precedes its predecessor
    expect(lint(FIXTURE_SETTING.replace("#### Clocks\n\nnone", "#### Clocks\n"))).toEqual(["land-and-title › Clocks: empty sections hold the line none"]);
    expect(lint(FIXTURE_SETTING.replace("A queue that is the income, and an employer nobody can name.", "A queue.\nTwo lines."))).toEqual(["labour › Frame: one line"]);
  });

  test("mechanisms go through the theme validator", () => {
    const f = lint(FIXTURE_SETTING.replace("- Work is a queue position drawn by lottery, with a rate posted where nobody may enforce it, and a week that closes at a negative number.", "- This is short."));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatch(/^labour › Mechanisms: This is short\.… 3 words, deictic opener$/);
  });

  test("the mask: proper nouns outside Institutions and Sources only when names is not true", () => {
    const masked = FIXTURE_SETTING.replace("names: true\n", "");
    expect(lint(masked)).toEqual([]);                                   // the fixture's only proper nouns sit in Institutions
    const named = masked.replace("- the annual reading of names", "- the annual reading of names at Cypress Lawn in Colma");
    expect(lint(named)).toEqual(["death-and-its-administration › Places: proper noun Cypress", "death-and-its-administration › Places: proper noun Lawn", "death-and-its-administration › Places: proper noun Colma"]);
    expect(lint(named.replace("draw: 2", "draw: 2\nnames: true"))).toEqual([]);   // names: true switches it off
    expect(lint(masked.replace("The county recorder, which", "The Alameda County recorder, which"))).toEqual([]);   // Institutions may carry names
  });

  test("sources: required, and every reference token must exist", () => {
    expect(lint(FIXTURE_SETTING.replace("- reference/labour.md", "none"))).toEqual(["labour › Sources: at least one reference/<file>.md line"]);
    expect(lint(FIXTURE_SETTING, (rel) => rel !== "reference/death.md")).toEqual(["death-and-its-administration › Sources: no file reference/death.md"]);
  });

  test("loadSetting reads from a settings directory and lint resolves reference files against it", () => {
    const dir = mkdtempSync(join(tmpdir(), "cloudchamber-set-"));
    const sdir = settingsFixture(dir);
    const s = loadSetting("basin", sdir);
    expect(s.domains).toHaveLength(3);
    const text = readFileSync(join(sdir, "basin.md"), "utf8");
    expect(lintSetting(text, "basin", (rel) => existsSync(join(sdir, "basin", rel)))).toEqual([]);
    writeFileSync(join(sdir, "basin.md"), text.replace("reference/death.md", "reference/gone.md"));
    expect(lintSetting(readFileSync(join(sdir, "basin.md"), "utf8"), "basin", (rel) => existsSync(join(sdir, "basin", rel))).map(formatFinding)).toEqual(["death-and-its-administration › Sources: no file reference/gone.md"]);
  });

  test("replaceSection rewrites one body and leaves every other byte alone", () => {
    const out = replaceSection(FIXTURE_SETTING, "basin", "land-and-title", "Clocks", "- a filing bar of two years");
    const before = FIXTURE_SETTING.slice(0, FIXTURE_SETTING.indexOf("#### Clocks") + "#### Clocks".length);
    const after = FIXTURE_SETTING.slice(FIXTURE_SETTING.indexOf("#### Places"));
    expect(out.startsWith(before)).toBe(true);
    expect(out.endsWith(after)).toBe(true);
    expect(parseSetting(out, "basin").domains[0].sections.Clocks).toBe("- a filing bar of two years");
    expect(() => replaceSection(FIXTURE_SETTING, "basin", "nope", "Clocks", "x")).toThrow("setting basin: no domain nope");
  });
});
