import React, { useEffect, useState } from "react";
import { api, type Artifact, type Candidate, type Example, type Run, type Step } from "./api.ts";

type Detail = { run: Run; steps: Step[]; artifacts: Artifact[]; candidates: Candidate[]; examples: Example[] };

export function RunDetail({ id }: { id: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [packet, setPacket] = useState<Record<string, string> | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const load = () => api.run(id).then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(load, 2500); return () => clearInterval(t); }, [id]);
  useEffect(() => { if (d?.run.status === "done") api.packet(id).then(setPacket).catch(() => {}); }, [d?.run.status, id]);
  if (err) return <div className="fail">{err}</div>;
  if (!d) return <div className="meta">loading…</div>;
  const { run, steps, artifacts, candidates, examples } = d;
  const verdict = async (e: Example, v: "keep" | "pass", artifact = false) => {
    await api.verdict({ kind: "example", target_id: e.id, verdict: v, artifact, note: "", method: "run" });
    load();
  };
  const gate = async (action: string, step_id?: string) => {
    setErr("");
    try { const r = await api.gate(id, { action, step_id, note }); if (r.id && r.id !== id) location.hash = `#run/${r.id}`; else load(); } catch (e: any) { setErr(e.message); }
  };
  const byParent = new Map<string | null, Step[]>();
  for (const s of steps) { const k = s.parent_id; if (!byParent.has(k)) byParent.set(k, []); byParent.get(k)!.push(s); }
  const artsOf = (stepId: string) => artifacts.filter((a) => a.step_id === stepId);
  const maxP = Math.max(...candidates.map((c) => c.probability), 0.1);

  const Tree = ({ parent }: { parent: string | null }) => (
    <ul className="tree">{(byParent.get(parent) ?? []).map((s) => (
      <li key={s.id}>
        <details>
          <summary><code>{s.stage}</code> <span className={s.status === "failed" ? "fail" : "meta"}>{s.status}{s.fail_reason ? ` (${s.fail_reason})` : ""}{s.attempt > 1 ? ` · attempt ${s.attempt}` : ""}</span> <span className="meta">· {s.model} · {s.ended_at && s.started_at ? `${Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000)}s` : "running"}</span>
            {s.id === run.chosen_step && <span className="verdict-keep"> · chosen</span>}</summary>
          <div className="meta">system: {s.system_prompt}</div>
          <details><summary className="meta">prompt ({s.prompt.length} chars)</summary><pre>{s.prompt}</pre></details>
          {s.raw_response && <details><summary className="meta">raw response</summary><pre>{(() => { try { return JSON.parse(s.raw_response!).result ?? s.raw_response; } catch { return s.raw_response; } })()}</pre></details>}
          {s.parsed && <details><summary className="meta">parsed</summary><pre>{s.parsed}</pre></details>}
          {s.error && <div className="fail">{s.error}</div>}
          {artsOf(s.id).map((a) => <details key={a.id}><summary className="meta">{a.kind} {a.id}{(() => { const m = JSON.parse(a.meta); return m.warnings?.length ? <span className="warn"> · {m.warnings.join(", ")}</span> : null; })()}</summary><pre>{a.content}</pre></details>)}
        </details>
        <Tree parent={s.id} />
      </li>))}</ul>
  );

  return (
    <>
      <h1>run {run.id} <span className={"meta " + (run.status === "failed" ? "fail" : "")}>· {run.status}{run.flagged ? " · flagged" : ""}</span></h1>
      <div className="meta">{run.setting ?? "unrestricted"} · {run.genre} · {run.mode}{run.gate_method ? ` · gate ${run.gate_method}` : ""} · seed {run.seed_mode} · {run.created_at}{run.superseded_by && <> · superseded by <a href={`#run/${run.superseded_by}`}>{run.superseded_by}</a></>}</div>
      <div className="card"><div className="meta">seed</div><p className="passage" style={{ fontSize: 16 }}>{run.seed_text}</p>{run.flag_note && <div className="warn meta">{run.flag_note}</div>}</div>

      {candidates.length > 0 && <>
        <h2>distribution <span className="meta">· stated probability · lower is further from centre</span></h2>
        <div className="dist">{candidates.map((c) => (
          <React.Fragment key={c.step_id}>
            <div><code>{c.probability.toFixed(2)}</code><div className="bar" style={{ width: `${(c.probability / maxP) * 100}%` }} /></div>
            <details open={c.step_id === run.chosen_step}>
              <summary>[{c.index}] {c.premise.slice(0, 160)}… {c.step_id === run.chosen_step && <span className="verdict-keep">· chosen</span>}{c.warnings.length > 0 && <span className="warn"> · {c.warnings.join(", ")}</span>}</summary>
              <p className="meta">{c.premise}</p>
              <p className="passage" style={{ fontSize: 15 }}>{c.vignette}</p>
              {run.status === "awaiting_gate" && <button className="keep" onClick={() => gate("choose", c.step_id)}>choose this one</button>}
            </details>
          </React.Fragment>))}</div>
        {run.status === "awaiting_gate" && (
          <div className="card">
            <div className="row">
              <input placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1 }} />
              <button className="pass" onClick={() => gate("redraw")}>reject · redraw all</button>
              <button className="pass" onClick={() => gate("keep-seed")}>reject · keep seed</button>
              <button className="flag" onClick={() => gate("flag")}>flag: call looks wrong</button>
            </div>
            {err && <div className="fail meta">{err}</div>}
          </div>)}
      </>}

      <h2>examples <span className="meta">· the six passages this run drew</span></h2>
      {examples.map((e) => (
        <details key={e.id} className="card" style={{ padding: ".6rem 1rem" }}>
          <summary><span className="meta">{e.text === null ? <>{e.id} · no longer in the pool</> : <>{e.source} · {e.title} — {e.author || "unknown"} · <code>{e.cell}</code> · {e.id}</>}</span>
            {e.latest && <span className={` verdict-${e.latest.verdict}`}> · {e.latest.verdict}{e.latest.artifact && <span className="artifact"> · artifact</span>}</span>}</summary>
          {e.text !== null && <>
            <p className="passage" style={{ fontSize: 15 }}>{e.text}</p>
            <div className="row"><button className="keep" onClick={() => verdict(e, "keep")}>keep</button><button className="pass" onClick={() => verdict(e, "pass")}>pass</button><button className="flag" onClick={() => verdict(e, e.latest?.verdict ?? "keep", !e.latest?.artifact)}>{e.latest?.artifact ? "unflag artifact" : "artifact"}</button></div>
          </>}
        </details>))}

      {packet && <>
        <h2>packet</h2>
        <div className="grid2">{["vignette.md", "outline.md", "context-1.md", "context-2.md", "ending.md", "trail.md"].filter((f) => packet[f]).map((f) => (
          <div className="card" key={f}><div className="meta">{f}</div><p className="passage" style={{ fontSize: 14.5 }}>{packet[f]}</p></div>))}</div>
      </>}

      <h2>steps <span className="meta">· {steps.length}</span></h2>
      <Tree parent={null} />
    </>
  );
}
