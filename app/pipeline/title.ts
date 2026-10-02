/**
 * The title: two sentences a listener sees before the story, written from the
 * finished scenes and the brief's premise, after the last screen. It is a
 * `title` artifact on the draw, and the latest holds: a second call or a
 * title the operator types replaces it with no schema change. It is not the
 * draw's `name`, which is a slug from the seed.
 */
import type { Pipeline } from "./draw.ts";
import { chainOf } from "./chain.ts";
import { briefParts } from "./briefparts.ts";
import { latestOf } from "./artifacts.ts";
import { fill } from "./prompts.ts";
import { need, words } from "./model.ts";

/** The words a title is asked to stay inside; the parser allows a few over, so a title one word long is not a retry. */
export const TITLE_WORDS_MAX = 16;
const SLACK = 4;

/** The <title> tag's text, one line, without wrapping quotes or a final stop; a missing tag or one far over the cap fails shape. */
export function parseTitle(text: string): string {
  const t = need(text, "title").replace(/\s+/g, " ").replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").replace(/\.$/, "").trim();
  if (!t) throw new Error("empty <title>");
  if (words(t) > TITLE_WORDS_MAX + SLACK) throw new Error(`title is ${words(t)} words, over ${TITLE_WORDS_MAX}`);
  return t;
}

/** The ask: the premise, the scenes as they stand, and the items the schedule keeps back past the midpoint, which the title must not name. */
export function titlePrompt(premise: string, scenes: string[], kept: string[]): string {
  return fill("title", {
    words: String(TITLE_WORDS_MAX), premise,
    story: scenes.map((s) => s.trim()).join("\n\n* * *\n\n"),
    kept: kept.length ? fill("titleKept", { items: kept.map((k) => `- ${k}`).join("\n") }) : "",
  });
}

/** The draw's title as it stands, or null before one is written. */
export function titleOf(p: Pipeline, drawId: string): string | null {
  return latestOf(p.artifacts(drawId), "title")?.content ?? null;
}

/** One call: the title from the scenes and the premise. The step hangs from the draw's last done step. */
export async function runTitle(p: Pipeline, drawId: string): Promise<string> {
  const chain = chainOf(p, drawId);
  const scenes = chain.scenes();
  if (!scenes.length) throw new Error(`draw ${drawId}: no scenes to title`);
  const M = scenes.length;
  // what a listener is not told until the second half, and what they are never told
  const kept = [...new Set((chain.schedule()?.beats ?? []).flatMap((b) => b.withheld).filter((w) => w.until > M / 2).map((w) => w.item))];
  const premise = briefParts(p, drawId).premise;
  const { step, value } = await p.invoke(drawId, chain.lastStep()?.id ?? null, "title", titlePrompt(premise, scenes.map((s) => s.text), kept), parseTitle);
  p.artifact(step, "title", value, { source: "model" });
  return value;
}

/** The operator's own title, recorded as a step that made no call. */
export function setTitle(p: Pipeline, drawId: string, text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) throw new Error("title text required");
  const step = p.recordStep(drawId, chainOf(p, drawId).lastStep()?.id ?? null, "title", "operator", { title: t });
  p.artifact(step, "title", t, { source: "operator" });
  return t;
}
