import React, { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { api, when, type Artifact, type Candidate, type Example, type Facets, type Draw, type Fork, type FullStep, type Origin, type Source, type Status, type Step } from "./api.ts";

export type Detail = { draw: Draw; origin: Origin | null; steps: Step[]; artifacts: Artifact[]; candidates: Candidate[]; examples: Example[]; forks: Fork[] };
const STAGES = ["premises", "execute", "gate", "outline", "context", "ending", "brief"];
/** The reserved domain pin: run the setting with no domain (NO_DOMAINS in app/pipeline/settings.ts). */
const NO_DOMAINS = "none";
export const LABEL: Record<string, string> = { awaiting_gate: "open", done: "brief", awaiting_check_gate: "gate 1", awaiting_draft_gate: "gate 2", checking: "checking", repairing: "repairing", drafting: "drafting", drafted: "drafted", passed: "passed", repaired: "repaired" };
export const label = (status: string) => LABEL[status] ?? status;
/** The statuses that mean a model call is in flight, so the views refresh while they hold. */
export const RUNNING_STATUS = new Set(["running", "checking", "repairing", "drafting"]);
export const secs = (a: string, b: string | null) => (b ? `${Math.round((Date.parse(b) - Date.parse(a)) / 1000)}s` : "running");
const choose = (index: number) => `Continue with premise ${index}: outline, two context vignettes, the ending, then the brief.`;
const SAMPLING_HELP: Record<string, string> = {
  tail: "The strangest readings of the seed: premises nobody else would file.",
  "off-centre": "Off the centre but inside the tradition: unusual without being absurd.",
  standard: "The strongest conventional treatment: what a good writer would reach for.",
};
const develop = (index: number) => `Develop premise ${index} as a draw of its own: the same seed and examples, its own outline, context vignettes, ending and brief.`;

/** The keys every stage prints about a draw: what it was drawn under. */
export function DrawMetaItems({ d }: { d: Detail }) {
  return (
    <>
      <span><i>setting</i> {d.draw.setting ?? "unrestricted"}</span>
      {d.draw.domains && <span><i>domains</i> {(JSON.parse(d.draw.domains) as string[]).join(" + ") || "none"}</span>}
      <span><i>genre</i> {d.draw.genre}</span>
      <span><i>sampling</i> {d.draw.sampling}</span>
    </>
  );
}

/** The disclosure chevron. Rotated by CSS on `.open`, or by the parent `details[open]`. */
export function Caret({ open }: { open?: boolean }) {
  return <span className={"caret icon" + (open ? " open" : "")} aria-hidden="true">chevron_right</span>;
}

/** Model output and brief files are markdown written by this pipeline; rendered as written. */
export function Md({ text, className = "" }: { text: string; className?: string }) {
  const html = useMemo(() => marked.parse(text, { async: false }) as string, [text]);
  return <div className={"md " + className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Draws in the left pane, each expanding into its facts and step log; the selected draw, a step, or the start form fills the rest. */
export function Draws({ status, selected, like }: { status: Status | null; selected: string | undefined; like?: string }) {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [stepId, setStepId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [err, setErr] = useState("");

  const loadDraws = () => api.draws(true).then(setDraws).catch(() => {});
  const busy = draws.some((r) => r.status === "running" || RUNNING_STATUS.has(r.status));
  useEffect(() => { loadDraws(); const t = setInterval(loadDraws, busy ? 3000 : 15000); return () => clearInterval(t); }, [busy]);

  // Archived draws stay out of the list until asked for, and the open one stays visible whatever its state.
  const archived = draws.filter((r) => r.archived_at).length;
  // With nothing chosen, land on the draw that needs attention, else the newest; with no draws, the form.
  const live = draws.filter((r) => !r.archived_at);
  const current = selected ?? (live.find((r) => r.status === "awaiting_gate") ?? live[0])?.id ?? (live.length ? undefined : "new");
  const shown = draws.filter((r) => showArchived || !r.archived_at || r.id === current);
  const isForm = current === "new";
  const loadDetail = (id: string) => api.draw(id).then((d) => setDetails((m) => ({ ...m, [id]: d }))).catch((e) => setErr(e.message));
  useEffect(() => {
    if (!current || isForm) return;
    setStepId(null); setErr("");
    setOpen((o) => new Set(o).add(current));
    loadDetail(current);
    return () => {};
  }, [current]);
  useEffect(() => { for (const id of open) if (!details[id]) loadDetail(id); }, [open]);
  const d = current && !isForm ? details[current] : undefined;
  // the pane refreshes itself while the pipeline is working on this draw, and rarely once it stops
  const working = !!d && (RUNNING_STATUS.has(d.draw.status) || d.steps.some((s) => s.status === "running"));
  useEffect(() => {
    if (!current || isForm) return;
    const t = setInterval(() => loadDetail(current), working ? 2500 : 20000);
    return () => clearInterval(t);
  }, [current, working]);

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
  const remove = async () => {
    if (!d || !confirm(`Delete ${d.draw.name ?? d.draw.id} and every step under it? There is no undo.`)) return;
    try { await api.deleteDraw(d.draw.id); location.hash = "#draws"; loadDraws(); } catch (e: any) { setErr(e.message); }
  };
  const verdict = async (e: Example, v: "keep" | "pass", artifact = false, note = "") => {
    await api.verdict({ kind: "example", target_id: e.id, verdict: v, artifact, note, method: "draw" });
    if (d) loadDetail(d.draw.id);
  };
  const step = d && stepId ? d.steps.find((s) => s.id === stepId) : undefined;
  const dot = (s: string) => "st " + (s === "awaiting_gate" ? "wait" : s === "failed" ? "fail" : s === "running" ? "running" : "");

  return (
    <>
      <div className="pane list">
        <div className="newdraw"><a className="btn primary" href="#draws/new" style={{ textDecoration: "none" }}>Draw</a>
          {archived > 0 && <button className="btn sm quiet" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "hide" : "show"} {archived} archived</button>}</div>
        {shown.length === 0 && <div className="empty">No draws yet.</div>}
        {shown.map((r) => (
          <div key={r.id} className={"drawrow" + (r.id === current ? " on" : "") + (r.superseded_by || r.archived_at ? " old" : "")} onClick={() => select(r.id)}>
            <div className="l1"><span className="nm">{r.name ?? r.id}</span><span className="when">{when(r.created_at)}</span></div>
            <div className="l2"><span className={dot(r.status)} />{label(r.status)} · {r.setting ?? "unrestricted"} · {r.genre} · {r.mode}{r.flagged ? <span className="art"> · flagged</span> : null}{r.forked_from && <span className="dim"> · fork</span>}{r.superseded_by && <span className="dim"> · superseded</span>}{r.archived_at && <span className="dim"> · archived</span>}</div>
            <div className="sd">{r.seed_text}</div>
            <div className="rid mono dim">{r.id}</div>
            {open.has(r.id) && details[r.id] && <>
              <RowFacts d={details[r.id]} />
              <Log d={details[r.id]} stepId={r.id === current ? stepId : null} onStep={(id) => { if (r.id !== current) location.hash = `#draw/${r.id}`; setStepId(id); }} />
            </>}
          </div>))}
      </div>

      {isForm || !current ? <StartForm status={status} like={like} /> : (
        <div className="pane read span">
          {!d ? (err ? <div className="err">{err}</div> : <span className="dim">loading…</span>) : <>
            <div className="drawhd"><h1>{d.draw.name ?? d.draw.id}</h1><span className="rid mono dim">{d.draw.id}</span><span className={"badge " + d.draw.status}>{label(d.draw.status)}</span><span className="meta"><DrawMetaItems d={d} /></span></div>
            {d.draw.forked_from && <div className="dim" style={{ fontSize: 12 }}>forked from <a href={`#draw/${d.draw.forked_from}`} className="mono">{d.draw.forked_from}</a></div>}
            {d.draw.superseded_by && <div className="dim" style={{ fontSize: 12 }}>superseded by <a href={`#draw/${d.draw.superseded_by}`} className="mono">{d.draw.superseded_by}</a></div>}
            {d.draw.status === "awaiting_gate" && !step
              ? <GateBar d={d} note={note} setNote={setNote} err={err} onGate={gate} onDelete={remove} />
              : !step && <div className="gatebar"><DrawTools d={d} onGate={gate} onDelete={remove} />{err && <div className="err" style={{ flexBasis: "100%" }}>{err}</div>}</div>}
            {step ? <StepView step={step} chosen={step.id === d.draw.chosen_step} onBack={() => setStepId(null)} /> : <DrawBody d={d} onChoose={(id) => gate("choose", id)} onFork={(id) => gate("fork", id)} onVerdict={verdict} />}
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

function DrawTools({ d, onGate, onDelete }: { d: Detail; onGate: (action: string) => void; onDelete: () => void }) {
  return (
    <>
      <button className="btn sm quiet" title={d.draw.archived_at ? "Put this draw back in the list." : "Hide this draw from the lists. Nothing else about it changes."}
        onClick={() => onGate(d.draw.archived_at ? "unarchive" : "archive")}>{d.draw.archived_at ? "unarchive" : "archive"}</button>
      <button className="btn sm quiet" title={d.draw.chosen_step ? "This draw produced a brief; archive it instead." : "Remove this draw and every step under it. There is no undo."}
        disabled={!!d.draw.chosen_step} onClick={onDelete}>delete</button>
    </>
  );
}

function GateBar({ d, note, setNote, err, onGate, onDelete }: { d: Detail; note: string; setNote: (s: string) => void; err: string; onGate: (action: string, stepId?: string) => void; onDelete: () => void }) {
  return (
    <div className="gatebar" role="group" aria-label="Gate">
      <a className="btn pass" href={`#draws/new/${d.draw.id}`} title="Open the draw form with this draw's options, to start another like it. This one stays open." style={{ textDecoration: "none" }}>Redraw</a>
      <button className="btn art" title="Mark this draw as a wrong call for later review. It stays open and nothing else changes." onClick={() => onGate("flag")}>Flag</button>
      <input type="text" name="gate-note" placeholder="note" aria-label="Gate note" value={note} onChange={(e) => setNote(e.target.value)} />
      <DrawTools d={d} onGate={onGate} onDelete={onDelete} />
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
      {developed && <a className="step" href={`#${d.draw.stage}/${d.draw.id}`} style={{ textDecoration: "none" }}><span className={"st " + (d.draw.status.startsWith("awaiting") ? "wait" : "")} /><span className="n">{d.draw.stage}<small> · {label(d.draw.status)}</small></span><span className="d">→</span></a>}
    </div>
  );
}

export const firstParagraph = (s: string) => s.trim().split(/\n\s*\n/)[0].replace(/[*_#>`]/g, "");

function DrawBody({ d, onChoose, onFork, onVerdict }: { d: Detail; onChoose: (stepId: string) => void; onFork: (stepId: string) => void; onVerdict: (e: Example, v: "keep" | "pass", artifact?: boolean, note?: string) => void }) {
  const [openVig, setOpenVig] = useState<string | null>(d.draw.chosen_step);
  const [openEx, setOpenEx] = useState<string | null>(null);
  const [exNote, setExNote] = useState<Record<string, string>>({});
  const cands = d.candidates;
  const maxP = Math.max(...cands.map((c) => c.probability), 0.01);
  const gating = d.draw.status === "awaiting_gate";
  return (
    <>
      <div className="drawbody"><div className="col">
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
                {chosen && <a className="tag" href={`#check/${d.draw.id}`}>in check →</a>}
                {fork && <a className="tag" href={`#check/${fork.id}`}>in check →</a>}
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
            : <button className="exhead" aria-expanded={openEx === e.id} onClick={() => setOpenEx(openEx === e.id ? null : e.id)}><Caret open={openEx === e.id} /><b>{e.title}</b> · {e.author || "unknown"} · <span className="cell">{e.cell}</span></button>}
          <span className="exv">{e.latest?.artifact ? <span className="art">flagged</span> : null}</span>
          {openEx === e.id && e.text !== null && <div className="exbody">
            <p className="passage sm">{e.text}</p>
            <div className="acts">
              {e.latest?.verdict === "pass"
                ? <button className="btn sm keep" title="Put this passage back in the pool for future draws." onClick={() => onVerdict(e, "keep", e.latest?.artifact ?? false, exNote[e.id] ?? "")}>include</button>
                : <button className="btn sm pass" title="Drop this passage from the pool for every future draw. This draw is unaffected." onClick={() => onVerdict(e, "pass", e.latest?.artifact ?? false, exNote[e.id] ?? "")}>exclude</button>}
              <button className="btn sm art" title="Mark this passage as an extraction artifact: it leaves the pool and the note says what the reader got wrong."
                onClick={() => onVerdict(e, e.latest?.verdict ?? "keep", !e.latest?.artifact, exNote[e.id] ?? "")}>{e.latest?.artifact ? "unflag" : "flag"}</button>
              <input type="text" placeholder="note" aria-label="Example note" value={exNote[e.id] ?? ""} onChange={(ev) => setExNote((m) => ({ ...m, [e.id]: ev.target.value }))} />
            </div>
          </div>}
        </div>))}
      </div>
      </div>
    </>
  );
}

/** The step's own text is fetched here: a draw's steps arrive without it. */
export function StepView({ step, chosen, onBack }: { step: Step; chosen: boolean; onBack: () => void }) {
  const [full, setFull] = useState<{ step: FullStep; artifacts: Artifact[] } | null>(null);
  useEffect(() => { setFull(null); api.step(step.id).then(setFull).catch(() => {}); }, [step.id]);
  const raw = (() => {
    const r = full?.step.raw_response;
    if (!r) return null;
    try { return JSON.parse(r).result ?? r; } catch { return r; }
  })();
  return (
    <div className="stepview">
      <button className="back" onClick={onBack}>← back to the draw</button>
      <div className="kv"><b className="mono">{step.stage}</b><span className={step.status === "failed" ? "pass" : ""}>{step.status}{step.fail_reason ? ` (${step.fail_reason})` : ""}</span><span className="mono">{step.model}</span><span>{secs(step.started_at, step.ended_at)}</span>{step.attempt > 1 && <span>attempt {step.attempt}</span>}{chosen && <span className="keep">chosen</span>}</div>
      {step.error && <div className="err" style={{ marginBottom: "1rem" }}>{step.error}</div>}
      <h2 className="sec">system</h2><div className="mute" style={{ fontSize: 12.5 }}>{step.system_prompt}</div>
      <h2 className="sec">prompt <span>· {step.prompt_chars} chars</span></h2><pre>{full ? full.step.prompt : "…"}</pre>
      {raw && <><h2 className="sec">raw response</h2><pre>{raw}</pre></>}
      {full?.step.parsed && <><h2 className="sec">parsed</h2><pre>{full.step.parsed}</pre></>}
      {(full?.artifacts ?? []).map((a) => { const m = JSON.parse(a.meta); return <div key={a.id}><h2 className="sec">{a.kind} <span className="mono">{a.id}</span>{m.warnings?.length ? <span className="warn"> · {m.warnings.join(", ")}</span> : null}</h2><pre>{a.content}</pre></div>; })}
    </div>
  );
}

function StartForm({ status, like }: { status: Status | null; like?: string }) {
  const [facets, setFacets] = useState<Facets | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ mode: "manual", sampling: "tail" });
  const [genreParts, setGenreParts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { api.facets().then(setFacets); }, []);
  const [sources, setSources] = useState<string[]>([]);
  const [domains, setDomains] = useState<{ draw: number; list: { slug: string; heading: string }[] } | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  // pins to apply once the setting's domains arrive; a ref, so the fetch below cannot race the state that fills it
  const wantPinned = useRef<string[]>([]);
  useEffect(() => {
    setPinned([]); setDomains(null);
    if (!form.setting) return;
    api.setting(form.setting).then((s) => {
      setDomains({ draw: s.draw, list: s.domains });
      setPinned(wantPinned.current.filter((slug) => slug === NO_DOMAINS || s.domains.some((d) => d.slug === slug)));
      wantPinned.current = [];
    }).catch(() => setDomains(null));
  }, [form.setting]);
  // "redraw": every option of the draw this one is being started from
  const [seedTouched, setSeedTouched] = useState(false);
  const [themeId, setThemeId] = useState("");
  useEffect(() => {
    if (!like) return;
    api.like(like).then((o) => {
      setForm({ mode: o.mode, sampling: o.sampling ?? "tail", setting: o.setting ?? "", genre: o.genre ?? "", seed: o.seed_text });
      wantPinned.current = o.domains?.length === 0 ? [NO_DOMAINS] : o.domains ?? [];
      setGenreParts([]);
      setSeedTouched(false);
      setThemeId(o.seed?.mode === "picked" ? o.seed.themeId : "");
      const s = o.segment?.source;
      setSources(Array.isArray(s) ? s : s ? [s] : []);
    }).catch((e) => setErr(e.message));
  }, [like]);
  // "No domains" is a pin of its own and excludes the rest (NO_DOMAINS in app/pipeline/settings.ts)
  const togglePin = (slug: string) => setPinned((p) => slug === NO_DOMAINS
    ? (p.includes(NO_DOMAINS) ? [] : [NO_DOMAINS])
    : p.includes(slug) ? p.filter((x) => x !== slug) : [...p.filter((x) => x !== NO_DOMAINS), slug]);
  // the chips are shortcuts into one free-text field: picking several joins them, typing clears them
  const toggleGenre = (v: string) => {
    const next = genreParts.includes(v) ? genreParts.filter((x) => x !== v) : [...genreParts, v];
    setGenreParts(next);
    setForm({ ...form, genre: next.join(" and ") });
  };
  const typeGenre = (e: React.ChangeEvent<HTMLInputElement>) => { setGenreParts([]); setForm({ ...form, genre: e.target.value }); };
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
    const keepsTheme = !!themeId && !seedTouched;
    try {
      const { id } = await api.startDraw({
        ...form, seed: keepsTheme ? undefined : form.seed, seed_id: keepsTheme ? themeId : undefined,
        source: sources.join(",") || undefined, domains: pinned.length ? pinned.join(",") : undefined,
      });
      location.hash = `#draw/${id}`;
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const eligible = new Map(status?.per_source.map((s) => [s.source, s.eligible]) ?? []);
  return (
    <div className="pane read span">
      <form className="form" onSubmit={start}>
        <h1>{like ? "Redraw" : "Start a draw"}</h1>
        {like && <p className="lede" style={{ marginBottom: ".75rem" }}>Every option below comes from <a href={`#draw/${like}`} className="mono">{like}</a>, which stays open. Change what you want and start.</p>}
        <p className="lede">Pulls six eligible passages and a seed, asks for five premises off the centre of the distribution, writes each as a 400-word vignette, then stops at the gate for you. After the gate: a reverse outline, two context vignettes, the ending, and a brief in <span className="mono">briefs/</span>.</p>
        <div className="field"><span className="lbl">Gate</span><div className="seg" role="group" aria-label="Gate"><button type="button" aria-pressed={form.mode === "manual"} onClick={() => setForm({ ...form, mode: "manual" })}>Manual</button><button type="button" aria-pressed={form.mode === "auto"} onClick={() => setForm({ ...form, mode: "auto" })}>Auto</button></div><span className="help">Manual waits for you after the vignettes. Auto takes the lowest-probability premise and keeps going.</span></div>
        <div className="field"><label htmlFor="setting">Setting</label><select id="setting" className="sel" value={form.setting ?? ""} onChange={set("setting")}><option value="">Unrestricted</option>{facets?.settings.map((s) => <option key={s}>{s}</option>)}</select><span className="help">A setting slices its sections into each stage, with the hard rules last. Its domains are optional: pin them, take the draw, or take none.</span></div>
        {form.setting && domains && <div className="field"><span className="lbl">Domains</span><div className="chips" role="group" aria-label="Domains">{domains.list.map((d) => <button key={d.slug} type="button" className="chip" aria-pressed={pinned.includes(d.slug)} onClick={() => togglePin(d.slug)}>{d.heading}</button>)}<button type="button" className="chip" aria-pressed={pinned.includes(NO_DOMAINS)} onClick={() => togglePin(NO_DOMAINS)}>No domain</button></div><span className="help">{pinned.includes(NO_DOMAINS) ? "No domain: the setting's own sections only." : pinned.length ? `Pinned: ${pinned.join(", ")}, in this order.` : domains.draw ? `None pinned: ${domains.draw} drawn at random.` : "This setting takes no domain unless you pin one."}</span></div>}
        <div className="field"><span className="lbl">Sampling</span><div className="seg" role="group" aria-label="Sampling">{(facets?.sampling ?? []).map((s) => (
          <button key={s.mode} type="button" aria-pressed={form.sampling === s.mode} onClick={() => setForm({ ...form, sampling: s.mode })}>{s.mode}</button>))}
          </div><span className="help">{SAMPLING_HELP[form.sampling] ?? ""} Stated probability {form.sampling === "standard" ? "over 0.35" : form.sampling === "off-centre" ? "0.10 to 0.35" : "under 0.10"}.</span></div>
        <div className="field"><label htmlFor="genre">Genre</label>
          <div className="genrefield">
          <div className="srcs" role="group" aria-label="Genre">{Object.entries(facets?.genres ?? {}).map(([g, vs]) => (
            <div key={g} className="srcgroup"><span className="grouphd" aria-hidden="true">{g}</span>
              <div className="chips">{vs.map((v) => (
                <button key={v} type="button" className="chip" aria-pressed={genreParts.includes(v)} onClick={() => toggleGenre(v)}>{v}</button>))}
              </div>
            </div>))}
          </div>
          <input id="genre" name="genre" type="text" value={form.genre ?? ""} placeholder="Empty: taken from the examples drawn" onChange={typeGenre} />
          </div>
          <span className="help">Chips fill the field, joined with “and”; type over it for anything else. It reaches one line of the premises ask.</span></div>
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
        <div className="field"><label htmlFor="seed">Seed</label><textarea id="seed" name="seed" value={form.seed ?? ""} onChange={(e) => { setSeedTouched(true); setForm({ ...form, seed: e.target.value }); }} placeholder="Leave empty to draw a theme from the bank, or type one…" /><span className="help">{status ? `${status.themes_eligible} eligible themes in the bank. ` : ""}A typed seed is logged as “typed”, a drawn one as “drawn”.</span></div>
        <div className="actions"><button type="submit" className="btn primary" disabled={busy}>{busy ? "Starting…" : "Start"}</button><span className="dim" style={{ fontSize: 12.5 }}>About a minute to the gate, a few more to a brief.</span>{err && <div className="err" style={{ flexBasis: "100%" }}>{err}</div>}</div>
      </form>
    </div>
  );
}
