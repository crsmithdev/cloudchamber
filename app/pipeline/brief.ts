/** briefs/<draw-id>/: the chosen vignette, outline, two context vignettes, ending, and the trail. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BRIEFS } from "./paths.ts";
import type { Db } from "./store/db.ts";
import type { StageConfig, StageName } from "./config.ts";
import { pipelineVersion } from "./version.ts";

export function writeBrief(db: Db, drawId: string, stages: Record<StageName, StageConfig>, base: string = BRIEFS): string {
  const draw = db.query("SELECT * FROM draws WHERE id = ?").get(drawId) as any;
  const steps = db.query("SELECT * FROM steps WHERE draw_id = ? ORDER BY started_at, rowid").all(drawId) as any[];
  const arts = db.query("SELECT a.*, s.stage FROM artifacts a JOIN steps s ON s.id = a.step_id WHERE s.draw_id = ? ORDER BY s.started_at, a.rowid").all(drawId) as any[];
  const byKind = (k: string, stage?: string) => arts.filter((a) => a.kind === k && (!stage || a.stage === stage));
  const chosen = arts.find((a) => a.kind === "vignette" && a.step_id === draw.chosen_step);
  const dir = join(base, drawId);
  mkdirSync(dir, { recursive: true });
  const w = (name: string, body: string) => writeFileSync(join(dir, name), body.trimEnd() + "\n");
  w("vignette.md", chosen?.content ?? "");
  w("outline.md", byKind("outline")[0]?.content ?? "");
  byKind("vignette", "context").forEach((a, i) => w(`context-${i + 1}.md`, `*Job: ${JSON.parse(a.meta).job}*\n\n${a.content}`));
  w("ending.md", byKind("ending")[0]?.content ?? "");

  const examples = (JSON.parse(draw.example_ids) as string[]).map((pid) => {
    const p = db.query("SELECT p.id, p.voice, p.mode, p.words, s.title, s.author, s.source_id FROM passages p JOIN stories s ON s.id = p.story_id WHERE p.id = ?").get(pid) as any;
    return p ? `- \`${p.voice}/${p.mode}\` ${p.source_id} · ${p.title} — ${p.author} · ${p.words}w · ${p.id}` : `- ${pid} (no longer in the pool)`;
  });
  const cands = byKind("vignette", "execute").map((a) => ({ a, m: JSON.parse(a.meta) })).sort((x, y) => x.m.probability - y.m.probability);
  const modelByStage = new Map<string, string>();
  for (const s of steps) if (s.status === "done") modelByStage.set(s.stage, s.model);
  const refusals = steps.filter((s) => s.fail_reason === "refusal").map((s) => `${s.stage} on ${s.model}`);
  const trail = [
    `# Trail — ${drawId}`, "",
    `setting: ${draw.setting ?? "none (unrestricted)"} · genre: ${draw.genre} · mode: ${draw.mode} · segment: ${draw.segment ?? "all"}`, "",
    `## seed (${draw.seed_mode}${draw.seed_theme_id ? `, theme ${draw.seed_theme_id}` : ""})`, "", draw.seed_text, "",
    "## examples", "", ...examples, "",
    "## premises, by stated probability", "",
    ...cands.map(({ a, m }) => `- **${m.probability}** [${m.index}]${a.step_id === draw.chosen_step ? " ← chosen" : ""} vignette ${a.id}${m.warnings?.length ? ` (${m.warnings.join(", ")})` : ""}: ${m.premise}`), "",
    `gate: ${draw.gate_method}, chose vignette from step ${draw.chosen_step}`, "",
    "## jobs", "", ...byKind("job").map((j, i) => `${i + 1}. ${j.content}`), "",
    "## models", "", ...[...modelByStage].map(([s, m]) => `- ${s}: ${m}`),
    ...(refusals.length ? ["", `refusals: ${refusals.join("; ")}`] : []), "",
    `steps: ${steps.length} · pipeline ${pipelineVersion()}`,
  ];
  w("trail.md", trail.join("\n"));
  return dir;
}
