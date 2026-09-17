/**
 * Which stage of the UI reads a draw, and which draw and candidate it came
 * from (docs/specs/2026-09-10-four-tabs.md).
 *
 * Every draw is in ideate for ever, because the gate is the only place to
 * develop a second candidate. `stageOf` names the later stage it also
 * belongs to: check from the moment a candidate is chosen, write from the
 * moment it has a schedule.
 */
import type { DrawRow, Pipeline } from "./draw.ts";

export type Stage = "ideate" | "check" | "write";

const CHECK = new Set(["done", "checking", "awaiting_check_gate", "repairing", "repaired"]);
const WRITE = new Set(["drafting", "awaiting_draft_gate", "drafted"]);

export function stageOf(draw: Pick<DrawRow, "id" | "status" | "chosen_step" | "repaired_from">): Stage {
  if (WRITE.has(draw.status)) return "write";
  if (CHECK.has(draw.status) || draw.chosen_step || draw.repaired_from) return "check";
  return "ideate";
}

export type Origin = { id: string; name: string | null; index: number | null; probability: number | null };

/**
 * The draw that ran the premises, and the candidate this one develops. A fork
 * names its candidate on the vignette it copied; a repair keeps its source's.
 */
export function originOf(p: Pipeline, drawId: string): Origin | null {
  let cur = p.draw(drawId);
  let index: number | null = null;
  let probability: number | null = null;
  for (let hop = 0; hop < 10; hop++) {
    if (cur.forked_from && index === null) {
      const copied = p.artifacts(cur.id).find((a) => a.kind === "vignette" && JSON.parse(a.meta).forked_from);
      if (copied) { const m = JSON.parse(copied.meta); index = m.index ?? null; probability = m.probability ?? null; }
    }
    const from = cur.repaired_from ?? cur.forked_from;
    if (!from) break;
    cur = p.draw(from);
  }
  if (index === null && cur.chosen_step) {
    const c = p.candidates(cur.id).find((x) => x.step_id === cur.chosen_step);
    if (c) { index = c.index; probability = c.probability; }
  }
  if (cur.id === drawId && index === null) return null;
  return { id: cur.id, name: cur.name, index, probability };
}
