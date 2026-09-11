/**
 * Every tunable, read at run time rather than written down: the settings and
 * their domain slugs come from sources/settings, the vocabularies from the
 * tomls, the sources from the store. `cloudchamber help` prints this after the
 * command grammar, and `--md` writes docs/knobs.md and answers the Voice
 * Bridge's knobs tool.
 */
import { readdirSync } from "node:fs";
import { BANDS, GENRES, RUN, SAMPLING, loadStages } from "./config.ts";
import { loadSetting } from "./settings.ts";
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

export function knobs(db: Db, settingsDir: string = SETTINGS): Section[] {
  const settings = readdirSync(settingsDir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
  const stages = loadStages();
  const sources = db.query("SELECT id, path, genre FROM sources ORDER BY id").all() as { id: string; path: string; genre: string }[];
  const d = draftToml as any;
  return [
    {
      title: "draw",
      note: "cloudchamber draw, POST /api/draws, and the Voice Bridge draw tool take the same knobs.",
      rows: [
        ["--auto", "skip the gate by taking the lowest stated probability; otherwise the draw waits for you"],
        ["--setting", `one of ${settings.join(", ")}, or omitted for an unrestricted draw`],
        ["--domains", "comma-separated slugs of that setting, pinned in the order given; drawn at random when omitted"],
        ["--genre", "free text, dropped into one line of the premises ask; omitted, it follows the examples drawn"],
        ["--sampling", `${SAMPLING.join(" | ")}; where in the stated distribution the five premises are asked for`],
        ["--source", "one or more source ids, comma-separated, to draw the six examples from"],
        ["--author", "restrict the examples to one author"],
        ["--seed / --seed-id", "a typed seed, or a theme id from the bank; omitted, one is drawn"],
      ],
    },
    {
      title: "settings and their domains",
      note: "The slug of a domain is its heading, lowercased and hyphenated. `draw` is how many are taken when none are pinned.",
      rows: settings.map((id) => {
        const s = loadSetting(id, settingsDir);
        return [id, `draw ${s.draw} · ${s.domains.map((x) => x.slug).join(", ")}`] as [string, string];
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
      note: "stages.toml: the model each stage calls, and the one it falls back to on a refusal.",
      rows: Object.entries(stages).map(([s, c]) => [s, `${c.model} → ${c.fallback}${c.tools ? ` · tools ${c.tools}` : ""}`] as [string, string]),
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
