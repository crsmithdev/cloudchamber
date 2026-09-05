/**
 * A setting is a file under sources/settings/ with a front-matter block:
 *
 *   ---
 *   id: setting-a
 *   name: The setting-a
 *   jobs:
 *     - matrix: Close the regional element so that removing it removes a mechanism, not an image.
 *   seed_segments: [scp, datlow-01]
 *   hard_rules: Hard rules
 *   ---
 *
 * `jobs` are appended to the outline's core jobs. `seed_segments` filters the
 * seed draw to those source ids. `hard_rules` names the heading whose section
 * goes last in every generation prompt. The body is appended after the
 * examples. Unrestricted mode is the absence of a setting.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.ts";

export type Setting = {
  id: string;
  name: string;
  jobs: { name: string; description: string }[];
  seedSegments: string[];
  hardRulesHeading: string;
  body: string;       // everything after the front matter
  hardRules: string;  // the named section, or ""
};

function parseList(v: string): string[] {
  return v.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function parseFrontMatter(text: string): { meta: Record<string, any>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, any> = {};
  let key: string | null = null;
  for (const raw of m[1].split("\n")) {
    const item = /^\s+-\s+(.*)$/.exec(raw);
    if (item && key) {
      const kv = /^([^:]+):\s*(.*)$/.exec(item[1]);
      (meta[key] as any[]).push(kv ? { name: kv[1].trim(), description: kv[2].trim() } : item[1].trim());
      continue;
    }
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(raw);
    if (!kv) continue;
    key = kv[1];
    const val = kv[2].trim();
    meta[key] = val === "" ? [] : val.startsWith("[") ? parseList(val) : val;
  }
  return { meta, body: text.slice(m[0].length) };
}

export function loadSetting(id: string): Setting {
  const path = join(ROOT, "sources", "settings", `${id}.md`);
  if (!existsSync(path)) throw new Error(`setting ${id}: no file at sources/settings/${id}.md`);
  const { meta, body } = parseFrontMatter(readFileSync(path, "utf8"));
  const heading: string = meta.hard_rules ?? "";
  let hardRules = "";
  if (heading) {
    const re = new RegExp(`^(#{1,6})\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
    const m = re.exec(body);
    if (m) {
      const level = m[1].length;
      const rest = body.slice(m.index + m[0].length);
      const end = new RegExp(`^#{1,${level}}\\s+`, "m").exec(rest);
      hardRules = (m[0] + (end ? rest.slice(0, end.index) : rest)).trim();
    }
  }
  return {
    id, name: meta.name ?? id,
    jobs: Array.isArray(meta.jobs) ? meta.jobs.filter((j: any) => typeof j === "object") : [],
    seedSegments: Array.isArray(meta.seed_segments) ? meta.seed_segments : [],
    hardRulesHeading: heading, body: body.trim(), hardRules,
  };
}
