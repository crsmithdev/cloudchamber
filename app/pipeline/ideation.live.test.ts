/**
 * Ideation under a real setting, against a real model. Opt-in:
 *
 *   CLOUDCHAMBER_LIVE=1 bun test app/pipeline/ideation.live.test.ts
 *
 * Ideation is not deterministic, so nothing here asserts what a premise says.
 * It asserts floors that must hold whatever the model writes, and prints the
 * measurement beside each so a drift shows up even while the floor passes:
 *
 *   anchored   the five premises together name at least one Body
 *   spread     they name at least two distinct Bodies — the property the
 *              random domain draw used to claim and could not deliver
 *   textured   the chosen vignette reaches for at least one Instrument,
 *              Place or Term
 *
 * A failure here is a setting whose lists the premises stage cannot use, not
 * a bad model reply: re-run before believing it.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import { openDb } from "./store/db.ts";
import { ClaudeCli } from "./model.ts";
import { Pipeline } from "./draw.ts";
import { DEFAULT_DB, SETTINGS } from "./paths.ts";
import { entryName, loadChecked, mentioned } from "./settings.ts";

const LIVE = process.env.CLOUDCHAMBER_LIVE === "1";
const SETTING_IDS = (process.env.CLOUDCHAMBER_LIVE_SETTINGS ?? "").split(",").filter(Boolean);

/** A scratch store with six passages copied from the real one: a draw writes rows, and it must not write them here. */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "cloudchamber-live-"));
  const db = openDb(join(dir, "live.db"));
  const src = new Database(DEFAULT_DB, { readonly: true });
  const stories = src.query("SELECT * FROM stories LIMIT 3").all() as any[];
  const sources = src.query("SELECT * FROM sources").all() as any[];
  const ins = (table: string, rows: any[]) => {
    for (const r of rows) {
      const keys = Object.keys(r);
      db.query(`INSERT OR IGNORE INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(...keys.map((k) => r[k]));
    }
  };
  ins("sources", sources);
  ins("stories", stories);
  for (const s of stories) ins("passages", src.query("SELECT * FROM passages WHERE story_id = ? LIMIT 4").all(s.id) as any[]);
  src.close();
  return { db, dir };
}

describe.skipIf(!LIVE)("ideation under a setting, live", () => {
  for (const id of SETTING_IDS) {
    test(`${id}: the premises reach the Bodies list and the vignette reaches the rest`, async () => {
      const { db, dir } = scratch();
      const setting = loadChecked(id, SETTINGS);
      const p = new Pipeline(db, new ClaudeCli(), { briefsDir: join(dir, "briefs"), settingsDir: SETTINGS });
      const draw = await p.start({ mode: "auto", setting: id, seed: { mode: "drawn" } });
      expect(draw.status).toBe("done");

      const premises = p.candidates(draw.id).map((c) => c.premise);
      expect(premises).toHaveLength(5);
      const perPremise = premises.map((t) => mentioned(t, setting.lists.Bodies).map(entryName));
      const distinct = new Set(perPremise.flat());
      console.log(`${id} anchored: ${perPremise.filter((m) => m.length).length}/5 premises name a Body`);
      console.log(`${id} spread:   ${distinct.size} distinct Bodies — ${[...distinct].join(", ") || "none"}`);
      expect(distinct.size).toBeGreaterThanOrEqual(1);
      expect(distinct.size).toBeGreaterThanOrEqual(2);

      const vignette = p.candidates(draw.id).find((c) => c.step_id === draw.chosen_step)!.vignette;
      const texture = (["Instruments", "Places", "Terms"] as const)
        .map((n) => [n, mentioned(vignette, setting.lists[n]).map(entryName)] as const);
      for (const [n, hits] of texture) console.log(`${id} ${n.toLowerCase()}: ${hits.length ? hits.join(", ") : "none"}`);
      expect(texture.some(([, hits]) => hits.length)).toBe(true);
    }, 600_000);
  }
});
