/**
 * Every drafting prompt a beat sheet produces, rendered under a profile, so a
 * test can hold the default and the listen profile to the text they had
 * before the opening and clarity keys existed. Capture with
 * `bun app/pipeline/opening.capture.ts > app/pipeline/opening.golden.json`.
 */
import { loadDraftConfig } from "./draftconfig.ts";
import type { BriefParts } from "./briefparts.ts";
import { linesOf, runSchedule, scenePrompt, structureScreen, STRUCTURE_RULES, type Schedule } from "./write.ts";

export const PARTS = {
  draw: {} as any, seed: "I Keep the Night Log at a Tide Station. The Sea Has Stopped Going Out", premise: "A premise.", outline: "<section name=\"departure\">The sea stops.</section>",
  outlineStepId: "s0", vignette: "The chosen vignette.", chosenStepId: "s1", contexts: ["Context one.", "Context two."], ending: "The ending.", examples: ["An example."],
} as BriefParts;

export const SCHEDULE: Schedule = {
  form: { tense: "past", person: "first", chronology: "linear", container: "prose" },
  raw: "<form>tense: past\nperson: first\nchronology: linear\ncontainer: prose</form>",
  beats: [
    { n: 1, words: 800, job: "The tide gauge reads high at slack water.", when: "night one, 2 a.m.", known: "The sea has not gone out.", withheld: [{ item: "what holds the water", until: 3 }], stakes: "The narrator's job.", set_piece: "The gauge needle.", absorbs: "chosen", pays: false },
    { n: 2, words: 900, job: "The keeper goes down to the wall.", when: "night one, 2 a.m.", known: "Something stands in the water.", withheld: [{ item: "what holds the water", until: 3 }], stakes: "The keeper's life.", set_piece: "The hand on the wall.", absorbs: "none", pays: true },
    { n: 3, words: 700, job: "The town wakes to a sea that will not move.", when: "three nights later", known: "The water holds.", withheld: [], stakes: "The town.", set_piece: "The boats on the mud.", absorbs: "ending", pays: false },
  ],
};

/** The schedule ask, read off a pipeline that records the prompt and stops. */
async function schedulePromptOf(cfg: any): Promise<string> {
  let asked = "";
  const p = { invoke: async (_d: string, _s: string, _st: string, prompt: string) => { asked = prompt; throw new Error("captured"); } } as any;
  await runSchedule(p, "d", PARTS, "<brief/>", cfg).catch(() => {});
  return asked;
}

export async function capture(profile?: string, overrides: Record<string, string | number> = {}): Promise<Record<string, string>> {
  const cfg = loadDraftConfig(profile, overrides).config;
  const out: Record<string, string> = { schedule: await schedulePromptOf(cfg) };
  for (const b of SCHEDULE.beats) {
    out[`scene-${b.n}`] = scenePrompt(PARTS, SCHEDULE, b, b.n > 1 ? ["Beat one."] : [], undefined, cfg);
    out[`screen-${b.n}`] = JSON.stringify(structureScreen(SCHEDULE, b.n, "The scene.", cfg.structure.template, cfg.opening));
  }
  const all = STRUCTURE_RULES.map((r) => r.name);
  out["lines-register"] = linesOf(all, true, cfg).join("\n");
  out["lines-all"] = linesOf(all, false, cfg).join("\n");
  return out;
}

if (import.meta.main) console.log(JSON.stringify({ default: await capture(), listen: await capture("listen") }, null, 1));
