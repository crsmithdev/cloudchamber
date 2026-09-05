#!/usr/bin/env bun
/**
 * fogbelt — the one command the skill and the UI drive.
 *
 *   fogbelt extract [--only ID ...]        read -> segment -> facets, then inherit verdicts
 *   fogbelt status                         pool, bank, eligibility, runs
 *   fogbelt export                         write bank/ from the store
 *   fogbelt verdict <kind> <id> <keep|pass> [--artifact] [--note "..."]
 *   fogbelt replay                         rebuild the verdicts table from bank/verdicts.jsonl
 */
import { parseArgs } from "node:util";
import { openDb } from "../pipeline/store/db.ts";
import { exportBank } from "../pipeline/bank.ts";
import { extractAll } from "../pipeline/extract.ts";
import { status } from "../pipeline/status.ts";
import { inherit, record, replay, type Kind } from "../pipeline/verdicts.ts";

const [cmd, ...rest] = process.argv.slice(2);

function usage(code = 1): never {
  console.error((import.meta as any).__doc ?? "usage: fogbelt <extract|status|export|verdict|replay> ...");
  process.exit(code);
}

function main() {
  const db = openDb();
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
    default:
      usage(cmd ? 1 : 0);
  }
}

main();
