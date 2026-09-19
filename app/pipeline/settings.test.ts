import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FIXTURE_SETTING, settingsFixture } from "./settings.fixture.ts";
import { LISTS, distillate, entryName, formatFinding, lintSetting, loadSetting, mentioned, mentions, parseSetting, replaceList, slice } from "./settings.ts";

const lint = (text: string) => lintSetting(text, "basin").map(formatFinding);

describe("setting lint", () => {
  test("the fixture is clean and parses into five lists", () => {
    expect(lint(FIXTURE_SETTING)).toEqual([]);
    const s = parseSetting(FIXTURE_SETTING, "basin");
    expect(s.claims).toBe("setting");
    expect(LISTS.map((n) => s.lists[n].length)).toEqual([3, 3, 3, 3, 3]);
    expect(s.lists.Terms[1]).toBe("Ellis — to withdraw every unit on a parcel from rent; used as a verb");
  });

  test("front matter: unknown keys and a bad claims value", () => {
    expect(lint(FIXTURE_SETTING.replace("claims: setting", "claims: setting\nhard_rules: Hard rules"))).toEqual(["front matter › hard_rules: unknown key hard_rules"]);
    expect(lint(FIXTURE_SETTING.replace("claims: setting", "claims: everywhere"))).toEqual(["front matter › claims: claims must be world | setting, got everywhere"]);
    expect(lint(FIXTURE_SETTING.replace("claims: setting\n", ""))).toEqual([]);   // absent is off, not a finding
  });

  test("lists: missing and empty; the prose sections are retired", () => {
    expect(lint(FIXTURE_SETTING.slice(0, FIXTURE_SETTING.indexOf("## Places")))).toEqual(["setting › Places: missing", "setting › Terms: missing"]);
    expect(lint(FIXTURE_SETTING.replace("## Bodies", "## Hard rules\n\n- One impossibility.\n\n## Bodies")))
      .toEqual(["setting › Hard rules: retired by the four-list shape"]);   // a setting is reference, not a rulebook
    // the Matrix and Jobs prose that came down from the playbook is retired with the rules: a setting is its five lists alone
    expect(lint(FIXTURE_SETTING.replace("## Bodies", "## Matrix\n\nTake the regional element out.\n\n## Jobs\n\n- matrix: close it\n\n## Bodies")))
      .toEqual(["setting › Matrix: retired by the four-list shape", "setting › Jobs: retired by the four-list shape"]);
    expect(slice(parseSetting(FIXTURE_SETTING, "basin"), "premises")).toStartWith("## Bodies");
    const empty = FIXTURE_SETTING.replace(/## Terms\n\n[\s\S]*$/, "## Terms\n\nnone\n");
    expect(lint(empty)).toEqual([]);                                    // a list may legitimately hold none
    expect(parseSetting(empty, "basin").lists.Terms).toEqual([]);
  });

  test("the retired nine-section shape is a finding, and no heading may sit below ##", () => {
    const old = FIXTURE_SETTING.replace("## Bodies", "## Domains\n\n### 1. Land and title\n\n#### Frame\n\nA line.\n\n## Bodies");
    expect(lint(old)).toEqual([
      "setting › Domains: retired by the four-list shape",
      "setting › 1. Land and title: no heading below ## ; a list is flat",
      "setting › Frame: no heading below ## ; a list is flat",
    ]);
  });

  test("an entry must carry the separator and the word cap", () => {
    expect(lint(FIXTURE_SETTING.replace("- Ellis — to withdraw", "- Ellis: to withdraw"))).toEqual(
      ["Terms › Ellis: to withdraw every unit on a parce…: an entry is `name — what it does; what follows`"]);
    expect(lint(FIXTURE_SETTING.replace("- Ellis — to", "-  — to"))).toEqual(["Terms › — to withdraw every unit on a parcel fro…: an entry is `name — what it does; what follows`"]);
    const long = FIXTURE_SETTING.replace("- Ellis — to withdraw every unit on a parcel from rent; used as a verb",
      `- Ellis — ${Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ")}`);
    expect(lint(long)).toEqual(["Terms › Ellis — word0 word1 word2 word3 word4 wo…: over 45 words"]);
    // whether an entry names anything this setting names is the reduce pass's judgement and Chris's, not lint's
  });

  test("a list over the cap is a finding", () => {
    const rows = Array.from({ length: 41 }, (_, i) => `- Term ${i} — a gloss naming Basin thing ${i}`).join("\n");
    const over = FIXTURE_SETTING.replace(/## Terms\n\n[\s\S]*$/, `## Terms\n\n${rows}\n`);
    expect(lint(over)).toEqual(["Terms › 41 entries: over the cap of 40"]);
  });
});

describe("slicing", () => {
  const s = parseSetting(FIXTURE_SETTING, "basin");

  test("each stage loads whole lists, never a subset, and no stage carries a rule", () => {
    const premises = slice(s, "premises");
    expect(premises).toContain("## Bodies — the setting records these");
    for (const e of s.lists.Bodies) expect(premises).toContain(e);          // whole, not sampled
    for (const e of s.lists.Events) expect(premises).toContain(e);        // premises settles the subject, so it reads the chronology too
    for (const x of ["## Instruments", "## Places", "## Terms", "## Hard rules", "## Do not build", "## Jobs"]) expect(premises).not.toContain(x);
    const execute = slice(s, "execute");
    for (const x of ["## Instruments", "## Places", "## Terms"]) expect(execute).toContain(x);
    expect(execute).not.toContain("## Bodies");
    expect(execute).not.toContain("## Events");                           // the premise has already settled when this is
    expect(slice(s, "outline")).toContain("## Bodies");
    expect(slice(s, "outline")).toContain("## Events");                   // arithmetic is settled against real dates
    expect(slice(s, "outline")).not.toContain("## Places");
    expect(slice(s, "jobs")).not.toContain("## Events");
    expect(slice(s, "ending")).toContain("## Terms");
    expect(premises).not.toMatch(/^### /m);
  });

  test("distillate is every list, whatever a stage would have loaded", () => {
    const d = distillate(s);
    for (const name of LISTS) for (const e of s.lists[name]) expect(d).toContain(e);
    expect(d).not.toContain("## Hard rules");
  });
});

describe("writing back", () => {
  test("replaceList rewrites one list and leaves every other byte alone", () => {
    const out = replaceList(FIXTURE_SETTING, "basin", "Places", ["The Recorder's counter — the one window that appends"]);
    expect(out.slice(0, out.indexOf("## Places"))).toBe(FIXTURE_SETTING.slice(0, FIXTURE_SETTING.indexOf("## Places")));
    expect(out.slice(out.indexOf("## Terms"))).toBe(FIXTURE_SETTING.slice(FIXTURE_SETTING.indexOf("## Terms")));
    expect(parseSetting(out, "basin").lists.Places).toEqual(["The Recorder's counter — the one window that appends"]);
    expect(parseSetting(replaceList(FIXTURE_SETTING, "basin", "Places", []), "basin").lists.Places).toEqual([]);
  });

  test("loadSetting reads from a settings directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "cloudchamber-set-"));
    const sdir = settingsFixture(dir);
    expect(loadSetting("basin", sdir).lists.Bodies).toHaveLength(3);
    writeFileSync(join(sdir, "basin.md"), readFileSync(join(sdir, "basin.md"), "utf8").replace("## Terms", "## Sources"));
    expect(lintSetting(readFileSync(join(sdir, "basin.md"), "utf8"), "basin").map(formatFinding))
      .toEqual(["setting › Terms: missing", "setting › Sources: retired by the four-list shape"]);
  });
});

describe("reading a draw back against the setting", () => {
  const s = parseSetting(FIXTURE_SETTING, "basin");

  test("mentions matches the whole name, or its capitalised run inside a sentence", () => {
    const body = s.lists.Bodies[1];                                   // The Office of the Public Administrator — ...
    expect(mentions("the Office of the Public Administrator wrote", body)).toBe(true);
    expect(mentions("the public administrator took the rooms", body)).toBe(true);   // the run, lowercased
    expect(mentions("A deputy arrived with a clipboard.", body)).toBe(false);
    expect(mentions("she filed the Notice of Withdrawal on Tuesday", s.lists.Instruments[1])).toBe(true);
    expect(mentions("the recorder's counter", s.lists.Places[0])).toBe(true);
    expect(mentions("he ellised the building", s.lists.Terms[1])).toBe(true);
  });

  test("mentioned reports which entries a passage reaches for, and finds none in prose that names nothing", () => {
    const text = "At the Recorder's counter she filed the Notice of Withdrawal; the Hiring Hall had already dispatched.";
    expect(mentioned(text, s.lists.Bodies).map(entryName)).toEqual(["Hiring Hall"]);
    expect(mentioned(text, s.lists.Instruments).map(entryName)).toEqual(["Notice of Withdrawal"]);
    expect(mentioned(text, s.lists.Places).map(entryName)).toEqual(["Recorder's counter"]);
    expect(mentioned("A man walked into a room and sat down for a long time.", [...s.lists.Bodies, ...s.lists.Terms])).toEqual([]);
  });
});
