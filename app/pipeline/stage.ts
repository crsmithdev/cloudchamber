/**
 * Which draw and candidate a draw came from. The tabs and the statuses live in
 * lifecycle.ts.
 */
import type { Pipeline } from "./draw.ts";
import { ofKind } from "./artifacts.ts";
import { Lineage } from "./lineage.ts";

export type Origin = { id: string; name: string | null; index: number | null; probability: number | null };

/**
 * The draw that ran the premises, and the candidate this one develops. A fork
 * names its candidate on the vignette it copied; a repair keeps its source's.
 */
export function originOf(p: Pipeline, drawId: string, lineage: Lineage = new Lineage([], (id) => p.draw(id))): Origin | null {
  const path = lineage.path(drawId);
  let index: number | null = null;
  let probability: number | null = null;
  // the nearest fork names its candidate on the vignette it copied
  for (const id of path) {
    if (!lineage.row(id).forked_from) continue;
    const copied = ofKind(p.artifacts(id), "vignette").find((a) => a.meta.forked_from);
    if (copied) { index = copied.meta.index ?? null; probability = copied.meta.probability ?? null; break; }
  }
  const cur = lineage.row(path.at(-1)!);
  if (index === null && cur.chosen_step) {
    const c = p.candidates(cur.id).find((x) => x.step_id === cur.chosen_step);
    if (c) { index = c.index; probability = c.probability; }
  }
  if (cur.id === drawId && index === null) return null;
  return { id: cur.id, name: cur.name, index, probability };
}
