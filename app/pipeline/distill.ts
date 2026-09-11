/**
 * `cloudchamber distill <id> [--domain slug]`: for each domain, fill every section
 * that is `none` or carries the redraft marker from the reference files the
 * domain's Sources name. One model call per domain, through the Pipeline so
 * the step is recorded like any other. Filled sections are never touched;
 * Frame and Sources are never written. Lines that fail the theme validator
 * (Mechanisms) or carry a proper noun while the setting is masked are dropped
 * and reported, not written.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RUN } from "./config.ts";
import type { Pipeline } from "./draw.ts";
import { StepFailure } from "./draw.ts";
import { sections as parseSections, words } from "./model.ts";
import { fill, TEMPLATES } from "./prompts.ts";
import {
  FILLABLE, REDRAFT, isEmpty, lintSetting, formatFinding, parseSetting, replaceSection, settingPath, sourceFiles,
  type Domain, type DomainSection, type Setting,
} from "./settings.ts";
import { properNouns, validateTheme } from "./themes.ts";

export type DistillOpts = { domain?: string };

const needsFill = (d: Domain, s: DomainSection) => isEmpty(d.sections[s]) || d.sections[s].includes(REDRAFT);

/** Strip the front matter of a reference file; the prose is what the model reads. */
function referenceText(path: string): string {
  const t = readFileSync(path, "utf8");
  const m = /^---\n[\s\S]*?\n---\n?/.exec(t);
  return (m ? t.slice(m[0].length) : t).trim();
}

export function distillPrompt(setting: Setting, d: Domain, toFill: DomainSection[], reference: string): string {
  const definitions = toFill.map((s) => TEMPLATES.distillDefinitions[s]).join("\n\n");
  return fill("distill", {
    matrix: setting.sections.Matrix, heading: d.heading, frame: d.sections.Frame, definitions,
    mask: setting.names ? "" : fill("distillMask", {}), reference,
  });
}

/** Returns the report lines, one per event, in the `<domain> › <section>: <what>` form. */
export async function distill(p: Pipeline, id: string, opts: DistillOpts = {}): Promise<string[]> {
  const dir = p.settingsDir;
  const path = settingPath(id, dir);
  if (!existsSync(path)) throw new Error(`setting ${id}: no file at sources/settings/${id}.md`);
  let text = readFileSync(path, "utf8");
  const findings = lintSetting(text, id, (rel) => existsSync(join(dir, id, rel)));
  if (findings.length) throw new Error(`setting ${id} fails lint:\n${findings.map(formatFinding).join("\n")}`);
  const setting = parseSetting(text, id, dir);
  const domains = opts.domain ? setting.domains.filter((d) => d.slug === opts.domain) : setting.domains;
  if (opts.domain && !domains.length) throw new Error(`setting ${id}: no domain ${opts.domain}`);
  const out: string[] = [];
  for (const d of domains) {
    const toFill = FILLABLE.filter((s) => needsFill(d, s));
    if (!toFill.length) { out.push(`${d.slug}: nothing to fill`); continue; }
    const files = sourceFiles(d).map((f) => join(dir, id, f));
    const reference = files.map((f) => referenceText(f)).join("\n\n---\n\n");
    const n = words(reference);
    if (n > RUN.distillWords) { out.push(`setting ${id} › ${d.slug}: ${n} words of reference exceeds ${RUN.distillWords}; split the domain or trim Sources`); continue; }
    let value: Record<string, string[]>;
    try {
      ({ value } = await p.invoke(null, null, "distill", distillPrompt(setting, d, toFill, reference), (raw) => {
        const secs = parseSections(raw);
        const got: Record<string, string[]> = {};
        for (const s of toFill) {
          const body = secs[s.toLowerCase()];
          if (body === undefined) throw new Error(`missing <section name="${s}">`);
          got[s] = body.split("\n").map((l) => l.replace(/^\s*[-*]\s+/, "").trim()).filter(Boolean);
        }
        return got;
      }, `setting/${id}/${d.slug}`));
    } catch (e) {
      out.push(`${d.slug}: ${e instanceof StepFailure ? e.reason : String((e as any)?.message ?? e)}`);
      continue;
    }
    for (const s of toFill) {
      const kept: string[] = [];
      for (const line of value[s]) {
        const why = s === "Mechanisms" ? validateTheme(line) : [];
        if (!setting.names && s !== "Institutions") why.push(...properNouns(line).map((w) => `proper noun ${w}`));
        if (why.length) out.push(`${d.slug} › ${s}: dropped ${line.slice(0, 40)}… (${[...new Set(why)].join(", ")})`);
        else kept.push(line);
      }
      const cap = RUN.distillCaps[s] ?? Infinity;
      const capped = kept.slice(0, cap);
      const body = capped.length ? capped.map((l) => `- ${l}`).join("\n") : "none";
      if (!capped.length) out.push(`${d.slug} › ${s}: nothing survived`);
      else out.push(`${d.slug} › ${s}: ${capped.length} lines${kept.length > cap ? ` (${kept.length - cap} over the cap of ${cap} dropped)` : ""}`);
      text = replaceSection(text, id, d.slug, s, body);
    }
    writeFileSync(path, text);
  }
  return out;
}
