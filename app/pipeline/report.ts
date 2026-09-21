/**
 * The report a draft leaves behind: output/<draw>/report.html, and report.pdf
 * beside it when a browser is on the machine. One document holds the story and
 * everything that made it: the seed, the six examples and the five premises;
 * the brief; every check round and the corrections it accepted; the schedule;
 * each beat's writing and screening; the quality measures against the
 * narration and passage pools; and what the chain cost, by stage and model.
 *
 * It is written when a draft reaches gate 2 and again after each rewrite
 * there, and `cloudchamber report <draw>` writes it for any drafted draw. It
 * reads the chain and makes no model call.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Pipeline, StepRow } from "./draw.ts";
import { OUTPUT, ROOT } from "./paths.ts";
import { chainOf, NO_CALL, type FindingView } from "./chain.ts";
import { briefParts } from "./briefparts.ts";
import { draftView } from "./drafts.ts";
import { ofKind } from "./artifacts.ts";
import { toToml, type Resolved } from "./draftconfig.ts";
import { words } from "./model.ts";
import { pipelineVersion } from "./version.ts";
import type { AutoResult } from "./drafting.ts";
import type { ListenProfile } from "./listen.ts";

/** Write the report for a drafted draw; the PDF only when a browser is found and CLOUDCHAMBER_PDF is not "0". */
export async function writeReport(p: Pipeline, drawId: string, base: string = OUTPUT): Promise<{ html: string; pdf: string | null }> {
  const dir = join(base, drawId);
  mkdirSync(dir, { recursive: true });
  const html = join(dir, "report.html");
  writeFileSync(html, renderReport(p, drawId));
  const pdf = join(dir, "report.pdf");
  return { html, pdf: process.env.CLOUDCHAMBER_PDF !== "0" && (await printPdf(html, pdf)) ? pdf : null };
}

const BROWSERS = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
const PRINT_TIMEOUT_MS = 60_000;

/**
 * Print the HTML to PDF with a headless browser. False when none is installed
 * or the print failed. Spawned, not run in line: the server drafts in its own
 * process and must keep answering while the page prints.
 */
async function printPdf(html: string, pdf: string): Promise<boolean> {
  const bin = BROWSERS.map((b) => Bun.which(b)).find(Boolean);
  if (!bin) return false;
  const proc = Bun.spawn([bin, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, `file://${html}`], { stdout: "ignore", stderr: "ignore" });
  // a print that waits on something it cannot load never exits, and the draft would wait with it
  const timer = setTimeout(() => proc.kill(), PRINT_TIMEOUT_MS);
  const code = await proc.exited;
  clearTimeout(timer);
  return code === 0 && Bun.file(pdf).size > 0;
}

// --- reading the chain -------------------------------------------------------

type Usage = { input: number; cache_read: number; cache_write: number; output: number; thinking: number; cost_usd: number };
type StageCost = { stage: string; models: Set<string>; calls: number; output: number; thinking: number; cost: number; priced: number };

function costs(steps: StepRow[]): { rows: StageCost[]; calls: number; cost: number; priced: number; output: number; thinking: number } {
  const by = new Map<string, StageCost>();
  for (const s of steps) {
    if (s.status !== "done" || NO_CALL.includes(s.model)) continue;
    const row = by.get(s.stage) ?? { stage: s.stage, models: new Set<string>(), calls: 0, output: 0, thinking: 0, cost: 0, priced: 0 };
    row.models.add(s.model);
    row.calls++;
    if (s.usage) {
      const u = JSON.parse(s.usage) as Usage;
      row.output += u.output; row.thinking += u.thinking; row.cost += u.cost_usd; row.priced++;
    }
    by.set(s.stage, row);
  }
  const rows = [...by.values()];
  const sum = (k: "calls" | "cost" | "priced" | "output" | "thinking") => rows.reduce((a, r) => a + r[k], 0);
  return { rows, calls: sum("calls"), cost: sum("cost"), priced: sum("priced"), output: sum("output"), thinking: sum("thinking") };
}

type Example = { id: string; text: string; words: number; title: string; author: string; source: string };

function examplesOf(p: Pipeline, ids: string[]): Example[] {
  const q = p.db.query("SELECT p.id, p.text, p.words, s.title, s.author, s.source_id AS source FROM passages p JOIN stories s ON s.id = p.story_id WHERE p.id = ?");
  return ids.map((id) => q.get(id) as Example | null).filter((e): e is Example => !!e);
}

// --- rendering ---------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const prose = (s: string) => s.trim().split(/\n\s*\n/).map((para) => `<p>${esc(para.trim()).replace(/\n/g, "<br>")}</p>`).join("\n");
const n = (x: number, d = 0) => x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = (x: number) => `$${n(x, 2)}`;
const kilo = (x: number) => (x >= 1000 ? `${n(x / 1000, 1)}k` : n(x));
const minutes = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);
const pill = (d: FindingView["decision"]) => `<span class="pill ${d}">${d}</span>`;

function findingRows(fs: FindingView[]): string {
  if (!fs.length) return `<p class="none">No finding reported.</p>`;
  return fs.map((f) => `
    <div class="finding">
      <div class="fhead"><span class="score">${f.score}</span>${pill(f.decision)}<span class="meta">${esc(f.checkers.join(" + "))} · ${f.n} of ${f.samples_run} samples · ${esc(f.result)}</span></div>
      <p class="statement">${esc(f.statement)}</p>
      <p class="span"><span class="k">span</span> ${esc(f.span)}</p>
      ${f.evidence ? `<p class="evidence"><span class="k">evidence</span> ${esc(f.evidence)}</p>` : ""}
      ${f.replacement && f.replacement.toLowerCase() !== "none" ? `<p class="repl"><span class="k">correction</span> ${esc(f.replacement)}</p>` : ""}
      ${f.note ? `<p class="evidence"><span class="k">note</span> ${esc(f.note)}</p>` : ""}
    </div>`).join("");
}

const LISTEN_ROWS: [keyof ListenProfile, string, number][] = [
  ["sentence_mean", "words per sentence", 1], ["long_sentence_share", "sentences over 30 words", 2], ["numerals_per_1k", "numerals per 1,000 words", 1],
  ["quotes_per_1k", "quotation marks per 1,000", 1], ["body_per_1k", "the body named per 1,000", 1], ["you_per_1k", "the listener addressed per 1,000", 1],
  ["first_person_per_1k", "first person per 1,000", 1],
];

export function renderReport(p: Pipeline, drawId: string): string {
  const chain = chainOf(p, drawId);
  const tip = p.draw(drawId);
  const rootId = chain.ids.at(-1)!;
  const root = p.draw(rootId);
  const parts = briefParts(p, drawId);
  const v = draftView(p, drawId);
  const resolved = tip.draft_config ? (JSON.parse(tip.draft_config) as Resolved) : null;
  const steps = [...chain.ids].reverse().flatMap((id) => p.steps(id));
  const cost = costs(steps);
  const ended = steps.map((s) => s.ended_at).filter((x): x is string => !!x).sort().at(-1) ?? root.created_at;
  const story = v.scenes.map((s) => s.text.trim()).join("\n\n");
  const storyWords = words(story);
  const examples = examplesOf(p, JSON.parse(root.example_ids) as string[]);
  const premises = ofKind(p.artifacts(rootId), "premise").sort((a, b) => (a.meta.index ?? 0) - (b.meta.index ?? 0));
  const auto = ofKind(p.artifacts(drawId), "auto").at(-1);
  const autoRun = auto ? (JSON.parse(auto.content) as AutoResult) : null;
  const rounds = [...chain.ids].reverse();
  const settled = chain.settled();
  const sceneArts = ofKind(p.artifacts(drawId), "scene");
  const openBy = (screen: string) => v.screenFindings.filter((f) => f.decision === "open" && f.screen === screen).length;
  const structureFlags = v.profiles.reduce((a, pr) => a + pr.flags.length, 0);
  const title = tip.name || drawId;

  const glance: [string, string][] = [
    ["words", n(storyWords)], ["beats", String(v.scenes.length)],
    ["read aloud", v.listen ? `${n(v.listen.minutes)} min` : "—"],
    ["repair rounds", String(rounds.length)], ["corrections accepted", String(settled.length)],
    ["screen flags open", `${openBy("ledger")} ledger · ${openBy("restated")} restated · ${structureFlags} structure`],
    ["model calls", n(cost.calls)], ["cost at list", cost.priced ? `${usd(cost.cost)}${cost.priced < cost.calls ? "*" : ""}` : "not recorded"],
    ["seed to gate 2", `${minutes(root.created_at, ended)} min`],
  ];

  const origin = `
    <section class="break">
      <h2>Where it came from</h2>
      <dl class="facts">
        <dt>seed</dt><dd class="seed">${esc(root.seed_text)}</dd>
        <dt>seed chosen</dt><dd>${esc(root.seed_mode)}</dd>
        <dt>genre</dt><dd>${esc(root.genre)}</dd>
        <dt>sampling</dt><dd>${esc(root.sampling)}${root.darkness ? ` · darkness ${esc(root.darkness)}` : ""}</dd>
        <dt>setting</dt><dd>${esc(root.setting ?? "unrestricted")}</dd>
        <dt>gate 0</dt><dd>${esc(root.gate_method ?? root.mode)}</dd>
      </dl>
      <h3>The six examples</h3>
      <p class="lead">Drawn from the corpus and shown to the premise stage as the register to write toward. Verbatim.</p>
      ${examples.map((e, i) => `
        <div class="example">
          <div class="ehead"><span class="idx">${i + 1}</span><span class="etitle">${esc(e.title)}</span><span class="meta">${esc(e.author || "unknown")} · ${esc(e.source)} · ${n(e.words)} words · ${esc(e.id)}</span></div>
          <div class="excerpt">${prose(e.text)}</div>
        </div>`).join("")}
      <h3>The five premises</h3>
      <p class="lead">Each with the probability the model stated for it. The chosen one was developed.</p>
      ${premises.map((a) => {
        const chosen = a.content.trim() === parts.premise.trim();
        return `<div class="premise${chosen ? " chosen" : ""}"><div class="phead"><span class="prob">${a.meta.probability ?? "—"}</span>${chosen ? `<span class="pill chosen">chosen</span>` : ""}</div>${prose(a.content)}</div>`;
      }).join("")}
    </section>`;

  const brief = `
    <section class="break">
      <h2>The brief</h2>
      <p class="lead">As it stood when drafting began, after ${rounds.length - 1} repair round${rounds.length === 2 ? "" : "s"}.</p>
      <h3>The chosen vignette</h3><div class="prose">${prose(parts.vignette)}</div>
      <h3>Outline</h3><div class="prose small">${prose(parts.outline)}</div>
      ${parts.contexts.map((c, i) => `<h3>Context ${i + 1}</h3><div class="prose">${prose(c)}</div>`).join("")}
      <h3>Ending</h3><div class="prose">${prose(parts.ending)}</div>
    </section>`;

  const checks = `
    <section class="break">
      <h2>Checks and corrections</h2>
      <p class="lead">Independent checkers read each brief; a finding's score weighs how often it recurred and how much it would break. Scores below are as the current scoring reads them; the round table records what the loop saw at the time. ${autoRun ? `The loop ran on its own and stopped on <b>${esc(autoRun.stopped)}</b> after ${autoRun.rounds.length} round${autoRun.rounds.length === 1 ? "" : "s"}, ${autoRun.left_open} left open at or above the floor of ${autoRun.floor}.` : "The gate was worked by hand."}</p>
      ${autoRun ? `
      <table class="grid"><thead><tr><th>round</th><th>brief</th><th class="r">open</th><th class="r">total score</th><th class="r">accepted</th><th class="r">calls so far</th></tr></thead>
      <tbody>${autoRun.rounds.map((r) => `<tr><td class="num">${r.round}</td><td class="mono">${esc(r.id)}</td><td class="r num">${r.open}</td><td class="r num">${r.total}</td><td class="r num">${r.accepted}</td><td class="r num">${r.calls}</td></tr>`).join("")}</tbody></table>` : ""}
      ${rounds.map((id, i) => {
        const repaired = p.steps(id).filter((s) => s.status === "done" && s.stage.startsWith("repair-")).map((s) => s.stage.replace(/^repair-/, ""));
        return `<h3>Round ${i + 1} <span class="mono dim">${esc(id)}</span></h3>
          ${i ? `<p class="lead">Rewrote: ${repaired.length ? esc([...new Set(repaired)].join(", ")) : "nothing; every correction was patched in place"}.</p>` : ""}
          ${findingRows(chainOf(p, id).findings())}`;
      }).join("")}
      ${settled.length ? `<h3>Every correction the chain accepted</h3>
        <table class="grid"><thead><tr><th>round</th><th>what was wrong</th><th>what it became</th></tr></thead>
        <tbody>${settled.map((s) => `<tr><td class="num">${s.round}</td><td>${esc(s.statement)}</td><td>${esc(s.replacement)}</td></tr>`).join("")}</tbody></table>` : ""}
    </section>`;

  const schedule = v.schedule ? `
    <section class="break">
      <h2>The schedule</h2>
      <dl class="facts">${Object.entries(v.schedule.form).map(([k, x]) => `<dt>${esc(k)}</dt><dd>${esc(x)}</dd>`).join("")}</dl>
      <table class="grid beats"><thead><tr><th>beat</th><th class="r">words</th><th>when</th><th>job</th><th>withheld after it</th></tr></thead>
      <tbody>${v.schedule.beats.map((b) => `<tr><td class="num">${b.n}${b.pays ? ` <span class="pill chosen">pays</span>` : ""}</td><td class="r num">${n(b.words)}</td><td>${esc(b.when || "—")}</td><td>${esc(b.job)}</td><td>${b.withheld.length ? b.withheld.map((w) => `${esc(w.item)} <span class="dim">until ${w.until}</span>`).join("<br>") : "—"}</td></tr>`).join("")}</tbody></table>
    </section>` : "";

  const screens = `
    <section class="break">
      <h2>Writing and screening, beat by beat</h2>
      <p class="lead">Each beat is written by one fresh call, bound to the brief's ledger as it is written, then screened for ledger contradictions and a fixed list of structural tells. A flagged beat is rewritten once.</p>
      <table class="grid"><thead><tr><th>beat</th><th class="r">words</th><th class="r">cap</th><th class="r">versions</th><th class="r">rewrites</th><th class="r">patches</th><th>ledger and restated flags</th><th>structure flags</th></tr></thead>
      <tbody>${v.scenes.map((s) => {
        const versions = sceneArts.filter((a) => a.meta.beat === s.beat);
        const last = versions.at(-1);
        const ledger = v.screenFindings.filter((f) => f.beat === s.beat);
        const pr = v.profiles.find((x) => x.beat === s.beat);
        return `<tr><td class="num">${s.beat}</td><td class="r num">${n(words(s.text))}</td><td class="r num">${last?.meta.cap ?? "—"}</td><td class="r num">${versions.length}</td><td class="r num">${versions.filter((a) => a.meta.rewrite).length}</td><td class="r num">${versions.reduce((a, x) => a + (x.meta.patched?.length ?? 0), 0)}</td>
          <td>${ledger.length ? ledger.map((f) => `${pill(f.decision)} <span class="k">${esc(f.screen ?? "")}</span>${esc(f.span)} <span class="dim">→ ${esc(f.replacement)}</span>`).join("<br>") : "—"}</td>
          <td>${pr?.flags.length ? pr.flags.map((q) => `<b>${esc(q)}</b> <span class="dim">${esc(pr.answers[q]?.quote ?? "")}</span>`).join("<br>") : "—"}</td></tr>`;
      }).join("")}</tbody></table>
      ${v.listen ? `<h3>Listenability, against the narration pool</h3>
        <p class="lead">${n(v.listen.minutes)} minutes at the pool's ${v.listen.pool_wpm} words a minute. The pool is the transcripts of the narrated channels.</p>
        <table class="grid"><thead><tr><th>measure</th><th class="r">this draft</th><th class="r">pool</th></tr></thead>
        <tbody>${LISTEN_ROWS.map(([k, label, d]) => `<tr><td>${label}</td><td class="r num">${n(v.listen!.story[k] as number, d)}</td><td class="r num">${n(v.listen!.pool[k] as number, d)}</td></tr>`).join("")}</tbody></table>` : ""}
      ${v.slop ? `<h3>Slop, against the passage pool</h3>
        <table class="grid"><tbody>
          <tr><td>not-X-but-Y per 10,000 words</td><td class="r num">${n(v.slop.not_but.per_10k, 1)}</td><td class="r num dim">pool ${n(v.slop.not_but.pool_per_10k, 1)}</td></tr>
          <tr><td>lexicon hits</td><td colspan="2">${v.slop.lexicon.length ? v.slop.lexicon.map((l) => `${esc(l.term)} ×${l.count}`).join(", ") : "none"}</td></tr>
          <tr><td>repeated trigrams absent from the pool</td><td colspan="2">${v.slop.trigrams.length ? v.slop.trigrams.map((t) => `“${esc(t.trigram)}” ×${t.count}`).join(", ") : "none"}</td></tr>
        </tbody></table>` : ""}
      ${v.judge ? `<p class="lead warn">${esc(v.judge)}</p>` : ""}
    </section>`;

  const spend = `
    <section class="break">
      <h2>What it cost</h2>
      <p class="lead">Every model call on the chain, from the premises to the last screen, at list price as the CLI reported it.${cost.priced < cost.calls ? ` * ${cost.calls - cost.priced} of ${cost.calls} calls predate usage recording and are counted but not priced.` : ""}</p>
      <table class="grid"><thead><tr><th>stage</th><th>model</th><th class="r">calls</th><th class="r">output</th><th class="r">thinking</th><th class="r">cost</th></tr></thead>
      <tbody>${cost.rows.map((r) => `<tr><td>${esc(r.stage)}</td><td class="mono">${esc([...r.models].join(", "))}</td><td class="r num">${r.calls}</td><td class="r num">${kilo(r.output)}</td><td class="r num">${kilo(r.thinking)}</td><td class="r num">${r.priced ? usd(r.cost) : "—"}</td></tr>`).join("")}
      <tr class="total"><td>total</td><td></td><td class="r num">${cost.calls}</td><td class="r num">${kilo(cost.output)}</td><td class="r num">${kilo(cost.thinking)}</td><td class="r num">${cost.priced ? usd(cost.cost) : "—"}</td></tr></tbody></table>
      ${resolved ? `<h3>Draft configuration</h3><pre>${esc(toToml(resolved))}</pre>` : ""}
      <p class="lead dim">Chain, newest first: ${chain.ids.map((id) => `<span class="mono">${esc(id)}</span>`).join(" ← ")}. Pipeline ${esc(pipelineVersion())}.</p>
    </section>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Cloud Chamber</title>
<style>${fontFaces()}${CSS}</style></head>
<body><main>
  <header>
    <div class="brand">${MARK}<span>Cloud Chamber · draft report · ${esc(tip.status.replace(/_/g, " "))}</span></div>
    <h1>${esc(title)}</h1>
    <p class="seedline">${esc(root.seed_text)}</p>
    <p class="meta">${esc(drawId)} · ${esc(root.genre)}${resolved?.profile ? ` · profile ${esc(resolved.profile)}` : ""} · written ${esc(ended.slice(0, 16).replace("T", " "))} UTC</p>
    <dl class="glance">${glance.map(([k, x]) => `<div><dt>${k}</dt><dd>${x}</dd></div>`).join("")}</dl>
  </header>
  <section class="story break">
    <h2>The story</h2>
    ${v.scenes.map((s) => `<div class="beat"><div class="beatno">${s.beat}</div>${prose(s.text)}</div>`).join(`<div class="sep">*</div>`)}
  </section>
  ${origin}${brief}${checks}${schedule}${screens}${spend}
</main></body></html>
`;
}

/**
 * The UI's own font files, embedded: the report opens anywhere without a
 * network, and a headless print waiting on a web font never returned.
 */
const FACES: [family: string, style: string, weight: string, file: string][] = [
  ["Newsreader", "normal", "400 600", "newsreader-normal-400-600-latin.woff2"],
  ["Newsreader", "italic", "400 600", "newsreader-italic-400-600-latin.woff2"],
  ["Instrument Sans", "normal", "400 700", "instrument-sans-normal-400-700-latin.woff2"],
  ["IBM Plex Mono", "normal", "400", "ibm-plex-mono-normal-400-latin.woff2"],
  ["IBM Plex Mono", "normal", "500", "ibm-plex-mono-normal-500-latin.woff2"],
];
let faces: string | null = null;
function fontFaces(): string {
  faces ??= FACES.map(([family, style, weight, file]) => {
    const data = readFileSync(join(ROOT, "app", "ui", "public", "fonts", file)).toString("base64");
    return `@font-face { font-family: "${family}"; font-style: ${style}; font-weight: ${weight}; src: url(data:font/woff2;base64,${data}) format("woff2"); }`;
  }).join("\n");
  return faces;
}

const MARK = `<svg viewBox="-2 20 100 58" aria-hidden="true"><g fill="none" stroke="#1b2226" stroke-width="6.5" stroke-linecap="round"><path d="M34 54 A30 30 0 0 1 94 54 A20 20 0 0 1 54 54 A10 10 0 0 1 74 54"/><path d="M34 54 A16 16 0 0 0 2 54 A8 8 0 0 0 18 54"/></g><circle cx="34" cy="54" r="11" fill="#c8932f"/></svg>`;

// A paper document in the tool's type: Newsreader for prose, Instrument Sans for the frame, Plex Mono for figures.
const CSS = `
:root { --paper: #ffffff; --ink: #1b2226; --mute: #56636a; --dim: #7c8a91; --hair: #dde3e6; --rule: #9aa7ad; --gold: #a8761c; --goldwash: #f6ecd7; --keep: #2f7a4a; --pass: #b3413c; --art: #9a6a00;
  --serif: "Newsreader", Georgia, "Times New Roman", serif; --sans: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif; --mono: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace; }
* { box-sizing: border-box; }
html, body { background: var(--paper); color: var(--ink); margin: 0; }
body { font: 400 14px/1.5 var(--sans); padding-inline: 20px; padding-block: 40px 64px; }
main { max-width: 760px; margin: 0 auto; }
h1, h2, h3 { text-wrap: balance; margin: 0; font-weight: 400; }
h1 { font: 400 44px/1.08 var(--serif); letter-spacing: -.01em; margin-top: 18px; }
h2 { font: 400 28px/1.2 var(--serif); padding-bottom: 8px; border-bottom: 2px solid var(--ink); margin-bottom: 18px; }
h3 { font: 600 14px/1.3 var(--sans); margin: 26px 0 10px; }
p { margin: 0 0 10px; }
section { margin-top: 56px; }
.brand { display: flex; align-items: center; gap: 10px; color: var(--mute); font-size: 12.5px; }
.brand svg { width: 38px; height: auto; }
.seedline { font: italic 400 20px/1.4 var(--serif); color: var(--mute); margin-top: 10px; }
.meta { font: 400 12px var(--mono); color: var(--dim); }
.glance { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; margin: 26px 0 0; border-top: 2px solid var(--ink); }
.glance div { padding: 10px 12px 10px 0; border-bottom: 1px solid var(--hair); }
.glance dt { font: 500 11.5px var(--sans); font-variant-caps: all-small-caps; letter-spacing: .06em; color: var(--mute); }
.glance dd { margin: 2px 0 0; font: 500 17px var(--mono); font-variant-numeric: tabular-nums; }
.story .beat { position: relative; font: 400 17px/1.62 var(--serif); }
.story .beat p { margin: 0 0 .9em; text-indent: 1.4em; }
.story .beat p:first-of-type { text-indent: 0; }
.beatno { position: absolute; left: -44px; top: 4px; width: 30px; text-align: right; font: 400 11px var(--mono); color: var(--dim); }
.sep { text-align: center; color: var(--dim); font: 400 16px var(--serif); margin: 18px 0 20px; letter-spacing: .5em; }
.lead { color: var(--mute); max-width: 66ch; }
.lead b { color: var(--ink); font-weight: 600; }
.warn { color: var(--art); }
.none { color: var(--dim); font-style: italic; }
.facts { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 6px 16px; margin: 0 0 8px; }
.facts dt { font: 500 12px var(--sans); font-variant-caps: all-small-caps; letter-spacing: .06em; color: var(--mute); padding-top: 2px; }
.facts dd { margin: 0; }
.facts .seed { font: italic 400 17px/1.4 var(--serif); }
.example, .premise, .finding { border-top: 1px solid var(--hair); padding: 12px 0 6px; break-inside: avoid; }
.ehead, .phead, .fhead { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 12px; margin-bottom: 6px; }
.idx { font: 500 12px var(--mono); color: var(--dim); }
.etitle { font: 600 14px var(--sans); }
.excerpt { font: 400 14.5px/1.55 var(--serif); color: #2b3439; }
.premise { font: 400 15.5px/1.55 var(--serif); }
.premise.chosen { background: var(--goldwash); padding-inline: 12px; box-shadow: inset 2px 0 0 var(--gold); }
.prob { font: 500 15px var(--mono); }
.prose { font: 400 15.5px/1.6 var(--serif); }
.prose.small { font-size: 14px; }
.pill { font: 500 11px var(--sans); font-variant-caps: all-small-caps; letter-spacing: .08em; padding: 0 6px; border: 1px solid currentColor; border-radius: 2px; white-space: nowrap; }
.pill.accepted, .pill.chosen { color: var(--gold); }
.pill.dismissed { color: var(--dim); }
.pill.open { color: var(--pass); }
.score { font: 500 16px var(--mono); min-width: 22px; }
.statement { font-weight: 600; margin-bottom: 6px; }
.span, .evidence, .repl { font-size: 13px; color: var(--mute); margin-bottom: 4px; }
.span { font-family: var(--serif); font-size: 14px; font-style: italic; }
.repl { color: var(--ink); }
.k { font: 500 11px var(--sans); font-style: normal; font-variant-caps: all-small-caps; letter-spacing: .06em; color: var(--dim); margin-right: 6px; }
table.grid { width: 100%; border-collapse: collapse; font-size: 12.5px; margin: 6px 0 14px; }
table.grid th { text-align: left; font: 500 11.5px var(--sans); font-variant-caps: all-small-caps; letter-spacing: .06em; color: var(--mute); border-bottom: 2px solid var(--rule); padding: 6px 8px 5px 0; }
table.grid td { border-bottom: 1px solid var(--hair); padding: 7px 8px 7px 0; vertical-align: top; }
table.grid tr { break-inside: avoid; }
table.grid tr.total td { border-top: 2px solid var(--rule); font-weight: 600; }
.r { text-align: right; }
.num, .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.mono { font-size: 11.5px; }
.dim { color: var(--dim); }
pre { font: 400 11.5px/1.5 var(--mono); background: #f3f5f6; padding: 12px 14px; white-space: pre-wrap; }
@media (max-width: 640px) { .glance { grid-template-columns: repeat(2, minmax(0, 1fr)); } .beatno { position: static; display: block; text-align: left; margin-bottom: 4px; } h1 { font-size: 34px; } .facts { grid-template-columns: 1fr; } table.grid { display: block; overflow-x: auto; } }
@page { size: A4; margin: 18mm 17mm 20mm 20mm; }
@media print {
  body { padding: 0; font-size: 12px; }
  main { max-width: none; }
  section.break { break-before: page; margin-top: 0; }
  .story .beat { font-size: 12pt; }
  h2 { break-after: avoid; } h3 { break-after: avoid; }
  a { color: inherit; }
}
`;
