/**
 * Every tunable, read at run time rather than written down: the settings and
 * their list sizes come from sources/settings, the vocabularies from the
 * tomls, the sources from the store. `cloudchamber help` prints this after the
 * command grammar, and `--md` writes docs/knobs.md.
 */
import { existsSync, readdirSync } from "node:fs";
import { BANDS, DARKNESS, GENRES, RUN, SAMPLING, loadStages } from "./config.ts";
import { TEMPLATES } from "./prompts.ts";
import { LISTS, loadSetting } from "./settings.ts";
import { profileNames } from "./draftconfig.ts";
import { sourceLabel } from "./bank.ts";
import { SETTINGS } from "./paths.ts";
import draftToml from "./draft.toml";
import type { Db } from "./store/db.ts";

export type Section = { title: string; note?: string; rows: [string, string][] };

const SAMPLING_NOTE: Record<string, string> = {
  tail: "the strangest readings of the seed; the default",
  "off-centre": "unusual, but inside the tradition the seed belongs to",
  standard: "the strongest conventional treatment",
};

/** The setting ids present, or none when the directory is absent. */
function settingListing(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
}

export function knobs(db: Db, settingsDir: string = SETTINGS): Section[] {
  // The settings are not in the repository; a checkout without them lists none.
  const settings = settingListing(settingsDir);
  const stages = loadStages();
  const sources = db.query("SELECT id, path, genre FROM sources ORDER BY id").all() as { id: string; path: string; genre: string }[];
  const d = draftToml as any;
  return [
    {
      title: "draw",
      note: "cloudchamber draw and POST /api/draws take the same knobs.",
      rows: [
        ["--auto", "skip the gate by taking the lowest stated probability; otherwise the draw waits for you"],
        ["--setting", `one of ${settings.join(", ")}, or omitted for an unrestricted draw`],
        ["--genre", "free text, dropped into one line of the premises ask; omitted, it follows the examples drawn"],
        ["--shape", "listen; the premises are asked for a story told aloud: a first moment, an arrival in the flesh, a cost paid on the page, an aftermath. Not stored on the draw; the premises step's prompt shows it"],
        ["--sampling", `${SAMPLING.join(" | ")}; where in the stated distribution the five premises are asked for`],
        ["--darkness", `${DARKNESS.join(" | ")}; how much the story takes, asked of the premises, the vignettes and the ending; omitted, nothing is asked`],
        ["--source", "one or more source ids, comma-separated, to draw the six examples from"],
        ["--author", "restrict the examples to one author"],
        ["--seed / --seed-id", "a typed seed, or a theme id from the bank; omitted, one is drawn"],
      ],
    },
    {
      title: "settings",
      note: `Every draw under a setting carries its lists whole. Caps: ${RUN.listCaps.entries} entries a list, ${RUN.listCaps.words} words an entry.`,
      rows: settings.map((id) => {
        const s = loadSetting(id, settingsDir);
        return [id, LISTS.map((n) => `${s.lists[n].length} ${n.toLowerCase()}`).join(" · ")] as [string, string];
      }),
    },
    {
      title: "genre shortcuts",
      note: "From genres.toml. Shortcuts only: any string is accepted, and several joined with \" and \" is a blend.",
      rows: Object.entries(GENRES).map(([g, vs]) => [g, vs.join(", ")] as [string, string]),
    },
    {
      title: "sampling",
      note: "Each mode is a band the premises must state and a register the ask is written in; the prose does most of the work.",
      rows: SAMPLING.map((m) => [m, `${BANDS[m].floor} to ${BANDS[m].ceiling} · ${SAMPLING_NOTE[m]}`] as [string, string]),
    },
    {
      title: "darkness",
      note: "One sentence per level, the same in the premises, execute and ending asks. Omitted, no sentence is added.",
      rows: DARKNESS.map((d) => [d, TEMPLATES.darknessAsk[d]] as [string, string]),
    },
    {
      title: "example sources",
      rows: sources.map((s) => { const l = sourceLabel(s.id, s.path); return [s.id, `${l.group} · ${l.title} · ${s.genre}`] as [string, string]; }),
    },
    {
      title: "drafting",
      note: "cloudchamber draft; every key of draft.toml is overridable per draw, and a profile bundles overrides.",
      rows: [
        ["--profile", profileNames().join(", ") || "none"],
        ["--words", `${d.length.words} (tolerance ${d.length.tolerance})`],
        ["--beats", `${d.beats.count}, between ${d.beats.min} and ${d.beats.max} of ${d.beats.words_min}-${d.beats.words_max} words`],
        ["--tense / --person", "past | present · first | second | third"],
        ["--chronology / --container", "linear | nonlinear · prose | document | interleaved"],
        ["--order", d.scenes.order],
        ["checks", `${d.checks.enabled.join(", ")} · ${d.checks.samples} samples, kept at ${d.checks.keep_if}`],
        ["screens", `${d.screens.enabled.join(", ")} · ${d.screens.samples} samples, kept at ${d.screens.keep_if}`],
        ["repair", `auto: up to ${d.repair.rounds} rounds, accepting findings scoring ${d.repair.stop_score}+, patience ${d.repair.patience}`],
      ],
    },
    {
      title: "fixed in code",
      note: "config.ts. Changing one of these is an edit and a test run, not a flag.",
      rows: [
        ["premises per draw", String(RUN.k)],
        ["examples per draw", String(RUN.examples)],
        ["context vignettes", String(RUN.contextVignettes)],
        ["word targets", `premise ${RUN.premiseWords} · vignette ${RUN.vignetteWords} · outline section ${RUN.outlineSectionWords} · ending ${RUN.endingWords}`],
        ["core jobs", RUN.coreJobs.join(", ")],
      ],
    },
    {
      title: "models",
      note: "stages.toml: the model each stage calls, the one it falls back to on a refusal, and how long it is asked to think. A draw overrides any model: `--models judgement=claude-sonnet-5,scene=claude-opus-5` on draw or draft, `models` on the API, the two selects on the forms; groups are prose, judgement, corpus, and the override follows the draw into its repairs and forks. Effort is set in the file alone; unset leaves the CLI default.",
      rows: Object.entries(stages).map(([s, c]) => [s, `${c.model} → ${c.fallback}${c.effort ? ` · effort ${c.effort}` : ""}${c.tools ? ` · tools ${c.tools}` : ""}`] as [string, string]),
    },
  ];
}

export function asText(sections: Section[]): string {
  return sections.map((s) => {
    const pad = Math.max(0, ...s.rows.map((r) => r[0].length));
    return [`— ${s.title} —`, ...(s.note ? [s.note] : []), ...s.rows.map(([k, v]) => `  ${k.padEnd(pad)}  ${v}`)].join("\n");
  }).join("\n\n");
}

/** A cell's pipes would end the column, and every value here is prose or a flag list. */
const cell = (s: string) => s.replace(/\|/g, "\\|");

export function asMarkdown(sections: Section[]): string {
  return ["# Cloud Chamber knobs", "", "Generated by `cloudchamber help --md`; every value here is read from the setting files, the tomls and the store when that runs.", "",
    ...sections.flatMap((s) => [`## ${s.title}`, "", ...(s.note ? [s.note, ""] : []), "| | |", "|---|---|",
      ...s.rows.map(([k, v]) => `| \`${cell(k)}\` | ${cell(v)} |`), ""])].join("\n");
}
