#!/usr/bin/env bun
/**
 * fogbelt — the one command the skill and the UI drive.
 *
 *   fogbelt extract [--only ID ...]        read -> segment -> facets, then inherit verdicts
 *   fogbelt status                         pool, bank, eligibility, runs
 *   fogbelt export                         write bank/ from the store
 *   fogbelt verdict <kind> <id> <keep|pass> [--artifact] [--note "..."]
 *   fogbelt replay                         rebuild the verdicts table from bank/verdicts.jsonl
 *   fogbelt run [--setting ID] [--genre G] [--auto] [--source S] [--author A]
 *               [--seed "text" | --seed-id ID]
 *   fogbelt gate <run> choose <execute-step> | redraw | keep-seed | flag  [--note "..."]
 *   fogbelt themes [--only SRC ...] [--limit N]   draft themes for stories not yet drafted
 *   fogbelt runs                           list runs
 *   fogbelt run-show <run>                 steps and artifacts of one run
 *   fogbelt packet <run>                   print the packet
 *   fogbelt serve [--port N]               API and UI on 127.0.0.1 (default 3002)
 */
import { parseArgs } from "node:util";
import { openDb } from "../pipeline/store/db.ts";
import { exportBank } from "../pipeline/bank.ts";
import { extractAll } from "../pipeline/extract.ts";
import { status } from "../pipeline/status.ts";
import { inherit, record, replay, type Kind } from "../pipeline/verdicts.ts";
import { Pipeline, type SeedChoice } from "../pipeline/run.ts";
import { ClaudeCli } from "../pipeline/model.ts";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PACKETS, now } from "../pipeline/paths.ts";
import { draftAll, histogram, replayThemes } from "../pipeline/themes.ts";

const [cmd, ...rest] = process.argv.slice(2);

function usage(code = 1): never {
  console.error((import.meta as any).__doc ?? "usage: fogbelt <extract|status|export|verdict|replay> ...");
  process.exit(code);
}

async function main() {
  const db = openDb();
  const pipeline = () => new Pipeline(db, new ClaudeCli());
  switch (cmd) {
    case "extract": {
      const { values } = parseArgs({ args: rest, options: { only: { type: "string", multiple: true } }, allowPositionals: true });
      for (const line of extractAll(values.only ?? [])) console.log(line);
      const inherited = inherit(db);
      console.log(`inherited ${inherited.length} verdict(s)`);
      const ex = exportBank(db);
      console.log(`exported ${ex.passages} passages, ${ex.themes} themes to bank/`);
      break;
    }
    case "status":
      console.log(JSON.stringify(status(db), null, 2));
      break;
    case "export": {
      const ex = exportBank(db);
      console.log(`exported ${ex.passages} passages, ${ex.themes} themes -> ${ex.files.length} files`);
      break;
    }
    case "verdict": {
      const { values, positionals } = parseArgs({
        args: rest, allowPositionals: true,
        options: { artifact: { type: "boolean", default: false }, note: { type: "string", default: "" } },
      });
      const [kind, id, verdict] = positionals;
      if (!["example", "theme", "packet"].includes(kind ?? "") || !id || !["keep", "pass"].includes(verdict ?? "")) usage();
      const v = record(db, { kind: kind as Kind, target_id: id!, verdict: verdict as "keep" | "pass", artifact: values.artifact, note: values.note, method: "cli" });
      console.log(JSON.stringify(v));
      break;
    }
    case "replay":
      console.log(`replayed ${replay(db)} verdict(s)`);
      break;
    case "run": {
      const { values } = parseArgs({
        args: rest, allowPositionals: true,
        options: { setting: { type: "string" }, genre: { type: "string" }, auto: { type: "boolean", default: false },
          source: { type: "string" }, author: { type: "string" }, seed: { type: "string" }, "seed-id": { type: "string" } },
      });
      const seed: SeedChoice = values.seed ? { mode: "typed", text: values.seed } : values["seed-id"] ? { mode: "picked", themeId: values["seed-id"] } : { mode: "drawn" };
      const segment = values.source || values.author ? { source: values.source, author: values.author } : undefined;
      const run = await pipeline().start({ mode: values.auto ? "auto" : "manual", setting: values.setting, genre: values.genre, segment, seed });
      console.log(JSON.stringify(run, null, 2));
      if (run.status === "awaiting_gate") {
        console.log("\ncandidates, by stated probability:");
        for (const c of pipeline().candidates(run.id)) console.log(`  ${c.probability}  ${c.step_id}  ${c.premise.slice(0, 100)}…`);
        console.log(`\nfogbelt gate ${run.id} choose <step> | redraw | keep-seed | flag --note "..."`);
      }
      break;
    }
    case "gate": {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { note: { type: "string", default: "" } } });
      const [runId, action, stepId] = positionals;
      const p = pipeline();
      if (!runId || !action) usage();
      const out = action === "choose" ? await p.choose(runId!, stepId!)
        : action === "redraw" ? await p.reject(runId!, "redraw", values.note)
        : action === "keep-seed" ? await p.reject(runId!, "keep-seed", values.note)
        : action === "flag" ? p.flag(runId!, values.note) : usage();
      console.log(JSON.stringify(out, null, 2));
      break;
    }
    case "themes": {
      const { values } = parseArgs({ args: rest, allowPositionals: true, options: { only: { type: "string", multiple: true }, limit: { type: "string" } } });
      const since = now();
      const reports = await draftAll(pipeline(), { only: values.only, limit: values.limit ? Number(values.limit) : undefined });
      for (const r of reports) console.log(`${r.story}: ${r.drafted} drafted, ${r.banked} banked, ${r.attested} attested, ${r.rejected.length} rejected${r.rejected.map((x) => `\n    REJ ${x.why.join("; ")} :: ${x.text.slice(0, 80)}`).join("")}`);
      console.log(histogram(db, since));
      const ex = exportBank(db);
      console.log(`exported ${ex.themes} themes to bank/`);
      break;
    }
    case "replay-themes":
      console.log(`replayed ${replayThemes(db)} theme event(s); run \`python -m extract embed\` to restore embeddings`);
      break;
    case "serve": {
      const { values } = parseArgs({ args: rest, allowPositionals: true, options: { port: { type: "string", default: "3002" } } });
      const { serve } = await import("../server/index.ts");
      await serve(Number(values.port));
      console.log(`fogbelt serving on http://127.0.0.1:${values.port}`);
      return;
    }
    case "runs":
      for (const r of pipeline().runs()) console.log(`${r.id}  ${r.status.padEnd(13)} ${r.mode.padEnd(6)} ${r.setting ?? "-"}  ${r.seed_text.slice(0, 70)}`);
      break;
    case "run-show": {
      const p = pipeline(); const [runId] = rest;
      if (!runId) usage();
      console.log(JSON.stringify({ run: p.run(runId!), steps: p.steps(runId!).map((s) => ({ ...s, prompt: `${s.prompt.length} chars`, raw_response: s.raw_response ? `${s.raw_response.length} chars` : null })), artifacts: p.artifacts(runId!).map((a) => ({ ...a, content: a.content.slice(0, 120) })) }, null, 2));
      break;
    }
    case "packet": {
      const [runId] = rest; const dir = join(PACKETS, runId ?? "");
      if (!runId || !existsSync(dir)) usage();
      for (const f of ["trail.md", "vignette.md", "outline.md", "context-1.md", "context-2.md", "ending.md"]) if (existsSync(join(dir, f))) console.log(`\n\n# ${f}\n\n${readFileSync(join(dir, f), "utf8")}`);
      break;
    }
    default:
      usage(cmd ? 1 : 0);
  }
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
