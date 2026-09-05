import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, type Item, type QueueMode } from "./api.ts";

export function Queue() {
  const [kind, setKind] = useState<"example" | "theme">("example");
  const [source, setSource] = useState("");
  const [mode, setMode] = useState<QueueMode>("suspects-first");
  const [sources, setSources] = useState<string[]>([]);
  const [item, setItem] = useState<Item | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [suspects, setSuspects] = useState(0);
  const [artifact, setArtifact] = useState(false);
  const [note, setNote] = useState("");
  const [last, setLast] = useState<string>("");
  const noteRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const q = await api.queue(kind, source || undefined, mode);
    setItem(q.items[0] ?? null); setRemaining(q.remaining); setSuspects(q.suspects ?? 0); setArtifact(false); setNote("");
  }, [kind, source, mode]);
  useEffect(() => { api.facets().then((f) => setSources(f.sources.map((s) => s.id))); }, []);
  useEffect(() => { load(); }, [load]);

  const decide = useCallback(async (verdict: "keep" | "pass") => {
    if (!item) return;
    await api.verdict({ kind, target_id: item.id, verdict, artifact, note, method: "queue" });
    setLast(`${verdict}${artifact ? " + artifact" : ""} · ${item.id}`);
    load();
  }, [item, kind, artifact, note, load]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (document.activeElement === noteRef.current) { if (e.key === "Escape") noteRef.current?.blur(); return; }
      if (e.key === "k") decide("keep");
      else if (e.key === "p") decide("pass");
      else if (e.key === "a") setArtifact((v) => !v);
      else if (e.key === "n") { e.preventDefault(); noteRef.current?.focus(); }
    };
    addEventListener("keydown", f); return () => removeEventListener("keydown", f);
  }, [decide]);

  return (
    <>
      <div className="row meta">
        <select value={kind} onChange={(e) => setKind(e.target.value as any)}><option value="example">examples</option><option value="theme">themes</option></select>
        {kind === "example" && <select value={source} onChange={(e) => setSource(e.target.value)}><option value="">all sources</option>{sources.map((s) => <option key={s}>{s}</option>)}</select>}
        {kind === "example" && <select value={mode} onChange={(e) => setMode(e.target.value as QueueMode)}><option value="suspects-first">suspects first</option><option value="suspects">suspects only</option><option value="sample">random sample</option></select>}
        <span>{remaining} unreviewed{kind === "example" && mode !== "suspects" ? ` · ${suspects} suspect` : ""}</span>
        <span style={{ marginLeft: "auto" }}><span className="kbd">k</span>keep <span className="kbd">p</span>pass <span className="kbd">a</span>artifact <span className="kbd">n</span>note</span>
      </div>
      {!item ? <div className="card meta">Nothing unreviewed{source ? ` in ${source}` : ""}.</div> : (
        <div className="card">
          <div className="meta">{kind === "example" ? <>{item.source} · {item.title} — {item.author || "unknown"} · {item.genre} · <code>{item.cell}</code> · {item.words}w · {item.id}{item.suspect?.length ? <span className="warn"> · suspect: {item.suspect.join(", ")}</span> : null}</> : <>×{item.attestation} · {item.stories && JSON.parse(item.stories).join(", ")} · {item.id}</>}</div>
          <p className="passage">{item.text}</p>
          <div className="row">
            <button className="keep" onClick={() => decide("keep")}>keep</button>
            <button className="pass" onClick={() => decide("pass")}>pass</button>
            <button className={"flag" + (artifact ? " on" : "")} onClick={() => setArtifact((v) => !v)}>{artifact ? "artifact ✓" : "artifact"}</button>
            <input ref={noteRef} placeholder="note" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") noteRef.current?.blur(); }} style={{ flex: 1, minWidth: "12rem" }} />
          </div>
        </div>
      )}
      {last && <div className="meta">last: {last}</div>}
    </>
  );
}
