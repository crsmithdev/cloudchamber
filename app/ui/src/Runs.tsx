import React, { useEffect, useMemo, useState } from "react";
import { api, when, type Artifact, type Candidate, type Example, type Facets, type Run, type Status, type Step } from "./api.ts";

type Detail = { run: Run; steps: Step[]; artifacts: Artifact[]; candidates: Candidate[]; examples: Example[] };
const STAGES = ["premises", "execute", "gate", "outline", "context", "ending", "packet"];
const LABEL: Record<string, string> = { awaiting_gate: "open", done: "closed" };
const label = (status: string) => LABEL[status] ?? status;
const secs = (a: string, b: string | null) => (b ? `${Math.round((Date.parse(b) - Date.parse(a)) / 1000)}s` : "running");

/** Runs in the left pane, each expanding into its step log; the selected run, a step, or the start form in the centre. */
export function Runs({ status, selected }: { status: Status | null; selected: string | undefined }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [stepId, setStepId] = useState<string | null>(null);
  const [packet, setPacket] = useState<Record<string, string> | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  const loadRuns = () => api.runs().then(setRuns).catch(() => {});
  useEffect(() => { loadRuns(); const t = setInterval(loadRuns, 3000); return () => clearInterval(t); }, []);

  // With nothing chosen, land on the run that needs attention, else the newest; with no runs, the form.
  const current = selected ?? (runs.find((r) => r.status === "awaiting_gate") ?? runs[0])?.id ?? (runs.length ? undefined : "new");
  const isForm = current === "new";
  const loadDetail = (id: string) => api.run(id).then((d) => setDetails((m) => ({ ...m, [id]: d }))).catch((e) => setErr(e.message));
  useEffect(() => {
    if (!current || isForm) return;
    setStepId(null); setPacket(null); setErr("");
    setOpen((o) => new Set(o).add(current));
    loadDetail(current);
    const t = setInterval(() => loadDetail(current), 2500);
    return () => clearInterval(t);
  }, [current]);
  useEffect(() => { for (const id of open) if (!details[id]) loadDetail(id); }, [open]);
  const d = current && !isForm ? details[current] : undefined;
  useEffect(() => { if (d?.run.status === "done" && !packet) api.packet(d.run.id).then(setPacket).catch(() => {}); }, [d?.run.status]);

  const select = (id: string) => {
    if (id === current) setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
    else location.hash = `#run/${id}`;
  };
  const gate = async (action: string, step_id?: string) => {
    if (!d) return;
    setErr("");
    try { const r = await api.gate(d.run.id, { action, step_id, note }); setNote(""); if (r.id && r.id !== d.run.id) location.hash = `#run/${r.id}`; else loadDetail(d.run.id); loadRuns(); } catch (e: any) { setErr(e.message); }
  };
  const verdict = async (e: Example, v: "keep" | "pass", artifact = false) => {
    await api.verdict({ kind: "example", target_id: e.id, verdict: v, artifact, note: "", method: "run" });
    if (d) loadDetail(d.run.id);
  };
  const step = d && stepId ? d.steps.find((s) => s.id === stepId) : undefined;
  const dot = (s: string) => "st " + (s === "awaiting_gate" ? "wait" : s === "failed" ? "fail" : s === "running" ? "run" : "");

  return (
    <>
      <div className="pane list">
        <div className="newrun"><a className="btn primary" href="#runs/new" style={{ textDecoration: "none" }}>New run</a></div>
        {runs.length === 0 && <div className="empty">No runs yet.</div>}
        {runs.map((r) => (
          <div key={r.id} className={"runrow" + (r.id === current ? " on" : "") + (r.superseded_by ? " old" : "")} onClick={() => select(r.id)}>
            <div className="l1"><span className="nm">{r.name ?? r.id}</span><span className="when">{when(r.created_at)}</span></div>
            <div className="l2"><span className={dot(r.status)} />{label(r.status)} · {r.setting ?? "unrestricted"} · {r.genre} · {r.mode}{r.flagged ? <span className="art"> · flagged</span> : null}{r.superseded_by && <span className="dim"> · superseded</span>}</div>
            <div className="sd">{r.seed_text}</div>
            <div className="rid mono dim">{r.id}</div>
            {open.has(r.id) && details[r.id] && <Log d={details[r.id]} stepId={r.id === current ? stepId : null} onStep={(id) => { if (r.id !== current) location.hash = `#run/${r.id}`; setStepId(id); }} />}
          </div>))}
      </div>

      {isForm || !current ? <StartForm status={status} /> : !d ? <><div className="pane read">{err ? <div className="err">{err}</div> : <span className="dim">loading…</span>}</div><aside className="pane insp" /></> : (
        <>
          <div className="pane read">
            <div className="runhd"><h1>{d.run.name ?? d.run.id}</h1><span className="rid mono dim">{d.run.id}</span><span className={"badge " + d.run.status}>{label(d.run.status)}</span><span className="dim" style={{ fontSize: 12 }}>{d.run.setting ?? "unrestricted"} · {d.run.genre} · {d.run.mode}{d.run.gate_method ? ` · gate ${d.run.gate_method}` : ""} · seed {d.run.seed_mode}</span></div>
            {d.run.superseded_by && <div className="dim" style={{ fontSize: 12 }}>superseded by <a href={`#run/${d.run.superseded_by}`} className="mono">{d.run.superseded_by}</a></div>}
            {step ? <StepView step={step} artifacts={d.artifacts.filter((a) => a.step_id === step.id)} chosen={step.id === d.run.chosen_step} onBack={() => setStepId(null)} /> : <RunBody d={d} packet={packet} onChoose={(id) => gate("choose", id)} onVerdict={verdict} />}
          </div>
          <aside className="pane insp">
            {d.run.status === "awaiting_gate" ? <Gate d={d} note={note} setNote={setNote} err={err} onGate={gate} /> : <RunFacts d={d} err={err} />}
            <PrevRun runs={runs} current={d.run.id} />
          </aside>
        </>
      )}
    </>
  );
}

function Log({ d, stepId, onStep }: { d: Detail; stepId: string | null; onStep: (id: string) => void }) {
  const byParent = new Map<string | null, Step[]>();
  for (const s of d.steps) { const k = s.parent_id; if (!byParent.has(k)) byParent.set(k, []); byParent.get(k)!.push(s); }
  const flat: { s: Step; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => { for (const s of byParent.get(parent) ?? []) { flat.push({ s, depth }); walk(s.id, depth + 1); } };
  walk(null, 0);
  const cand = new Map(d.candidates.map((c) => [c.step_id, c]));
  const seen = new Set(d.steps.map((s) => s.stage));
  const inFlight = d.run.status === "awaiting_gate" || d.run.status === "running";
  return (
    <div className="log" onClick={(e) => e.stopPropagation()}>
      {flat.map(({ s, depth }) => {
        const c = cand.get(s.id);
        return (
          <button key={s.id} className={"step" + (s.id === stepId ? " on" : "")} style={{ paddingLeft: `${0.4 + depth}rem` }} onClick={() => onStep(s.id)}>
            <span className={"st " + (s.status === "failed" ? "fail" : s.status === "running" ? "run" : "")} />
            <span className="n">{s.stage}<small>{c ? ` · #${c.index} · ${c.probability.toFixed(2)}` : ""}{s.attempt > 1 ? ` · attempt ${s.attempt}` : ""}{s.fail_reason ? ` · ${s.fail_reason}` : ""}{s.id === d.run.chosen_step ? " · chosen" : ""}</small></span>
            <span className="d">{secs(s.started_at, s.ended_at)}</span>
          </button>);
      })}
      {d.run.status === "awaiting_gate" && <div className="step"><span className="st wait" /><span className="n">gate<small> · {d.run.mode}</small></span><span className="d">waiting</span></div>}
      {inFlight && STAGES.filter((st) => !seen.has(st) && st !== "gate" && (st !== "packet")).map((st) => <div key={st} className="step todo"><span className="st todo" /><span className="n">{st}</span><span className="d">—</span></div>)}
      {inFlight && <div className="step todo"><span className="st todo" /><span className="n">packet</span><span className="d">—</span></div>}
      {d.run.status === "done" && <div className="step"><span className="st" /><span className="n">packet<small> · exported</small></span><span className="d">{d.run.ended_at ? when(d.run.ended_at).replace(" today", "") : ""}</span></div>}
    </div>
  );
}

function RunBody({ d, packet, onChoose, onVerdict }: { d: Detail; packet: Record<string, string> | null; onChoose: (stepId: string) => void; onVerdict: (e: Example, v: "keep" | "pass", artifact?: boolean) => void }) {
  const [openVig, setOpenVig] = useState<string | null>(d.run.chosen_step);
  const [openEx, setOpenEx] = useState<string | null>(null);
  const cands = useMemo(() => [...d.candidates].sort((a, b) => a.probability - b.probability), [d.candidates]);
  const maxP = Math.max(...cands.map((c) => c.probability), 0.01);
  const gating = d.run.status === "awaiting_gate";
  return (
    <>
      <div className="seed"><small>seed</small>{d.run.seed_text}{d.run.flag_note && <div className="warn" style={{ fontStyle: "normal", fontFamily: "Instrument Sans, system-ui, sans-serif", fontSize: 12.5, marginTop: ".5rem" }}>flagged: {d.run.flag_note}</div>}</div>
      <div className={"runbody" + (packet ? " two" : "")}><div className="col">
      {cands.length > 0 && <>
        <h2 className="sec">distribution <span>· stated probability · lower is further from centre</span></h2>
        {cands.map((c) => {
          const chosen = c.step_id === d.run.chosen_step;
          return (
            <div key={c.step_id} className={"cand" + (chosen ? " chosen" : "")}>
              <div className="pb"><b>{c.probability.toFixed(2)}<small>#{c.index}</small></b><div className="bar"><i style={{ width: `${(c.probability / maxP) * 100}%` }} /></div>{chosen && <span className="tag">chosen</span>}{c === cands[0] && !chosen && <span className="tag dim">lowest</span>}</div>
              <div className="body">{c.premise}{c.warnings.length > 0 && <span className="warn"> {c.warnings.join(", ")}</span>}
                <div className={"vig" + (openVig === c.step_id ? " open" : "")} onClick={() => setOpenVig(openVig === c.step_id ? null : c.step_id)} style={{ cursor: "pointer" }}>{c.vignette}</div>
                {gating && <div className="acts"><button className="btn sm" title={`Continue with premise ${c.index}: outline, two context vignettes, the ending, then the packet.`} onClick={() => onChoose(c.step_id)}>choose this one</button></div>}
              </div>
            </div>);
        })}
      </>}
      <h2 className="sec">examples</h2>
      {d.examples.map((e) => (
        <div key={e.id} className="exr">
          {e.text === null
            ? <span className="exhead"><span className="caret" /><span className="dim"><span className="mono">{e.id}</span> · not in the current pool; the passages were re-extracted after this run</span></span>
            : <button className="exhead" aria-expanded={openEx === e.id} onClick={() => setOpenEx(openEx === e.id ? null : e.id)}><span className={"caret" + (openEx === e.id ? " open" : "")}>▸</span><b>{e.title}</b> · {e.author || "unknown"} · <span className="cell">{e.cell}</span></button>}
          <span className="exv">{e.latest ? <><span className={e.latest.verdict}>{e.latest.verdict}</span>{e.latest.artifact && <span className="art"> · artifact</span>}</> : <span className="dim">—</span>}</span>
          {openEx === e.id && e.text !== null && <div className="exbody">
            <p className="passage sm">{e.text}</p>
            <div className="acts"><button className="btn sm keep" onClick={() => onVerdict(e, "keep")}>keep</button><button className="btn sm pass" onClick={() => onVerdict(e, "pass")}>pass</button><button className="btn sm art" onClick={() => onVerdict(e, e.latest?.verdict ?? "keep", !e.latest?.artifact)}>{e.latest?.artifact ? "unflag artifact" : "artifact"}</button></div>
          </div>}
        </div>))}
      </div>
      {packet && <div className="col">
        <h2 className="sec">packet</h2>
        <div className="packet">{["vignette.md", "outline.md", "context-1.md", "context-2.md", "ending.md", "trail.md"].filter((f) => packet[f]).map((f) => <div className="file" key={f}><div className="fn">{f}</div><p className="passage sm">{packet[f]}</p></div>)}</div>
      </div>}
      </div>
    </>
  );
}

function StepView({ step, artifacts, chosen, onBack }: { step: Step; artifacts: Artifact[]; chosen: boolean; onBack: () => void }) {
  const raw = (() => { if (!step.raw_response) return null; try { return JSON.parse(step.raw_response).result ?? step.raw_response; } catch { return step.raw_response; } })();
  return (
    <div className="stepview">
      <button className="back" onClick={onBack}>← back to the run</button>
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

function Gate({ d, note, setNote, err, onGate }: { d: Detail; note: string; setNote: (s: string) => void; err: string; onGate: (action: string, stepId?: string) => void }) {
  const lowest = [...d.candidates].sort((a, b) => a.probability - b.probability)[0];
  const since = d.steps.reduce((m, s) => (s.ended_at && s.ended_at > m ? s.ended_at : m), "");
  return (
    <>
      <div><h3>gate</h3><dl className="facts" style={{ marginTop: ".5rem" }}><dt>mode</dt><dd>{d.run.mode}</dd><dt>candidates</dt><dd>{d.candidates.length}</dd><dt>lowest</dt><dd className="cell">{lowest ? `#${lowest.index} · ${lowest.probability.toFixed(2)}` : "—"}</dd>{since && <><dt>since</dt><dd>{when(since)}</dd></>}</dl></div>
      <div className="stack">
        {lowest && <button className="btn primary" title={`Continue with premise ${lowest.index}: outline, two context vignettes, the ending, then the packet.`} onClick={() => onGate("choose", lowest.step_id)}>choose #{lowest.index}, continue</button>}
        <button className="btn pass" title="Close this run as rejected and start a new one with a fresh seed and fresh examples." onClick={() => onGate("redraw")}>reject · redraw all</button>
        <button className="btn pass" title="Close this run as rejected and start a new one from the same seed, with fresh examples and premises." onClick={() => onGate("keep-seed")}>reject · keep seed</button>
        <button className="btn art" title="Mark this run as a wrong call for later review. It stays open and nothing else changes." onClick={() => onGate("flag")}>flag · call looks wrong</button>
        <textarea name="gate-note" placeholder="note for the log…" aria-label="Gate note" value={note} onChange={(e) => setNote(e.target.value)} />
        {err && <div className="err">{err}</div>}
      </div>
      <div><h3>after the gate</h3><p className="mute" style={{ margin: ".5rem 0 0", fontSize: 12.5 }}>Outline, two context vignettes and the ending, then the packet.</p></div>
    </>
  );
}

function RunFacts({ d, err }: { d: Detail; err: string }) {
  const chosen = d.candidates.find((c) => c.step_id === d.run.chosen_step);
  return (
    <div><h3>run</h3><dl className="facts" style={{ marginTop: ".5rem" }}>
      <dt>status</dt><dd className={d.run.status === "failed" ? "pass" : ""}>{label(d.run.status)}</dd>
      {d.run.gate_method && <><dt>gate</dt><dd>{d.run.gate_method}</dd></>}
      {chosen && <><dt>chosen</dt><dd className="cell">#{chosen.index} · {chosen.probability.toFixed(2)}</dd></>}
      <dt>started</dt><dd>{when(d.run.created_at)}</dd>
      {d.run.ended_at && <><dt>ended</dt><dd>{when(d.run.ended_at)}</dd></>}
      <dt>steps</dt><dd>{d.steps.length}{d.steps.some((s) => s.status === "failed") ? <span className="pass"> · {d.steps.filter((s) => s.status === "failed").length} failed</span> : null}</dd>
      {d.run.flagged ? <><dt>flag</dt><dd className="art">{d.run.flag_note || "flagged"}</dd></> : null}
    </dl>{err && <div className="err" style={{ marginTop: ".5rem" }}>{err}</div>}</div>
  );
}

function PrevRun({ runs, current }: { runs: Run[]; current: string }) {
  const i = runs.findIndex((r) => r.id === current);
  const prev = i >= 0 ? runs[i + 1] : undefined;
  if (!prev) return null;
  return <div className="foot">previous run <a href={`#run/${prev.id}`} className="mono">{prev.id.slice(-4)}</a> {label(prev.status)}{prev.ended_at ? ` ${when(prev.ended_at)}` : ""}</div>;
}

function StartForm({ status }: { status: Status | null }) {
  const [facets, setFacets] = useState<Facets | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ mode: "manual", genre: "horror" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { api.facets().then(setFacets); }, []);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const start = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { const { id } = await api.startRun(form); location.hash = `#run/${id}`; } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const eligible = new Map(status?.per_source.map((s) => [s.source, s.eligible]) ?? []);
  return (
    <>
      <div className="pane read">
        <form className="form" onSubmit={start}>
          <h1>Start a run</h1>
          <p className="lede">Draws six eligible passages and a seed, asks for five premises off the centre of the distribution, writes each as a 400-word vignette, then stops at the gate for you.</p>
          <div className="field"><span className="lbl">Gate</span><div className="seg" role="group" aria-label="Gate"><button type="button" aria-pressed={form.mode === "manual"} onClick={() => setForm({ ...form, mode: "manual" })}>Manual</button><button type="button" aria-pressed={form.mode === "auto"} onClick={() => setForm({ ...form, mode: "auto" })}>Auto</button></div><span className="help">Manual waits for you after the vignettes. Auto takes the lowest-probability premise and keeps going.</span></div>
          <div className="field"><label htmlFor="setting">Setting</label><select id="setting" className="sel" value={form.setting ?? ""} onChange={set("setting")}><option value="">Unrestricted</option>{facets?.settings.map((s) => <option key={s}>{s}</option>)}</select><span className="help">A setting appends its reference file to every prompt and adds its outline jobs.</span></div>
          <div className="field"><label htmlFor="genre">Genre</label><select id="genre" className="sel" value={form.genre} onChange={set("genre")}><option>horror</option><option>scifi</option></select></div>
          <div className="field"><label htmlFor="source">Examples from</label><select id="source" className="sel" value={form.source ?? ""} onChange={set("source")}><option value="">All sources{status ? ` · ${status.passages_eligible} eligible` : ""}</option>{facets?.sources.map((s) => <option key={s.id} value={s.id}>{s.id}{eligible.has(s.id) ? ` · ${eligible.get(s.id)}` : ""}</option>)}</select></div>
          <div className="field"><label htmlFor="seed">Seed</label><textarea id="seed" name="seed" value={form.seed ?? ""} onChange={set("seed")} placeholder="Leave empty to draw a theme from the bank, or type one…" /><span className="help">{status ? `${status.themes_eligible} eligible themes in the bank. ` : ""}A typed seed is logged as “typed”, a drawn one as “drawn”.</span></div>
          <div className="actions"><button type="submit" className="btn primary" disabled={busy}>{busy ? "Starting…" : "Start run"}</button><span className="dim" style={{ fontSize: 12.5 }}>About a minute to the gate, a few more to a packet.</span>{err && <div className="err" style={{ flexBasis: "100%" }}>{err}</div>}</div>
        </form>
      </div>
      <aside className="pane insp">
        <div><h3>this run will</h3><div className="plan" style={{ marginTop: ".5rem" }}>
          <div className="pstep"><i /><span><b>draw</b> 6 passages and a seed</span></div>
          <div className="pstep"><i /><span><b>premises</b> five, with stated probability</span></div>
          <div className="pstep"><i /><span><b>execute</b> five vignettes in parallel</span></div>
          <div className="pstep"><i className="gate" /><span><b>gate</b> {form.mode === "manual" ? "waits for you" : "takes the lowest"}</span></div>
          <div className="pstep"><i /><span><b>outline</b> in reverse, from the chosen one</span></div>
          <div className="pstep"><i /><span><b>context</b> two vignettes, and the <b>ending</b></span></div>
          <div className="pstep"><i /><span><b>packet</b> exported to <span className="mono">packets/</span></span></div>
        </div></div>
        {status && <div><h3>pool</h3><dl className="facts" style={{ marginTop: ".5rem" }}><dt>passages</dt><dd>{status.passages_eligible} of {status.passages} eligible</dd><dt>themes</dt><dd>{status.themes_eligible} of {status.themes} eligible</dd></dl></div>}
      </aside>
    </>
  );
}
