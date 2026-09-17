/**
 * Which draw and candidate a draw came from. The tabs and the statuses live in
 * lifecycle.ts.
 */
import type { Pipeline } from "./draw.ts";

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
