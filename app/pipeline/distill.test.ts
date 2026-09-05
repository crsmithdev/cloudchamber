import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "./store/db.ts";
import { FakeModel } from "./model.ts";
import { Pipeline } from "./draw.ts";
import { distill } from "./distill.ts";
import { FIXTURE_SETTING, settingsFixture } from "./settings.fixture.ts";
import { parseSetting, REDRAFT } from "./settings.ts";

const sec = (name: string, lines: string[]) => `<section name="${name}">\n${lines.map((l) => `- ${l}`).join("\n")}\n</section>`;

function setup(text = FIXTURE_SETTING) {
  const dir = mkdtempSync(join(tmpdir(), "fogbelt-distill-"));
  const db = openDb(join(dir, "t.db"));
  const sdir = settingsFixture(dir, text);
  const path = join(sdir, "fog.md");
  return { db, dir, sdir, path, read: () => readFileSync(path, "utf8") };
}

describe("distill", () => {
  test("fills only empty and marked sections, in place, one call per domain, recording a step", async () => {
    // land-and-title has Clocks = none; labour gets a redraft marker on Places; death is complete
    const text = FIXTURE_SETTING.replace("#### Places\n\n- the dispatch hall", `#### Places\n\n${REDRAFT}\n- the dispatch hall`);
    const { db, sdir, read } = setup(text);
    const before = read();
    const model = new FakeModel({
      distill: (prompt: string) => /### 1\. Land/.test(prompt)
        ? sec("Clocks", ["a filing bar of two years from the act", "a wait of decades before confirmation"])
        : sec("Places", ["the hiring hall, where the lottery is drawn"]),
    });
    const p = new Pipeline(db, model, { settingsDir: sdir });
    const out = await distill(p, "fog");
    expect(out).toEqual(["land-and-title › Clocks: 2 lines", "labour › Places: 1 lines", "death-and-its-administration: nothing to fill"]);
    expect(model.calls).toHaveLength(2);
    // the land call asked only for Clocks and carried the land reference, not the others
    expect(model.calls[0].prompt).toContain('<section name="Clocks">');
    expect(model.calls[0].prompt).not.toContain('<section name="Places">');
    expect(model.calls[0].prompt).toContain("Land Act of 1851");
    expect(model.calls[0].prompt).not.toContain("hiring halls");
    expect(model.calls[0].prompt).not.toContain("Proper nouns belong only");   // names: true, no mask instruction
    const after = parseSetting(read(), "fog");
    expect(after.domains[0].sections.Clocks).toBe("- a filing bar of two years from the act\n- a wait of decades before confirmation");
    expect(after.domains[1].sections.Places).toBe("- the hiring hall, where the lottery is drawn");
    expect(read()).not.toContain(REDRAFT);
    // every other section byte-identical, Frame and Sources included
    const b = parseSetting(before, "fog");
    for (const [i, d] of after.domains.entries()) for (const s of Object.keys(d.sections) as (keyof typeof d.sections)[]) {
      if ((i === 0 && s === "Clocks") || (i === 1 && s === "Places")) continue;
      expect(d.sections[s]).toBe(b.domains[i].sections[s]);
    }
    expect(after.sections).toEqual(b.sections);
    // the step rows
    const steps = db.query("SELECT stage, draw_id, story_id, status FROM steps ORDER BY rowid").all() as any[];
    expect(steps).toEqual([
      { stage: "distill", draw_id: null, story_id: "setting/fog/land-and-title", status: "done" },
      { stage: "distill", draw_id: null, story_id: "setting/fog/labour", status: "done" },
    ]);
  });

  test("--domain restricts to one domain and a bad slug fails", async () => {
    const { db, sdir, read } = setup();
    const model = new FakeModel({ distill: () => sec("Clocks", ["a two-year filing bar"]) });
    const p = new Pipeline(db, model, { settingsDir: sdir });
    expect(await distill(p, "fog", { domain: "land-and-title" })).toEqual(["land-and-title › Clocks: 1 lines"]);
    expect(model.calls).toHaveLength(1);
    expect(parseSetting(read(), "fog").domains[0].sections.Clocks).toBe("- a two-year filing bar");
    await expect(distill(p, "fog", { domain: "nope" })).rejects.toThrow("setting fog: no domain nope");
  });

  test("drops lines that fail the theme validator or carry a proper noun while masked; nothing surviving writes none", async () => {
    const text = FIXTURE_SETTING.replace("names: true\n", "")
      // strip the fixture's own proper nouns so the masked file lints clean, and empty two sections to fill
      .replace("- The Public Administrator under the Probate Code, which takes an estate nobody claims and answers to the probate court.", "- The public administrator, which takes an estate nobody claims and answers to the probate court.")
      .replace("#### Mechanisms\n\n- Nobody to claim you, so a county acts: the flat inventoried and auctioned, the ashes held their interval, then a name read aloud once.", "#### Mechanisms\n\nnone")
      .replace("#### Places\n\n- the annual reading of names", "#### Places\n\nnone");
    const { db, sdir, read } = setup(text);
    const model = new FakeModel({
      distill: () => sec("Mechanisms", [
        "Nobody to claim you, so a county acts: the flat inventoried and auctioned, the ashes held their interval, then a name read aloud once.",
        "This is too short.",
        "A deputy files the final account in Colma and the estate escheats to the state under a claim period nobody reads.",
      ]) + sec("Places", ["the Colma trench"]),
    });
    const p = new Pipeline(db, model, { settingsDir: sdir });
    const out = await distill(p, "fog", { domain: "death-and-its-administration" });
    expect(model.calls[0].prompt).toContain("Proper nouns belong only");
    expect(out).toEqual([
      "death-and-its-administration › Mechanisms: dropped This is too short.… (4 words, deictic opener)",
      "death-and-its-administration › Mechanisms: dropped A deputy files the final account in Colm… (proper noun Colma)",
      "death-and-its-administration › Mechanisms: 1 lines",
      "death-and-its-administration › Places: dropped the Colma trench… (proper noun Colma)",
      "death-and-its-administration › Places: nothing survived",
    ]);
    const d = parseSetting(read(), "fog").domains[2];
    expect(d.sections.Mechanisms).toBe("- Nobody to claim you, so a county acts: the flat inventoried and auctioned, the ashes held their interval, then a name read aloud once.");
    expect(d.sections.Places).toBe("none");
  });

  test("a domain over the word budget is refused without a call; the others proceed", async () => {
    const { db, sdir, read } = setup();
    writeFileSync(join(sdir, "fog", "reference", "land-and-title.md"), "---\ntopic: x\n---\n" + "word ".repeat(60001));
    const model = new FakeModel({ distill: () => sec("Clocks", ["never reached"]) });
    const p = new Pipeline(db, model, { settingsDir: sdir });
    const out = await distill(p, "fog");
    expect(out[0]).toBe("setting fog › land-and-title: 60001 words of reference exceeds 60000; split the domain or trim Sources");
    expect(model.calls).toHaveLength(0);
    expect(parseSetting(read(), "fog").domains[0].sections.Clocks).toBe("none");
  });

  test("a double refusal reports the domain and leaves the file unchanged; a lint failure stops before any call", async () => {
    const { db, sdir, read } = setup();
    const before = read();
    const model = new FakeModel({ distill: [{ text: "", stop: "refusal" }, { text: "", stop: "refusal" }] });
    const p = new Pipeline(db, model, { settingsDir: sdir });
    expect(await distill(p, "fog", { domain: "land-and-title" })).toEqual(["land-and-title: refusal"]);
    expect(read()).toBe(before);
    writeFileSync(join(sdir, "fog.md"), before.replace("#### Clocks\n\nnone\n\n", ""));
    await expect(distill(p, "fog")).rejects.toThrow(/land-and-title › Clocks: missing/);
    expect(model.calls).toHaveLength(2);
  });
});
