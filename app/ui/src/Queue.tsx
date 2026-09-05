import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, type Item, type QueueMode } from "./api.ts";

const PAGE = 30;

/** Three panes: what is coming, the text, and the verdict. */
export function Queue({ onVerdict }: { onVerdict: () => void }) {
  const [kind, setKind] = useState<"example" | "theme">("example");
  const [source, setSource] = useState("");
  const [mode, setMode] = useState<QueueMode>("suspects-first");
  const [sources, setSources] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [suspects, setSuspects] = useState(0);
  const [artifact, setArtifact] = useState(false);
  const [note, setNote] = useState("");
  const [last, setLast] = useState<{ verdict: string; artifact: boolean; item: Item } | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const q = await api.queue(kind, source || undefined, mode, PAGE);
    setItems(q.items); setSel(0); setRemaining(q.remaining); setSuspects(q.suspects ?? 0);
  }, [kind, source, mode]);
  useEffect(() => { api.facets().then((f) => setSources(f.sources.map((s) => s.id))); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setArtifact(false); setNote(""); }, [sel, items]);

  const item = items[sel] ?? null;
  const decide = useCallback(async (verdict: "keep" | "pass") => {
    if (!item) return;
    await api.verdict({ kind, target_id: item.id, verdict, artifact, note, method: "queue" });
    setLast({ verdict, artifact, item });
    onVerdict();
    const rest = items.filter((it) => it.id !== item.id);
    if (rest.length < 5) { load(); return; }
    setItems(rest); setSel(Math.min(sel, rest.length - 1)); setRemaining((r) => r - 1);
    if (item.suspect?.length) setSuspects((s) => s - 1);
  }, [item, items, sel, kind, artifact, note, load, onVerdict]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (document.activeElement === noteRef.current) { if (e.key === "Escape") noteRef.current?.blur(); return; }
      if ((e.target as HTMLElement)?.tagName === "SELECT") return;
      if (e.key === "k") decide("keep");
      else if (e.key === "p") decide("pass");
      else if (e.key === "a") setArtifact((v) => !v);
      else if (e.key === "n") { e.preventDefault(); noteRef.current?.focus(); }
      else if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    };
    addEventListener("keydown", f); return () => removeEventListener("keydown", f);
  }, [decide, items.length]);

  const stories = (it: Item) => (it.stories ? (JSON.parse(it.stories) as string[]) : []);
  const pressed = (v: boolean) => (v ? "true" : "false") as "true" | "false";

  return (
    <>
      <div className="pane list">
        <div className="filters">
          <button className="chip" aria-pressed={pressed(kind === "example")} onClick={() => setKind("example")}>passages</button>
          <button className="chip" aria-pressed={pressed(kind === "theme")} onClick={() => setKind("theme")}>themes</button>
          {kind === "example" && <>
            <select className="chip sel" aria-label="Order" value={mode} onChange={(e) => setMode(e.target.value as QueueMode)}><option value="suspects-first">suspects first</option><option value="suspects">suspects only</option><option value="sample">random sample</option></select>
            <select className="chip sel" aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}><option value="">all sources</option>{sources.map((s) => <option key={s}>{s}</option>)}</select>
          </>}
          <span className="dim tnum" style={{ marginLeft: "auto", fontSize: 11.5 }}>{remaining} left{kind === "example" && mode !== "suspects" ? ` · ${suspects} suspect` : ""}</span>
        </div>
        {items.length === 0 && <div className="empty">Nothing unreviewed{source ? ` in ${source}` : ""}.</div>}
        {items.map((it, i) => (
          <div key={it.id} className={"row" + (i === sel ? " on" : "")} onClick={() => setSel(i)}>
            <div className="t">{it.text}</div>
            {kind === "example"
              ? <><span className="w">{it.title} · {it.author || "unknown"}</span>{it.suspect?.length ? <span className="s warn">suspect: {it.suspect.join(", ")}</span> : <span className="s">{it.words}w</span>}</>
              : <><span className="w">{stories(it).join(", ")}</span><span className="s">×{it.attestation}</span></>}
          </div>))}
      </div>

      <div className="pane read">
        {item && <>
          <div className="crumbs">
            {kind === "example" ? <><b>{item.source}</b><span>{item.title}</span><span>{item.author || "unknown"}</span></> : <><b>theme</b><span>attested ×{item.attestation}</span></>}
            <span>{sel + 1} of {items.length} loaded</span>
          </div>
          <p className="passage">{item.text}</p>
        </>}
      </div>

      <aside className="pane insp">
        {item && <>
          <div>
            <h3>{kind === "example" ? "passage" : "theme"}</h3>
            <dl className="facts" style={{ marginTop: ".5rem" }}>
              <dt>id</dt><dd className="mono">{item.id}</dd>
              {kind === "example" ? <>
                <dt>cell</dt><dd className="cell">{item.cell}</dd>
                <dt>words</dt><dd>{item.words}</dd>
                <dt>genre</dt><dd>{item.genre}</dd>
                <dt>suspect</dt><dd className={item.suspect?.length ? "warn" : ""}>{item.suspect?.length ? item.suspect.join(", ") : "—"}</dd>
              </> : <>
                <dt>stories</dt><dd>{stories(item).join(", ")}</dd>
              </>}
            </dl>
          </div>
          <div className="stack">
            <h3>verdict</h3>
            <button className="btn keep" onClick={() => decide("keep")}>keep <kbd>k</kbd></button>
            <button className="btn pass" onClick={() => decide("pass")}>pass <kbd>p</kbd></button>
            <button className="btn art" aria-pressed={pressed(artifact)} onClick={() => setArtifact((v) => !v)}>{artifact ? "artifact ✓" : "artifact"} <kbd>a</kbd></button>
            <textarea ref={noteRef} name="note" placeholder="note… (n)" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); noteRef.current?.blur(); } }} />
          </div>
        </>}
        {last && <div className="foot">last: <b className={last.verdict}>{last.verdict}{last.artifact ? " + artifact" : ""}</b> <span className="mono">{last.item.id}</span><br />{last.item.title ?? last.item.text.slice(0, 60)}{last.item.author ? ` · ${last.item.author}` : ""}</div>}
      </aside>
    </>
  );
}
