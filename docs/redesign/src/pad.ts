/**
 * Direction 1, the computation pad. A bench log on pale green engineering
 * paper: the draw is a dated entry, the step log is its procedure, and the
 * decision the gate waits for is the boxed result at the foot of the entry.
 */
import * as M from "./model.ts";
import { esc, num, paras, type Tab } from "./model.ts";
import { page, svgMark, TABS } from "./page.ts";

const top = (tab: Tab) => `
<header class="top">
  <a class="word" href="ideate.html">Cloud Chamber</a>
  <nav>${TABS.map(
    (t) =>
      `<a href="${t}.html" class="${t === tab ? "on" : ""}${t === "sources" ? " sep" : ""}">${t}${
        t in M.WAITING ? `<span class="n">${M.WAITING[t as "ideate"]}</span>` : ""
      }</a>`,
  ).join("")}</nav>
  <div class="store"><span>${num(M.D.status.passages)}</span> passages <span>${num(M.D.status.stories)}</span> stories <span>${M.D.status.sources}</span> sources</div>
  <button class="btn">new draw</button>
</header>`;

/** The contents page: the tab's entries, grouped by day. */
const contents = (tab: Tab, openId: string) => {
  const rows = M.rows(tab);
  const days = [...new Set(rows.map((r) => r.day))];
  return `<aside class="contents">
  <div class="ch"><span>entries</span><span class="dim">${rows.filter((r) => r.mark === "wait").length} wait for you</span></div>
  ${days
    .map(
      (d) => `<div class="day">${d}</div>` +
        rows
          .filter((r) => r.day === d)
          .map(
            (r) => `<a class="entry${r.id === openId ? " on" : ""} st-${r.mark}" href="#">
    ${svgMark(r.mark)}<span class="nm">${esc(r.name)}</span><span class="t">${r.when}</span>
    <span class="sw">${esc(r.state)}${r.note ? ` · ${esc(r.note)}` : ""}</span>
    ${r.mark === "run" ? `<span class="sweep"></span>` : ""}
  </a>`,
          )
          .join(""),
    )
    .join("")}
</aside>`;
};

const dl = (rows: string[][]) => `<dl class="facts">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;

/** The pad's title block: ruled cells with a small label over each value. */
const head = (name: string, id: string, state: string, actions: string, started = "") => `
<div class="ehead">
  <div class="cell grow"><label>entry</label><h1>${esc(name)}</h1></div>
  <div class="cell"><label>id</label><span class="mono">${id}</span></div>
  <div class="cell state"><label>state</label><span>${svgMark("wait")} ${state}</span></div>
  <div class="cell acts">${actions}</div>
</div>`;

const quiet = (...a: string[]) => a.map((x) => `<button class="q">${x}</button>`).join("");

function ideate() {
  const d = M.D.ideate;
  const open = d.candidates.find((c) => c.index === M.OPEN)!;
  const trials = d.candidates
    .map(
      (c) => `<tr class="${c.index === M.OPEN ? "open" : ""}">
    <td class="n">${c.index}</td><td class="p">${c.p.toFixed(2)}</td>
    <td class="bar"><i style="width:${(c.p / 0.05) * 100}%"></i></td>
    <td class="prem">${esc(c.premise)}</td>
    <td class="w">${c.words}</td>
    <td class="act"><button class="btn sm">choose</button></td>
  </tr>${
    c.index === M.OPEN
      ? `<tr class="vig"><td colspan="2"></td><td></td><td colspan="3"><div class="prose">${paras(open.vignette)}</div><div class="more">${open.words} words · read the whole vignette</div></td></tr>`
      : ""
  }`,
    )
    .join("");
  const main = `<main class="entry-page">
  ${head(d.name, d.id, "choose a premise", `<input class="note" placeholder="note for the log">${quiet("flag", "redraw", "archive", "delete")}`, "Sep 29, 06:56")}
  <section class="aim"><h2>seed</h2><p class="seed">${esc(d.seed)}</p></section>
  <section>
    <h2>premises <span class="hn">lowest probability first · sampled from the tail, 0 to 0.1</span></h2>
    <table class="trials">
      <thead><tr><th>#</th><th>p</th><th></th><th>premise</th><th class="r">words</th><th></th></tr></thead>
      <tbody>${trials}</tbody>
    </table>
  </section>
  <section class="result">
    <div class="rbox">
      <div class="rl">result</div>
      <div class="rq">Develop premise <b>#${M.OPEN}</b>, p ${open.p.toFixed(2)}. Choosing runs the outline, the context plan, two contexts and the ending: 5 model calls.</div>
      <button class="btn primary">choose #${M.OPEN}</button>
    </div>
    <div class="keys"><kbd>↓</kbd> move <kbd>⏎</kbd> read <kbd>c</kbd> choose <kbd>n</kbd> note</div>
  </section>
  <section>
    <h2>examples <span class="hn">6 passages the premises were drawn against</span></h2>
    <table class="plain">
      <thead><tr><th>passage</th><th>author</th><th>voice / mode</th><th class="r">words</th></tr></thead>
      <tbody>${d.examples.map((e) => `<tr><td>${esc(e.title)}</td><td>${esc(e.author || "—")}</td><td class="mono">${e.cell}</td><td class="r mono">${e.words ?? ""}</td></tr>`).join("")}</tbody>
    </table>
  </section>
</main>`;
  const side = `<aside class="procedure">
  <h2>procedure <span class="hn">6 of 12 calls done</span></h2>
  <ol class="proc">${M.steps()
    .map(
      (s, i) => `<li class="st-${s.mark}"><span class="i">${i + 1}</span>${svgMark(s.mark)}<span class="l">${s.label}<small>${s.sub}</small></span><span class="at">${s.at}</span><span class="s">${s.secs ?? ""}</span></li>`,
    )
    .join("")}</ol>
  <h2>draw</h2>
  ${dl(M.facts())}
</aside>`;
  return page(d.name, "ideate", `${top("ideate")}<div class="frame">${contents("ideate", d.id)}${main}${side}</div>`);
}

function check() {
  const c = M.D.check;
  const obs = M.findings
    .map(
      (f, i) => `<article class="obs${i === 0 ? " open" : ""}">
    <div class="on">${i + 1}</div>
    <div class="ob">
      <div class="meta"><span class="score">${f.score}</span><span class="dots">${svgMark("done", 7).repeat(f.n)}</span><span class="mono">${f.n}/${f.samples}</span><span>breaks <b>${f.invalidates}</b></span><span class="dim">${f.checkers.join(" · ")}</span></div>
      <blockquote>${M.inline(f.span)}</blockquote>
      <p class="stmt">${M.inline(f.statement)}</p>
      ${
        i === 0
          ? `<dl class="ev"><dt>result</dt><dd>${esc(f.result.replace(":", ": "))}</dd><dt>evidence</dt><dd>${esc(f.evidence)}</dd><dt>replacement</dt><dd class="rep">${esc(f.replacement)}</dd></dl>`
          : ""
      }
    </div>
    <div class="verdict"><button class="btn sm keep">accept</button><div class="dis">dismiss: ${M.DISMISS.map((d) => `<button class="q">${d}</button>`).join("")}</div></div>
  </article>`,
    )
    .join("");
  const main = `<main class="entry-page">
  ${head(c.name, c.id, "review findings", `<input class="note" placeholder="note for the log">${quiet("check again", "draft", "flag", "hold")}`, "Sep 26, 15:39")}
  <section class="aim"><h2>seed</h2><p class="seed">${esc(c.seed)}</p></section>
  <section class="result">
    <div class="rbox">
      <div class="rl">result</div>
      <div class="rq"><b>5</b> findings open, <b>0</b> accepted. Accept or dismiss each, or let auto repair take the ones it can.</div>
      <button class="btn primary">auto repair · up to 4 rounds</button>
    </div>
  </section>
  <section>
    <h2>findings <span class="hn">what it breaks first, then score · duplicates merged across checkers</span></h2>
    <div class="filter"><button class="chip on">all 5</button><button class="chip">score ≥ 7 · 2</button><span class="dim">8 the verify pass dropped · show</span></div>
    ${obs}
  </section>
  <section>
    <h2>instruction <span class="hn">what should change, in your own words; tick the parts it is for</span></h2>
    <textarea class="inp" rows="2" placeholder="for example: the ending leaves the safe open, and the weight stays on the pier"></textarea>
    <div class="for">for ${["vignette", "ending", "context 1", "context 2"].map((p) => `<button class="chip">${p}</button>`).join("")}<span class="seg"><button class="on">direction</button><button>fact</button></span><button class="btn sm">add</button></div>
  </section>
</main>`;
  const side = `<aside class="procedure">
  <h2>outline <span class="hn">open findings by the section they break</span></h2>
  <table class="plain tight"><thead><tr><th>section</th><th class="r">findings</th></tr></thead><tbody>${M.sections()
    .map((s) => `<tr${s.n ? "" : ' class="dim"'}><td>${s.name}</td><td class="r mono">${s.n || "—"}</td></tr>`)
    .join("")}</tbody></table>
  <h2>check</h2>
  ${dl(M.checkFacts())}
  <h2>brief</h2>
  <div class="prose small">${paras(String(c.parts.outline).replace(/^## \w+\s*/, "").replace(/\*\*/g, ""))}</div>
</aside>`;
  return page(c.name, "check", `${top("check")}<div class="frame">${contents("check", c.id)}${main}${side}</div>`);
}

function write() {
  let n = 1;
  const beats = M.W.scenes
    .map((s) => {
      const b = M.W.beats.find((x) => x.n === s.beat)!;
      const fl = M.flagsOf(s.beat);
      const html = M.flagged(s.text, s.beat, n);
      const notes = fl.map((f, i) => `<li><span class="fn">${n + i}</span><span class="k">${f.screen}</span> ${esc(f.statement)}</li>`).join("");
      n += fl.length;
      return `<section class="beat">
      <h2>beat ${s.beat} <span class="hn"><span class="mono">${s.words} / ${b.words}</span> words${s.words > b.words * 1.05 ? " · over the cap" : ""} · ${fl.length} flag${fl.length === 1 ? "" : "s"}</span></h2>
      <p class="job">${esc(b.job)}</p>
      <div class="prose">${html}</div>
      ${notes ? `<ol class="flags">${notes}</ol>` : ""}
    </section>`;
    })
    .join("");
  const main = `<main class="entry-page">
  ${head(M.W.name, M.W.id, "review the draft", `<input class="note" placeholder="note for the log">${quiet("plan", "flag")}`, "Sep 22, 15:47")}
  <section class="result">
    <div class="rbox">
      <div class="rl">result</div>
      <div class="rq">Keep the draft and export it to <span class="mono">drafts/${M.W.name}/story.md</span>, or tick flags and rewrite their beats.</div>
      <button class="btn primary">keep and export</button>
    </div>
  </section>
  ${beats}
</main>`;
  const side = `<aside class="procedure">
  <h2>rewrite <span class="hn">nothing ticked</span></h2>
  <div class="for">beats ${[1, 2, 3].map((b) => `<button class="chip">${b}</button>`).join("")}</div>
  <div class="seg wide"><button class="on">rewrite these</button><button>fix the plan</button><button>re-plan from 1</button></div>
  <textarea class="inp" rows="3" placeholder="optional: what should change, in your own words"></textarea>
  <button class="btn sm" disabled>rewrite 0 beats</button>
  <h2>form</h2>
  ${dl(M.writeFacts())}
  <h2>beats</h2>
  <table class="plain tight"><thead><tr><th>#</th><th class="r">words</th><th class="r">flags</th></tr></thead><tbody>${M.W.beats
    .map((b) => {
      const s = M.W.scenes.find((x) => x.beat === b.n)!;
      return `<tr><td class="mono">${b.n}</td><td class="r mono">${s.words} / ${b.words}</td><td class="r mono">${M.flagsOf(b.n).length}</td></tr>`;
    })
    .join("")}</tbody></table>
  <h2>repeated <span class="hn">a tell, not a score</span></h2>
  <ul class="tri">${M.W.trigrams.map((t) => `<li><span>${t.trigram}</span><span class="mono">${t.count}</span></li>`).join("")}</ul>
</aside>`;
  return page(M.W.name, "write", `${top("write")}<div class="frame">${contents("write", M.W.id)}${main}${side}</div>`);
}

function sources() {
  const facets = `<aside class="contents">
  <div class="seg wide">${["passages", "stories", "themes", "briefs"].map((k, i) => `<button class="${i ? "" : "on"}">${k}</button>`).join("")}</div>
  <div class="day">order</div>
  ${["suspects first", "shuffled", "source order"].map((o, i) => `<a class="facet${i ? "" : " on"}" href="#">${o}</a>`).join("")}
  <div class="day">source</div>
  <a class="facet" href="#">all<span class="t">${num(M.D.status.passages)}</span></a>
  ${M.sources.slice(0, 16).map((s) => `<a class="facet${s.source === "scp" ? " on" : ""}" href="#">${s.source}<span class="t">${s.n}</span></a>`).join("")}
  <a class="facet dim" href="#">${M.sources.length - 16} more</a>
</aside>`;
  const rows = M.passages
    .map(
      (p, i) => `<tr class="${i === 1 ? "open" : ""}">
    <td class="n">${i + 1}</td>
    <td class="prem">${esc(p.text)}</td>
    <td><b>${esc(p.title)}</b><br><span class="dim">${esc(p.author)} · ${p.words}w</span></td>
    <td class="mono small">${p.cell}</td>
    <td class="c">${svgMark(i === 0 ? "keep" : i === 3 ? "pass" : "wait")}</td>
    <td class="act"><button class="q k">keep</button><button class="q p">pass</button><button class="q a">artifact</button></td>
  </tr>`,
    )
    .join("");
  const main = `<main class="entry-page wide">
  <div class="ehead"><div class="cell grow"><label>source</label><h1>scp</h1></div><div class="cell"><label>passages</label><span class="mono">${M.D.passagesTotal} of ${num(M.D.status.passages)}</span></div><div class="cell"><label>verdict</label><span>unreviewed</span></div>
  <div class="cell acts"><span class="keys"><kbd>↑</kbd><kbd>↓</kbd> move <kbd>k</kbd> keep <kbd>p</kbd> pass <kbd>a</kbd> artifact <kbd>n</kbd> note</span><span class="mono dim">1–14</span>${quiet("prev", "next")}</div></div>
  <table class="trials src"><thead><tr><th>#</th><th>text</th><th>from</th><th>voice / mode</th><th>state</th><th></th></tr></thead><tbody>${rows}</tbody></table>
</main>`;
  const side = `<aside class="procedure">
  <h2>voice / mode <span class="hn">passages in each cell</span></h2>
  <table class="plain tight"><tbody>${M.cells.map((c) => `<tr><td class="mono">${c.cell}</td><td class="r mono">${c.n}</td></tr>`).join("")}</tbody></table>
  <h2>store</h2>
  ${dl([["passages", num(M.D.status.passages)], ["eligible", num(M.D.status.eligible)], ["suspect", num(M.D.status.suspect)], ["stories", num(M.D.status.stories)]])}
</aside>`;
  return page("passages", "sources", `${top("sources")}<div class="frame">${facets}${main}${side}</div>`);
}

export default {
  slug: "pad",
  name: "Computation pad",
  line: "A bench log on green engineering paper: each draw is a dated entry, and the gate is the boxed result at its foot.",
  pages: { ideate, check, write, sources },
};
