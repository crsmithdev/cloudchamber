import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, type Facets, type Item, type Status } from "./api.ts";

const PAGE = 25;
type Kind = "example" | "story" | "theme" | "brief";
type Order = "suspects" | "shuffle" | "source";
const KIND_LABEL: Record<Kind, string> = { example: "passages", story: "stories", theme: "themes", brief: "briefs" };

/**
 * The one review surface. Facets on the left, the table across the rest. The
 * selected row opens to its full text and its verdict controls; the keyboard
 * moves the selection and records verdicts, so an unreviewed filter is a queue.
 */
export function Browser({ status, onVerdict }: { status: Status | null; onVerdict: () => void }) {
  const [kind, setKind] = useState<Kind>("example");
  const [f, setF] = useState<Record<string, string>>({ verdict: "unreviewed" });
  const [order, setOrder] = useState<Order>("suspects");
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  const [facets, setFacets] = useState<Facets | null>(null);
  const [res, setRes] = useState<{ total: number; items: Item[] }>({ total: 0, items: [] });
  const [offset, setOffset] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [pendingArt, setPendingArt] = useState(false);
  const [note, setNote] = useState("");
  const [hideFacets, setHideFacets] = useState(() => { try { return localStorage.getItem("fb-facets") === "hidden"; } catch { return false; } });
  const noteRef = useRef<HTMLInputElement>(null);
  const selRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => { api.facets().then(setFacets); }, []);
  useEffect(() => { try { localStorage.setItem("fb-facets", hideFacets ? "hidden" : "shown"); } catch {} }, [hideFacets]);
  const query = useCallback(() => api.items({
    kind, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)),
    order: kind === "example" ? order : "source", seed: String(seed), limit: String(PAGE), offset: String(offset),
  }), [kind, f, order, seed, offset]);
  useEffect(() => { query().then(setRes); }, [query]);
  useEffect(() => { setPendingArt(false); setNote(""); }, [sel, res.items[sel ?? -1]?.id]);
  useEffect(() => { selRef.current?.scrollIntoView({ block: "nearest" }); }, [sel]);

  const selected = sel !== null ? res.items[sel] ?? null : null;
  const set = (k: string, v: string) => { setOffset(0); setSel(null); setF({ ...f, [k]: f[k] === v ? "" : v }); };
  const switchKind = (k: Kind) => { setKind(k); setF(k === "brief" ? {} : { verdict: "unreviewed" }); setOffset(0); setSel(null); };

  const decide = useCallback(async (it: Item, verdict: "keep" | "pass", artifact = false) => {
    await api.verdict({ kind, target_id: it.id, verdict, artifact, note: it.id === selected?.id ? note : "", method: "browse" });
    onVerdict();
    const r = await query();
    setRes(r);
    // Under an unreviewed filter the decided row leaves and the next one takes its index: the selection advances by itself.
    setSel((s) => (s === null ? null : r.items.length === 0 ? null : Math.min(s, r.items.length - 1)));
  }, [kind, note, selected, query, onVerdict]);

  const move = (d: number) => {
    if (res.items.length === 0) return;
    const next = (sel ?? -1) + d;
    if (next >= res.items.length) { if (offset + PAGE < res.total) { setOffset(offset + PAGE); setSel(0); } return; }
    if (next < 0) { if (offset > 0) { setOffset(Math.max(0, offset - PAGE)); setSel(PAGE - 1); } return; }
    setSel(next);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName)) { if (e.key === "Escape") t.blur(); return; }
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Escape") setSel(null);
      else if (e.key === "f") setHideFacets((v) => !v);
      else if (!selected) return;
      else if (e.key === "k") decide(selected, "keep", pendingArt);
      else if (e.key === "p") decide(selected, "pass", pendingArt);
      else if (e.key === "a" && kind !== "story") { if (selected.latest) decide(selected, selected.latest.verdict, !selected.latest.artifact); else setPendingArt((v) => !v); }
      else if (e.key === "n") { e.preventDefault(); noteRef.current?.focus(); }
    };
    addEventListener("keydown", h); return () => removeEventListener("keydown", h);
  }, [selected, pendingArt, decide, kind, sel, res, offset]);

  const pressed = (v: boolean) => (v ? "true" : "false") as "true" | "false";
  const Opt = ({ k, v, label, n }: { k: string; v: string; label?: string; n?: number }) => (
    <button className={"opt" + ((f[k] ?? "") === v ? " on" : "")} onClick={() => set(k, v)}>{label ?? v}{n !== undefined && <span>{n}</span>}</button>
  );
  const bySource = new Map(status?.per_source.map((s) => [s.source, s]) ?? []);
  const withItems = kind === "example" || kind === "story";
  const active = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  if (kind === "example" && order !== "source") active.push(order === "suspects" ? "suspects first" : "shuffled");

  return (
    <>
      {!hideFacets && <div className="pane list">
        <div className="filters">
          {(["example", "story", "theme", "brief"] as Kind[]).map((k) => <button key={k} className="chip" aria-pressed={pressed(kind === k)} onClick={() => switchKind(k)}>{KIND_LABEL[k]}</button>)}
        </div>
        {kind === "example" && <div className="facet"><h3>order</h3>
          <button className={"opt" + (order === "suspects" ? " on" : "")} onClick={() => { setOrder("suspects"); setOffset(0); setSel(null); }}>suspects first</button>
          <button className={"opt" + (order === "shuffle" ? " on" : "")} onClick={() => { setOrder("shuffle"); setOffset(0); setSel(null); }}>shuffled</button>
          <button className={"opt" + (order === "source" ? " on" : "")} onClick={() => { setOrder("source"); setOffset(0); setSel(null); }}>source order</button>
        </div>}
        {withItems && facets && <>
          <div className="facet"><h3>source</h3><Opt k="source" v="" label="all" n={status?.passages} />{facets.sources.map((s) => <Opt key={s.id} k="source" v={s.id} n={kind === "example" ? bySource.get(s.id)?.n : undefined} />)}</div>
          <div className="facet"><h3>author</h3><select value={f.author ?? ""} onChange={(e) => { setOffset(0); setSel(null); setF({ ...f, author: e.target.value }); }}><option value="">any author</option>{facets.authors.map((a) => <option key={a}>{a}</option>)}</select></div>
          <div className="facet"><h3>genre</h3><Opt k="genre" v="horror" /><Opt k="genre" v="scifi" /></div>
        </>}
        <div className="facet"><h3>verdict</h3><Opt k="verdict" v="" label="any" /><Opt k="verdict" v="unreviewed" /><Opt k="verdict" v="keep" /><Opt k="verdict" v="pass" /></div>
        {kind !== "story" && <div className="facet"><h3>artifact</h3><Opt k="artifact" v="true" label="flagged" /><Opt k="artifact" v="false" label="not flagged" /></div>}
        {kind === "example" && facets && <>
          <div className="facet"><h3>voice / mode</h3>{facets.cells.map((c) => <Opt key={c.cell} k="cell" v={c.cell} n={c.n} />)}</div>
          <div className="facet"><h3>suspect</h3><Opt k="suspect" v="true" label="suspect" n={status?.passages_suspect} /><Opt k="suspect" v="false" label="clean" /></div>
        </>}
      </div>}

      <div className={"pane read wide" + (hideFacets ? " full" : "")}>
        <div className="tblhead">
          <button className="toggle" aria-pressed={pressed(!hideFacets)} title="Show or hide the filters (f)" onClick={() => setHideFacets((v) => !v)}>{hideFacets ? "filters ›" : "‹ filters"}</button>
          <b className="tnum">{res.total} {KIND_LABEL[kind]}</b>
          <span>{active.join(" · ") || "no filters"}</span>
          <span className="keys"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>k</kbd> keep</span><span><kbd>p</kbd> pass</span>{kind !== "story" && <span><kbd>a</kbd> artifact</span>}<span><kbd>n</kbd> note</span></span>
          <span className="pg">
            <button className="btn quiet sm" disabled={offset === 0} onClick={() => { setOffset(Math.max(0, offset - PAGE)); setSel(null); }}>prev</button>
            {res.total > 0 ? `${offset + 1}–${Math.min(offset + PAGE, res.total)}` : "0"}
            <button className="btn quiet sm" disabled={offset + PAGE >= res.total} onClick={() => { setOffset(offset + PAGE); setSel(null); }}>next</button>
          </span>
        </div>
        <div className="tblwrap"><table>
          {kind === "story" && <caption>A passed story hides all its passages from the bank and the draw.</caption>}
          <thead><tr><th>{kind === "story" ? "story" : "text"}</th><th>where</th><th>cell</th><th>verdict</th><th></th></tr></thead>
          <tbody>{res.items.map((it, i) => {
            const on = sel === i;
            return (
              <tr key={it.id} ref={on ? selRef : undefined} className={"item" + (on ? " on" : "")} onClick={() => setSel(on ? null : i)}>
                <td className={"t" + (on ? " open" : "")}>
                  {on ? it.text : it.text.slice(0, 160) + (it.text.length > 160 ? "…" : "")}
                  {on && <div className="rowtools" onClick={(e) => e.stopPropagation()}>
                    <button className="btn sm keep" onClick={() => decide(it, "keep", pendingArt)}>keep <kbd>k</kbd></button>
                    <button className="btn sm pass" onClick={() => decide(it, "pass", pendingArt)}>pass <kbd>p</kbd></button>
                    {kind !== "story" && (it.latest
                      ? <button className="btn sm art" onClick={() => decide(it, it.latest!.verdict, !it.latest!.artifact)}>{it.latest.artifact ? "unflag artifact" : "artifact"} <kbd>a</kbd></button>
                      : <button className="btn sm art" aria-pressed={pressed(pendingArt)} onClick={() => setPendingArt((v) => !v)}>{pendingArt ? "artifact ✓" : "artifact"} <kbd>a</kbd></button>)}
                    <input ref={noteRef} type="text" name="note" autoComplete="off" placeholder="note… (n)" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") noteRef.current?.blur(); }} />
                    {kind === "brief" && <a href={`#draw/${it.id}`} className="mono dim">open draw</a>}
                  </div>}
                </td>
                <td className="w">{kind === "example" ? <><b>{it.title}</b>{it.author} · {it.source} · {it.words}w</>
                  : kind === "story" ? <><b>{it.title}</b>{it.author} · {it.source} · {it.words}w · {it.passages} passages</>
                  : kind === "theme" ? <><b>×{it.attestation}</b>{it.stories && JSON.parse(it.stories).join(", ")}</>
                  : <><b>{it.setting ?? "unrestricted"} · {it.genre}</b><a href={`#draw/${it.id}`} className="mono">{it.id}</a></>}</td>
                <td className="c">{it.cell && <span className="cell">{it.cell}</span>}{it.suspect?.length ? <div className="warn" style={{ fontSize: 11.5 }}>{it.suspect.join(", ")}</div> : null}</td>
                <td className="v">{it.latest ? <><span className={it.latest.verdict}>{it.latest.verdict}</span>{it.latest.artifact && <span className="art"> · artifact</span>}{it.latest.inherited_from && <span className="dim"> · inherited</span>}{it.latest.note && <div className="dim">{it.latest.note}</div>}</> : <span className="dim">—</span>}</td>
                <td className="a" onClick={(e) => e.stopPropagation()}>{!on && <>
                  <button aria-label="Keep" onClick={() => decide(it, "keep")}>k</button>
                  <button aria-label="Pass" onClick={() => decide(it, "pass")}>p</button>
                  {kind !== "story" && <button aria-label="Toggle artifact" onClick={() => decide(it, it.latest?.verdict ?? "keep", !it.latest?.artifact)}>a</button>}
                </>}</td>
              </tr>);
          })}</tbody>
        </table></div>
        {res.items.length === 0 && <div className="empty">Nothing matches these filters.</div>}
      </div>
    </>
  );
}
