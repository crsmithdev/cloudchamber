/**
 * Phase B mockups: the draw page in two worlds, from the real gate fixture.
 * Three states per world: gate (all rows shut), open (the lowest premise read), running
 * (the draw as it stood at 14:15:05, one vignette landed and four still being written).
 * Static HTML on Tailwind v4; compile each world's stylesheet with @tailwindcss/cli.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { marked } from "marked";
const dir = import.meta.dir;
const read = (f: string) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
const draws = read("draws.json") as any[];
const gate = read("gate.json");

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const md = (text: string) => marked.parse(text, { async: false }) as string;
const firstPara = (s: string) => esc(s.trim().split(/\n\s*\n/)[0].replace(/[*_#>`]/g, ""));
const hhmm = (iso: string) => iso.slice(11, 16);
const when = (iso: string) => `${iso.slice(5, 10).replace("-", " ")} · ${hhmm(iso)}`;
const secs = (a: string, b: string | null, now?: string) => Math.round((Date.parse(b ?? now!) - Date.parse(a)) / 1000);
const band = (p: number) => (p < 0.1 ? "tail" : p < 0.35 ? "off-centre" : "standard");

// --- the fixture, as of a moment ------------------------------------------------------------
type State = "gate" | "open" | "running";
const RUNNING_AT = "2026-09-09T14:15:05Z";
const g = gate.draw;
const cands = (gate.candidates as any[]).slice().sort((a, b) => a.probability - b.probability);
const maxP = Math.max(...cands.map((c) => c.probability));
const stepOf = new Map<string, any>((gate.steps as any[]).map((s) => [s.id, s]));
const examples = gate.examples as any[];

function stepsAt(state: State) {
  const now = state === "running" ? RUNNING_AT : null;
  return (gate.steps as any[]).map((s) => {
    const done = !now || s.ended_at <= now;
    const c = cands.find((x) => x.step_id === s.id);
    return { ...s, done, running: !done, elapsed: done ? secs(s.started_at, s.ended_at) : secs(s.started_at, null, now!), cand: c };
  });
}
function candsAt(state: State) {
  return cands.map((c) => {
    const s = stepOf.get(c.step_id);
    const landed = state !== "running" || s.ended_at <= RUNNING_AT;
    return { ...c, landed, elapsed: landed ? secs(s.started_at, s.ended_at) : secs(s.started_at, null, RUNNING_AT) };
  });
}
const listRows = (state: State) => {
  const rows = draws.filter((r) => !["rejected"].includes(r.status)).slice(0, 9);
  return rows.map((r) => ({ ...r, on: r.id === g.id, status: r.id === g.id && state === "running" ? "running" : r.status }));
};
const STATUS: Record<string, string> = { awaiting_gate: "open", running: "running", done: "brief", failed: "failed", awaiting_check_gate: "gate 1" };

// --- shared head -------------------------------------------------------------------------
const head = (title: string, css: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} (mockup)</title>
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20,400..500,0,0&icon_names=check,chevron_left,chevron_right,question_mark,expand_more,close&display=block" />
<link rel="stylesheet" href="${css}" /></head><body>`;

// =========================================================================================
// World A: The Tide Table
// =========================================================================================
function tide(state: State) {
  const steps = stepsAt(state);
  const cs = candsAt(state);
  const openIdx = state === "open" ? 0 : -1;
  const running = state === "running";
  const rail = `
  <aside class="border-r border-hair px-3 py-4 flex flex-col gap-5 min-w-0">
    <div class="px-2 font-serif text-[18px] leading-tight font-medium">Cloud Chamber<small class="block font-sans text-head text-dim mt-0.5">ideation pipeline</small></div>
    <nav class="flex flex-col" aria-label="Sections">
      <a class="navlink" href="#">browse</a><a class="navlink on" href="#">ideate <span class="text-dim">${listRows(state).filter((r) => r.status === "awaiting_gate").length}</span></a><a class="navlink" href="#">check <span class="text-dim">1</span></a><a class="navlink" href="#">write</a>
    </nav>
    <div class="mt-auto px-2 text-dim leading-relaxed"><b class="text-mute font-medium">4079</b>/4082 passages<br /><b class="text-mute font-medium">1823</b>/1824 themes</div>
  </aside>`;
  const list = `
  <div class="bg-sheet border-r border-hair min-w-0 overflow-auto">
    <div class="sticky top-0 bg-sheet border-b-2 border-rule px-3 py-2 flex items-center gap-3"><button class="choose primary">draw</button><span class="head">10 open · 1 in check</span></div>
    ${listRows(state).map((r) => `
    <div class="row${r.on ? " on" : ""}${r.status === "running" ? " running" : ""}${r.archived_at || r.superseded_by ? " old" : ""}">
      <div class="flex justify-between gap-2"><span class="text-ink font-semibold">${esc(r.name ?? r.id)}</span><span class="text-dim font-mono">${when(r.created_at)}</span></div>
      <div class="flex items-center gap-2 text-mute"><span class="mark ${r.status === "awaiting_gate" ? "wait" : r.status === "running" ? "run" : r.status === "failed" ? "fail" : r.status === "done" ? "held" : ""}"></span><span class="${r.status === "running" ? "sweep text-running" : ""}">${STATUS[r.status] ?? r.status}</span><span class="text-dim">· ${esc(r.setting ?? "unrestricted")} · ${esc(r.genre)} · ${esc(r.sampling)}</span></div>
      <div class="seed text-mute line-clamp-2">${esc(r.seed_text)}</div>
    </div>`).join("")}
  </div>`;
  const log = `
  <div class="tt log">
    <div><div class="head mb-1">steps <span class="normal-case tracking-normal text-dim">· ${steps.filter((s) => s.done).length} of ${steps.length + 1}</span></div>
    <table>
      <thead><tr><th class="head w-4"></th><th class="head">stage</th><th class="head">started</th><th class="head text-right">s</th></tr></thead>
      <tbody>
      ${steps.map((s) => `<tr${s.running ? ' class="sweep"' : ""}><td><span class="mark ${s.running ? "run" : "held"}"></span></td><td class="font-mono ${s.running ? "text-running" : ""}">${s.stage}${s.cand ? `<span class="text-dim"> #${s.cand.index}</span>` : ""}</td><td class="font-mono text-dim">${hhmm(s.started_at)}</td><td class="font-mono text-right ${s.running ? "text-running" : ""}">${s.elapsed}</td></tr>`).join("")}
      <tr><td><span class="mark ${running ? "todo" : "wait"}"></span></td><td class="font-mono ${running ? "text-dim" : "text-art"}">gate</td><td class="font-mono text-dim">${running ? "—" : hhmm(steps[steps.length - 1].ended_at)}</td><td class="font-mono text-right ${running ? "text-dim" : "text-art"}">${running ? "—" : "waiting"}</td></tr>
      ${["outline", "context", "ending", "brief"].map((st) => `<tr><td><span class="mark todo"></span></td><td class="font-mono text-dim">${st}</td><td class="font-mono text-dim">—</td><td class="font-mono text-dim text-right">—</td></tr>`).join("")}
      </tbody>
    </table></div>
    <div class="facts mt-6"><div class="head mb-1">draw</div>
    <table><tbody>
      <tr><td class="text-dim w-24">setting</td><td>${esc(g.setting)}</td></tr>
      <tr><td class="text-dim">genre</td><td>${esc(g.genre)}</td></tr>
      <tr><td class="text-dim">sampling</td><td>${esc(g.sampling)} <span class="text-dim">· 0.35 to 1</span></td></tr>
      <tr><td class="text-dim">model</td><td class="font-mono">${esc(steps[0].model)}</td></tr>
      <tr><td class="text-dim">calls</td><td>${steps.filter((s) => s.done).length} <span class="text-dim">· ${steps.filter((s) => s.done).reduce((n, s) => n + s.elapsed, 0)} s</span></td></tr>
      <tr><td class="text-dim">started</td><td class="font-mono">${when(g.created_at)}</td></tr>
    </tbody></table></div>
  </div>`;
  const rows = cs.map((c, i) => {
    const open = i === openIdx;
    const cls = open ? "rev" : openIdx >= 0 ? "faded" : "";
    return `
      <tr class="${cls}">
        <td class="font-mono">${c.index}</td>
        <td class="font-mono font-semibold">${c.probability.toFixed(2)}</td>
        <td class="pt-4"><div class="bar"><i style="width:${Math.round((c.probability / maxP) * 100)}%"></i></div></td>
        <td class="font-mono text-dim">${band(c.probability)}</td>
        <td class="serif-cell">${esc(c.premise)}${running && !c.landed ? `<div class="font-sans font-mono text-running mt-2 inline-block sweep">writing the vignette · ${c.elapsed} s</div>` : ""}${running && c.landed ? `<div class="font-sans font-mono text-dim mt-2">vignette · ${c.elapsed} s</div>` : ""}</td>
        <td class="text-center"><span class="mark"></span></td>
        <td class="text-right whitespace-nowrap">${running ? "" : `<button class="choose">choose</button>`}${!running && !open ? `<div class="mt-1"><a class="text-dim hover:text-ink" href="#">read</a></div>` : ""}</td>
      </tr>${open ? `<tr class="spans"><td colspan="7"><div class="prose-open">${md(c.vignette)}</div><div class="mt-3 flex gap-4 font-mono text-[12px]"><a href="#" class="underline underline-offset-4">close</a><span class="text-dim">${c.vignette.split(/\s+/).length} words · ${c.elapsed} s</span></div></td></tr>` : ""}`;
  }).join("");
  const body = `
  <div class="min-w-0 overflow-auto px-10 pt-6 pb-16 tt" style="container-type:inline-size">
    <div class="flex items-baseline gap-4 flex-wrap border-b-2 pb-2 ${running ? "sweep border-running" : "border-rule"}">
      <h1 class="text-name font-semibold m-0">${esc(g.name)}</h1>
      <span class="font-mono text-dim">${g.id}</span>
      <span class="flex items-center gap-2 ${running ? "text-running" : "text-art"}"><span class="mark ${running ? "run" : "wait"}"></span><span class="${running ? "sweep" : ""}">${running ? "running · execute" : "awaiting the gate"}</span></span>
      <span class="ml-auto flex items-center gap-2">
        <input type="text" placeholder="note" aria-label="Gate note" class="bg-desk border border-hair px-2 py-1 w-56 text-ink placeholder:text-dim" />
        <button class="choose">flag</button><button class="choose text-mute">redraw</button><button class="choose text-mute">archive</button>
      </span>
    </div>
    <div class="drawbody mt-4">
      <div class="min-w-0">
        <div class="head">seed</div>
        <p class="seed m-0 mt-1 max-w-[66ch]">${esc(g.seed_text)}</p>
        <div class="head mt-5">premises <span class="normal-case tracking-normal text-dim">· lowest probability first · ${running ? `${cs.filter((c) => c.landed).length} of 5 vignettes landed` : "five vignettes"}</span></div>
        <table class="mt-1">
          <thead><tr><th class="head w-7">#</th><th class="head w-12">p</th><th class="head w-20"></th><th class="head w-24">band</th><th class="head premise">premise</th><th class="head w-12 text-center">state</th><th class="head w-20"></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="head mt-6">examples <span class="normal-case tracking-normal text-dim">· six passages the premises were drawn against</span></div>
        <table class="mt-1">
          <thead><tr><th class="head">passage</th><th class="head">author</th><th class="head">cell</th><th class="head text-right">words</th><th class="head w-12 text-center">state</th><th class="head w-20"></th></tr></thead>
          <tbody>${examples.map((e) => `<tr><td class="serif-cell">${esc(e.title)}</td><td class="text-mute">${esc(e.author || "unknown")}</td><td class="font-mono text-dim">${esc(e.cell)}</td><td class="font-mono text-right">${e.words}</td><td class="text-center"><span class="mark held"></span></td><td class="text-right whitespace-nowrap"><a class="text-dim hover:text-ink" href="#">read</a></td></tr>`).join("")}</tbody>
        </table>
      </div>
      ${log}
    </div>
  </div>`;
  return head(`Cloud Chamber · ideate · tide table · ${state}`, "tide-table.out.css") + `
<div class="grid h-screen" style="grid-template-columns: 168px 340px minmax(0, 1fr)">${rail}${list}${body}</div>
<div class="mocktag">mockup · tide table · ${state}</div></body></html>`;
}

// =========================================================================================
// World B: The Galley Proof
// =========================================================================================
function galley(state: State) {
  const steps = stepsAt(state);
  const cs = candsAt(state);
  const openIdx = state === "open" ? 0 : -1;
  const running = state === "running";
  const rail = `
  <aside class="border-r border-desk-line px-3 py-4 flex flex-col gap-5 min-w-0">
    <div class="px-2 font-serif text-[18px] leading-tight font-medium text-desk-ink">Cloud Chamber<small class="block font-sans text-[11px] text-desk-dim mt-0.5">ideation pipeline</small></div>
    <nav class="flex flex-col" aria-label="Sections">
      <a class="navlink" href="#">browse</a><a class="navlink on" href="#">ideate <span class="text-desk-dim">${listRows(state).filter((r) => r.status === "awaiting_gate").length}</span></a><a class="navlink" href="#">check <span class="text-desk-dim">1</span></a><a class="navlink" href="#">write</a>
    </nav>
    <div class="mt-auto px-2 text-desk-dim leading-relaxed"><b class="text-desk-mute font-medium">4079</b>/4082 passages<br /><b class="text-desk-mute font-medium">1823</b>/1824 themes</div>
  </aside>`;
  const list = `
  <div class="border-r border-desk-line min-w-0 overflow-auto bg-desk-raised/40">
    <div class="sticky top-0 bg-desk border-b border-desk-line px-3 py-2 flex items-center gap-3"><a href="#" class="mark choose" style="color:var(--color-desk-ink);border-color:var(--color-desk-mute)">draw</a><span class="text-desk-dim">10 open · 1 in check</span></div>
    ${listRows(state).map((r) => `
    <div class="row${r.on ? " on" : ""}${r.status === "running" ? " running" : ""}${r.archived_at || r.superseded_by ? " old" : ""}">
      <div class="flex justify-between gap-2"><span class="text-desk-ink font-semibold">${esc(r.name ?? r.id)}</span><span class="text-desk-dim font-mono">${when(r.created_at)}</span></div>
      <div class="flex items-center gap-2"><span class="dot ${r.status === "awaiting_gate" ? "wait" : r.status === "running" ? "run" : r.status === "failed" ? "fail" : r.status === "done" ? "done" : ""}"></span><span class="${r.status === "running" ? "setting" : ""}">${STATUS[r.status] ?? r.status}</span><span class="text-desk-dim">· ${esc(r.setting ?? "unrestricted")} · ${esc(r.genre)} · ${esc(r.sampling)}</span></div>
      <div class="seed">${esc(r.seed_text)}</div>
    </div>`).join("")}
  </div>`;
  const slugline = `
    <div class="slugline slug${running ? " running" : ""}">
      ${steps.map((s) => `<span class="step ${s.done ? "done" : "setting"}"><b>${s.stage}${s.cand ? ` #${s.cand.index}` : ""}</b> · ${s.elapsed} s</span>`).join("")}
      <span class="step ${running ? "" : ""}" style="color:${running ? "var(--color-sheet-dim)" : "var(--color-art)"}"><b style="color:inherit">gate</b> · ${running ? "—" : "waiting since " + hhmm(steps[steps.length - 1].ended_at)}</span>
      ${["outline", "context", "ending", "brief"].map((st) => `<span class="step" style="color:var(--color-sheet-dim)">${st} · —</span>`).join("")}
      <span class="step ml-auto">${esc(steps[0].model)} · ${steps.filter((s) => s.done).length} calls</span>
    </div>`;
  const galleys = cs.map((c, i) => {
    const open = i === openIdx;
    const cls = open ? "open" : openIdx >= 0 ? "faded" : "";
    return `
      <div class="galley ${cls}">
        <div class="slug"><div><b class="text-sheet-ink">#${c.index}</b></div><div class="text-[15px] text-sheet-ink font-medium">${c.probability.toFixed(2)}</div><div>${band(c.probability)}</div><div class="slugbar"><i style="width:${Math.round((c.probability / maxP) * 100)}%"></i></div>${running ? `<div class="mt-2 ${c.landed ? "" : "setting"}">${c.landed ? `set · ${c.elapsed} s` : `setting · ${c.elapsed} s`}</div>` : `<div class="mt-2 text-sheet-dim">${c.elapsed} s</div>`}</div>
        <div class="type">
          <p class="premise">${esc(c.premise)}</p>
          ${running && !c.landed ? "" : open ? md(c.vignette) : `<div class="fold">${firstPara(c.vignette)}</div>`}
        </div>
        <div class="marks">
          ${running ? "" : `<button class="mark choose"><span class="icon" aria-hidden="true">check</span>choose</button>`}
          ${open ? `<button class="mark quiet"><span class="icon" aria-hidden="true">close</span>fold</button>` : running ? "" : `<a class="mark quiet" href="#"><span class="icon" aria-hidden="true">expand_more</span>unfold · ${c.vignette.split(/\s+/).length} words</a>`}
          ${!running ? `<button class="mark art"><span class="icon" aria-hidden="true">question_mark</span>query</button>` : ""}
        </div>
      </div>`;
  }).join("");
  const sources = examples.map((e) => `
      <div class="source"><span class="slug">${esc(e.cell)}</span><span class="t"><b>${esc(e.title)}</b> <span class="text-sheet-mute">· ${esc(e.author || "unknown")} · ${e.words} w</span></span><span class="marks flex-row gap-3"><button class="mark keep">stet</button><button class="mark pass">delete</button><button class="mark art"><span class="icon" aria-hidden="true">question_mark</span>query</button></span></div>`).join("");
  const body = `
  <div class="sheet min-w-0 overflow-auto px-12 pt-6 pb-16" style="container-type:inline-size;container-name:sheet">
    ${slugline}
    <div class="flex items-baseline gap-4 flex-wrap mt-4">
      <h1 class="font-sans text-name font-semibold m-0">${esc(g.name)}</h1>
      <span class="slug">${g.id}</span>
      <span class="slug">${esc(g.setting)} · ${esc(g.genre)} · ${esc(g.sampling)} · ${when(g.created_at)}</span>
      <span class="ml-auto flex items-center gap-3">
        <input type="text" placeholder="note in the margin" aria-label="Gate note" class="bg-sheet border-0 border-b border-sheet-rule px-1 py-1 w-56 text-sheet-ink placeholder:text-sheet-dim font-serif italic" />
        <button class="mark art">flag</button><button class="mark quiet">redraw</button><button class="mark quiet">archive</button>
      </span>
    </div>
    <p class="headnote mt-4 mb-0">${esc(g.seed_text)}</p>
    <div class="slug mt-6 mb-1">premises · lowest probability first${running ? ` · ${cs.filter((c) => c.landed).length} of 5 set` : ""}</div>
    <div class="galleys two">${galleys}</div>
    <div class="slug mt-8 mb-1">sources · six passages the premises were drawn against</div>
    ${sources}
  </div>`;
  return head(`Cloud Chamber · ideate · galley proof · ${state}`, "galley-proof.out.css") + `
<div class="grid h-screen" style="grid-template-columns: 168px 340px minmax(0, 1fr)">${rail}${list}${body}</div>
<div class="mocktag">mockup · galley proof · ${state}</div></body></html>`;
}

// =========================================================================================
// World A, the second test: the check page at gate 1, from the real checked fixture
// =========================================================================================
const checked = read("checked.json");
const findings = read("findings.json");
const brief = read("brief.json") as Record<string, string>;
const CHECK_STATUS: Record<string, string> = { done: "brief · not yet checked", awaiting_check_gate: "gate 1", checking: "checking", repairing: "repairing", repaired: "repaired" };
const STRUCTURE_Q = ["threat", "category-violation", "agency", "obscurity", "thickening", "spectacle", "consequence"];
const unquote = (s: string) => s.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "");
const boldLabels = (text: string) => text.replace(/^([A-Z][A-Za-z0-9 ,'’/&-]{0,40}):(?=\s)/gm, "**$1:**");

function tideCheck() {
  const c = checked.draw;
  const origin = (checked.candidates as any[]).find((x) => x.step_id === c.chosen_step);
  const outline = [...checked.artifacts].reverse().find((a: any) => a.kind === "outline");
  const jobs: string[] = outline ? JSON.parse(outline.meta).jobs ?? [] : [];
  const fs = (findings.findings as any[]).slice().sort((a, b) => b.n - a.n || (a.invalidates === "none" ? 1 : 0) - (b.invalidates === "none" ? 1 : 0));
  const selected = new Set(fs.slice(0, 2).map((x) => x.id));
  const structure = (findings.profiles as any[]).find((p) => p.checker === "structure");
  const resemblance = (findings.profiles as any[]).find((p) => p.checker === "resemblance");
  const checkSteps = (checked.steps as any[]).filter((s) => s.stage.startsWith("check-"));
  const checkSecs = checkSteps.reduce((n, s) => n + secs(s.started_at, s.ended_at), 0);
  const list = draws.filter((r) => ["done", "awaiting_check_gate", "checking", "repairing", "repaired"].includes(r.status));
  const rail = `
  <aside class="border-r border-hair px-3 py-4 flex flex-col gap-5 min-w-0">
    <div class="px-2 font-serif text-[18px] leading-tight font-medium">Cloud Chamber<small class="block font-sans text-head text-dim mt-0.5">ideation pipeline</small></div>
    <nav class="flex flex-col" aria-label="Sections">
      <a class="navlink" href="#">browse</a><a class="navlink" href="draw-tide-gate.html">ideate <span class="text-dim">10</span></a><a class="navlink on" href="#">check <span class="text-dim">${list.length}</span></a><a class="navlink" href="#">write</a>
    </nav>
    <div class="mt-auto px-2 text-dim leading-relaxed"><b class="text-mute font-medium">4079</b>/4082 passages<br /><b class="text-mute font-medium">1823</b>/1824 themes</div>
  </aside>`;
  const listPane = `
  <div class="bg-sheet border-r border-hair min-w-0 overflow-auto">
    <div class="sticky top-0 bg-sheet border-b-2 border-rule px-3 py-2 flex items-center gap-3"><span class="head">${list.filter((r) => r.status === "awaiting_check_gate").length} at gate 1 · ${list.filter((r) => r.status === "done").length} unchecked</span></div>
    ${list.map((r) => `
    <div class="row${r.id === c.id ? " on" : ""}">
      <div class="flex justify-between gap-2"><span class="text-ink font-semibold">${esc(r.name ?? r.id)}</span><span class="text-dim font-mono">${when(r.created_at)}</span></div>
      <div class="flex items-center gap-2 text-mute"><span class="mark ${r.status === "awaiting_check_gate" ? "wait" : r.status === "done" ? "" : "held"}"></span><span>${CHECK_STATUS[r.status] ?? r.status}</span><span class="text-dim">· ${esc(r.setting ?? "unrestricted")} · ${esc(r.genre)} · ${esc(r.sampling)}</span></div>
      <div class="seed text-mute line-clamp-2">${esc(r.seed_text)}</div>
      ${r.status === "done" ? `<div class="mt-1 flex items-center gap-3"><button class="choose">check this brief</button><span class="text-dim">derivation, ledger, structure, resemblance</span></div>` : ""}
    </div>`).join("")}
  </div>`;
  const marks = (n: number, of = 3) => Array.from({ length: of }, (_, i) => `<span class="mark ${i < n ? "held" : ""}"></span>`).join(" ");
  const findingRows = fs.map((x) => {
    const sel = selected.has(x.id);
    return `
      <tr class="${sel ? "rev" : ""}">
        <td class="whitespace-nowrap pt-3.5">${marks(x.n)} <span class="font-mono ml-1">${x.n}/3</span></td>
        <td class="font-mono ${x.invalidates === "none" ? "text-dim" : "text-gold"}">${esc(x.invalidates)}</td>
        <td class="font-mono text-dim">${x.checkers.map((k: string) => `<div>${k}</div>`).join("")}</td>
        <td class="finding-col">
          <div class="serif-cell italic">“${esc(unquote(x.span))}”</div>
          <div class="mt-1">${esc(x.statement)}</div>
          <div class="grid gap-x-3 gap-y-0.5 mt-2 text-mute" style="grid-template-columns: 5.5rem minmax(0, 1fr)"><span class="text-dim">result</span><span class="font-mono">${esc(x.result)}</span><span class="text-dim">evidence</span><span>${esc(x.evidence)}</span><span class="text-dim">replacement</span><span class="text-ink">${esc(x.replacement)}</span></div>
        </td>
        <td class="text-center"><span class="mark ${sel ? "held" : ""}"></span></td>
        <td class="text-right whitespace-nowrap"><button class="choose ${sel ? "" : "text-mute"}">${sel ? "selected" : "accept"}</button><div class="mt-1"><a class="text-dim hover:text-ink" href="#">dismiss</a></div></td>
      </tr>`;
  }).join("");
  const briefFiles = ["outline.md", "vignette.md", "context-1.md", "context-2.md", "ending.md"].map((f, i) => `
      <tr><td class="w-4"><span class="icon text-dim" aria-hidden="true">${i === 0 ? "expand_more" : "chevron_right"}</span></td><td class="font-mono text-dim whitespace-nowrap">${f}</td><td class="text-mute"><span class="line-clamp-1">${firstPara(brief[f]).slice(0, 90)}</span></td></tr>
      ${i === 0 ? `<tr class="spans"><td colspan="3" style="padding-left: 1.75rem"><div class="prose-open" style="font-size: 14.5px">${md(boldLabels(brief[f]))}</div></td></tr>` : ""}`).join("");
  const body = `
  <div class="min-w-0 overflow-auto px-10 pt-6 pb-16 tt" style="container-type:inline-size">
    <div class="flex items-baseline gap-4 flex-wrap border-b-2 border-rule pb-2">
      <h1 class="text-name font-semibold m-0">${esc(c.name)}</h1>
      <span class="font-mono text-dim">${c.id}</span>
      <span class="flex items-center gap-2 text-art"><span class="mark wait"></span>awaiting gate 1</span>
      <span class="text-mute">candidate <a class="font-mono text-gold" href="#">#${origin?.index} · ${origin?.probability.toFixed(2)}</a> · ${esc(c.setting ?? "unrestricted")} · ${esc(c.genre)} · ${esc(c.sampling)}</span>
      <span class="ml-auto flex items-center gap-2">
        <input type="text" placeholder="note for the log" aria-label="Gate note" class="bg-desk border border-hair px-2 py-1 w-56 text-ink placeholder:text-dim" />
        <button class="choose text-art">flag · a check looks wrong</button><button class="choose text-mute">hold</button><button class="choose text-pass">pass brief</button>
      </span>
    </div>
    <div class="flex items-center gap-2 flex-wrap mt-3 pb-3 border-b border-hair">
      <button class="choose primary">accept ${selected.size} · repair and re-check</button>
      <span class="flex items-center gap-2 pl-2 border-l border-hair"><button class="choose text-keep">all ${fs.length}</button><button class="choose text-keep">≥ 7 · ${fs.filter((x) => x.n === 3 && x.invalidates !== "none").length}</button><input type="range" min="1" max="10" value="7" aria-label="Score floor" class="w-24 accent-gold" /><button class="choose text-mute">none</button></span>
      <button class="choose text-art">auto · ≥ 7, to 4 rounds</button>
      <span class="ml-auto flex items-center gap-2"><button class="choose">draft · 5000 words <span class="icon" aria-hidden="true">expand_more</span></button></span>
    </div>
    <div class="checkbody mt-4">
      <div class="min-w-0">
        <div class="head">findings <span class="normal-case tracking-normal text-dim">· ${fs.length} reported · pass ${findings.pass.slice(0, 16).replace("T", " ")} · ${checkSteps.length} checker calls · ${checkSecs} s · by recurrence, then by the job it breaks</span></div>
        <table class="mt-1">
          <thead><tr><th class="head w-24">recurred</th><th class="head w-24">breaks</th><th class="head w-24">checkers</th><th class="head">finding</th><th class="head w-12 text-center">state</th><th class="head w-20"></th></tr></thead>
          <tbody>${findingRows}</tbody>
        </table>
        <div class="head mt-6">claims <span class="normal-case tracking-normal text-dim">· off · no claims authority declared on the setting</span></div>
        <div class="head mt-6">jobs <span class="normal-case tracking-normal text-dim">· from the outline · the words each carries</span></div>
        <table class="mt-1"><thead><tr><th class="head">job</th><th class="head text-right">words</th><th class="head text-right">findings against it</th></tr></thead><tbody>
          ${jobs.map((j) => `<tr><td class="font-mono">${j}</td><td class="font-mono text-right">${JSON.parse(outline.meta).words[j]}</td><td class="font-mono text-right">${fs.filter((x) => x.invalidates === j).length}</td></tr>`).join("")}
        </tbody></table>
      </div>
      <div class="min-w-0">
        <div class="head">structure <span class="normal-case tracking-normal text-dim">· present or absent · never summed</span></div>
        <table class="mt-1"><tbody>
          ${STRUCTURE_Q.map((q) => { const a = structure.answers[q]; return `<tr><td class="w-4"><span class="mark ${a.answer === "present" ? "held" : ""}"></span></td><td class="font-mono whitespace-nowrap ${a.answer === "present" ? "" : "text-dim"}">${q.replace("category-violation", "category")}</td><td class="serif-cell italic text-mute"><span class="line-clamp-1">${esc(a.quote)}</span></td></tr>`; }).join("")}
        </tbody></table>
        <div class="head mt-6">resemblance <span class="normal-case tracking-normal text-dim">· retrieval, not judgement · against premises.md</span></div>
        <table class="mt-1"><tbody>
          ${(resemblance.matches as any[]).map((m) => `<tr><td class="font-mono text-dim whitespace-nowrap w-16">matches</td><td><div>${esc(m.entry)}</div><div class="serif-cell italic text-mute mt-1">“${esc(unquote(m.span))}”</div></td></tr>`).join("")}
          <tr><td class="font-mono text-dim whitespace-nowrap">nearest</td><td><span class="serif-cell">${esc(resemblance.nearest.title)}</span>, ${esc(resemblance.nearest.author)}<div class="text-mute mt-1">${esc(resemblance.nearest.shared)}</div></td></tr>
        </tbody></table>
        <div class="head mt-6">examined <span class="normal-case tracking-normal text-dim">· what an empty result would have looked at</span></div>
        <table class="mt-1"><tbody><tr><td class="w-4"><span class="icon text-dim" aria-hidden="true">chevron_right</span></td><td class="font-mono">${findings.examined.length} lists</td><td class="text-dim">${[...new Set((findings.examined as any[]).map((e) => e.stage))].join(", ")}</td></tr></tbody></table>
        <div class="head mt-6">brief <span class="normal-case tracking-normal text-dim">· briefs/${c.id}/trail.md</span></div>
        <table class="mt-1"><tbody>${briefFiles}</tbody></table>
        <div class="font-mono text-dim mt-6 pt-3 border-t border-hair">${esc(findings.judge)}</div>
      </div>
    </div>
  </div>`;
  return head("Cloud Chamber · check · tide table · gate 1", "tide-table.out.css") + `
<div class="grid h-screen" style="grid-template-columns: 168px 340px minmax(0, 1fr)">${rail}${listPane}${body}</div>
<div class="mocktag">mockup · tide table · check · gate 1</div></body></html>`;
}

for (const state of ["gate", "open", "running"] as State[]) {
  writeFileSync(`${dir}/draw-tide-${state}.html`, tide(state));
  writeFileSync(`${dir}/draw-galley-${state}.html`, galley(state));
}
writeFileSync(`${dir}/check-tide-gate.html`, tideCheck());
console.log("wrote draw-{tide,galley}-{gate,open,running}.html check-tide-gate.html");
