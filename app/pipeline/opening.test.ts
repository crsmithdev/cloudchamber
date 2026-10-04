import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { capture, PARTS, SCHEDULE } from "./opening.capture.ts";
import { loadDraftConfig } from "./draftconfig.ts";
import { HOOK_LINE, hookLine, scenePrompt } from "./write.ts";
import { TEMPLATES } from "./prompts.ts";

/** The prompts captured on c814392, before the opening and clarity keys: the defaults and the listen profile must still produce them. */
const GOLDEN = JSON.parse(readFileSync(join(import.meta.dir, "opening.golden.json"), "utf8")) as Record<string, Record<string, string>>;
const screen = (c: Record<string, string>, k: number) => JSON.parse(c[`screen-${k}`]) as { prompt: string; names: string[] };

describe("the opening and clarity keys", () => {
  test("the defaults and the listen profile give today's prompts byte for byte", async () => {
    expect(await capture()).toEqual(GOLDEN.default!);
    expect(await capture("listen")).toEqual(GOLDEN.listen!);
    expect(HOOK_LINE).toBe("The first 150 words of this beat say what is wrong: the thing the story is about, or its first effect, named or shown before any routine, setting or history.");
  });

  test("opening.window drives the listen schedule, the hook-late question and its rewrite line", async () => {
    const c = await capture("listen", { "opening.window": 40 });
    expect(c.schedule).toContain("it says what is wrong inside its first 40 words.");
    expect(screen(c, 1).prompt).toContain("hook-late: the first 40 words do not say what is wrong");
    expect(c["lines-register"]).toContain("The first 40 words of this beat say what is wrong");
    expect(c.schedule + screen(c, 1).prompt + c["lines-register"]).not.toContain("150 words");
  });

  test("opening.mode: promise and cold ask beat 1 for their opening, in the schedule, the scene, the screen and the rewrite; slow asks no hook", async () => {
    const promise = await capture("listen", { "opening.mode": "promise", "opening.window": 40 });
    expect(promise.schedule).toContain("Beat 1 opens on a promise: within its first 40 words the narrator states their situation, the work or the place the story happens in, and what went wrong there");
    expect(promise["scene-1"]).toContain(`<telling>\n${hookLine({ mode: "promise", window: 40, echo_title: false })}\n</telling>`);
    expect(promise["scene-2"]).not.toContain("<telling>");
    expect(screen(promise, 1).prompt).toContain("hook-late: the first 40 words do not state both the narrator's situation and what went wrong");
    expect(promise["lines-register"]).toContain("the narrator states their situation, the work or the place the story happens in, and what went wrong there");
    const cold = await capture("listen", { "opening.mode": "cold" });
    expect(cold.schedule).toContain("Beat 1 opens inside the wrong thing, while it is happening");
    expect(cold["scene-1"]).toContain("This beat opens inside the wrong thing");
    expect(screen(cold, 1).prompt).toContain("hook-late: the scene does not open inside the wrong thing");
    const slow = await capture("listen", { "opening.mode": "slow" });
    expect(screen(slow, 1).prompt).not.toContain("hook-late");
    expect(screen(slow, 1).names).not.toContain("hook-late");
    expect(slow.schedule).toContain("A first beat that holds the ordinary the story will break");
    expect(slow.schedule).not.toContain("150 words");
    expect(slow["scene-1"]).not.toContain("<telling>");
  });

  test("the promise opening asks for the narrator's situation, not a name or a self-introduction (todo #38)", async () => {
    const c = await capture("testimony");
    const asks = [c.schedule!, c["scene-1"]!, screen(c, 1).prompt, c["lines-register"]!].join("\n");
    expect(asks).toContain("the opening does not introduce the narrator by name");
    expect(asks).not.toMatch(/who (they are|is telling|the narrator is)|the narrator the title names|introduces? (themselves|himself|herself)/i);
    expect(asks).not.toMatch(/\b(says|gives|states|tells)\b[^.]{0,30}\b(their|his|her|the narrator's|a) name\b/i);
  });

  test("opening.echo_title puts the seed title's promise in the schedule and beat 1", async () => {
    const c = await capture(undefined, { "opening.echo_title": "true" });
    expect(c.schedule).toContain("The seed is the story's title, and beat 1 keeps its promise");
    expect(c["scene-1"]).toContain(`The story's title is "${PARTS.seed}". This beat keeps the title's promise in its own words`);
    expect(c["scene-2"]).not.toContain("title");
  });

  test("clarity.signposts = spoken: a moved beat opens on a spoken mark, and the register no longer asks the first sentence for the time and place", async () => {
    const c = await capture("listen", { "clarity.signposts": "spoken" });
    for (const k of [1, 2, 3]) {
      expect(c[`scene-${k}`]).toContain("When the time moves, the beat's first words say so the way a person telling it would");
      expect(c[`scene-${k}`]).not.toContain("When the time or the place changes, the first sentence says so");
    }
    expect(c["scene-3"]).toContain("so its first words mark the move aloud, the way a person telling it would, before its events begin.");
    expect(c["lines-register"]).toContain("Its first words mark the move aloud");
    expect(c["lines-register"]).not.toContain("Its opening places the listener in the new time");
  });

  test("clarity.focal = 1 holds every beat to the narrator's point of view, in the schedule and every scene", async () => {
    const c = await capture(undefined, { "clarity.focal": 1 });
    expect(c.schedule).toContain("One point of view in every beat: the narrator's.");
    for (const k of [1, 2, 3]) expect(c[`scene-${k}`]).toContain("<telling>\nOne point of view: the narrator's.");
  });

  test("clarity.recap asks each beat after the first to say its stake once, early", async () => {
    const c = await capture(undefined, { "clarity.recap": "true" });
    expect(c["scene-1"]).not.toContain("what is at stake now");
    expect(c["scene-2"]).toContain("what is at stake now (The keeper's life)");
    expect(c["scene-3"]).toContain("what is at stake now (The town)");
  });

  test("structure.register = teller is the signal register's plain speech from a narrator who faces the listener", async () => {
    const c = await capture(undefined, { "structure.register": "teller" });
    expect(c["scene-1"]).toContain('One narrator tells this aloud to a listener they speak to as "you"');
    expect(c["scene-1"]).toContain("Keep only the numbers a person would say aloud");
    expect(c["scene-1"]).toContain("When the time or the place changes, the first sentence says so.");
    expect(c["scene-1"]).not.toContain("One narrator reads this aloud to listeners");
  });

  test("the teller register quotes no line a draft could copy (todo #37)", async () => {
    const texts = [TEMPLATES.sceneTeller, TEMPLATES.tellerFirst, TEMPLATES.tellerOutside];
    // a quoted span of two words or more is a line to copy; "you" alone names the address
    for (const t of texts) expect(t).not.toMatch(/"[^"\n]*\s[^"\n]*"/);
    const c = await capture("testimony");
    expect(c["scene-1"]).not.toContain("nobody believes");
  });

  test("the teller follows the schedule's person: a third-person schedule gets an outside narrator who never says I", () => {
    const cfg = loadDraftConfig("dossier").config;
    const third = { ...SCHEDULE, form: { ...SCHEDULE.form, person: "third limited" } };
    const p = scenePrompt(PARTS, third, third.beats[0]!, [], undefined, cfg);
    const reg = p.slice(p.indexOf("<register>"), p.indexOf("</register>"));
    expect(reg).toContain('speak to as "you"');
    expect(reg).toContain("It did not happen to the narrator: they tell it in the third person");
    expect(reg).toContain("they never say I, me or my");
    const first = scenePrompt(PARTS, SCHEDULE, SCHEDULE.beats[0]!, [], undefined, cfg);
    expect(first).not.toContain("never say I");
    expect(first).toContain('One narrator tells this aloud to a listener they speak to as "you", and tells it to be believed. They say what they are about to tell');
  });

  test("form.container = rules asks the schedule for the list and every scene to open a rule on it", async () => {
    const c = await capture(undefined, { "form.container": "rules" });
    expect(c.schedule).toContain("container: rules");
    expect(c.schedule).toContain("Before the beats, a <rules> tag: the list, numbered, one rule per line");
    expect(c.schedule).toContain("The <form> tag's container line says rules.");
    const s = { ...SCHEDULE, form: { ...SCHEDULE.form, container: "rules" } };
    const cfg = loadDraftConfig(undefined, { "form.container": "rules" }).config;
    expect(scenePrompt(PARTS, s, s.beats[1]!, [], undefined, cfg)).toContain("When the schedule has this beat open a rule, the beat opens on the rule");
    expect((await capture())["scene-2"]).not.toContain("open a rule");
  });

  test("the testimony profile carries every key it sets into beat 1", async () => {
    const c = await capture("testimony");
    expect(c["scene-1"]).toContain('speak to as "you"');
    expect(c["scene-1"]).toContain("Within the first 40 words of this beat");
    expect(c["scene-1"]).toContain(`The story's title is "${PARTS.seed}"`);
    expect(c["scene-1"]).toContain("One point of view: the narrator's.");
    expect(c["scene-1"]).toContain("The story's first sentence belongs to the narrator");
    expect(c.schedule).toContain("person: first");
    expect(c.schedule).toContain("tense: past");
  });
});
