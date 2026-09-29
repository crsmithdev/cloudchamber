/**
 * Render every direction's four screens to docs/redesign/<slug>/<tab>.html.
 * Run from the repository root: bun docs/redesign/src/build.ts
 */
import { join } from "node:path";
import pad from "./pad.ts";
import timetable from "./timetable.ts";
import bench from "./bench.ts";
import standard from "./standard.ts";

export const DIRECTIONS = [pad, timetable, bench, standard];

const root = join(import.meta.dir, "..");
for (const d of DIRECTIONS) {
  for (const [tab, render] of Object.entries(d.pages)) {
    await Bun.write(join(root, d.slug, `${tab}.html`), render());
  }
  console.log(`${d.slug}: ${Object.keys(d.pages).join(", ")}`);
}

const { index } = await import("./index.ts");
await Bun.write(join(root, "index.html"), index(DIRECTIONS));
console.log("index.html");
