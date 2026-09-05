import React, { useEffect, useState } from "react";
import { api, type Status } from "./api.ts";
import { Queue } from "./Queue.tsx";
import { Browser } from "./Browser.tsx";
import { Draws } from "./Draws.tsx";

function useHash() {
  const [h, setH] = useState(location.hash.slice(1) || "queue");
  useEffect(() => { const f = () => setH(location.hash.slice(1) || "queue"); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return h;
}

export function App() {
  const hash = useHash();
  const [status, setStatus] = useState<Status | null>(null);
  const refresh = () => api.status().then(setStatus).catch(() => {});
  useEffect(() => { refresh(); }, [hash]);
  const [view, arg] = hash.split("/");
  const drawsView = view === "draws" || view === "draw";
  const drawsOpen = status?.draws.filter((r) => r.status === "awaiting_gate" || r.status === "running").reduce((a, r) => a + r.n, 0) ?? 0;
  return (
    <div className="app">
      <aside className="rail">
        <div className="wordmark">Fog Belt<small>ideation pipeline</small></div>
        <nav className="nav" aria-label="Sections">
          <a href="#queue" className={view === "queue" ? "on" : ""}>queue</a>
          <a href="#browse" className={view === "browse" ? "on" : ""}>browse</a>
          <a href="#draws" className={drawsView ? "on" : ""}>draws {drawsOpen > 0 && <span>{drawsOpen} open</span>}</a>
        </nav>
        {status && <div className="pool"><b>{status.passages_eligible}</b>/{status.passages} passages<br /><b>{status.themes_eligible}</b>/{status.themes} themes<br /><b>{status.verdicts}</b> verdicts</div>}
      </aside>
      {view === "queue" && <Queue onVerdict={refresh} />}
      {view === "browse" && <Browser status={status} onVerdict={refresh} />}
      {drawsView && <Draws status={status} selected={view === "draw" ? arg : arg === "new" ? "new" : undefined} />}
    </div>
  );
}
