#!/usr/bin/env bun
/** cloudchamber — the one command the skill and the UI drive. `cloudchamber help` prints DOC below, then every tunable value. */
import { asMarkdown, asText, knobs } from "../pipeline/knobs.ts";

const DOC = `cloudchamber — the one command the skill and the UI drive.

   cloudchamber extract [--only ID ...]        read -> segment -> facets, then inherit verdicts
   cloudchamber status                         pool, bank, eligibility, draws
   cloudchamber export                         write bank/ from the store
   cloudchamber verdict <example|theme|brief|story> <id> <keep|pass> [--artifact] [--note "..."]
                                          a passed story hides all its passages
   cloudchamber replay                         rebuild the verdicts table from bank/verdicts.jsonl
   cloudchamber replay-themes                  rebuild the themes from bank/themes.jsonl
   cloudchamber draw [--setting ID] [--genre G] [--sampling M] [--darkness D] [--auto] [--source S[,S]] [--author A]
               [--seed "text" | --seed-id ID] [--like DRAW]
                                          --like takes another draw's options; the rest override it
   cloudchamber setting lint <id>              check a setting file; exit 1 with one finding per line
   cloudchamber setting sources <id>           every kept entry beside the reference file it came from
   cloudchamber distill <id> [--map|--reduce]  build a setting's five lists from its reference/, in two passes
   cloudchamber gate <draw> choose <execute-step> | fork <execute-step> | flag | archive | unarchive  [--note "..."]
   cloudchamber delete <draw>                  remove a draw that never produced a brief
   cloudchamber themes [--only SRC ...] [--limit N]   draft themes for stories not yet drafted
   cloudchamber draws [--archived]              list draws, archived ones included with the flag
   cloudchamber draw-show <draw>                 steps and artifacts of one draw
   cloudchamber candidates <draw>              the five candidates in full, by stated probability
   cloudchamber brief <draw>                   print the brief
   cloudchamber check <draw> [--checks a,b] [--samples N]   run the checkers over a brief; stops at gate 1
   cloudchamber findings <draw> [--examined] [--all]   the findings of the latest check, by score
   cloudchamber gate <draw> accept <finding>... | auto | dismiss <finding> | hold | keep | patch [<flag>...] | rewrite <k> [--finding ID]  [--note "..."]
       patch applies a screen flag's own rewrite of its span in place, with no model call;
       named flags only, or every open flag that carries one
       auto repairs round after round, accepting what scores repair.stop_score or more,
       until nothing reaches the floor, the rounds run out, or the total stops falling
   cloudchamber draft <draw> [--auto] [--profile P] [--words N] [--beats N] [--tense T] [--person P] [--chronology C] [--container C] [--order O]
   cloudchamber story <draw>                   the draft with its screen flags inline
   cloudchamber serve [--port N] [--host H]    API and UI (default 127.0.0.1:3002)
   cloudchamber help [--md]                    this, then every tunable value, live\n`;

import { parseArgs } from "node:util";
import { openDb } from "../pipeline/store/db.ts";
import { exportBank } from "../pipeline/bank.ts";
import { extractAll } from "../pipeline/extract.ts";
import { status } from "../pipeline/status.ts";
import { KINDS, inherit, record, replay, type Kind } from "../pipeline/verdicts.ts";
import { Pipeline, type DrawOpts, type SeedChoice } from "../pipeline/draw.ts";
import type { Darkness, Sampling } from "../pipeline/config.ts";
import { ClaudeCli } from "../pipeline/model.ts";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BRIEFS, SETTINGS, now } from "../pipeline/paths.ts";
import { draftAll, failures, histogram, replayThemes } from "../pipeline/themes.ts";
import { formatFinding, lintFile, loadSetting, LISTS } from "../pipeline/settings.ts";
import { distill, readKept } from "../pipeline/distill.ts";
import { Drafting } from "../pipeline/drafting.ts";
import type { Overrides } from "../pipeline/draftconfig.ts";

const [cmd, ...rest] = process.argv.slice(2);

function usage(code = 1): never {
  console.error("usage: cloudchamber <extract|status|export|verdict|replay|replay-themes|draw|delete|gate|draws|candidates|draw-show|brief|check|findings|draft|story|themes|setting|distill|serve|help>");
  console.error("run `cloudchamber help` for the full grammar and the tunable values");
  process.exit(code);
}

async function main() {
  const db = openDb();
  const pipeline = () => new Pipeline(db, new ClaudeCli());
  const drafting = () => new Drafting(pipeline());
  const printFindings = (drawId: string, examined = false, all = false) => {
    const f = drafting().findings(drawId, { all });
    if (!f.pass) { console.log("no check has run"); return; }
    const sub = f.findings.filter((x) => !x.reported).length;
    console.log(`check pass ${f.pass} · ${f.findings.length - sub} reported${sub ? ` · ${sub} below the bar` : ""} · by score`);
    for (const x of f.findings) {
      console.log(`\n${x.id}  score ${x.score}/10  ${x.checkers.join("+")} ×${x.n}/${x.samples_run}  [${x.invalidates}]  ${x.decision}${x.reported ? "" : " · below the bar"}${x.note ? `: ${x.note}` : ""}`);
      console.log(`  span: ${x.span}`); console.log(`  ${x.statement}`); console.log(`  result: ${x.result} · evidence: ${x.evidence}`); console.log(`  replacement: ${x.replacement}`);
    }
    const claims = f.claims as any[];
    console.log(`\nclaims: ${claims.length ? claims.map((c) => `${c.result} · ${c.statement}`).join("\n        ") : "off (no authority declared)"}`);
    for (const pr of f.profiles as any[]) console.log(`\n${pr.checker}: ${pr.checker === "structure" ? Object.entries(pr.answers).map(([q, a]: any) => `${q}=${a.answer}`).join(" ") : `${pr.matches?.length ?? 0} matches · nearest ${pr.nearest?.title ?? "?"} (${pr.nearest?.author ?? "?"})`}`);
    if (examined) for (const e of f.examined) console.log(`\n== ${e.stage} · sample ${e.sample}\n${e.examined}`);
    if (f.judge) console.log(`\n${f.judge}`);
  };
  switch (cmd) {
    case "help": case "--help": case "-h": {
      const sections = knobs(db);
      console.log(rest.includes("--md") ? asMarkdown(sections) : `${DOC}\n${asText(sections)}`);
      break;
    }
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
      if (!KINDS.has(kind as Kind) || !id || !["keep", "pass"].includes(verdict ?? "")) usage();
      const v = record(db, { kind: kind as Kind, target_id: id!, verdict: verdict as "keep" | "pass", artifact: values.artifact, note: values.note, method: "cli" });
      console.log(JSON.stringify(v));
      break;
    }
    case "replay":
      console.log(`replayed ${replay(db)} verdict(s)`);
      break;
    case "draw": {
      const { values } = parseArgs({
        args: rest, allowPositionals: true,
        options: { setting: { type: "string" }, genre: { type: "string" }, sampling: { type: "string" }, darkness: { type: "string" }, like: { type: "string" }, auto: { type: "boolean", default: false },
          source: { type: "string" }, author: { type: "string" }, seed: { type: "string" }, "seed-id": { type: "string" } },
      });
      const seed: SeedChoice = values.seed ? { mode: "typed", text: values.seed } : values["seed-id"] ? { mode: "picked", themeId: values["seed-id"] } : { mode: "drawn" };
      const sources = values.source ? values.source.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const segment = sources.length || values.author ? { source: sources.length ? sources : undefined, author: values.author } : undefined;
      const base = values.like ? pipeline().like(values.like) : {};
      const draw = await pipeline().start({
        ...base,
        mode: values.auto ? "auto" : values.like ? (base as DrawOpts).mode : "manual",
        ...(values.setting ? { setting: values.setting } : {}),
        ...(values.genre ? { genre: values.genre } : {}),
        ...(values.sampling ? { sampling: values.sampling as Sampling } : {}),
        ...(values.darkness ? { darkness: values.darkness as Darkness } : {}),
        ...(segment ? { segment } : {}),
        ...(values.seed || values["seed-id"] ? { seed } : {}),
      });
      console.log(JSON.stringify(draw, null, 2));
      if (draw.status === "awaiting_gate") {
        console.log("\ncandidates, by stated probability:");
        for (const c of pipeline().candidates(draw.id)) console.log(`  ${c.probability}  ${c.step_id}  ${c.premise.slice(0, 100)}…`);
        console.log(`\ncloudchamber gate ${draw.id} choose <step> | fork <step> | flag --note "..."`);
      }
      break;
    }
    case "gate": {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { note: { type: "string", default: "" }, finding: { type: "string" } } });
      const [drawId, action, ...args] = positionals;
      const p = pipeline(), d = drafting();
      if (!drawId || !action) usage();
      const out = action === "choose" ? await p.choose(drawId!, args[0]!)
        : action === "fork" ? await p.fork(drawId!, args[0]!)
        : action === "flag" ? p.flag(drawId!, values.note)
        : action === "archive" ? p.archive(drawId!)
        : action === "unarchive" ? p.archive(drawId!, false)
        : action === "accept" ? (args.length ? await d.accept(drawId!, args, { note: values.note }) : usage())
        : action === "auto" ? await d.autoRounds(drawId!, { note: values.note || undefined })
        : action === "dismiss" ? (args[0] ? d.dismiss(drawId!, args[0], values.note) : usage())
        : action === "hold" ? d.hold(drawId!)
        : action === "keep" ? d.keep(drawId!, values.note)
        : action === "rewrite" ? (args[0] ? await d.rewrite(drawId!, Number(args[0]), values.finding) : usage())
        : action === "patch" ? d.patch(drawId!, args, values.note)
        : usage();
      if (action === "patch") {
        const r = out as { applied: any[]; skipped: { finding: any; why: string }[] };
        console.log(`${r.applied.length} applied, ${r.skipped.length} left for a rewrite · no model calls`);
        for (const f of r.applied) console.log(`  ${f.id}  beat ${f.beat}  “${f.span}”\n      → ${f.patch}`);
        for (const x of r.skipped) console.log(`  ${x.finding.id}  beat ${x.finding.beat}  skipped: ${x.why}`);
        if (r.applied.length) console.log(`\ncloudchamber story ${drawId}  ·  cloudchamber gate ${drawId} keep | rewrite <k>`);
        break;
      }
      console.log(JSON.stringify(out, null, 2));
      if (action === "accept") { console.log(`\nrepaired brief ${(out as any).id}; re-check findings:`); printFindings((out as any).id); }
      if (action === "auto") {
        const r = out as any;
        console.log(`\nstopped on ${r.stopped} · floor ${r.floor} · ${r.rounds.length} round${r.rounds.length > 1 ? "s" : ""} · ${r.calls} calls`);
        for (const x of r.rounds) console.log(`  round ${x.round}  ${x.id}  ${x.open} open · total ${x.total} · accepted ${x.accepted} · ${x.calls} calls${x.round === r.best.round ? "   ← lowest total" : ""}`);
        if (r.best.id !== r.id) console.log(`\nthe lowest-scoring round is not the last: read ${r.best.id}. It is superseded, so auto left it alone.`);
        if (r.left_open) console.log(`\n${r.left_open} finding${r.left_open > 1 ? "s" : ""} at or above the floor ${r.left_open > 1 ? "are" : "is"} still open on ${r.id}: auto stopped before repairing ${r.left_open > 1 ? "them" : "it"}.`);
        printFindings(r.id);
      }
      break;
    }
    case "check": {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { checks: { type: "string" }, samples: { type: "string" } } });
      const [drawId] = positionals;
      if (!drawId) usage();
      const r = await drafting().check(drawId!, { checks: values.checks?.split(",").map((x) => x.trim()).filter(Boolean), samples: values.samples ? Number(values.samples) : undefined });
      printFindings(drawId!);
      console.log(`\ncloudchamber gate ${drawId} accept <finding>... | auto | dismiss <finding> --note "..." | hold | flag  ·  cloudchamber draft ${drawId}  (${r.findings.length} reported)`);
      break;
    }
    case "findings": {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { examined: { type: "boolean", default: false }, all: { type: "boolean", default: false } } });
      if (!positionals[0]) usage();
      printFindings(positionals[0], values.examined, values.all);
      break;
    }
    case "draft": {
      const { values, positionals } = parseArgs({
        args: rest, allowPositionals: true,
        options: { auto: { type: "boolean", default: false }, profile: { type: "string" }, words: { type: "string" }, beats: { type: "string" }, tense: { type: "string" }, person: { type: "string" }, chronology: { type: "string" }, container: { type: "string" }, order: { type: "string" } },
      });
      const [drawId] = positionals;
      if (!drawId) usage();
      const map: Record<string, string> = { words: "length.words", beats: "beats.count", tense: "form.tense", person: "form.person", chronology: "form.chronology", container: "form.container", order: "scenes.order" };
      const overrides: Overrides = {};
      for (const [flag, key] of Object.entries(map)) if ((values as any)[flag] !== undefined) overrides[key] = (values as any)[flag];
      const draw = await drafting().draft(drawId!, { auto: values.auto, profile: values.profile, overrides: Object.keys(overrides).length ? overrides : undefined });
      console.log(JSON.stringify(draw, null, 2));
      console.log(`\ncloudchamber story ${draw.id}  ·  cloudchamber gate ${draw.id} keep | patch [<flag>...] | rewrite <k> [--finding ID]`);
      break;
    }
    case "story": {
      const [drawId] = rest;
      if (!drawId) usage();
      console.log(drafting().story(drawId!));
      break;
    }
    case "themes": {
      const { values } = parseArgs({ args: rest, allowPositionals: true, options: { only: { type: "string", multiple: true }, limit: { type: "string" } } });
      const since = now();
      const reports = await draftAll(pipeline(), { only: values.only, limit: values.limit ? Number(values.limit) : undefined });
      for (const r of reports) console.log(`${r.story}: ${r.drafted} drafted, ${r.banked} banked, ${r.attested} attested, ${r.rejected.length} rejected${r.rejected.map((x) => `\n    REJ ${x.why.join("; ")} :: ${x.text.slice(0, 80)}`).join("")}`);
      for (const f of failures(db, since)) console.log(f);
      console.log(histogram(db, since));
      const ex = exportBank(db);
      console.log(`exported ${ex.themes} themes to bank/`);
      break;
    }
    case "replay-themes":
      console.log(`replayed ${replayThemes(db)} theme event(s); run \`python -m extract embed\` to restore embeddings`);
      break;
    case "setting": {
      const [action, sid] = rest;
      if (!sid || (action !== "lint" && action !== "sources")) usage();
      if (action === "sources") {
        // the setting file cannot carry the trail, so distill writes it beside the candidates
        const kept = readKept(sid!, SETTINGS);
        if (!kept.length) { console.log(`${sid}: no kept.jsonl; run distill --reduce`); break; }
        const s = loadSetting(sid!);
        for (const name of LISTS) {
          console.log(`\n## ${name}`);
          for (const e of s.lists[name]) {
            const row = kept.find((k) => k.list === name && k.entry === e);
            console.log(`${(row?.file || "— untraced —").padEnd(52)}  ${e.split(" — ")[0]}`);
          }
        }
        break;
      }
      const findings = lintFile(sid!);
      if (findings.length) { for (const f of findings) console.log(formatFinding(f)); process.exit(1); }
      console.log(`${sid}: ${LISTS.map((n) => `${loadSetting(sid!).lists[n].length} ${n.toLowerCase()}`).join(", ")}, clean`);
      break;
    }
    case "distill": {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { map: { type: "boolean" }, reduce: { type: "boolean" } } });
      const [sid] = positionals;
      if (!sid) usage();
      for (const line of await distill(pipeline(), sid!, { map: values.map, reduce: values.reduce })) console.log(line);
      break;
    }
    case "serve": {
      const { values } = parseArgs({ args: rest, allowPositionals: true, options: { port: { type: "string", default: "3002" }, host: { type: "string", default: "127.0.0.1" } } });
      const { serve } = await import("../server/index.ts");
      await serve(Number(values.port), { host: values.host });
      console.log(`cloudchamber serving on http://${values.host}:${values.port}`);
      return;
    }
    case "delete": {
      const [drawId] = rest;
      if (!drawId) usage();
      pipeline().delete(drawId!);
      console.log(`deleted ${drawId}`);
      break;
    }
    case "draws":
      for (const r of pipeline().draws(rest.includes("--archived"))) {
        console.log(`${r.id}  ${(r.name ?? "").padEnd(30)} ${r.status.padEnd(19)} ${r.mode.padEnd(6)} ${r.setting ?? "-"}  ${r.archived_at ? "(archived) " : ""}${r.repaired_from ? `(repairs ${r.repaired_from}) ` : ""}${r.seed_text.slice(0, 60)}`);
      }
      break;
    case "draw-show": {
      const p = pipeline(); const [drawId] = rest;
      if (!drawId) usage();
      console.log(JSON.stringify({ draw: p.draw(drawId!), steps: p.steps(drawId!).map((s) => ({ ...s, prompt: `${s.prompt.length} chars`, raw_response: s.raw_response ? `${s.raw_response.length} chars` : null })), artifacts: p.artifacts(drawId!).map((a) => ({ ...a, content: a.content.slice(0, 120) })) }, null, 2));
      break;
    }
    case "candidates": {
      const p = pipeline(); const [drawId] = rest;
      if (!drawId) usage();
      const cs = p.candidates(drawId!);
      if (!cs.length) { console.log(`draw ${drawId} has no candidates (status ${p.draw(drawId!).status})`); break; }
      for (const c of cs) console.log(`\n\n# candidate ${c.index} · step ${c.step_id} · probability ${c.probability}${c.warnings.length ? ` · warnings: ${c.warnings.join("; ")}` : ""}\n\n## premise\n\n${c.premise}\n\n## vignette\n\n${c.vignette}`);
      console.log(`\ncloudchamber gate ${drawId} choose <step> | fork <step> | flag --note "..."`);
      break;
    }
    case "brief": {
      const [drawId] = rest; const dir = join(BRIEFS, drawId ?? "");
      if (!drawId || !existsSync(dir)) usage();
      for (const f of ["trail.md", "vignette.md", "outline.md", "context-1.md", "context-2.md", "ending.md", "ending.previous.md"]) if (existsSync(join(dir, f))) console.log(`\n\n# ${f}\n\n${readFileSync(join(dir, f), "utf8")}`);
      break;
    }
    default:
      usage(cmd ? 1 : 0);
  }
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
