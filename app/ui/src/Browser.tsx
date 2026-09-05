import React, { useEffect, useState } from "react";
import { api, type Item } from "./api.ts";

export function Browser() {
  const [kind, setKind] = useState("example");
  const [f, setF] = useState<Record<string, string>>({});
  const [facets, setFacets] = useState<any>(null);
  const [res, setRes] = useState<{ total: number; items: Item[] }>({ total: 0, items: [] });
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api.facets().then(setFacets); }, []);
  useEffect(() => { api.items({ kind, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), limit: "25", offset: String(offset) }).then(setRes); }, [kind, f, offset]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLSelectElement>) => { setOffset(0); setF({ ...f, [k]: e.target.value }); };
  const decide = async (it: Item, verdict: "keep" | "pass", artifact = false) => {
    await api.verdict({ kind, target_id: it.id, verdict, artifact, note: "", method: "browse" });
    setRes(await api.items({ kind, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), limit: "25", offset: String(offset) }));
  };
  return (
    <>
      <div className="row meta">
        <select value={kind} onChange={(e) => { setKind(e.target.value); setF({}); setOffset(0); }}><option value="example">examples</option><option value="story">stories</option><option value="theme">themes</option><option value="packet">packets</option></select>
        {(kind === "example" || kind === "story") && facets && <>
          <select value={f.source ?? ""} onChange={set("source")}><option value="">source</option>{facets.sources.map((s: any) => <option key={s.id} value={s.id}>{s.id}</option>)}</select>
          <select value={f.author ?? ""} onChange={set("author")}><option value="">author</option>{facets.authors.map((a: string) => <option key={a}>{a}</option>)}</select>
          <select value={f.genre ?? ""} onChange={set("genre")}><option value="">genre</option><option>horror</option><option>scifi</option></select>
        </>}
        {kind === "example" && facets && <>
          <select value={f.cell ?? ""} onChange={set("cell")}><option value="">voice/mode</option>{facets.cells.map((c: any) => <option key={c.cell} value={c.cell}>{c.cell} ({c.n})</option>)}</select>
          <select value={f.suspect ?? ""} onChange={set("suspect")}><option value="">suspect?</option><option value="true">suspect</option><option value="false">clean</option></select>
        </>}
        <select value={f.verdict ?? ""} onChange={set("verdict")}><option value="">any verdict</option><option value="unreviewed">unreviewed</option><option value="keep">keep</option><option value="pass">pass</option></select>
        {kind !== "story" && <select value={f.artifact ?? ""} onChange={set("artifact")}><option value="">artifact?</option><option value="true">flagged</option><option value="false">not flagged</option></select>}
        <span style={{ marginLeft: "auto" }}>{res.total} items</span>
      </div>
      <table>
        {kind === "story" && <caption className="meta" style={{ textAlign: "left", paddingBottom: ".5rem" }}>A passed story hides all its passages from the queue, the bank and the draw.</caption>}
        <thead><tr><th style={{ width: "40%" }}>{kind === "story" ? "story" : "text"}</th><th>where</th><th>cell</th><th>verdict</th><th></th></tr></thead>
        <tbody>{res.items.map((it) => (
          <tr key={it.id} onClick={() => setOpen(open === it.id ? null : it.id)} style={{ cursor: "pointer" }}>
            <td className={open === it.id ? "passage" : ""} style={open === it.id ? { fontSize: 15 } : {}}>{open === it.id ? it.text : it.text.slice(0, 140) + (it.text.length > 140 ? "…" : "")}</td>
            <td className="meta">{kind === "example" ? <>{it.source}<br />{it.title} — {it.author}</> : kind === "story" ? <>{it.source} · {it.author}<br />{it.words}w · {it.passages} passages</> : kind === "theme" ? <>×{it.attestation}<br />{it.stories && JSON.parse(it.stories).join(", ")}</> : <>{it.setting ?? "unrestricted"} · {it.genre}<br /><a href={`#run/${it.id}`}>{it.id}</a></>}</td>
            <td><code>{it.cell ?? ""}</code>{it.suspect?.length ? <div className="warn meta">{it.suspect.join(", ")}</div> : null}</td>
            <td>{it.latest ? <span className={`verdict-${it.latest.verdict}`}>{it.latest.verdict}{it.latest.artifact && <span className="artifact"> · artifact</span>}{it.latest.inherited_from && <span className="meta"> · inherited</span>}{it.latest.note && <div className="meta">{it.latest.note}</div>}</span> : <span className="meta">—</span>}</td>
            <td className="row" onClick={(e) => e.stopPropagation()}><button className="keep" onClick={() => decide(it, "keep")}>k</button><button className="pass" onClick={() => decide(it, "pass")}>p</button>{kind !== "story" && <button className="flag" onClick={() => decide(it, it.latest?.verdict ?? "keep", !it.latest?.artifact)}>a</button>}</td>
          </tr>))}</tbody>
      </table>
      <div className="row meta" style={{ marginTop: "1rem" }}>
        <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>prev</button>
        <span>{offset + 1}–{Math.min(offset + 25, res.total)}</span>
        <button disabled={offset + 25 >= res.total} onClick={() => setOffset(offset + 25)}>next</button>
      </div>
    </>
  );
}
