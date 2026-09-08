import React, { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { api, when, type Artifact, type Candidate, type Example, type Facets, type Draw, type Fork, type Source, type Status, type Step } from "./api.ts";

export type Detail = { draw: Draw; steps: Step[]; artifacts: Artifact[]; candidates: Candidate[]; examples: Example[]; forks: Fork[] };
const STAGES = ["premises", "execute", "gate", "outline", "context", "ending", "brief"];
export const LABEL: Record<string, string> = { awaiting_gate: "open", done: "brief", awaiting_check_gate: "gate 1", awaiting_draft_gate: "gate 2", checking: "checking", repairing: "repairing", drafting: "drafting", drafted: "drafted", passed: "passed", repaired: "repaired" };
export const label = (status: string) => LABEL[status] ?? status;
export const secs = (a: string, b: string | null) => (b ? `${Math.round((Date.parse(b) - Date.parse(a)) / 1000)}s` : "running");
const choose = (index: number) => `Continue with premise ${index}: outline, two context vignettes, the ending, then the brief.`;
const develop = (index: number) => `Develop premise ${index} as a draw of its own: the same seed and examples, its own outline, context vignettes, ending and brief.`;

/** Model output and brief files are markdown written by this pipeline; rendered as written. */
export function Md({ text, className = "" }: { text: string; className?: string }) {
  const html = useMemo(() => marked.parse(text, { async: false }) as string, [text]);
  return <div className={"md " + className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Draws in the left pane, each expanding into its facts and step log; the selected draw, a step, or the start form fills the rest. */
export function Draws({ status, selected }: { status: Status | null; selected: string | undefined }) {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [stepId, setStepId] = useState<string | null>(null);
  const [brief, setBrief] = useState<Record<string, string> | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  const loadDraws = () => api.draws().then(setDraws).catch(() => {});
  useEffect(() => { loadDraws(); const t = setInterval(loadDraws, 3000); return () => clearInterval(t); }, []);

  // With nothing chosen, land on the draw that needs attention, else the newest; with no draws, the form.
  const current = selected ?? (draws.find((r) => r.status === "awaiting_gate") ?? draws[0])?.id ?? (draws.length ? undefined : "new");
  const isForm = current === "new";
  const loadDetail = (id: string) => api.draw(id).then((d) => setDetails((m) => ({ ...m, [id]: d }))).catch((e) => setErr(e.message));
  useEffect(() => {
    if (!current || isForm) return;
    setStepId(null); setBrief(null); setErr("");
    setOpen((o) => new Set(o).add(current));
    loadDetail(current);
    const t = setInterval(() => loadDetail(current), 2500);
    return () => clearInterval(t);
  }, [current]);
  useEffect(() => { for (const id of open) if (!details[id]) loadDetail(id); }, [open]);
  const d = current && !isForm ? details[current] : undefined;
  useEffect(() => { if (d?.draw.status === "done" && !brief) api.brief(d.draw.id).then(setBrief).catch(() => {}); }, [d?.draw.status]);

  const select = (id: string) => {
    if (id !== current) { location.hash = `#draw/${id}`; return; }
    if (stepId) { setStepId(null); return; }   // a step log is open: back to the draw before collapsing the row
    setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const gate = async (action: string, step_id?: string) => {
    if (!d) return;
    setErr("");
    try { const r = await api.gate(d.draw.id, { action, step_id, note }); setNote(""); if (r.id && r.id !== d.draw.id) location.hash = `#draw/${r.id}`; else loadDetail(d.draw.id); loadDraws(); } catch (e: any) { setErr(e.message); }
  };
  const verdict = async (e: Example, v: "keep" | "pass", artifact = false) => {
    await api.verdict({ kind: "example", target_id: e.id, verdict: v, artifact, note: "", method: "draw" });
    if (d) loadDetail(d.draw.id);
  };
  const step = d && stepId ? d.steps.find((s) => s.id === stepId) : undefined;
  const dot = (s: string) => "st " + (s === "awaiting_gate" ? "wait" : s === "failed" ? "fail" : s === "running" ? "running" : "");

  return (
    <>
      <div className="pane list">
        <div className="newdraw"><a className="btn primary" href="#draws/new" style={{ textDecoration: "none" }}>Draw</a></div>
        {draws.length === 0 && <div className="empty">No draws yet.</div>}
        {draws.map((r) => (
          <div key={r.id} className={"drawrow" + (r.id === current ? " on" : "") + (r.superseded_by ? " old" : "")} onClick={() => select(r.id)}>
            <div className="l1"><span className="nm">{r.name ?? r.id}</span><span className="when">{when(r.created_at)}</span></div>
            <div className="l2"><span className={dot(r.status)} />{label(r.status)} · {r.setting ?? "unrestricted"} · {r.genre} · {r.mode}{r.flagged ? <span className="art"> · flagged</span> : null}{r.forked_from && <span className="dim"> · fork</span>}{r.superseded_by && <span className="dim"> · superseded</span>}</div>
            <div className="sd">{r.seed_text}</div>
            <div className="rid mono dim">{r.id}</div>
            {open.has(r.id) && details[r.id] && <>
              <RowFacts d={details[r.id]} />
              <Log d={details[r.id]} stepId={r.id === current ? stepId : null} onStep={(id) => { if (r.id !== current) location.hash = `#draw/${r.id}`; setStepId(id); }} />
            </>}
          </div>))}
      </div>

      {isForm || !current ? <StartForm status={status} /> : (
        <div className="pane read span">
          {!d ? (err ? <div className="err">{err}</div> : <span className="dim">loading…</span>) : <>
            <div className="drawhd"><h1>{d.draw.name ?? d.draw.id}</h1><span className="rid mono dim">{d.draw.id}</span><span className={"badge " + d.draw.status}>{label(d.draw.status)}</span><span className="dim" style={{ fontSize: 12 }}>{d.draw.setting ?? "unrestricted"}{d.draw.domains ? ` · ${(JSON.parse(d.draw.domains) as string[]).join(" + ")}` : ""} · {d.draw.genre} · {d.draw.mode}{d.draw.gate_method ? ` · gate ${d.draw.gate_method}` : ""} · seed {d.draw.seed_mode}</span></div>
            {d.draw.forked_from && <div className="dim" style={{ fontSize: 12 }}>forked from <a href={`#draw/${d.draw.forked_from}`} className="mono">{d.draw.forked_from}</a></div>}
            {d.draw.superseded_by && <div className="dim" style={{ fontSize: 12 }}>superseded by <a href={`#draw/${d.draw.superseded_by}`} className="mono">{d.draw.superseded_by}</a></div>}
            {d.draw.status === "awaiting_gate" && !step && <GateBar d={d} note={note} setNote={setNote} err={err} onGate={gate} />}
            {step ? <StepView step={step} artifacts={d.artifacts.filter((a) => a.step_id === step.id)} chosen={step.id === d.draw.chosen_step} onBack={() => setStepId(null)} /> : <DrawBody d={d} brief={brief} onChoose={(id) => gate("choose", id)} onFork={(id) => gate("fork", id)} onVerdict={verdict} />}
          </>}
        </div>
      )}
    </>
  );
}

function RowFacts({ d }: { d: Detail }) {
  const chosen = d.candidates.find((c) => c.step_id === d.draw.chosen_step);
  const lowest = d.candidates[0];
  const since = d.steps.reduce((m, s) => (s.ended_at && s.ended_at > m ? s.ended_at : m), "");
  const failed = d.steps.filter((s) => s.status === "failed").length;
  return (
    <dl className="facts rowfacts" onClick={(e) => e.stopPropagation()}>
      {d.draw.status === "awaiting_gate" ? <>
        <dt>candidates</dt><dd>{d.candidates.length}</dd>
        {lowest && <><dt>lowest</dt><dd className="cell">#{lowest.index} · {lowest.probability.toFixed(2)}</dd></>}
        {since && <><dt>waiting since</dt><dd>{when(since)}</dd></>}
      </> : <>
        {d.draw.gate_method && <><dt>gate</dt><dd>{d.draw.gate_method}</dd></>}
        {chosen && <><dt>chosen</dt><dd className="cell">#{chosen.index} · {chosen.probability.toFixed(2)}</dd></>}
        <dt>started</dt><dd>{when(d.draw.created_at)}</dd>
        {d.draw.ended_at && <><dt>ended</dt><dd>{when(d.draw.ended_at)}</dd></>}
        <dt>steps</dt><dd>{d.steps.length}{failed ? <span className="pass"> · {failed} failed</span> : null}</dd>
      </>}
      {d.draw.flagged ? <><dt>flag</dt><dd className="art">{d.draw.flag_note || "flagged"}</dd></> : null}
    </dl>
  );
}

function GateBar({ d, note, setNote, err, onGate }: { d: Detail; note: string; setNote: (s: string) => void; err: string; onGate: (action: string, stepId?: string) => void }) {
  const lowest = d.candidates[0];
  return (
    <div className="gatebar" role="group" aria-label="Gate">
      {lowest && <button className="btn primary" title={choose(lowest.index)} onClick={() => onGate("choose", lowest.step_id)}>choose #{lowest.index}, continue</button>}
      <button className="btn pass" title="Close this draw as rejected and start a new one with a fresh seed and fresh examples." onClick={() => onGate("redraw")}>Reject</button>
      <button className="btn pass" title="Close this draw as rejected and start a new one from the same seed, with fresh examples and premises." onClick={() => onGate("keep-seed")}>Redraw</button>
      <button className="btn art" title="Mark this draw as a wrong call for later review. It stays open and nothing else changes." onClick={() => onGate("flag")}>Flag</button>
      <input type="text" name="gate-note" placeholder="note" aria-label="Gate note" value={note} onChange={(e) => setNote(e.target.value)} />
      {err && <div className="err" style={{ flexBasis: "100%" }}>{err}</div>}
    </div>
  );
}

export function Log({ d, stepId, onStep }: { d: Detail; stepId: string | null; onStep: (id: string) => void }) {
  const byParent = new Map<string | null, Step[]>();
  for (const s of d.steps) { const k = s.parent_id; if (!byParent.has(k)) byParent.set(k, []); byParent.get(k)!.push(s); }
  const flat: { s: Step; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => { for (const s of byParent.get(parent) ?? []) { flat.push({ s, depth }); walk(s.id, depth + 1); } };
  walk(null, 0);
  const cand = new Map(d.candidates.map((c) => [c.step_id, c]));
  const seen = new Set(d.steps.map((s) => s.stage));
  const inFlight = d.draw.status === "awaiting_gate" || d.draw.status === "running";
  const developed = !["awaiting_gate", "running", "done", "failed", "rejected"].includes(d.draw.status);
  return (
    <div className="log" onClick={(e) => e.stopPropagation()}>
      {flat.map(({ s, depth }) => {
        const c = cand.get(s.id);
        return (
          <button key={s.id} className={"step" + (s.id === stepId ? " on" : "")} style={{ paddingLeft: `${0.4 + depth}rem` }} onClick={() => onStep(s.id)}>
            <span className={"st " + (s.status === "failed" ? "fail" : s.status === "running" ? "running" : "")} />
            <span className="n">{s.stage}<small>{c ? ` · #${c.index} · ${c.probability.toFixed(2)}` : ""}{s.attempt > 1 ? ` · attempt ${s.attempt}` : ""}{s.fail_reason ? ` · ${s.fail_reason}` : ""}{s.id === d.draw.chosen_step ? " · chosen" : ""}</small></span>
            <span className="d">{secs(s.started_at, s.ended_at)}</span>
          </button>);
      })}
      {d.draw.status === "awaiting_gate" && <div className="step"><span className="st wait" /><span className="n">gate<small> · {d.draw.mode}</small></span><span className="d">waiting</span></div>}
      {inFlight && STAGES.filter((st) => !seen.has(st) && st !== "gate" && st !== "brief").map((st) => <div key={st} className="step todo"><span className="st todo" /><span className="n">{st}</span><span className="d">—</span></div>)}
      {inFlight && <div className="step todo"><span className="st todo" /><span className="n">brief</span><span className="d">—</span></div>}
      {(d.draw.status === "done" || developed) && <div className="step"><span className="st" /><span className="n">brief<small> · exported</small></span><span className="d">{d.draw.ended_at ? when(d.draw.ended_at).replace(" today", "") : ""}</span></div>}
      {developed && <a className="step" href={`#develop/${d.draw.id}`} style={{ textDecoration: "none" }}><span className={"st " + (d.draw.status.startsWith("awaiting") ? "wait" : "")} /><span className="n">develop<small> · {label(d.draw.status)}</small></span><span className="d">→</span></a>}
    </div>
  );
}

const BRIEF_FILES = ["outline.md", "vignette.md", "context-1.md", "context-2.md", "ending.md"];
export const firstParagraph = (s: string) => s.trim().split(/\n\s*\n/)[0].replace(/[*_#>`]/g, "");

function DrawBody({ d, brief, onChoose, onFork, onVerdict }: { d: Detail; brief: Record<string, string> | null; onChoose: (stepId: string) => void; onFork: (stepId: string) => void; onVerdict: (e: Example, v: "keep" | "pass", artifact?: boolean) => void }) {
  const [openVig, setOpenVig] = useState<string | null>(d.draw.chosen_step);
  const [openEx, setOpenEx] = useState<string | null>(null);
  const cands = d.candidates;
  const maxP = Math.max(...cands.map((c) => c.probability), 0.01);
  const gating = d.draw.status === "awaiting_gate";
  return (
    <>
      <div className={"drawbody" + (brief ? " two" : "")}><div className="col">
      <div className="seed"><small>seed</small>{d.draw.seed_text}{d.draw.flag_note && <div className="warn" style={{ fontStyle: "normal", fontFamily: "Instrument Sans, system-ui, sans-serif", fontSize: 12.5, marginTop: ".5rem" }}>flagged: {d.draw.flag_note}</div>}</div>
      {cands.length > 0 && <>
        <h2 className="sec">distribution <span>· lowest to highest probability</span></h2>
        {cands.map((c) => {
          const chosen = c.step_id === d.draw.chosen_step;
          const fork = d.forks.find((f) => f.step_id === c.step_id);
          const isOpen = openVig === c.step_id;
          return (
            <div key={c.step_id} className={"cand" + (chosen ? " chosen" : "")}>
              <div className="pb"><b>{c.probability.toFixed(2)}<small>#{c.index}</small></b><div className="bar"><i style={{ width: `${(c.probability / maxP) * 100}%` }} /></div>{chosen && <span className="tag">chosen</span>}{c === cands[0] && !chosen && <span className="tag dim">lowest</span>}
                {gating && <button className="btn sm" title={choose(c.index)} onClick={() => onChoose(c.step_id)}>choose</button>}
                {fork && <a className="tag" href={`#draw/${fork.id}`}>developed →</a>}
                {!gating && !chosen && !fork && d.draw.chosen_step && <button className="btn sm" title={develop(c.index)} onClick={() => onFork(c.step_id)}>develop too</button>}</div>
              <div className="body">{c.premise}{c.warnings.length > 0 && <span className="warn"> {c.warnings.join(", ")}</span>}
                <button className="vigtoggle" aria-expanded={isOpen} onClick={() => setOpenVig(isOpen ? null : c.step_id)}>
                  {isOpen ? <Md className="vig open" text={c.vignette} /> : <div className="vig">{firstParagraph(c.vignette)}</div>}
                </button>
              </div>
            </div>);
        })}
      </>}
      <h2 className="sec">examples</h2>
      {d.examples.map((e) => (
        <div key={e.id} className="exr">
          {e.text === null
            ? <span className="exhead"><span className="caret" /><span className="dim"><span className="mono">{e.id}</span> · not in the current pool; the passages were re-extracted after this draw</span></span>
            : <button className="exhead" aria-expanded={openEx === e.id} onClick={() => setOpenEx(openEx === e.id ? null : e.id)}><span className={"caret" + (openEx === e.id ? " open" : "")}>▸</span><b>{e.title}</b> · {e.author || "unknown"} · <span className="cell">{e.cell}</span></button>}
          <span className="exv">{e.latest && <><span className={e.latest.verdict}>{e.latest.verdict === "pass" ? "excluded" : "kept"}</span>{e.latest.artifact && <span className="art"> · artifact</span>}</>}</span>
          {openEx === e.id && e.text !== null && <div className="exbody">
            <p className="passage sm">{e.text}</p>
            <div className="acts">{e.latest?.verdict === "pass"
              ? <button className="btn sm keep" title="Put this passage back in the pool for future draws." onClick={() => onVerdict(e, "keep")}>include</button>
              : <button className="btn sm pass" title="Drop this passage from the pool for every future draw. This draw is unaffected." onClick={() => onVerdict(e, "pass")}>exclude</button>}<button className="btn sm art" onClick={() => onVerdict(e, e.latest?.verdict ?? "keep", !e.latest?.artifact)}>{e.latest?.artifact ? "unflag artifact" : "artifact"}</button></div>
          </div>}
        </div>))}
      </div>
      {brief && <div className="col">
        <h2 className="sec">brief <span>· <a href={api.briefFile(d.draw.id, "trail.md")} target="_blank" rel="noopener" className="mono">briefs/{d.draw.id}/trail.md</a></span></h2>
        <div className="brief">{BRIEF_FILES.filter((f) => brief[f]).map((f) => (
          // Only the outline is open by default: the chosen vignette already sits in the distribution column.
          <details className="file ctx" key={f} open={f === "outline.md"}><summary><span className="caret">▸</span><span className="fn">{f}</span><span className="dim"> · {firstParagraph(brief[f]).slice(0, 80)}…</span></summary><Md className="passage sm" text={brief[f]} /></details>))}</div>
      </div>}
      </div>
    </>
  );
}

export function StepView({ step, artifacts, chosen, onBack }: { step: Step; artifacts: Artifact[]; chosen: boolean; onBack: () => void }) {
  const raw = (() => { if (!step.raw_response) return null; try { return JSON.parse(step.raw_response).result ?? step.raw_response; } catch { return step.raw_response; } })();
  return (
    <div className="stepview">
      <button className="back" onClick={onBack}>← back to the draw</button>
      <div className="kv"><b className="mono">{step.stage}</b><span className={step.status === "failed" ? "pass" : ""}>{step.status}{step.fail_reason ? ` (${step.fail_reason})` : ""}</span><span className="mono">{step.model}</span><span>{secs(step.started_at, step.ended_at)}</span>{step.attempt > 1 && <span>attempt {step.attempt}</span>}{chosen && <span className="keep">chosen</span>}</div>
      {step.error && <div className="err" style={{ marginBottom: "1rem" }}>{step.error}</div>}
      <h2 className="sec">system</h2><div className="mute" style={{ fontSize: 12.5 }}>{step.system_prompt}</div>
      <h2 className="sec">prompt <span>· {step.prompt.length} chars</span></h2><pre>{step.prompt}</pre>
      {raw && <><h2 className="sec">raw response</h2><pre>{raw}</pre></>}
      {step.parsed && <><h2 className="sec">parsed</h2><pre>{step.parsed}</pre></>}
      {artifacts.map((a) => { const m = JSON.parse(a.meta); return <div key={a.id}><h2 className="sec">{a.kind} <span className="mono">{a.id}</span>{m.warnings?.length ? <span className="warn"> · {m.warnings.join(", ")}</span> : null}</h2><pre>{a.content}</pre></div>; })}
    </div>
  );
}

function StartForm({ status }: { status: Status | null }) {
  const [facets, setFacets] = useState<Facets | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ mode: "manual", genre: "horror" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { api.facets().then(setFacets); }, []);
  const [sources, setSources] = useState<string[]>([]);
  const [domains, setDomains] = useState<{ draw: number; list: { slug: string; heading: string }[] } | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  useEffect(() => {
    setPinned([]); setDomains(null);
    if (form.setting) api.setting(form.setting).then((s) => setDomains({ draw: s.draw, list: s.domains })).catch(() => setDomains(null));
  }, [form.setting]);
  const togglePin = (slug: string) => setPinned((p) => p.includes(slug) ? p.filter((x) => x !== slug) : [...p, slug]);
  // sources grouped by the author or editor on the file, so a whole shelf goes in or out at once
  const groups = useMemo(() => {
    const m = new Map<string, Source[]>();
    for (const s of facets?.sources ?? []) { if (!m.has(s.group)) m.set(s.group, []); m.get(s.group)!.push(s); }
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [facets]);
  const toggleSource = (id: string) => setSources((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const toggleGroup = (rows: Source[]) => setSources((s) => rows.every((r) => s.includes(r.id))
    ? s.filter((x) => !rows.some((r) => r.id === x))
    : [...s, ...rows.map((r) => r.id).filter((id) => !s.includes(id))]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const start = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { const { id } = await api.startDraw({ ...form, source: sources.join(",") || undefined, domains: pinned.length ? pinned.join(",") : undefined }); location.hash = `#draw/${id}`; } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const eligible = new Map(status?.per_source.map((s) => [s.source, s.eligible]) ?? []);
  return (
    <div className="pane read span">
      <form className="form" onSubmit={start}>
        <h1>Start a draw</h1>
        <p className="lede">Pulls six eligible passages and a seed, asks for five premises off the centre of the distribution, writes each as a 400-word vignette, then stops at the gate for you. After the gate: a reverse outline, two context vignettes, the ending, and a brief in <span className="mono">briefs/</span>.</p>
        <div className="field"><span className="lbl">Gate</span><div className="seg" role="group" aria-label="Gate"><button type="button" aria-pressed={form.mode === "manual"} onClick={() => setForm({ ...form, mode: "manual" })}>Manual</button><button type="button" aria-pressed={form.mode === "auto"} onClick={() => setForm({ ...form, mode: "auto" })}>Auto</button></div><span className="help">Manual waits for you after the vignettes. Auto takes the lowest-probability premise and keeps going.</span></div>
        <div className="field"><label htmlFor="setting">Setting</label><select id="setting" className="sel" value={form.setting ?? ""} onChange={set("setting")}><option value="">Unrestricted</option>{facets?.settings.map((s) => <option key={s}>{s}</option>)}</select><span className="help">A setting draws two of its domains and slices its sections into each stage; hard rules go last.</span></div>
        {form.setting && domains && <div className="field"><span className="lbl">Domains</span><div className="chips" role="group" aria-label="Domains">{domains.list.map((d) => <button key={d.slug} type="button" className="chip" aria-pressed={pinned.includes(d.slug)} onClick={() => togglePin(d.slug)}>{d.heading}</button>)}</div><span className="help">{pinned.length ? `Pinned: ${pinned.join(", ")}, in this order.` : `None pinned: ${domains.draw} drawn at random.`}</span></div>}
        <div className="field"><label htmlFor="genre">Genre</label><select id="genre" className="sel" value={form.genre} onChange={set("genre")}><option>horror</option><option>scifi</option></select></div>
        <div className="field"><span className="lbl">Examples from</span>
          <div className="srcs" role="group" aria-label="Sources">{groups.map(([g, rows]) => (
            <div key={g} className="srcgroup">
              <button type="button" className="grouphd" aria-pressed={rows.every((r) => sources.includes(r.id))} onClick={() => toggleGroup(rows)}>{g}</button>
              <div className="chips">{rows.map((r) => (
                <button key={r.id} type="button" className="chip" aria-pressed={sources.includes(r.id)} title={r.id} onClick={() => toggleSource(r.id)}>{r.title}{eligible.has(r.id) ? <span className="dim"> · {eligible.get(r.id)}</span> : null}</button>))}
              </div>
            </div>))}
          </div>
          <span className="help">{sources.length
            ? `${sources.reduce((n, id) => n + (eligible.get(id) ?? 0), 0)} eligible passages across ${sources.length} source${sources.length > 1 ? "s" : ""}.`
            : `None selected: all ${status?.passages_eligible ?? ""} eligible passages.`}</span></div>
        <div className="field"><label htmlFor="seed">Seed</label><textarea id="seed" name="seed" value={form.seed ?? ""} onChange={set("seed")} placeholder="Leave empty to draw a theme from the bank, or type one…" /><span className="help">{status ? `${status.themes_eligible} eligible themes in the bank. ` : ""}A typed seed is logged as “typed”, a drawn one as “drawn”.</span></div>
        <div className="actions"><button type="submit" className="btn primary" disabled={busy}>{busy ? "Starting…" : "Start"}</button><span className="dim" style={{ fontSize: 12.5 }}>About a minute to the gate, a few more to a brief.</span>{err && <div className="err" style={{ flexBasis: "100%" }}>{err}</div>}</div>
      </form>
    </div>
  );
}
