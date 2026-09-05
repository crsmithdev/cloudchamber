import React, { useEffect, useState } from "react";
import { api, type Facets, type Item, type Status } from "./api.ts";

const PAGE = 25;
type Kind = "example" | "story" | "theme" | "brief";

/** Facets on the left, the table across the rest. */
export function Browser({ status, onVerdict }: { status: Status | null; onVerdict: () => void }) {
  const [kind, setKind] = useState<Kind>("example");
  const [f, setF] = useState<Record<string, string>>({ verdict: "unreviewed" });
  const [facets, setFacets] = useState<Facets | null>(null);
  const [res, setRes] = useState<{ total: number; items: Item[] }>({ total: 0, items: [] });
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api.facets().then(setFacets); }, []);
  const query = () => api.items({ kind, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), limit: String(PAGE), offset: String(offset) });
  useEffect(() => { query().then(setRes); }, [kind, f, offset]);
  const set = (k: string, v: string) => { setOffset(0); setF({ ...f, [k]: f[k] === v ? "" : v }); };
  const decide = async (it: Item, verdict: "keep" | "pass", artifact = false) => {
    await api.verdict({ kind, target_id: it.id, verdict, artifact, note: "", method: "browse" });
    onVerdict(); setRes(await query());
  };
  const pressed = (v: boolean) => (v ? "true" : "false") as "true" | "false";
  const Opt = ({ k, v, label, n }: { k: string; v: string; label?: string; n?: number }) => (
    <button className={"opt" + ((f[k] ?? "") === v ? " on" : "")} onClick={() => set(k, v)}>{label ?? v}{n !== undefined && <span>{n}</span>}</button>
  );
  const bySource = new Map(status?.per_source.map((s) => [s.source, s]) ?? []);
  const withItems = kind === "example" || kind === "story";
  const label: Record<Kind, string> = { example: "passages", story: "stories", theme: "themes", brief: "briefs" };

  return (
    <>
      <div className="pane list">
        <div className="filters">
          {(["example", "story", "theme", "brief"] as Kind[]).map((k) => <button key={k} className="chip" aria-pressed={pressed(kind === k)} onClick={() => { setKind(k); setF({}); setOffset(0); }}>{label[k]}</button>)}
        </div>
        {withItems && facets && <>
          <div className="facet"><h3>source</h3><Opt k="source" v="" label="all" n={status?.passages} />{facets.sources.map((s) => <Opt key={s.id} k="source" v={s.id} n={kind === "example" ? bySource.get(s.id)?.n : undefined} />)}</div>
          <div className="facet"><h3>author</h3><select value={f.author ?? ""} onChange={(e) => { setOffset(0); setF({ ...f, author: e.target.value }); }}><option value="">any author</option>{facets.authors.map((a) => <option key={a}>{a}</option>)}</select></div>
          <div className="facet"><h3>genre</h3><Opt k="genre" v="horror" /><Opt k="genre" v="scifi" /></div>
        </>}
        <div className="facet"><h3>verdict</h3><Opt k="verdict" v="" label="any" /><Opt k="verdict" v="unreviewed" /><Opt k="verdict" v="keep" /><Opt k="verdict" v="pass" /></div>
        {kind !== "story" && <div className="facet"><h3>artifact</h3><Opt k="artifact" v="true" label="flagged" /><Opt k="artifact" v="false" label="not flagged" /></div>}
        {kind === "example" && facets && <>
          <div className="facet"><h3>voice / mode</h3>{facets.cells.map((c) => <Opt key={c.cell} k="cell" v={c.cell} n={c.n} />)}</div>
          <div className="facet"><h3>suspect</h3><Opt k="suspect" v="true" label="suspect" n={status?.passages_suspect} /><Opt k="suspect" v="false" label="clean" /></div>
        </>}
      </div>

      <div className="pane read wide">
        <div className="tblhead">
          <b className="tnum">{res.total} {label[kind]}</b>
          <span>{Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") || "no filters"}</span>
          <span className="pg">
            <button className="btn quiet sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>prev</button>
            {res.total > 0 ? `${offset + 1}–${Math.min(offset + PAGE, res.total)}` : "0"}
            <button className="btn quiet sm" disabled={offset + PAGE >= res.total} onClick={() => setOffset(offset + PAGE)}>next</button>
          </span>
        </div>
        <div className="tblwrap"><table>
          {kind === "story" && <caption>A passed story hides all its passages from the queue, the bank and the draw.</caption>}
          <thead><tr><th>{kind === "story" ? "story" : "text"}</th><th>where</th><th>cell</th><th>verdict</th><th></th></tr></thead>
          <tbody>{res.items.map((it) => (
            <tr key={it.id} className="item" onClick={() => setOpen(open === it.id ? null : it.id)}>
              <td className={"t" + (open === it.id ? " open" : "")}>{open === it.id ? it.text : it.text.slice(0, 160) + (it.text.length > 160 ? "…" : "")}</td>
              <td className="w">{kind === "example" ? <><b>{it.title}</b>{it.author} · {it.source} · {it.words}w</>
                : kind === "story" ? <><b>{it.title}</b>{it.author} · {it.source} · {it.words}w · {it.passages} passages</>
                : kind === "theme" ? <><b>×{it.attestation}</b>{it.stories && JSON.parse(it.stories).join(", ")}</>
                : <><b>{it.setting ?? "unrestricted"} · {it.genre}</b><a href={`#draw/${it.id}`} className="mono">{it.id}</a></>}</td>
              <td className="c">{it.cell && <span className="cell">{it.cell}</span>}{it.suspect?.length ? <div className="warn" style={{ fontSize: 11.5 }}>{it.suspect.join(", ")}</div> : null}</td>
              <td className="v">{it.latest ? <><span className={it.latest.verdict}>{it.latest.verdict}</span>{it.latest.artifact && <span className="art"> · artifact</span>}{it.latest.inherited_from && <span className="dim"> · inherited</span>}{it.latest.note && <div className="dim">{it.latest.note}</div>}</> : <span className="dim">—</span>}</td>
              <td className="a" onClick={(e) => e.stopPropagation()}>
                <button aria-label="Keep" onClick={() => decide(it, "keep")}>k</button>
                <button aria-label="Pass" onClick={() => decide(it, "pass")}>p</button>
                {kind !== "story" && <button aria-label="Toggle artifact" onClick={() => decide(it, it.latest?.verdict ?? "keep", !it.latest?.artifact)}>a</button>}
              </td>
            </tr>))}</tbody>
        </table></div>
        {res.items.length === 0 && <div className="empty">Nothing matches these filters.</div>}
      </div>
    </>
  );
}
