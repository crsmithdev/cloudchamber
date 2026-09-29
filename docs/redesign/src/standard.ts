/**
 * Direction 4, the standard. The category's usual tool, played straight: a
 * sidebar, a list, a detail pane with tabs, status badges, rounded controls and
 * one sans for everything, the generated prose included. The baseline the
 * other directions are measured against.
 */
import * as M from "./model.ts";
import { esc, num, type Tab } from "./model.ts";
import { page, TABS } from "./page.ts";

const BADGE: Record<string, string> = { wait: "amber", run: "blue", done: "green", fail: "red", todo: "grey" };
const badge = (mark: string, text: string) => `<span class="badge ${BADGE[mark]}"><i></i>${esc(text)}</span>`;

const side = (tab: Tab) => `<aside class="side">
  <div class="brand"><span class="logo">CC</span>Cloud Chamber</div>
  <button class="btn primary block">New draw</button>
  <div class="grp">Pipeline</div>
  ${TABS.filter((t) => t !== "sources").map((t) => `<a class="nav${t === tab ? " on" : ""}" href="${t}.html">${t[0].toUpperCase() + t.slice(1)}<span class="count">${M.WAITING[t as "ideate"]}</span></a>`).join("")}
  <div class="grp">Corpus</div>
  <a class="nav${tab === "sources" ? " on" : ""}" href="sources.html">Sources<span class="count dim">${num(M.D.status.passages)}</span></a>
  <div class="foot">${M.D.status.stories} stories · ${M.D.status.sources} sources</div>
</aside>`;

const list = (tab: Tab, openId: string) => {
  const rows = M.rows(tab);
  return `<section class="list">
  <div class="lh"><h2>${tab[0].toUpperCase() + tab.slice(1)}</h2><span class="muted">${rows.length} draws</span></div>
  <input class="search" placeholder="Search draws">
  ${rows
    .map(
      (r) => `<a class="item${r.id === openId ? " on" : ""}" href="#">
    <div class="it"><span class="nm">${esc(r.name)}</span><span class="muted sm">${r.day}</span></div>
    <div class="seedline">${esc(r.seed)}</div>
    <div>${badge(r.mark, r.state)}${r.note ? `<span class="muted sm"> · ${esc(r.note)}</span>` : ""}</div>
  </a>`,
    )
    .join("")}
  <div class="muted sm pad">119 archived</div>
</section>`;
};

const header = (name: string, mark: string, state: string, actions: string, tabs: string[]) => `
<div class="dh">
  <div class="crumbs muted sm">Draws / ${esc(name)}</div>
  <div class="dt"><h1>${esc(name)}</h1>${badge(mark, state)}<div class="acts">${actions}</div></div>
  <div class="tabs">${tabs.map((t, i) => `<a class="${i ? "" : "on"}">${t}</a>`).join("")}</div>
</div>`;

const btn = (label: string, cls = "") => `<button class="btn ${cls}">${label}</button>`;
const more = `<button class="btn icon" aria-label="More actions"><svg width="14" height="14" viewBox="0 0 14 14"><circle cx="3" cy="7" r="1.3" fill="currentColor"/><circle cx="7" cy="7" r="1.3" fill="currentColor"/><circle cx="11" cy="7" r="1.3" fill="currentColor"/></svg></button>`;
const props = (rows: string[][]) => `<div class="card props"><h2>Details</h2>${rows.map(([k, v]) => `<div class="prop"><span class="muted">${k}</span><span>${esc(v)}</span></div>`).join("")}</div>`;

function ideate() {
  const d = M.D.ideate;
  const cards = d.candidates
    .map((c) => {
      const open = c.index === M.OPEN;
      return `<div class="card prem${open ? " sel" : ""}">
      <div class="ph"><span class="pill">#${c.index}</span><span class="muted sm">p = ${c.p.toFixed(2)}</span><div class="meter"><i style="width:${(c.p / 0.05) * 100}%"></i></div><span class="muted sm">${c.words} words</span>${btn(open ? "Choose premise" : "Choose", open ? "primary sm" : "sm")}</div>
      <p>${esc(c.premise)}</p>
      ${open ? `<details open><summary>Vignette</summary>${M.paras(c.vignette)}</details>` : `<a class="link sm">Show vignette</a>`}
    </div>`;
    })
    .join("");
  const steps = M.steps()
    .map((s) => `<div class="step">${badge(s.mark, s.mark === "wait" ? "waiting" : s.mark === "todo" ? "pending" : "done")}<span>${s.label} <span class="muted">${s.sub}</span></span><span class="muted sm r">${s.at}${s.secs ? ` · ${s.secs}s` : ""}</span></div>`)
    .join("");
  const body = `${header(d.name, "wait", "Choose a premise", btn("Flag") + btn("Redraw") + more, ["Premises", "Examples", "Steps", "Log"])}
  <div class="cols">
    <div class="maincol">
      <div class="card seed"><h2>Seed</h2><p>${esc(d.seed)}</p></div>
      <div class="sech"><h2>Premises</h2><span class="muted sm">Sorted by probability, lowest first. Choosing runs 5 model calls.</span></div>
      ${cards}
    </div>
    <div class="sidecol">
      ${props(M.facts())}
      <div class="card"><h2>Steps <span class="muted sm">6 of 12</span></h2>${steps}</div>
    </div>
  </div>`;
  return page(d.name, "ideate", `<div class="app">${side("ideate")}${list("ideate", d.id)}<main>${body}</main></div>`);
}

function check() {
  const c = M.D.check;
  const cards = M.findings
    .map((f, i) => {
      const open = i === 0;
      return `<div class="card find${open ? " sel" : ""}">
      <div class="ph"><span class="pill ${f.score >= 7 ? "hi" : ""}">Score ${f.score}</span><span class="muted sm">${f.n}/${f.samples} samples · ${f.checkers.join(", ")}</span><span class="tag">breaks ${f.invalidates}</span>
      <div class="acts">${btn("Accept", "success sm")}<select class="sel sm"><option>Dismiss…</option>${M.DISMISS.map((x) => `<option>${x}</option>`).join("")}</select></div></div>
      <blockquote>${M.inline(f.span)}</blockquote>
      <p>${M.inline(f.statement)}</p>
      ${open ? `<div class="kv"><span class="muted">Result</span><span>${esc(f.result.replace(":", ": "))}</span><span class="muted">Evidence</span><span>${esc(f.evidence)}</span><span class="muted">Replacement</span><span class="rep">${esc(f.replacement)}</span></div>` : ""}
    </div>`;
    })
    .join("");
  const body = `${header(c.name, "wait", "Review findings", btn("Check again") + btn("Draft") + btn("Auto repair", "primary") + more, ["Findings", "Brief", "Outline", "Log"])}
  <div class="cols">
    <div class="maincol">
      <div class="sech"><h2>Findings <span class="count">5</span></h2><div class="segs"><button class="on">All</button><button>Score ≥ 7</button><button>Dropped (8)</button></div></div>
      ${cards}
      <div class="card"><h2>Instruction</h2><textarea rows="2" placeholder="What should change, in your own words"></textarea><div class="row">${["vignette", "ending", "context 1", "context 2"].map((p) => `<label class="cb"><input type="checkbox"> ${p}</label>`).join("")}${btn("Add instruction", "sm")}</div></div>
    </div>
    <div class="sidecol">
      ${props(M.checkFacts())}
      <div class="card"><h2>Outline</h2>${M.sections().map((s) => `<div class="prop"><span>${s.name}</span>${s.n ? `<span class="pill hi">${s.n}</span>` : '<span class="muted">0</span>'}</div>`).join("")}</div>
    </div>
  </div>`;
  return page(c.name, "check", `<div class="app">${side("check")}${list("check", c.id)}<main>${body}</main></div>`);
}

function write() {
  let n = 1;
  const beats = M.W.scenes
    .map((s) => {
      const b = M.W.beats.find((x) => x.n === s.beat)!;
      const fl = M.flagsOf(s.beat);
      const html = M.flagged(s.text, s.beat, n);
      const notes = fl.map((f, i) => `<div class="flag"><input type="checkbox"><span class="pill warn">${n + i}</span><span class="muted">${f.screen}</span> ${esc(f.statement)}</div>`).join("");
      n += fl.length;
      return `<div class="card beat"><div class="ph"><h2>Beat ${s.beat}</h2><span class="muted sm">${s.words} / ${b.words} words</span>${fl.length ? `<span class="pill warn">${fl.length} flags</span>` : ""}<div class="acts">${btn("Rewrite", "sm")}</div></div><p class="muted sm">${esc(b.job)}</p><div class="prose">${html}</div>${notes}</div>`;
    })
    .join("");
  const body = `${header(M.W.name, "wait", "Review the draft", btn("Plan") + btn("Keep and export", "primary") + more, ["Draft", "Plan", "Checks", "Log"])}
  <div class="cols">
    <div class="maincol">${beats}</div>
    <div class="sidecol">
      ${props(M.writeFacts())}
      <div class="card"><h2>Rewrite</h2><textarea rows="3" placeholder="Optional: what should change"></textarea><div class="segs full"><button class="on">Rewrite</button><button>Fix plan</button><button>Re-plan</button></div>${btn("Rewrite 0 beats", "block sm")}</div>
      <div class="card"><h2>Repeated phrases</h2>${M.W.trigrams.map((t) => `<div class="prop"><span>${t.trigram}</span><span class="muted">${t.count}</span></div>`).join("")}</div>
    </div>
  </div>`;
  return page(M.W.name, "write", `<div class="app">${side("write")}${list("write", M.W.id)}<main>${body}</main></div>`);
}

function sources() {
  const filters = `<section class="list">
  <div class="lh"><h2>Filters</h2><a class="link sm">Reset</a></div>
  <label class="fl">Kind<select class="sel"><option>Passages</option></select></label>
  <label class="fl">Order<select class="sel"><option>Suspects first</option></select></label>
  <label class="fl">Source<select class="sel"><option>scp (543)</option></select></label>
  <label class="fl">Author<select class="sel"><option>Any author</option></select></label>
  <label class="fl">Voice / mode<select class="sel"><option>Any</option></select></label>
  <label class="fl">Verdict<select class="sel"><option>Unreviewed</option></select></label>
  <div class="card props"><h2>Store</h2>${[["Passages", num(M.D.status.passages)], ["Eligible", num(M.D.status.eligible)], ["Suspect", num(M.D.status.suspect)], ["Stories", num(M.D.status.stories)]].map(([k, v]) => `<div class="prop"><span class="muted">${k}</span><span>${v}</span></div>`).join("")}</div>
</section>`;
  const rows = M.passages
    .map(
      (p, i) => `<tr class="${i === 1 ? "sel" : ""}"><td class="txt">${esc(p.text)}</td><td><div>${esc(p.title)}</div><div class="muted sm">${esc(p.author)} · ${p.words} words</div></td><td><span class="tag">${p.cell}</span></td><td>${i === 0 ? badge("done", "kept") : i === 3 ? badge("fail", "passed") : badge("todo", "unreviewed")}</td><td class="r nowrap">${btn("Keep", "sm")}${btn("Pass", "sm")}${more}</td></tr>`,
    )
    .join("");
  const body = `<div class="dh"><div class="crumbs muted sm">Sources / Passages</div><div class="dt"><h1>Passages</h1><span class="muted">543 results</span><div class="acts">${btn("Previous", "sm")}${btn("Next", "sm")}</div></div></div>
  <div class="tablewrap"><table class="table"><thead><tr><th>Text</th><th>From</th><th>Voice / mode</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return page("passages", "sources", `<div class="app">${side("sources")}${filters}<main>${body}</main></div>`);
}

export default {
  slug: "standard",
  name: "Standard",
  line: "The category's usual tool played straight: sidebar, list, detail with tabs, status badges, one sans throughout. The baseline.",
  pages: { ideate, check, write, sources },
};
