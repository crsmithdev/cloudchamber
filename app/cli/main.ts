#!/usr/bin/env bun
/**
 * fogbelt — the one command the skill and the UI drive.
 *
 *   fogbelt extract [--only ID ...]        read -> segment -> facets, then inherit verdicts
 *   fogbelt status                         pool, bank, eligibility, draws
 *   fogbelt export                         write bank/ from the store
 *   fogbelt verdict <example|theme|brief|story> <id> <keep|pass> [--artifact] [--note "..."]
 *                                          a passed story hides all its passages
 *   fogbelt replay                         rebuild the verdicts table from bank/verdicts.jsonl
 *   fogbelt draw [--setting ID [--domains a,b]] [--genre G] [--auto] [--source S] [--author A]
 *               [--seed "text" | --seed-id ID]
 *   fogbelt setting lint <id>              check a setting file; exit 1 with one finding per line
 *   fogbelt distill <id> [--domain SLUG]   fill a setting's empty or redraft-marked sections from its reference/
 *   fogbelt gate <draw> choose <execute-step> | redraw | keep-seed | flag  [--note "..."]
 *   fogbelt themes [--only SRC ...] [--limit N]   draft themes for stories not yet drafted
 *   fogbelt draws                           list draws
 *   fogbelt draw-show <draw>                 steps and artifacts of one draw
 *   fogbelt brief <draw>                   print the brief
 *   fogbelt check <draw> [--checks a,b] [--samples N]   run the checkers over a brief; stops at gate 1
 *   fogbelt findings <draw> [--examined]   the reported findings of the latest check, ordered
 *   fogbelt gate <draw> accept <finding>... | dismiss <finding> | hold | pass | keep | rewrite <k> [--finding ID]  [--note "..."]
 *   fogbelt draft <draw> [--auto] [--profile P] [--words N] [--beats N] [--tense T] [--person P] [--chronology C] [--container C] [--order O]
 *   fogbelt story <draw>                   the draft with its screen flags inline
 *   fogbelt serve [--port N]               API and UI on 127.0.0.1 (default 3002)
 */
import { parseArgs } from "node:util";
import { openDb } from "../pipeline/store/db.ts";
import { exportBank } from "../pipeline/bank.ts";
import { extractAll } from "../pipeline/extract.ts";
import { status } from "../pipeline/status.ts";
import { KINDS, inherit, record, replay, type Kind } from "../pipeline/verdicts.ts";
import { Pipeline, type SeedChoice } from "../pipeline/draw.ts";
import { ClaudeCli } from "../pipeline/model.ts";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BRIEFS, now } from "../pipeline/paths.ts";
import { draftAll, histogram, replayThemes } from "../pipeline/themes.ts";
import { formatFinding, lintFile, loadSetting } from "../pipeline/settings.ts";
import { distill } from "../pipeline/distill.ts";
import { Drafting } from "../pipeline/drafting.ts";
import type { Overrides } from "../pipeline/draftconfig.ts";

const [cmd, ...rest] = process.argv.slice(2);

function usage(code = 1): never {
  console.error((import.meta as any).__doc ?? "usage: fogbelt <extract|status|export|verdict|replay> ...");
  process.exit(code);
}

async function main() {
  const db = openDb();
  const pipeline = () => new Pipeline(db, new ClaudeCli());
  const drafting = () => new Drafting(pipeline());
  const printFindings = (drawId: string, examined = false) => {
    const f = drafting().findings(drawId);
    if (!f.pass) { console.log("no check has run"); return; }
    console.log(`check pass ${f.pass} · ${f.findings.length} reported`);
    for (const x of f.findings) {
      console.log(`\n${x.id}  ${x.checkers.join("+")} ×${x.n}  [${x.invalidates}]  ${x.decision}${x.note ? `: ${x.note}` : ""}`);
      console.log(`  span: ${x.span}`); console.log(`  ${x.statement}`); console.log(`  result: ${x.result} · evidence: ${x.evidence}`); console.log(`  replacement: ${x.replacement}`);
    }
    const claims = f.claims as any[];
    console.log(`\nclaims: ${claims.length ? claims.map((c) => `${c.result} · ${c.statement}`).join("\n        ") : "off (no authority declared)"}`);
    for (const pr of f.profiles as any[]) console.log(`\n${pr.checker}: ${pr.checker === "structure" ? Object.entries(pr.answers).map(([q, a]: any) => `${q}=${a.answer}`).join(" ") : `${pr.matches?.length ?? 0} matches · nearest ${pr.nearest?.title ?? "?"} (${pr.nearest?.author ?? "?"})`}`);
    if (examined) for (const e of f.examined) console.log(`\n== ${e.stage} · sample ${e.sample}\n${e.examined}`);
    if (f.judge) console.log(`\n${f.judge}`);
  };
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
        options: { setting: { type: "string" }, domains: { type: "string" }, genre: { type: "string" }, auto: { type: "boolean", default: false },
          source: { type: "string" }, author: { type: "string" }, seed: { type: "string" }, "seed-id": { type: "string" } },
      });
      if (values.domains && !values.setting) usage();
      const seed: SeedChoice = values.seed ? { mode: "typed", text: values.seed } : values["seed-id"] ? { mode: "picked", themeId: values["seed-id"] } : { mode: "drawn" };
      const segment = values.source || values.author ? { source: values.source, author: values.author } : undefined;
      const domains = values.domains ? values.domains.split(",").map((d) => d.trim()).filter(Boolean) : undefined;
      const draw = await pipeline().start({ mode: values.auto ? "auto" : "manual", setting: values.setting, domains, genre: values.genre, segment, seed });
      console.log(JSON.stringify(draw, null, 2));
      if (draw.status === "awaiting_gate") {
        console.log("\ncandidates, by stated probability:");
        for (const c of pipeline().candidates(draw.id)) console.log(`  ${c.probability}  ${c.step_id}  ${c.premise.slice(0, 100)}…`);
        console.log(`\nfogbelt gate ${draw.id} choose <step> | redraw | keep-seed | flag --note "..."`);
      }
      break;
    }
    case "gate": {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { note: { type: "string", default: "" }, finding: { type: "string" } } });
      const [drawId, action, ...args] = positionals;
      const p = pipeline(), d = drafting();
      if (!drawId || !action) usage();
      const out = action === "choose" ? await p.choose(drawId!, args[0]!)
        : action === "redraw" ? await p.reject(drawId!, "redraw", values.note)
        : action === "keep-seed" ? await p.reject(drawId!, "keep-seed", values.note)
        : action === "flag" ? p.flag(drawId!, values.note)
        : action === "accept" ? (args.length ? await d.accept(drawId!, args, { note: values.note }) : usage())
        : action === "dismiss" ? (args[0] ? d.dismiss(drawId!, args[0], values.note) : usage())
        : action === "hold" ? d.hold(drawId!)
        : action === "pass" ? (p.draw(drawId!).status === "awaiting_draft_gate" ? d.passDraft(drawId!, values.note) : d.passBrief(drawId!, values.note))
        : action === "keep" ? d.keep(drawId!, values.note)
        : action === "rewrite" ? (args[0] ? await d.rewrite(drawId!, Number(args[0]), values.finding) : usage())
        : usage();
      console.log(JSON.stringify(out, null, 2));
      if (action === "accept") { console.log(`\nrepaired brief ${(out as any).id}; re-check findings:`); printFindings((out as any).id); }
      break;
    }
    case "check": {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { checks: { type: "string" }, samples: { type: "string" } } });
      const [drawId] = positionals;
      if (!drawId) usage();
      const r = await drafting().check(drawId!, { checks: values.checks?.split(",").map((x) => x.trim()).filter(Boolean), samples: values.samples ? Number(values.samples) : undefined });
      printFindings(drawId!);
      console.log(`\nfogbelt gate ${drawId} accept <finding>... | dismiss <finding> --note "..." | hold | pass | flag  ·  fogbelt draft ${drawId}  (${r.findings.length} reported)`);
      break;
    }
    case "findings": {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { examined: { type: "boolean", default: false } } });
      if (!positionals[0]) usage();
      printFindings(positionals[0], values.examined);
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
      console.log(`\nfogbelt story ${draw.id}  ·  fogbelt gate ${draw.id} keep | rewrite <k> [--finding ID] | pass`);
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
      if (action !== "lint" || !sid) usage();
      const findings = lintFile(sid!);
      if (findings.length) { for (const f of findings) console.log(formatFinding(f)); process.exit(1); }
      console.log(`${sid}: ${loadSetting(sid!).domains.length} domains, clean`);
      break;
    }
    case "distill": {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { domain: { type: "string" } } });
      const [sid] = positionals;
      if (!sid) usage();
      for (const line of await distill(pipeline(), sid!, { domain: values.domain })) console.log(line);
      break;
    }
    case "serve": {
      const { values } = parseArgs({ args: rest, allowPositionals: true, options: { port: { type: "string", default: "3002" } } });
      const { serve } = await import("../server/index.ts");
      await serve(Number(values.port));
      console.log(`fogbelt serving on http://127.0.0.1:${values.port}`);
      return;
    }
    case "draws":
      for (const r of pipeline().draws()) console.log(`${r.id}  ${r.status.padEnd(19)} ${r.mode.padEnd(6)} ${r.setting ?? "-"}  ${r.repaired_from ? `(repairs ${r.repaired_from}) ` : ""}${r.seed_text.slice(0, 70)}`);
      break;
    case "draw-show": {
      const p = pipeline(); const [drawId] = rest;
      if (!drawId) usage();
      console.log(JSON.stringify({ draw: p.draw(drawId!), steps: p.steps(drawId!).map((s) => ({ ...s, prompt: `${s.prompt.length} chars`, raw_response: s.raw_response ? `${s.raw_response.length} chars` : null })), artifacts: p.artifacts(drawId!).map((a) => ({ ...a, content: a.content.slice(0, 120) })) }, null, 2));
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
