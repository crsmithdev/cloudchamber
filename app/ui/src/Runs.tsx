import React, { useEffect, useState } from "react";
import { api, type Run } from "./api.ts";

export function Runs() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [facets, setFacets] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({ mode: "manual", genre: "horror" });
  const [err, setErr] = useState("");
  const load = () => api.runs().then(setRuns);
  useEffect(() => { load(); api.facets().then(setFacets); const t = setInterval(load, 3000); return () => clearInterval(t); }, []);
  const start = async () => {
    setErr("");
    try { const { id } = await api.startRun(form); location.hash = `#run/${id}`; } catch (e: any) { setErr(e.message); }
  };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Start a run</h2>
        <div className="row">
          <select value={form.mode} onChange={set("mode")}><option value="manual">manual gate</option><option value="auto">auto gate</option></select>
          <select value={form.setting ?? ""} onChange={set("setting")}><option value="">unrestricted</option>{facets?.settings.map((s: string) => <option key={s}>{s}</option>)}</select>
          <select value={form.genre} onChange={set("genre")}><option>horror</option><option>scifi</option></select>
          <select value={form.source ?? ""} onChange={set("source")}><option value="">all sources</option>{facets?.sources.map((s: any) => <option key={s.id}>{s.id}</option>)}</select>
          <input placeholder="seed: leave empty to draw, or type one" value={form.seed ?? ""} onChange={set("seed")} style={{ flex: 1, minWidth: "16rem" }} />
          <button onClick={start}>run</button>
        </div>
        {err && <div className="fail meta" style={{ marginTop: ".5rem" }}>{err}</div>}
      </div>
      <table>
        <thead><tr><th>run</th><th>status</th><th>mode</th><th>setting</th><th>seed</th></tr></thead>
        <tbody>{runs.map((r) => (
          <tr key={r.id}>
            <td><a href={`#run/${r.id}`}>{r.id}</a></td>
            <td className={r.status === "failed" ? "fail" : r.status === "awaiting_gate" ? "warn" : ""}>{r.status}{r.flagged ? <span className="artifact"> · flagged</span> : null}{r.superseded_by && <div className="meta">→ <a href={`#run/${r.superseded_by}`}>{r.superseded_by}</a></div>}</td>
            <td>{r.mode}{r.gate_method ? <span className="meta"> · {r.gate_method}</span> : null}</td>
            <td>{r.setting ?? <span className="meta">—</span>}</td>
            <td className="meta">{r.seed_text.slice(0, 90)}…</td>
          </tr>))}</tbody>
      </table>
    </>
  );
}
