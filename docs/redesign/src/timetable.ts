/**
 * Direction 2, the timetable. A railway timetable book: black header bars,
 * condensed grotesk, every row a service with its times. A draw is a run along
 * one route, and the route strip across the top says where it stands.
 */
import * as M from "./model.ts";
import { esc, num, type Tab } from "./model.ts";
import { page, svgMark, TABS } from "./page.ts";

const bar = (tab: Tab) => `
<header class="bar">
  <a class="word" href="ideate.html">Cloud Chamber</a>
  <nav>${TABS.map(
    (t) => `<a href="${t}.html" class="${t === tab ? "on" : ""}${t === "sources" ? " sep" : ""}">${t}${t in M.WAITING ? ` <b>${M.WAITING[t as "ideate"]}</b>` : ""}</a>`,
  ).join("")}</nav>
  <div class="store">${num(M.D.status.passages)} passages · ${num(M.D.status.stories)} stories · ${M.D.status.sources} sources</div>
  <button class="b inv">new draw</button>
</header>`;

/** The route strip: every stop of the pipeline, the draw's times under the stops it has passed. */
const route = (tab: Tab, note: string) => `
<div class="route">
  <ol>${M.route(tab)
    .map(
      (s) => `<li class="st-${s.mark}"><span class="stop"></span><span class="lb">${s.label}</span><span class="at">${s.mark === "wait" ? note : s.at || (s.mark === "done" ? "origin" : "")}</span></li>`,
    )
    .join("")}</ol>
</div>`;

/** The departures board: the tab's draws, one line each. */
const departures = (tab: Tab, openId: string) => `
<aside class="deps">
  <table>
    <thead><tr><th>time</th><th>draw</th><th>state</th></tr></thead>
    <tbody>${M.rows(tab)
      .map(
        (r) => `<tr class="st-${r.mark}${r.id === openId ? " on" : ""}"><td class="tm">${r.day.replace(" ", "&nbsp;")}<br><span>${r.when}</span></td><td class="dn">${esc(r.name)}<small>${esc(r.seed.slice(0, 74))}…</small></td><td class="ds">${svgMark(r.mark)} ${esc(r.state)}${r.mark === "run" ? '<i class="sweep"></i>' : ""}</td></tr>`,
      )
      .join("")}</tbody>
  </table>
  <div class="foot">show archived · 119</div>
</aside>`;

/** The service header: the draw's name, then its facts as timetable columns. */
const service = (name: string, cols: string[][], actions: string) => `
<div class="svc">
  <div class="svc-top"><h1>${esc(name)}</h1><div class="acts">${actions}</div></div>
  <table class="cols"><tr>${cols.map(([k]) => `<th>${k}</th>`).join("")}</tr><tr>${cols.map(([, v]) => `<td>${esc(v)}</td>`).join("")}</tr></table>
</div>`;

const quiet = (...a: string[]) => a.map((x) => `<button class="b q">${x}</button>`).join("");
const note = `<input class="note" placeholder="note for the log">`;

function ideate() {
  const d = M.D.ideate;
  const steps = M.steps();
  const rows = d.candidates
    .map((c) => {
      const s = steps[c.index];
      const open = c.index === M.OPEN;
      return `<tr class="${open ? "open" : ""}">
      <td class="n">${c.index}</td>
      <td class="p">${c.p.toFixed(2)}</td>
      <td class="pb"><i style="width:${(c.p / 0.05) * 100}%"></i></td>
      <td class="prem">${esc(c.premise)}${open ? `<div class="vig">${M.paras(c.vignette)}<a class="more">${c.words} words · read the whole vignette</a></div>` : ""}</td>
      <td class="num">${c.words}</td>
      <td class="num">${s.at}<br><span class="dim">${s.secs} s</span></td>
      <td class="go">${svgMark("wait")}</td>
      <td class="act"><button class="b ${open ? "red" : "q"}">choose${open ? ` #${c.index}` : ""}</button></td>
    </tr>`;
    })
    .join("");
  const body = `
  ${service(
    d.name,
    [["id", d.id], ["setting", "unrestricted"], ["genre", d.genre], ["sampling", "tail 0–0.1"], ["model", d.model], ["calls", `${d.calls} · ${d.secs} s`], ["cost", `$${d.cost.toFixed(2)}`], ["seed", "drawn"]],
    `${note}${quiet("flag", "redraw", "archive", "delete")}`,
  )}
  <p class="seed">${esc(d.seed)}</p>
  <div class="th-bar"><span>premises</span><span class="sub">lowest probability first · proposed 06:56 in 24 s · choosing runs outline, context plan, two contexts and ending: 5 calls</span></div>
  <table class="tt">
    <thead><tr><th>#</th><th>p</th><th></th><th>premise</th><th class="num">words</th><th class="num">written</th><th>state</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="keys"><kbd>↓</kbd> move <kbd>⏎</kbd> read <kbd>c</kbd> choose <kbd>n</kbd> note</div>
  <div class="th-bar"><span>examples</span><span class="sub">6 passages the premises were drawn against</span></div>
  <table class="tt small">
    <thead><tr><th>passage</th><th>author</th><th>voice / mode</th><th class="num">words</th></tr></thead>
    <tbody>${d.examples.map((e) => `<tr><td>${esc(e.title)}</td><td>${esc(e.author || "—")}</td><td>${e.cell}</td><td class="num">${e.words ?? ""}</td></tr>`).join("")}</tbody>
  </table>`;
  return page(d.name, "ideate", `${bar("ideate")}${route("ideate", "waiting for you")}<div class="frame">${departures("ideate", d.id)}<main>${body}</main></div>`);
}

function check() {
  const c = M.D.check;
  const rows = M.findings
    .map((f, i) => {
      const open = i === 0;
      return `<tr class="${open ? "open" : ""}">
      <td class="n">${i + 1}</td>
      <td class="num strong">${f.score}</td>
      <td class="num">${f.n}/${f.samples}</td>
      <td>${f.invalidates}</td>
      <td class="ck">${f.checkers.join("<br>")}</td>
      <td class="prem"><q>${M.inline(f.span)}</q><div class="stmt">${M.inline(f.statement)}</div>${
        open
          ? `<table class="ev"><tr><th>result</th><td>${esc(f.result.replace(":", ": "))}</td></tr><tr><th>evidence</th><td>${esc(f.evidence)}</td></tr><tr><th>replacement</th><td class="rep">${esc(f.replacement)}</td></tr></table>`
          : ""
      }</td>
      <td class="act"><button class="b keep">accept</button><div class="dis">${M.DISMISS.map((x) => `<button class="b q">${x}</button>`).join("")}</div></td>
    </tr>`;
    })
    .join("");
  const body = `
  ${service(
    c.name,
    [["id", c.id], ["reported", `${c.summary.reported} of ${c.summary.total}`], ["dropped", `${c.dropped}`], ["checker calls", "12 · 887 s"], ["accepted", "0"], ...M.sections().filter((s) => s.n).map((s) => [`breaks ${s.name}`, String(s.n)])],
    `${note}${quiet("check again", "draft", "flag", "hold")}<button class="b red">auto repair · 4 rounds</button>`,
  )}
  <p class="seed">${esc(c.seed)}</p>
  <div class="th-bar"><span>findings</span><span class="sub">what it breaks first, then score · duplicates merged across checkers</span><span class="filters"><button class="on">all 5</button><button>score ≥ 7 · 2</button><button>dropped · 8</button></span></div>
  <table class="tt find">
    <thead><tr><th>#</th><th class="num">score</th><th class="num">seen</th><th>breaks</th><th>checker</th><th>finding</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="keys"><kbd>↓</kbd> move <kbd>a</kbd> accept <kbd>d</kbd> dismiss <kbd>1–4</kbd> dismiss with a reason <kbd>i</kbd> instruction</div>
  <div class="th-bar"><span>instruction</span><span class="sub">what should change, in your own words; tick the parts it is for</span></div>
  <div class="instr"><textarea rows="2" placeholder="for example: the ending leaves the safe open, and the weight stays on the pier"></textarea>
  <div class="for">for ${["vignette", "ending", "context 1", "context 2"].map((p) => `<button class="b q">${p}</button>`).join("")}<span class="seg"><button class="on">direction</button><button>fact</button></span><button class="b">add</button></div></div>`;
  return page(c.name, "check", `${bar("check")}${route("check", "review findings")}<div class="frame">${departures("check", c.id)}<main>${body}</main></div>`);
}

function write() {
  let n = 1;
  const beats = M.W.scenes
    .map((s) => {
      const fl = M.flagsOf(s.beat);
      const html = M.flagged(s.text, s.beat, n);
      const side = fl.map((f, i) => `<li><b>${n + i}</b> <span class="k">${f.screen}</span> ${esc(f.statement)}<span class="tick"><input type="checkbox" aria-label="tick flag ${n + i}"></span></li>`).join("");
      n += fl.length;
      return `<div class="scene"><div class="sh">beat ${s.beat}</div><div class="prose">${html}</div><ol class="margin">${side}</ol></div>`;
    })
    .join("");
  const body = `
  ${service(
    M.W.name,
    [["id", M.W.id], ...M.writeFacts().filter(([k]) => k !== "person")],
    `${note}${quiet("plan", "flag")}<button class="b red">keep and export</button>`,
  )}
  <p class="seed">${esc(M.W.seed)}</p>
  <div class="th-bar"><span>beats</span><span class="sub">the schedule the scenes were written from · tick flags, then rewrite their beats</span></div>
  <table class="tt">
    <thead><tr><th>beat</th><th class="num">words</th><th class="num">cap</th><th class="num">flags</th><th class="num">withheld</th><th>job</th><th></th></tr></thead>
    <tbody>${M.W.beats
      .map((b) => {
        const s = M.W.scenes.find((x) => x.beat === b.n)!;
        return `<tr><td class="n">${b.n}</td><td class="num${s.words > b.words * 1.05 ? " over" : ""}">${s.words}</td><td class="num">${b.words}</td><td class="num">${M.flagsOf(b.n).length}</td><td class="num">${b.withheld}</td><td class="job">${esc(b.job)}</td><td class="act"><button class="b q">rewrite</button></td></tr>`;
      })
      .join("")}</tbody>
  </table>
  <div class="th-bar"><span>draft</span><span class="sub">${M.W.form.person} · ${M.W.form.tense} · ${M.W.form.container}</span></div>
  ${beats}`;
  return page(M.W.name, "write", `${bar("write")}${route("write", "keep or rewrite")}<div class="frame">${departures("write", M.W.id)}<main>${body}</main></div>`);
}

function sources() {
  const facets = `<aside class="deps facets">
  <div class="seg full">${["passages", "stories", "themes", "briefs"].map((k, i) => `<button class="${i ? "" : "on"}">${k}</button>`).join("")}</div>
  <table><thead><tr><th>order</th><th></th></tr></thead><tbody>${["suspects first", "shuffled", "source order"].map((o, i) => `<tr class="${i ? "" : "on"}"><td colspan="2">${o}</td></tr>`).join("")}</tbody></table>
  <table><thead><tr><th>source</th><th class="num">passages</th></tr></thead><tbody>
  <tr><td>all</td><td class="num">${num(M.D.status.passages)}</td></tr>
  ${M.sources.map((s) => `<tr class="${s.source === "scp" ? "on" : ""}"><td>${s.source}</td><td class="num">${s.n}</td></tr>`).join("")}</tbody></table>
</aside>`;
  const body = `
  ${service("passages", [["source", "scp"], ["showing", `1–14 of ${M.D.passagesTotal}`], ["verdict", "unreviewed"], ["order", "suspects first"], ["eligible", num(M.D.status.eligible)], ["suspect", num(M.D.status.suspect)]], quiet("prev", "next"))}
  <div class="th-bar"><span>passages</span><span class="sub"><kbd>↑</kbd><kbd>↓</kbd> move <kbd>k</kbd> keep <kbd>p</kbd> pass <kbd>a</kbd> artifact <kbd>n</kbd> note</span></div>
  <table class="tt src">
    <thead><tr><th>#</th><th>text</th><th>from</th><th>voice / mode</th><th class="num">words</th><th>state</th><th>verdict</th></tr></thead>
    <tbody>${M.passages
      .map(
        (p, i) => `<tr class="${i === 1 ? "open" : ""}"><td class="n">${i + 1}</td><td class="prem">${esc(p.text)}</td><td><b>${esc(p.title)}</b><br><span class="dim">${esc(p.author)}</span></td><td>${p.cell}</td><td class="num">${p.words}</td><td class="go">${svgMark(i === 0 ? "keep" : i === 3 ? "pass" : "wait")}</td><td class="act v"><button class="b q k">keep</button><button class="b q p">pass</button><button class="b q a">artifact</button></td></tr>`,
      )
      .join("")}</tbody>
  </table>`;
  return page("passages", "sources", `${bar("sources")}<div class="frame">${facets}<main>${body}</main></div>`);
}

export default {
  slug: "timetable",
  name: "Timetable",
  line: "A railway timetable book: black header bars, condensed figures, and a route strip that shows where each draw stands in the whole pipeline.",
  pages: { ideate, check, write, sources },
};
