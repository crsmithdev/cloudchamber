/** briefs/<draw-id>/: the chosen vignette, outline, two context vignettes, ending, and the trail. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BRIEFS } from "./paths.ts";
import type { Db } from "./store/db.ts";
import { pipelineVersion } from "./version.ts";
import { partOf, partsFrom, partsIn } from "./briefparts.ts";
import { parseMeta, type Artifact } from "./artifacts.ts";

export function writeBrief(db: Db, drawId: string, base: string = BRIEFS, settledLines: { round: number; replacement: string }[] = []): string {
  const draw = db.query("SELECT * FROM draws WHERE id = ?").get(drawId) as any;
  const steps = db.query("SELECT * FROM steps WHERE draw_id = ? ORDER BY started_at, rowid").all(drawId) as any[];
  const rows = db.query("SELECT a.*, s.stage FROM artifacts a JOIN steps s ON s.id = a.step_id WHERE s.draw_id = ? ORDER BY s.started_at, a.rowid").all(drawId) as { id: string; step_id: string; kind: string; content: string; meta: string; stage: string }[];
  const arts: (Artifact & { stage: string })[] = rows.map((r) => ({ ...r, meta: parseMeta(r.meta) }));
  const parts = partsFrom(arts, draw.chosen_step);
  const chosen = partOf(parts, "vignette"), outline = partOf(parts, "outline"), ending = partOf(parts, "ending");
  const dir = join(base, drawId);
  mkdirSync(dir, { recursive: true });
  const w = (name: string, body: string) => writeFileSync(join(dir, name), body.trimEnd() + "\n");
  // one file per part, named for its role: context-1.md is the same job in every round, whichever stage wrote it
  w("vignette.md", chosen?.text ?? "");
  w("outline.md", outline?.text ?? "");
  partsIn(parts, "context").forEach((c, i) => w(`context-${i + 1}.md`, `*Job: ${c.meta.job}*\n\n${c.text}`));
  w("ending.md", ending?.text ?? "");
  if (ending?.meta.previous) w("ending.previous.md", ending.meta.previous);

  const examples = (JSON.parse(draw.example_ids) as string[]).map((pid) => {
    const p = db.query("SELECT p.id, p.voice, p.mode, p.words, s.title, s.author, s.source_id FROM passages p JOIN stories s ON s.id = p.story_id WHERE p.id = ?").get(pid) as any;
    return p ? `- \`${p.voice}/${p.mode}\` ${p.source_id} · ${p.title} — ${p.author} · ${p.words}w · ${p.id}` : `- ${pid} (no longer in the pool)`;
  });
  const cands = arts.filter((a) => a.kind === "vignette" && a.stage === "execute").map((a) => ({ a, m: a.meta })).sort((x, y) => x.m.probability - y.m.probability);
  const modelByStage = new Map<string, string>();
  for (const s of steps) if (s.status === "done") modelByStage.set(s.stage, s.model);
  const refusals = steps.filter((s) => s.fail_reason === "refusal").map((s) => `${s.stage} on ${s.model}`);
  const forked: string[] = draw.forked_from ? ["## forked_from", "", `${draw.forked_from}, its candidate ${chosen?.meta.index ?? "?"}`, ""] : [];
  const settled: string[] = settledLines.length
    ? ["## settled in earlier rounds", "", ...settledLines.map((sc) => `- round ${sc.round}: ${sc.replacement}`), ""]
    : [];
  const repaired: string[] = draw.repaired_from
    ? ["## repaired_from", "", draw.repaired_from, "", ...((outline?.meta.constraints as string[] | undefined) ?? []).map((c) => `- ${c}`), ""]
    : [];
  const trail = [
    `# Trail${draw.repaired_from ? " (repaired)" : draw.forked_from ? " (forked)" : ""} — ${drawId}`, "",
    ...repaired, ...settled, ...forked,
    `setting: ${draw.setting ?? "none (unrestricted)"} · genre: ${draw.genre} · sampling: ${draw.sampling} · darkness: ${draw.darkness ?? "none"} · mode: ${draw.mode} · segment: ${draw.segment ?? "all"}`, "",
    `## seed (${draw.seed_mode}${draw.seed_theme_id ? `, theme ${draw.seed_theme_id}` : ""})`, "", draw.seed_text, "",
    "## examples", "", ...examples, "",
    "## premises, by stated probability", "",
    ...cands.map(({ a, m }) => `- **${m.probability}** [${m.index}]${a.step_id === draw.chosen_step ? " ← chosen" : ""} vignette ${a.id}${m.warnings?.length ? ` (${m.warnings.join(", ")})` : ""}: ${m.premise}`), "",
    `gate: ${draw.gate_method}, chose vignette from step ${draw.chosen_step}`, "",
    "## jobs", "", ...partsIn(parts, "job").map((j, i) => `${i + 1}. ${j.text}`), "",
    "## models", "", ...[...modelByStage].map(([s, m]) => `- ${s}: ${m}`),
    ...(refusals.length ? ["", `refusals: ${refusals.join("; ")}`] : []), "",
    `steps: ${steps.length} · pipeline ${pipelineVersion()}`,
  ];
  w("trail.md", trail.join("\n"));
  return dir;
}

