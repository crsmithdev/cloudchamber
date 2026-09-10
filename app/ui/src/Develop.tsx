import React, { useEffect, useMemo, useState } from "react";
import { api, when, type Draw, type DraftConfig, type Finding, type Findings, type Story, type Step } from "./api.ts";
import { Caret, Log, Md, StepView, firstParagraph, label, type Detail } from "./Draws.tsx";

/**
 * Develop a brief: the stages after a brief (docs/specs/2026-09-05-drafting-pipeline.md).
 * The list holds briefs from the moment they exist to the moment they are kept
 * or passed; the reading pane is the findings at gate 1, the story with its
 * screens at gate 2, or the running log in between.
 */
const OPEN = new Set(["awaiting_check_gate", "awaiting_draft_gate"]);
const RUNNING = new Set(["checking", "repairing", "drafting"]);
const dot = (s: string) => "st " + (OPEN.has(s) ? "wait" : s === "failed" ? "fail" : RUNNING.has(s) ? "running" : s === "repaired" ? "rep" : s === "done" ? "todo" : "");
const badge = (s: string) => "badge " + (OPEN.has(s) ? "awaiting_gate" : RUNNING.has(s) ? "running" : s === "drafted" ? "done" : s === "failed" ? "failed" : "");
const INVALIDATES = ["debt audit", "arithmetic", "custody"];
/** A quoted span is shown between the row's own quotation marks; a span the model already quoted would show two. */
const unquote = (s: string) => s.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "");
/** Markdown from the outline stage opens paragraphs with a label and a colon; the label reads better set bold. */
const boldLabels = (md: string) => md.replace(/^([A-Z][A-Za-z0-9 ,'’/&-]{0,40}):(?=\s)/gm, "**$1:**");

export function Develop({ stage, selected }: { stage: "check" | "write"; selected: string | undefined }) {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [d, setD] = useState<Detail | null>(null);
  const [stepId, setStepId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [settings, setSettings] = useState(false);
  const loadDraws = () => api.draws().then((all) => setDraws(all.filter((r) => r.stage === stage))).catch(() => {});
  useEffect(() => { loadDraws(); const t = setInterval(loadDraws, 3000); return () => clearInterval(t); }, [stage]);
  const current = selected ?? (draws.find((r) => OPEN.has(r.status)) ?? draws.find((r) => !r.superseded_by))?.id;
  const loadDetail = (id: string) => api.draw(id).then(setD).catch((e) => setErr(e.message));
  useEffect(() => {
    if (!current) return;
    setD(null); setStepId(null); setErr(""); setSettings(false);
    loadDetail(current);
    const t = setInterval(() => loadDetail(current), 2500);
    return () => clearInterval(t);
  }, [current]);
  const act = async (fn: () => Promise<any>, go?: (r: any) => string | undefined) => {
    setErr("");
    try { const r = await fn(); const to = go?.(r); if (to && to !== current) location.hash = `#${stage}/${to}`; else if (current) loadDetail(current); loadDraws(); } catch (e: any) { setErr(e.message); }
  };
  const step = d && stepId ? d.steps.find((s) => s.id === stepId) : undefined;
  return (
    <>
      <div className="pane list">
        {draws.length === 0 && <div className="empty">{stage === "check" ? "No briefs yet. Choose a candidate at a gate under ideate." : "Nothing drafted yet. Send a checked brief here from check."}</div>}
        {draws.map((r) => (
          <div key={r.id} className={"drawrow" + (r.id === current ? " on" : "") + (r.superseded_by ? " old" : "")} onClick={() => { location.hash = `#${stage}/${r.id}`; }}>
            <div className="l1"><span className="nm">{r.name ?? r.id}</span><span className="when">{when(r.created_at)}</span></div>
            <div className="l2"><span className={dot(r.status)} />{r.status === "done" ? "brief · not yet checked" : label(r.status)}{r.origin?.index ? <span className="cell"> · #{r.origin.index}{r.origin.probability != null ? ` · ${r.origin.probability.toFixed(2)}` : ""}</span> : null} · {r.setting ?? "unrestricted"} · {r.genre}{r.repaired_from ? <span className="dim"> · repaired</span> : null}{r.flagged ? <span className="art"> · flagged</span> : null}{r.superseded_by && <span className="dim"> · superseded</span>}</div>
            <div className="sd">{r.seed_text}</div>
            <div className="rid mono dim">{r.id}</div>
            {stage === "check" && r.status === "done" && !r.superseded_by &&
              <div className="rowacts" onClick={(e) => e.stopPropagation()}>
                <button className="btn sm keep" onClick={() => act(() => api.check(r.id), () => r.id)}>check this brief</button>
                <span className="dim">derivation, ledger, structure, resemblance</span>
              </div>}
            {r.id === current && d && <Log d={d} stepId={stepId} onStep={setStepId} />}
          </div>))}
      </div>
      <div className="pane read span dev">
        {!current ? <div className="empty">{stage === "check" ? "Nothing to check yet." : "Nothing to write yet."}</div> : !d ? (err ? <div className="err">{err}</div> : <span className="dim">loading…</span>) : <>
          <div className="drawhd"><h1>{d.draw.name ?? d.draw.id}</h1><span className="rid mono dim">{d.draw.id}</span><span className={badge(d.draw.status)}>{d.draw.status === "done" ? "brief" : label(d.draw.status)}</span>
            {d.origin && <span className="meta"><span><i>{d.origin.id === d.draw.id ? "candidate" : "from"}</i>{d.origin.id === d.draw.id
              ? <a href={`#draw/${d.origin.id}`}>#{d.origin.index}{d.origin.probability != null ? ` · ${d.origin.probability.toFixed(2)}` : ""}</a>
              : <a href={`#draw/${d.origin.id}`}>{d.origin.name ?? d.origin.id}{d.origin.index ? ` #${d.origin.index}` : ""}</a>}</span></span>}
            <span className="dim" style={{ fontSize: 12 }}>{d.draw.setting ?? "unrestricted"} · {d.draw.genre} · {d.draw.mode}{d.draw.repaired_from ? <> · repairs <a href={`#${stage}/${d.draw.repaired_from}`} className="mono">{d.draw.repaired_from}</a></> : null}{d.draw.superseded_by ? <> · superseded by <a href={`#${stage}/${d.draw.superseded_by}`} className="mono">{d.draw.superseded_by}</a></> : null}</span></div>
          {err && <div className="err">{err}</div>}
          {step ? <StepView step={step} artifacts={d.artifacts.filter((a) => a.step_id === step.id)} chosen={false} onBack={() => setStepId(null)} />
            : settings ? <DraftSettings d={d} onClose={() => setSettings(false)} onDraft={(b) => act(async () => { await api.draft(d.draw.id, b); location.hash = `#write/${d.draw.id}`; })} />
            : stage === "write" ? <StoryPane d={d} onAct={act} />
            : d.draw.status === "awaiting_check_gate" || d.draw.status === "repaired" ? <GateOne d={d} onAct={act} onDraft={() => setSettings(true)} />
            : d.draw.status === "done" || d.draw.status === "passed" ? <BriefReady d={d} onCheck={() => act(() => api.check(d.draw.id))} onDraft={() => setSettings(true)} onPass={(note) => act(() => api.gate(d.draw.id, { action: "pass", note }))} />
            : <Building d={d} />}
        </>}
      </div>
    </>
  );
}

function useBrief(id: string) {
  const [brief, setBrief] = useState<Record<string, string> | null>(null);
  useEffect(() => { setBrief(null); api.brief(id).then(setBrief).catch(() => setBrief({})); }, [id]);
  return brief;
}

const BRIEF_FILES = ["outline.md", "vignette.md", "context-1.md", "context-2.md", "ending.md", "ending.previous.md"];

function BriefFiles({ id, open = "outline.md" }: { id: string; open?: string }) {
  const brief = useBrief(id);
  if (!brief) return <span className="dim">loading…</span>;
  return (
    <div className="brief" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>{BRIEF_FILES.filter((f) => brief[f]).map((f) => (
      <details className="file ctx" key={f} open={f === open}><summary><Caret /><span className="fn">{f}</span><span className="dim"> · {firstParagraph(brief[f]).slice(0, 80)}…</span></summary><Md className="passage sm" text={boldLabels(brief[f])} /></details>))}</div>
  );
}

function BriefReady({ d, onCheck, onDraft, onPass }: { d: Detail; onCheck: () => void; onDraft: () => void; onPass: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <>
      <div className="gatebar" role="group" aria-label="Brief">
        <button className="btn primary" onClick={onCheck}>check · derivation, ledger, structure, resemblance{d.draw.setting ? ", claims" : ""}</button>
        <button className="btn" onClick={onDraft}>draft without checking ▾</button>
        <button className="btn pass" onClick={() => onPass(note)}>pass brief</button>
        <input type="text" placeholder="note for the log…" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="seed"><small>seed</small>{d.draw.seed_text}</div>
      <h2 className="sec">brief <span>· <a href={api.briefFile(d.draw.id, "trail.md")} target="_blank" rel="noopener" className="mono">briefs/{d.draw.id}/trail.md</a></span></h2>
      <div style={{ maxWidth: "58rem" }}><BriefFiles id={d.draw.id} /></div>
    </>
  );
}

const BUILD = ["outline", "jobs", "context", "ending"];

/**
 * A brief under construction. The premise and the vignette exist from the
 * gate; the outline, the two context vignettes and the ending land one at a
 * time. Each part is read from its artifact, because the files under briefs/
 * are written last and all at once.
 */
function Building({ d }: { d: Detail }) {
  const stageOfStep = new Map(d.steps.map((s) => [s.id, s.stage]));
  const running = d.steps.filter((s) => s.status === "running");
  const done = new Set(d.steps.filter((s) => s.status === "done").map((s) => s.stage));
  const chosen = d.artifacts.find((a) => a.kind === "vignette" && a.step_id === d.draw.chosen_step);
  const outline = [...d.artifacts].reverse().find((a) => a.kind === "outline");
  const contexts = d.artifacts.filter((a) => a.kind === "vignette" && stageOfStep.get(a.step_id) === "context");
  const ending = [...d.artifacts].reverse().find((a) => a.kind === "ending");
  const part = (name: string, body: string | undefined, open = false) => body
    ? <details className="file ctx" key={name} open={open}><summary><Caret /><span className="fn">{name}</span><span className="dim"> · {firstParagraph(body).slice(0, 80)}…</span></summary><Md className="passage sm" text={boldLabels(body)} /></details>
    : <div className="file ctx" key={name} style={{ padding: ".5rem .75rem", opacity: .5 }}><span className="fn">{name}</span><span className="dim"> · waiting</span></div>;
  return (
    <>
      <div className="seed"><small>{label(d.draw.status)}</small>
        {running.length ? `${running.length} call${running.length > 1 ? "s" : ""} in flight: ${[...new Set(running.map((s) => s.stage))].join(", ")}` : "waiting for the next step"}
        <div className="dim" style={{ fontStyle: "normal", fontFamily: "Instrument Sans, system-ui, sans-serif", fontSize: 12.5, marginTop: ".5rem" }}>
          {BUILD.map((s) => `${s}${done.has(s) ? " ✓" : ""}`).join(" · ")}. The page refreshes itself.</div></div>
      <h2 className="sec">the brief, as it lands</h2>
      <div className="brief" style={{ gridTemplateColumns: "minmax(0, 1fr)", maxWidth: "58rem" }}>
        {part("premise and vignette", chosen?.content, true)}
        {part("outline.md", outline?.content, true)}
        {contexts.length ? contexts.map((a, i) => part(`context-${i + 1}.md`, a.content)) : part("context-1.md", undefined)}
        {part("ending.md", ending?.content)}
      </div>
    </>
  );
}

// --- gate 1 ------------------------------------------------------------------

function GateOne({ d, onAct, onDraft }: { d: Detail; onAct: (fn: () => Promise<any>, go?: (r: any) => string | undefined) => void; onDraft: () => void }) {
  const [f, setF] = useState<Findings | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [examined, setExamined] = useState(false);
  const id = d.draw.id;
  useEffect(() => { api.findings(id).then(setF).catch(() => {}); }, [id, d.steps.length]);
  const gate = (action: string, extra: Record<string, unknown> = {}) => onAct(() => api.gate(id, { action, note, ...extra }), (r) => r?.id);
  const open = f?.findings.filter((x) => x.decision === "open") ?? [];
  const accepted = f?.findings.filter((x) => x.decision === "accepted") ?? [];
  const repaired = d.draw.status === "repaired";
  const outline = [...d.artifacts].reverse().find((a) => a.kind === "outline");
  const constraints: string[] = outline ? JSON.parse(outline.meta).constraints ?? [] : [];
  const settingJobs: string[] = outline ? (JSON.parse(outline.meta).jobs ?? []).filter((j: string) => !INVALIDATES.includes(j)) : [];
  const toggle = (fid: string) => setSel((s) => { const n = new Set(s); n.has(fid) ? n.delete(fid) : n.add(fid); return n; });
  return (
    <>
      {!repaired && <div className="gatebar" role="group" aria-label="Gate 1">
        <button className="btn primary" disabled={!sel.size && !accepted.length} onClick={() => gate("accept", { findings: [...sel] })} title="Accept the selected findings. The brief is repaired into a new draw under their replacements and re-checked.">accept {sel.size || accepted.length} · repair and re-check</button>
        <button className="btn quiet" onClick={() => gate("hold")} title="Leave the brief here. Nothing runs.">hold</button>
        <button className="btn pass" onClick={() => gate("pass")} title="Pass over this brief. Its verdict goes to the log.">pass brief</button>
        <button className="btn art" onClick={() => gate("flag")} title="Mark a check call as looking wrong. Nothing runs.">flag · a check looks wrong</button>
        <input type="text" placeholder="note for the log…" aria-label="Gate note" value={note} onChange={(e) => setNote(e.target.value)} />
        <span className="gatesep" />
        <button className="btn" onClick={onDraft} disabled={accepted.length > 0} title={accepted.length ? "Accepted findings are pending repair." : "Schedule and write the story from this brief as it stands."}>draft{d.draw.draft_config ? ` · ${JSON.parse(d.draw.draft_config).config.length.words} words` : ""} ▾</button>
      </div>}
      {repaired && <div className="seed"><small>repaired</small>This brief was repaired into <a href={`#check/${d.draw.superseded_by}`} className="mono">{d.draw.superseded_by}</a>; its findings and their decisions are kept here for the record.</div>}
      <div className="drawbody two"><div className="col">
        <h2 className="sec">findings <span>· {f ? `${f.findings.length} reported` : "…"}{f?.pass ? ` · pass ${f.pass.slice(0, 16).replace("T", " ")}` : ""} · ordered by recurrence, then by what they invalidate · merged across checkers</span></h2>
        {f && f.findings.length === 0 && <div className="note" style={{ padding: ".75rem 1rem", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6 }}>Nothing recurred in enough samples to report. What each checker examined is listed on the right.</div>}
        {f?.findings.map((x) => <FindingRow key={x.id} f={x} S={Math.max(x.n, ...x.samples, x.checkers.includes("claims") ? 1 : 3)} selected={sel.has(x.id)} onToggle={() => toggle(x.id)} onDismiss={() => gate("dismiss", { finding: x.id })} readOnly={repaired} />)}
        {f && <>
          <h2 className="sec">claims <span>· {f.claims.length ? `${f.claims.length} verified · ${f.claims.filter((c) => c.result === "supported").length} supported · ${f.claims.filter((c) => c.result === "contradicted").length} contradicted · ${f.claims[0].authority === "world" ? "the web, on sonnet" : "the setting's reference files"}` : "off · no claims authority declared on the setting"}</span></h2>
          {f.claims.map((c, i) => <div key={i} className="claim"><span className={"r mono " + (c.result === "supported" ? "keep" : c.result === "contradicted" ? "pass" : "dim")}>{c.result}</span><div>{c.statement}<div className="ev">{c.evidence}</div></div></div>)}
        </>}
        {constraints.length > 0 && <>
          <h2 className="sec">constraints <span>· the accepted replacements, verbatim, in the repair prompts</span></h2>
          <div className="cons"><div className="fn">&lt;constraints&gt;</div>{constraints.map((c, i) => <div key={i}>- {c}</div>)}<div className="fn">&lt;/constraints&gt;</div></div>
        </>}
      </div><div className="col">
        {f && <Profiles f={f} settingJobs={settingJobs} />}
        {f && f.examined.length > 0 && <>
          <h2 className="sec">examined <span>· what an empty result would have looked at</span></h2>
          <button className="fold" aria-expanded={examined} onClick={() => setExamined((e) => !e)}><Caret open={examined} /><span className="fn mono">{f.examined.length} lists</span><span className="dim">· {[...new Set(f.examined.map((e) => e.stage))].join(", ")}</span></button>
          {examined && f.examined.map((e, i) => <div key={i} className="mono dim" style={{ fontSize: 11.5, lineHeight: 1.7, padding: ".25rem 0 .25rem 1.4rem", whiteSpace: "pre-wrap" }}><span className="mute">{e.stage} · sample {e.sample}</span>{"\n"}{e.examined}</div>)}
        </>}
        <h2 className="sec">brief <span>· <a href={api.briefFile(id, "trail.md")} target="_blank" rel="noopener" className="mono">briefs/{id}/trail.md</a></span></h2>
        <BriefFiles id={id} open={d.draw.repaired_from ? "ending.previous.md" : "outline.md"} />
        {f?.judge && <div className="judge">{f.judge}</div>}
      </div></div>
    </>
  );
}

function FindingRow({ f, S, selected, onToggle, onDismiss, readOnly }: { f: Finding; S: number; selected: boolean; onToggle: () => void; onDismiss: () => void; readOnly: boolean }) {
  const cls = "finding" + (f.decision === "accepted" || selected ? " acc" : "") + (f.decision === "dismissed" ? " dis" : "");
  return (
    <div className={cls}>
      <div className="rec">
        <div className="dots">{Array.from({ length: S }, (_, i) => <i key={i} className={i < f.n ? "on" : ""} />)}<b className="tnum">{f.n}/{S}</b></div>
        <div className={"ptr" + (f.invalidates === "none" ? " none" : "")}>→ {f.invalidates}</div>
        <div className="ck">{f.checkers.map((c) => <span key={c}>{c}</span>)}</div>
      </div>
      <div className="body">
        <div className="span">{unquote(f.span)}</div>
        <div>{f.statement}</div>
        <div className="kv"><b>result</b><span className="mono" style={{ fontSize: 11.5 }}>{f.result}</span><b>evidence</b><span>{f.evidence}</span><b>replacement</b><span className="rep">{f.replacement}</span></div>
      </div>
      <div className="acts">
        {f.decision === "accepted" ? <span className="state keep">accepted{f.note ? ` · ${f.note}` : ""}</span>
          : f.decision === "dismissed" ? <span className="state dim">dismissed{f.note ? ` · ${f.note}` : ""}</span>
          : readOnly ? <span className="state dim">open</span> : <>
            <button className={"btn sm keep"} aria-pressed={selected} onClick={onToggle}>{selected ? "selected" : "accept"}</button>
            <button className="btn sm pass" onClick={onDismiss}>dismiss</button>
          </>}
      </div>
    </div>
  );
}

const STRUCTURE_Q = ["threat", "category-violation", "agency", "obscurity", "thickening", "spectacle", "consequence"];
/** The seven questions as the checker is asked them (app/pipeline/prompts.ts, checkStructure). */
const STRUCTURE_DEF: Record<string, string> = {
  threat: "Something in the brief would harm or endanger someone in it.",
  "category-violation": "A boundary is violated: between living and dead, self and other, inside and outside, one thing and another. Not: something is disgusting.",
  agency: "There is an unresolved question of what is acting: something acting with no visible actor, or an actor-shaped absence.",
  obscurity: "What is withheld is withheld deliberately and legibly, leaving something for the imagination to enlarge. Absent means the brief is merely underspecified.",
  thickening: "The brief contains material for development beyond its own statement, rather than a single image or a single reveal.",
  spectacle: "The brief's entire payload is a shock, a gross-out or a final twist.",
  consequence: "The point of departure from the actual has its consequences taken seriously.",
};
const STRUCTURE_TIP = "Seven binary questions about the brief, from the evaluation review's list of what a judge can answer with a quote. Each is present or absent with one verbatim quote; they are a profile, never summed into a score.";
const RESEMBLANCE_TIP = "Retrieval, not judgement: the brief is matched against the enumerated list of overused premises in app/pipeline/premises.md, and the nearest published work is named with one sentence on what is shared. Nothing is asked about originality.";
const PREMISES_FILE = "app/pipeline/premises.md";

function Profiles({ f, settingJobs }: { f: Findings; settingJobs: string[] }) {
  const structure = f.profiles.find((p) => p.checker === "structure");
  const resemblance = f.profiles.find((p) => p.checker === "resemblance");
  void settingJobs;
  return (
    <>
      {structure?.answers && <>
        <h2 className="sec" title={STRUCTURE_TIP}>structure <span>· present / absent · never summed</span></h2>
        <div className="profile">{STRUCTURE_Q.map((q) => <div key={q} className={structure.answers![q]?.answer === "present" ? "on" : ""} title={`${STRUCTURE_DEF[q]}\n\n${structure.answers![q]?.answer ?? ""}: “${structure.answers![q]?.quote ?? ""}”`}>{q.replace("category-violation", "category")}</div>)}</div>
        <details className="ctx" style={{ marginTop: ".6rem" }}><summary><Caret /><span className="fn">quotes</span></summary>
          <dl className="facts" style={{ marginTop: ".5rem" }}>{STRUCTURE_Q.map((q) => <React.Fragment key={q}><dt title={STRUCTURE_DEF[q]}>{q}</dt><dd className="serif" style={{ fontStyle: "italic" }}>{structure.answers![q]?.quote}</dd></React.Fragment>)}</dl></details>
      </>}
      {resemblance && <>
        <h2 className="sec" title={RESEMBLANCE_TIP}>resemblance <span>· retrieval, not judgement · against <span className="mono">{PREMISES_FILE}</span></span></h2>
        {(resemblance.matches ?? []).length === 0 && <div className="note">no list entry matched</div>}
        {(resemblance.matches ?? []).map((m, i) => <div key={i} className="note" style={{ marginBottom: 4 }} title={`Entry ${/^\d+/.exec(m.entry)?.[0] ?? "?"} of ${PREMISES_FILE}, quoted by the checker verbatim; the span is where the brief matches it.`}>matches <span className="mono dim">{PREMISES_FILE.split("/").pop()} </span><span style={{ color: "var(--ink)" }}>{m.entry}</span> <span className="dim">· “{unquote(m.span)}”</span></div>)}
        {resemblance.nearest && <div className="note" style={{ marginTop: 6 }}>nearest <span style={{ color: "var(--ink)" }}>{resemblance.nearest.title}</span>, {resemblance.nearest.author} <span className="dim">· {resemblance.nearest.shared}</span></div>}
      </>}
    </>
  );
}

// --- draft settings ----------------------------------------------------------

const AXES: Record<string, string[]> = { tense: ["past", "present"], person: ["first", "second", "third"], chronology: ["linear", "nonlinear"], container: ["prose", "document", "interleaved"] };

function Seg({ value, options, onChange, label: lbl }: { value: string; options: string[]; onChange: (v: string) => void; label: string }) {
  return <div className="seg" role="group" aria-label={lbl}>{options.map((o) => <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}>{o}</button>)}</div>;
}

function DraftSettings({ d, onClose, onDraft }: { d: Detail; onClose: () => void; onDraft: (b: { auto?: boolean; profile?: string; overrides?: Record<string, string | number> }) => void }) {
  const [cfg, setCfg] = useState<{ defaults: DraftConfig; profiles: string[] } | null>(null);
  const [profile, setProfile] = useState<string>("");
  const [v, setV] = useState<Record<string, string>>({});
  const [auto, setAuto] = useState(false);
  useEffect(() => { api.draftConfig().then(setCfg); }, []);
  if (!cfg) return <span className="dim">loading…</span>;
  const def = cfg.defaults;
  const base: Record<string, string> = {
    "length.words": String(def.length.words), "beats.count": String(def.beats.count), "beats.min": String(def.beats.min), "beats.max": String(def.beats.max),
    "beats.words_min": String(def.beats.words_min), "beats.words_max": String(def.beats.words_max),
    "form.tense": def.form.tense, "form.person": def.form.person, "form.chronology": def.form.chronology, "form.container": def.form.container, "form.ending": def.form.ending,
    "scenes.order": def.scenes.order,
  };
  const val = (k: string) => v[k] ?? base[k];
  const set = (k: string) => (x: string) => setV({ ...v, [k]: x });
  const overrides: Record<string, string | number> = {};
  for (const [k, x] of Object.entries(v)) if (x !== base[k] && x !== "") overrides[k] = x;
  const checked = d.artifacts.some((a) => a.kind === "ledger");
  return (
    <div className="form">
      <button className="back" onClick={onClose}>← back</button>
      <h1>Draft</h1>
      <p className="lede">Defaults from <span className="mono">app/pipeline/draft.toml</span>. Whatever you change here is written to the trail and to <span className="mono">config.toml</span> on keep.</p>
      <div className="field"><span className="lbl">Profile</span><Seg label="Profile" value={profile || "default"} options={["default", ...cfg.profiles]} onChange={(p) => setProfile(p === "default" ? "" : p)} /><span className="help">A profile bundles overrides; the flags below override it again.</span></div>
      <div className="field"><label htmlFor="words">Length</label><div style={{ display: "flex", gap: ".6rem", alignItems: "center" }}><input id="words" type="text" className="mono" style={{ width: "6rem" }} value={val("length.words")} onChange={(e) => set("length.words")(e.target.value)} /><span className="dim">words · ±{Math.round(def.length.tolerance * 100)}%</span></div></div>
      <div className="field"><span className="lbl">Beats</span><div style={{ display: "flex", gap: ".6rem", alignItems: "center", flexWrap: "wrap" }}>
        <Seg label="Beat count" value={val("beats.count") === "auto" ? "auto" : "fixed"} options={["auto", "fixed"]} onChange={(m) => set("beats.count")(m === "auto" ? "auto" : val("beats.min"))} />
        {val("beats.count") === "auto" ? <><span className="dim">between</span><input type="text" className="mono" style={{ width: "3.5rem" }} aria-label="Minimum beats" value={val("beats.min")} onChange={(e) => set("beats.min")(e.target.value)} /><span className="dim">and</span><input type="text" className="mono" style={{ width: "3.5rem" }} aria-label="Maximum beats" value={val("beats.max")} onChange={(e) => set("beats.max")(e.target.value)} /></>
          : <><span className="dim">exactly</span><input type="text" className="mono" style={{ width: "3.5rem" }} aria-label="Beat count" value={val("beats.count")} onChange={(e) => set("beats.count")(e.target.value)} /></>}
        <span className="dim">· each</span><input type="text" className="mono" style={{ width: "4rem" }} aria-label="Minimum words per beat" value={val("beats.words_min")} onChange={(e) => set("beats.words_min")(e.target.value)} /><span className="dim">–</span><input type="text" className="mono" style={{ width: "4rem" }} aria-label="Maximum words per beat" value={val("beats.words_max")} onChange={(e) => set("beats.words_max")(e.target.value)} /><span className="dim">words</span>
      </div><span className="help">The schedule chooses the count within the range and assigns each beat its cap.</span></div>
      <div className="field"><span className="lbl">Form</span><div style={{ display: "grid", gap: ".5rem" }}>
        {Object.entries(AXES).map(([axis, opts]) => <div key={axis} style={{ display: "flex", gap: ".6rem", alignItems: "center" }}><span className="dim mono" style={{ width: "5.5rem", fontSize: 11.5 }}>{axis}</span><Seg label={axis} value={val(`form.${axis}`)} options={["auto", ...opts]} onChange={set(`form.${axis}`)} />{overrides[`form.${axis}`] !== undefined && <span className="art" style={{ fontSize: 11.5 }}>overridden</span>}</div>)}
        <div style={{ display: "flex", gap: ".6rem", alignItems: "center" }}><span className="dim mono" style={{ width: "5.5rem", fontSize: 11.5 }}>ending</span><Seg label="ending" value={val("form.ending")} options={["brief", "open"]} onChange={set("form.ending")} /></div>
      </div><span className="help">auto: the schedule derives the axis from the brief and states it. A fixed axis is checked on the schedule and fails shape when contradicted.</span></div>
      <div className="field"><span className="lbl">Scenes</span><Seg label="Scene order" value={val("scenes.order")} options={["sequential", "parallel"]} onChange={set("scenes.order")} /><span className="help">Sequential carries the text so far into each scene call. Parallel writes all beats at once from the schedule alone.</span></div>
      {!checked && <div className="field"><span className="lbl">Gate 1</span><Seg label="Gate 1" value={auto ? "auto" : "skip"} options={["skip", "auto"]} onChange={(x) => setAuto(x === "auto")} /><span className="help">This brief has not been checked. Skip drafts it as it stands (one ledger extraction supplies the ledger). Auto runs the check, accepts what recurred in every sample with evidence, dismisses the rest, repairs once and re-checks, then drafts and stops at gate 2.</span></div>}
      <div className="actions"><button className="btn primary" onClick={() => onDraft({ auto, profile: profile || undefined, overrides: Object.keys(overrides).length ? overrides : undefined })}>Draft</button><span className="dim" style={{ fontSize: 12.5 }}>One schedule call, then the scene calls in sequence, then the screens. About eight minutes at the defaults.</span></div>
    </div>
  );
}

// --- gate 2 ------------------------------------------------------------------

function StoryPane({ d, onAct }: { d: Detail; onAct: (fn: () => Promise<any>, go?: (r: any) => string | undefined) => void }) {
  const [s, setS] = useState<Story | null>(null);
  const [note, setNote] = useState("");
  const [k, setK] = useState(1);
  const [view, setView] = useState<"story" | "schedule">("story");
  const id = d.draw.id;
  useEffect(() => { api.story(id).then(setS).catch(() => {}); }, [id, d.steps.length]);
  if (!s) return <span className="dim">loading…</span>;
  const gating = d.draw.status === "awaiting_draft_gate";
  const gate = (action: string, extra: Record<string, unknown> = {}) => onAct(() => api.gate(id, { action, note, ...extra }));
  const M = s.scenes.length;
  const flagsFor = (beat: number) => ({ ledger: s.screenFindings.filter((f) => f.beat === beat), structure: s.profiles.find((p) => p.beat === beat) });
  const words = s.scenes.reduce((a, x) => a + x.text.split(/\s+/).filter(Boolean).length, 0);
  const cfg = d.draw.draft_config ? JSON.parse(d.draw.draft_config) : null;
  const nStructure = s.profiles.reduce((a, p) => a + p.flags.length, 0);
  return (
    <>
      {gating && <div className="gatebar" role="group" aria-label="Gate 2">
        <button className="btn primary keepbg" onClick={() => gate("keep")} title={`Keep the story. It is exported to drafts/${id}/ with its schedule, findings, configuration and trail.`}>keep · export drafts/{id}/</button>
        <span className="rewrite"><button className="btn art" onClick={() => gate("rewrite", { beat: k })} title="Regenerate one scene from its beat under its flags' replacements, then screen it and the next scene again.">rewrite scene</button><select className="sel" aria-label="Scene to rewrite" value={k} onChange={(e) => setK(Number(e.target.value))}>{s.scenes.map((x) => <option key={x.beat} value={x.beat}>{x.beat}</option>)}</select><span className="dim" style={{ fontSize: 12 }}>· screens {k}{k < M ? ` and ${k + 1}` : ""} run again</span></span>
        <button className="btn pass" onClick={() => gate("pass")} title="Pass over this draft. Its verdict goes to the log.">pass</button>
        <input type="text" placeholder="note for the log…" aria-label="Gate note" value={note} onChange={(e) => setNote(e.target.value)} />
        <span className="gatesep" />
        <button className="btn quiet" aria-pressed={view === "schedule"} onClick={() => setView(view === "schedule" ? "story" : "schedule")}>{view === "schedule" ? "story" : "schedule"}</button>
      </div>}
      {!gating && <div className="seed"><small>{label(d.draw.status)}</small>{d.draw.status === "drafted" ? <>Kept and exported to <span className="mono">drafts/{id}/</span>.</> : "Passed over."}{d.draw.flag_note && <div className="dim" style={{ fontStyle: "normal", fontFamily: "Instrument Sans, system-ui, sans-serif", fontSize: 12.5, marginTop: ".5rem", whiteSpace: "pre-wrap" }}>{d.draw.flag_note}</div>}<div style={{ marginTop: ".6rem" }}><button className="btn sm" aria-pressed={view === "schedule"} onClick={() => setView(view === "schedule" ? "story" : "schedule")}>{view === "schedule" ? "story" : "schedule"}</button></div></div>}
      <div className="chips form-chips">{cfg && <><span className="chip on mono">{cfg.config.length.words.toLocaleString()} words</span><span className="chip on mono">{M} beats{cfg.config.beats.count === "auto" ? ` · auto ${cfg.config.beats.min}–${cfg.config.beats.max}` : ""}</span>{s.schedule && Object.entries(s.schedule.form).map(([a, x]) => <span key={a} className="chip on mono" title={a}>{x.split(/[,;]/)[0].replace(/^[a-z]+\s*[:=]\s*/i, "").trim().slice(0, 28)}</span>)}<span className="chip on mono">ending = {cfg.config.form.ending}</span><span className="chip on mono">{cfg.config.scenes.order}</span>{cfg.profile && <span className="chip mono">profile {cfg.profile}</span>}</>}<span className="chip mono">{words.toLocaleString()} written</span></div>
      <div className="drawbody two"><div className="col">
        {view === "schedule" && s.schedule ? <ScheduleView s={s} /> : s.scenes.map((sc) => {
          const fl = flagsFor(sc.beat), beat = s.schedule?.beats[sc.beat - 1];
          const n = sc.text.split(/\s+/).filter(Boolean).length;
          const over = beat ? n > beat.words * 1.1 : false;
          const nf = fl.ledger.length + (fl.structure?.flags.length ?? 0);
          return (
            <div key={sc.beat} className="scene" id={`beat-${sc.beat}`}>
              <div className="hd"><b>beat {sc.beat}</b><span className={over ? "over" : ""}>{n}{beat ? ` / ${beat.words}` : ""}{over ? " · over cap" : ""}</span>{beat && beat.absorbs !== "none" && <span>absorbs {beat.absorbs}</span>}<span className={nf ? "art" : "keep"}>{nf ? `${nf} flag${nf > 1 ? "s" : ""}` : "no flags"}</span></div>
              <Md className="prose" text={sc.text} />
              {fl.ledger.map((f) => <div key={f.id} className="flag"><div className="k">screen-ledger<small>×{f.n} of {Math.max(...f.samples, f.n)} samples</small></div><div><div className="q">“{f.span}”</div><div className="rep"><b>replacement</b> {f.replacement}</div></div>{gating && <button className="btn sm art" onClick={() => gate("rewrite", { beat: sc.beat, finding: f.id })}>rewrite with this</button>}</div>)}
              {fl.structure?.flags.map((q) => <div key={q} className="flag"><div className="k">screen-structure<small>{q} · {fl.structure!.answers[q].answer}</small></div><div><div className="q">“{fl.structure!.answers[q].quote}”</div></div><span /></div>)}
            </div>);
        })}
      </div><div className="col">
        <h2 className="sec">scenes <span>· {words.toLocaleString()} words · {s.screenFindings.length} ledger flags · {nStructure} structure flags</span></h2>
        <div className="tree">{s.scenes.map((sc) => { const fl = flagsFor(sc.beat), beat = s.schedule?.beats[sc.beat - 1]; const n = sc.text.split(/\s+/).filter(Boolean).length; return (
          <a key={sc.beat} href={`#write/${id}`} onClick={(e) => { e.preventDefault(); setView("story"); setK(sc.beat); document.getElementById(`beat-${sc.beat}`)?.scrollIntoView({ block: "start" }); }} className={"row" + (k === sc.beat ? " on" : "")}><span className="b mono">{sc.beat}</span><span className="j">{beat?.job ?? firstParagraph(sc.text)}</span><span className={"w mono" + (beat && n > beat.words * 1.1 ? " art" : "")}>{n}</span><span className="f">{fl.ledger.map((f) => <i key={f.id} className="l" />)}{fl.structure?.flags.map((q) => <i key={q} />)}</span></a>); })}</div>
        <div className="note" style={{ marginTop: 8 }}><i className="dotl" /> ledger flag <i className="dots2" /> structure flag</div>
        {s.profiles.length > 0 && <>
          <h2 className="sec">structure <span>· present across the draft · a tell, not a score</span></h2>
          <dl className="facts">
            {["theme-stated", "bodily-emotion", "withheld-revealed", "protagonist-never-wrong", "resolved", "resolves-everything"].map((q) => { const hits = s.profiles.filter((p) => p.flags.includes(q)); if (!hits.length && q !== "theme-stated" && q !== "bodily-emotion") return null; return <React.Fragment key={q}><dt>{q.replace(/-/g, " ")}</dt><dd className={hits.length ? "art" : "keep"}>{hits.length ? `${hits.length} of ${M} · beats ${hits.map((h) => h.beat).join(", ")}` : "none"}</dd></React.Fragment>; })}
          </dl>
        </>}
        {s.slop && <>
          <h2 className="sec">slop <span>· deterministic · against the passage pool</span></h2>
          <div className="slop">
            <div><div className="k">lexicon hits · proper nouns excluded</div><div className="lex">{s.slop.lexicon.length ? s.slop.lexicon.slice(0, 12).map((l) => <span key={l.term}>{l.term} <b>{l.count}</b></span>) : <span className="dim">none</span>}</div></div>
            <div><div className="k">not X but Y</div><div className="rate mono">{s.slop.not_but.per_10k} per 10k <span className="dim">· pool {s.slop.not_but.pool_per_10k}</span></div></div>
            <div><div className="k">trigrams repeated ×3+, absent from the pool</div><div className="lex">{s.slop.trigrams.length ? s.slop.trigrams.slice(0, 10).map((t) => <span key={t.trigram}>{t.trigram} <b>{t.count}</b></span>) : <span className="dim">none</span>}</div></div>
            <div><div className="k">mean paragraph length by scene · single-sentence share</div><div className="paras">{s.slop.paragraphs.map((p) => { const max = Math.max(...s.slop!.paragraphs.map((x) => x.mean_words), 1); return <i key={p.beat} className={p.single_sentence_share > .5 ? "hi" : ""} style={{ height: `${Math.max(8, Math.round((p.mean_words / max) * 100))}%` }} title={`beat ${p.beat}: ${p.paragraphs} paragraphs, mean ${p.mean_words} words, ${Math.round(p.single_sentence_share * 100)}% single-sentence`} />; })}</div></div>
          </div>
        </>}
        {s.judge && <div className="judge">{s.judge}</div>}
      </div></div>
    </>
  );
}

function ScheduleView({ s }: { s: Story }) {
  const sched = s.schedule!;
  const M = sched.beats.length;
  // one row per withheld item: first beat that lists it, and the beat that reveals it
  const rows = useMemo(() => {
    const m = new Map<string, { from: number; until: number }>();
    for (const b of sched.beats) for (const w of b.withheld) { const key = w.item.toLowerCase(); if (!m.has(key)) m.set(key, { from: b.n, until: w.until }); }
    return [...m.entries()].map(([, v], i) => ({ item: [...new Set(sched.beats.flatMap((b) => b.withheld.map((w) => w.item)))][i] ?? "", ...v })).sort((a, b) => a.until - b.until);
  }, [sched]);
  const wordsOf = (beat: number) => s.scenes.find((x) => x.beat === beat)?.text.split(/\s+/).filter(Boolean).length ?? 0;
  return (
    <>
      <h2 className="sec">withholding <span>· what stays hidden until which beat · shaded is withheld, the marked cell is the beat that reveals it</span></h2>
      <div className="chartwrap"><div className="chart" style={{ gridTemplateColumns: `minmax(0, 2fr) repeat(${M}, minmax(0, 1fr))` }}>
        <div className="h" style={{ textAlign: "right", paddingRight: 12 }}>beat</div>{sched.beats.map((b) => <div key={b.n} className="h">{b.n}{b.n === M ? " · ending" : ""}</div>)}
        {rows.map((r) => <React.Fragment key={r.item}><div className="lbl" title={r.item}>{r.item}</div>{sched.beats.map((b) => <div key={b.n} className={"c " + (b.n === r.until ? "rev" : b.n >= r.from && b.n < r.until ? "held" : "open")} />)}</React.Fragment>)}
      </div></div>
      <div className="note" style={{ marginTop: 10 }}>form as derived: {Object.entries(sched.form).map(([a, x]) => `${a} ${x}`).join(" · ")}</div>
      <h2 className="sec">beats <span>· job · known by its end · withheld after it · cap and words written</span></h2>
      {sched.beats.map((b) => { const n = wordsOf(b.n); const pct = Math.min(100, Math.round((n / b.words) * 100)); return (
        <div key={b.n} className="beat">
          <div className="n"><b className="tnum">{b.n}<small>cap {b.words}</small></b><div className="bar"><i className={n > b.words * 1.1 ? "over" : ""} style={{ width: `${pct}%` }} /></div><span className="mono dim" style={{ fontSize: 11 }}>{n} written{n > b.words * 1.1 ? " · over cap" : ""}</span>{b.absorbs !== "none" && <span className="tag">absorbs {b.absorbs}</span>}</div>
          <div className="body"><div className="job">{b.job}</div><div className="kv"><b>known</b><span>{b.known}</span><b>withheld</b><span>{b.withheld.length ? b.withheld.map((w) => `${w.item} → ${w.until}`).join(" · ") : "nothing"}</span><b>stakes</b><span>{b.stakes}</span></div></div>
        </div>); })}
    </>
  );
}

export type { Step };
