/**
 * Direction 3, the signal bench. An instrument on a dark bench: each draw is a
 * channel, and a scope screen above the work draws one real signal from it —
 * the calls over time, the finding scores against the filter level, the words
 * of each beat against its cap. One orange key per surface is the action.
 */
import * as M from "./model.ts";
import { esc, num, type Tab } from "./model.ts";
import { page, svgMark, TABS } from "./page.ts";

const rail = (tab: Tab, openId: string) => {
  const rows = M.rows(tab);
  const list =
    tab === "sources"
      ? ""
      : rows
          .map(
            (r, i) => `<a class="ch st-${r.mark}${r.id === openId ? " on" : ""}" href="#"><span class="cn">ch ${i + 1}</span>${svgMark(r.mark, 9)}<span class="nm">${esc(r.name)}</span><span class="sw">${esc(r.state)}</span><span class="t">${r.day} ${r.when}</span>${r.mark === "run" ? '<i class="sweep"></i>' : ""}</a>`,
          )
          .join("");
  return `<aside class="rail">
  <a class="word" href="ideate.html">Cloud Chamber</a>
  <nav>${TABS.map(
    (t) => `<a href="${t}.html" class="${t === tab ? "on" : ""}${t === "sources" ? " sep" : ""}"><span>${t}</span>${t in M.WAITING ? `<b>${M.WAITING[t as "ideate"]}</b>` : ""}</a>`,
  ).join("")}</nav>
  ${list ? `<div class="lg">channels <span>${rows.length}</span></div>${list}<div class="lg dim">archived 119</div>` : sourcesFacets()}
  <div class="store"><span>${num(M.D.status.passages)}</span> passages<br><span>${num(M.D.status.stories)}</span> stories · <span>${M.D.status.sources}</span> sources</div>
</aside>`;
};

const sourcesFacets = () => `<div class="lg">order</div>
  ${["suspects first", "shuffled", "source order"].map((o, i) => `<a class="fc${i ? "" : " on"}" href="#">${o}</a>`).join("")}
  <div class="lg">source</div>
  <a class="fc" href="#">all<span>${num(M.D.status.passages)}</span></a>
  ${M.sources.slice(0, 18).map((s) => `<a class="fc${s.source === "scp" ? " on" : ""}" href="#">${s.source}<span>${s.n}</span></a>`).join("")}`;

/** The scope: a 10 by 4 graticule, a trace, and the readouts in its corners. */
const scope = (title: string, readout: string, [plot, ro]: [string, string], keys: string) => `
<section class="bench">
  <div class="screen">
    <div class="ro tl">${title}</div><div class="ro tr">${readout}</div>
    <div class="plot"><svg viewBox="0 0 1000 200" preserveAspectRatio="none" class="grat" aria-hidden="true">
      ${Array.from({ length: 11 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="200"/>`).join("")}
      ${Array.from({ length: 5 }, (_, i) => `<line x1="0" y1="${i * 50}" x2="1000" y2="${i * 50}"/>`).join("")}
      <line class="axis" x1="0" y1="100" x2="1000" y2="100"/><line class="axis" x1="500" y1="0" x2="500" y2="200"/>
    </svg>${plot}</div>${ro}
  </div>
  <div class="keys">${keys}</div>
</section>`;

/** A label on the screen, placed in the trace's 1000 by 200 space but set as HTML so it keeps its shape. */
const lab = (x: number, y: number, text: string, cls = "") =>
  `<span class="lab ${cls}" style="left:${(x / 10).toFixed(2)}%;top:${(y / 2).toFixed(2)}%">${text}</span>`;

const key = (label: string, legend = "", cls = "") => `<div class="key ${cls}"><span class="legend">${legend}</span><button>${label}</button></div>`;

/** The ideate trace: one lane per stage, a pulse per call, then the flat line of the gate. */
function callsTrace() {
  const d = M.D.ideate;
  const t0 = +new Date(d.steps[0].started);
  const span = 60; // seconds across the screen
  const x = (s: number) => (s / span) * 1000;
  const labels: string[] = [];
  const lanes = d.steps.map((s, i) => {
    const a = (+new Date(s.started) - t0) / 1000;
    const b = a + (s.secs ?? 0);
    const y = i === 0 ? 46 : 104 + (i - 1) * 20;
    labels.push(i === 0 ? lab(x(b) + 6, y - 14, "propose premises · 24 s") : lab(x(a) - 8, y - 14, `vignette #${i} · ${s.secs} s`, "end"));
    return `<path d="M0 ${y} H${x(a)} V${y - 12} H${x(b)} V${y} H1000" class="tr${i ? "" : " lead"}"/>`;
  });
  const gate = x(45);
  return [`<svg viewBox="0 0 1000 200" preserveAspectRatio="none" class="trace" aria-label="calls over time">
    ${lanes.join("")}
    <line class="trig" x1="${gate}" y1="8" x2="${gate}" y2="196"/>
  </svg>${labels.join("")}
  <div class="mk-at" style="left:${gate / 10}%"><b>T</b> waiting for you since 06:57</div>`, `<div class="ro bl">06:56:22</div><div class="ro br">+60 s · 6 s/div</div>`];
}

/** The check trace: each open finding's score as a bar, and the filter as the trigger level. */
function scoreTrace() {
  const fs = M.findings;
  const w = 1000 / (fs.length + 1);
  const labels: string[] = [];
  const bars = fs
    .map((f, i) => {
      const h = (f.score / 12) * 180;
      labels.push(lab(w * (i + 0.6), 184 - h, `#${i + 1} · ${f.score}`, "up"));
      return `<rect x="${w * (i + 0.6)}" y="${200 - h}" width="${w * 0.5}" height="${h}" class="${f.score >= 7 ? "hot" : ""}"/>`;
    })
    .join("");
  const lvl = 200 - (7 / 12) * 180;
  return [`<svg viewBox="0 0 1000 200" preserveAspectRatio="none" class="trace bars">${bars}<line class="lvl" x1="0" y1="${lvl}" x2="1000" y2="${lvl}"/></svg>${labels.join("")}
  <div class="lvl-tag" style="top:${lvl / 2}%">level ≥ 7 · 2 above</div>`, `<div class="ro bl">score · 12 full scale</div><div class="ro br">5 open · 8 dropped</div>`];
}

/** The write trace: each beat's words against its cap, with a tick per flag. */
function wordsTrace() {
  const w = 1000 / 3;
  const labels: string[] = [];
  const bars = M.W.beats
    .map((b, i) => {
      const s = M.W.scenes.find((x) => x.beat === b.n)!;
      const h = (s.words / 700) * 180;
      const cap = 200 - (b.words / 700) * 180;
      labels.push(lab(w * i + 60, Math.min(200 - h, cap) - 6, `beat ${b.n} · ${s.words} of ${b.words}`, "up"));
      const flags = M.flagsOf(b.n)
        .map((_, j) => `<rect x="${w * i + 60 + j * 14}" y="${Math.min(200 - h, cap) - 34}" width="8" height="8" class="flag"/>`)
        .join("");
      return `<rect x="${w * i + 60}" y="${200 - h}" width="${w - 120}" height="${h}" class="${s.words > b.words * 1.05 ? "over" : ""}"/><line class="cap" x1="${w * i + 40}" y1="${cap}" x2="${w * (i + 1) - 40}" y2="${cap}"/>${flags}`;
    })
    .join("");
  return [`<svg viewBox="0 0 1000 200" preserveAspectRatio="none" class="trace bars">${bars}</svg>${labels.join("")}`, `<div class="ro bl">words · cap line per beat · a square per flag</div><div class="ro br">1,430 of 1,400</div>`];
}

/** The sources trace: passages in each voice / mode cell. */
function cellsTrace() {
  const w = 1000 / M.cells.length;
  const max = Math.max(...M.cells.map((c) => c.n));
  return [`<svg viewBox="0 0 1000 200" preserveAspectRatio="none" class="trace bars">${M.cells
    .map((c, i) => {
      const h = (c.n / max) * 130;
      return `<rect x="${w * i + 14}" y="${200 - h}" width="${w - 28}" height="${h}" class="${c.cell.startsWith("informational") ? "hot" : ""}"/>`;
    })
    .join("")}</svg>${M.cells.map((c, i) => lab((1000 / M.cells.length) * i + 14, 194 - (c.n / max) * 130, `${c.cell.replace("/", "/<br>")} · ${c.n}`, "two up")).join("")}`, `<div class="ro bl">passages by voice / mode · lit cells hold this page's passages</div><div class="ro br">${num(M.D.status.passages)}</div>`];
}

const head = (name: string, id: string, state: string, extra = "") => `
<div class="head"><h1>${esc(name)}</h1><span class="id">${id}</span><span class="state">${svgMark("wait", 9)} ${state}</span>${extra}<input class="note" placeholder="note for the log"></div>`;

const dl = (rows: string[][]) => `<dl class="facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;

function ideate() {
  const d = M.D.ideate;
  const rows = d.candidates
    .map((c) => {
      const open = c.index === M.OPEN;
      return `<div class="row${open ? " open" : ""}">
      <span class="n">${c.index}</span><span class="p">${c.p.toFixed(2)}</span><span class="pb"><i style="width:${(c.p / 0.05) * 100}%"></i></span>
      <div class="prem">${esc(c.premise)}${open ? `<div class="vig">${M.paras(c.vignette)}<a class="more">${c.words} words · read the whole vignette</a></div>` : ""}</div>
      <button class="sel${open ? " on" : ""}">${open ? "selected" : "select"}</button>
    </div>`;
    })
    .join("");
  const body = `
  ${scope("ch 1 · calls over time", `${d.calls} calls · ${d.secs} s · $${d.cost.toFixed(2)}`, callsTrace(), key("choose #2", "develop · 5 calls", "act") + key("flag") + key("redraw") + key("archive") + key("delete", "", "warn"))}
  <div class="work">
    ${head(d.name, d.id, "choose a premise")}
    ${dl(M.facts().filter(([k]) => k !== "id"))}
    <p class="seed"><span class="lg">seed</span>${esc(d.seed)}</p>
    <div class="lg">premises <span>lowest probability first · <kbd>↓</kbd> move <kbd>⏎</kbd> read <kbd>c</kbd> choose <kbd>n</kbd> note</span></div>
    <div class="rows">${rows}</div>
    <div class="lg">examples <span>6 passages the premises were drawn against</span></div>
    <table class="tbl"><tbody>${d.examples.map((e) => `<tr><td class="serif">${esc(e.title)}</td><td>${esc(e.author || "—")}</td><td class="mono">${e.cell}</td><td class="mono r">${e.words ?? ""}</td></tr>`).join("")}</tbody></table>
  </div>`;
  return page(d.name, "ideate", `<div class="frame">${rail("ideate", d.id)}<main>${body}</main></div>`);
}

function check() {
  const c = M.D.check;
  const rows = M.findings
    .map((f, i) => {
      const open = i === 0;
      return `<div class="row find${open ? " open" : ""}${f.score >= 7 ? " hot" : ""}">
      <span class="n">${i + 1}</span><span class="p">${f.score}</span><span class="seen">${f.n}/${f.samples}<br><small>${f.checkers.join(" · ")}</small></span>
      <div class="prem"><div class="brk">breaks <b>${f.invalidates}</b></div><q>${M.inline(f.span)}</q><div class="stmt">${M.inline(f.statement)}</div>${
        open
          ? `<dl class="ev"><dt>result</dt><dd>${esc(f.result.replace(":", ": "))}</dd><dt>evidence</dt><dd>${esc(f.evidence)}</dd><dt>replacement</dt><dd class="rep">${esc(f.replacement)}</dd></dl>`
          : ""
      }</div>
      <div class="vd"><button class="keep">accept</button><div>${M.DISMISS.map((x) => `<button class="q">${x}</button>`).join("")}</div></div>
    </div>`;
    })
    .join("");
  const body = `
  ${scope("ch 3 · finding scores", "5 reported of 24 · 12 checker calls · 887 s", scoreTrace(), key("auto repair", "up to 4 rounds", "act") + key("check again") + key("draft") + key("flag") + key("hold"))}
  <div class="work">
    ${head(c.name, c.id, "review findings")}
    ${dl(M.checkFacts())}
    <p class="seed"><span class="lg">seed</span>${esc(c.seed)}</p>
    <div class="lg">findings <span>what it breaks first, then score · <kbd>a</kbd> accept <kbd>d</kbd> dismiss <kbd>1–4</kbd> reason</span></div>
    <div class="rows">${rows}</div>
    <div class="lg">instruction <span>what should change, in your own words</span></div>
    <textarea class="inp" rows="2" placeholder="for example: the ending leaves the safe open, and the weight stays on the pier"></textarea>
    <div class="for">${["vignette", "ending", "context 1", "context 2"].map((p) => `<button class="q box">${p}</button>`).join("")}<span class="seg"><button class="on">direction</button><button>fact</button></span></div>
  </div>`;
  return page(c.name, "check", `<div class="frame">${rail("check", c.id)}<main>${body}</main></div>`);
}

function write() {
  let n = 1;
  const beats = M.W.scenes
    .map((s) => {
      const b = M.W.beats.find((x) => x.n === s.beat)!;
      const fl = M.flagsOf(s.beat);
      const html = M.flagged(s.text, s.beat, n);
      const side = fl.map((f, i) => `<li><label><input type="checkbox"> <b>${n + i}</b> ${f.screen}</label> ${esc(f.statement)}</li>`).join("");
      n += fl.length;
      return `<section class="beat"><div class="lg">beat ${s.beat} <span>${s.words} of ${b.words} words · ${fl.length} flags · ${esc(b.job)}</span></div>
      <div class="bt"><div class="prose">${html}</div>${side ? `<ol class="flags">${side}</ol>` : '<div class="flags none">no flags</div>'}</div></section>`;
    })
    .join("");
  const body = `
  ${scope("ch 1 · words per beat", "3 beats · 5 flags · 0 ticked", wordsTrace(), key("keep and export", "drafts/…/story.md", "act") + key("rewrite ticked", "0 beats") + key("fix the plan") + key("re-plan") + key("flag"))}
  <div class="work">
    ${head(M.W.name, M.W.id, "review the draft")}
    ${dl(M.writeFacts())}
    ${beats}
  </div>`;
  return page(M.W.name, "write", `<div class="frame">${rail("write", M.W.id)}<main>${body}</main></div>`);
}

function sources() {
  const rows = M.passages
    .map(
      (p, i) => `<tr class="${i === 1 ? "open" : ""}"><td class="mono dim">${i + 1}</td><td class="serif">${esc(p.text)}</td><td><b>${esc(p.title)}</b><br><span class="dim">${esc(p.author)} · ${p.words}w</span></td><td class="mono">${p.cell}</td><td>${svgMark(i === 0 ? "keep" : i === 3 ? "pass" : "wait", 9)}</td><td class="vd row-v"><button class="q k">keep</button><button class="q p">pass</button><button class="q a">artifact</button></td></tr>`,
    )
    .join("");
  const body = `
  ${scope("passages · voice / mode", `${M.D.passagesTotal} in scp · ${num(M.D.status.eligible)} eligible`, cellsTrace(), key("next page", "1–14", "act") + key("prev") + key("shuffle"))}
  <div class="work">
    <div class="head"><h1>passages</h1><span class="id">scp · unreviewed · suspects first</span><span class="kh"><kbd>↑</kbd><kbd>↓</kbd> move <kbd>k</kbd> keep <kbd>p</kbd> pass <kbd>a</kbd> artifact <kbd>n</kbd> note</span></div>
    <div class="seg full">${["passages", "stories", "themes", "briefs"].map((k, i) => `<button class="${i ? "" : "on"}">${k}</button>`).join("")}</div>
    <table class="tbl src"><thead><tr><th>#</th><th>text</th><th>from</th><th>voice / mode</th><th>state</th><th>verdict</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
  return page("passages", "sources", `<div class="frame">${rail("sources", "")}<main>${body}</main></div>`);
}

export default {
  slug: "bench",
  name: "Signal bench",
  line: "A dark instrument bench: draws are channels, a scope screen draws one real signal per screen, and one orange key is the action.",
  pages: { ideate, check, write, sources },
};
