/** briefs/<draw-id>/: the chosen vignette, outline, two context vignettes, ending, and the trail. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BRIEFS } from "./paths.ts";
import type { Db } from "./store/db.ts";
import type { StageConfig, StageName } from "./config.ts";
import { pipelineVersion } from "./version.ts";
import { loadSetting } from "./settings.ts";
import { SETTINGS } from "./paths.ts";
import { CONTEXT_STAGES } from "./config.ts";

/** Artifacts in the order their stage produced them, which their meta records and their row order does not. */
const byIndex = <T extends { meta: string }>(as: T[]): T[] => [...as].sort((x, y) => (JSON.parse(x.meta).index ?? 0) - (JSON.parse(y.meta).index ?? 0));

export function writeBrief(db: Db, drawId: string, stages: Record<StageName, StageConfig>, base: string = BRIEFS, settingsDir: string = SETTINGS, settledLines: { round: number; replacement: string }[] = []): string {
  const draw = db.query("SELECT * FROM draws WHERE id = ?").get(drawId) as any;
  const steps = db.query("SELECT * FROM steps WHERE draw_id = ? ORDER BY started_at, rowid").all(drawId) as any[];
  const arts = db.query("SELECT a.*, s.stage FROM artifacts a JOIN steps s ON s.id = a.step_id WHERE s.draw_id = ? ORDER BY s.started_at, a.rowid").all(drawId) as any[];
  const byKind = (k: string, stages?: ReadonlySet<string>) => arts.filter((a) => a.kind === k && (!stages || stages.has(a.stage)));
  const chosen = arts.find((a) => a.kind === "vignette" && a.step_id === draw.chosen_step);
  const dir = join(base, drawId);
  mkdirSync(dir, { recursive: true });
  const w = (name: string, body: string) => writeFileSync(join(dir, name), body.trimEnd() + "\n");
  w("vignette.md", chosen?.content ?? "");
  const outline = byKind("outline").at(-1);
  w("outline.md", outline?.content ?? "");
  // by the job's index, not by which call finished first, so context-1.md is the same job in every round
  byIndex(byKind("vignette", CONTEXT_STAGES)).forEach((a, i) => w(`context-${i + 1}.md`, `*Job: ${JSON.parse(a.meta).job}*\n\n${a.content}`));
  const ending = byKind("ending").at(-1);
  w("ending.md", ending?.content ?? "");
  if (ending && JSON.parse(ending.meta).previous) w("ending.previous.md", JSON.parse(ending.meta).previous);

  const examples = (JSON.parse(draw.example_ids) as string[]).map((pid) => {
    const p = db.query("SELECT p.id, p.voice, p.mode, p.words, s.title, s.author, s.source_id FROM passages p JOIN stories s ON s.id = p.story_id WHERE p.id = ?").get(pid) as any;
    return p ? `- \`${p.voice}/${p.mode}\` ${p.source_id} · ${p.title} — ${p.author} · ${p.words}w · ${p.id}` : `- ${pid} (no longer in the pool)`;
  });
  const cands = byKind("vignette", new Set(["execute"])).map((a) => ({ a, m: JSON.parse(a.meta) })).sort((x, y) => x.m.probability - y.m.probability);
  const modelByStage = new Map<string, string>();
  for (const s of steps) if (s.status === "done") modelByStage.set(s.stage, s.model);
  const refusals = steps.filter((s) => s.fail_reason === "refusal").map((s) => `${s.stage} on ${s.model}`);
  const forked: string[] = draw.forked_from ? ["## forked_from", "", `${draw.forked_from}, its candidate ${JSON.parse(chosen?.meta ?? "{}").index ?? "?"}`, ""] : [];
  const settled: string[] = settledLines.length
    ? ["## settled in earlier rounds", "", ...settledLines.map((sc) => `- round ${sc.round}: ${sc.replacement}`), ""]
    : [];
  const repaired: string[] = draw.repaired_from
    ? ["## repaired_from", "", draw.repaired_from, "", ...((JSON.parse(outline?.meta ?? "{}").constraints as string[] | undefined) ?? []).map((c) => `- ${c}`), ""]
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
    "## jobs", "", ...byIndex(byKind("job")).map((j, i) => `${i + 1}. ${j.content}`), "",
    "## models", "", ...[...modelByStage].map(([s, m]) => `- ${s}: ${m}`),
    ...(refusals.length ? ["", `refusals: ${refusals.join("; ")}`] : []), "",
    `steps: ${steps.length} · pipeline ${pipelineVersion()}`,
  ];
  w("trail.md", trail.join("\n"));
  return dir;
}

