import React, { useEffect, useState } from "react";
import { api, type Status } from "./api.ts";
import { Browser } from "./Browser.tsx";
import { Draws } from "./Draws.tsx";

function useHash() {
  const [h, setH] = useState(location.hash.slice(1) || "browse");
  useEffect(() => { const f = () => setH(location.hash.slice(1) || "browse"); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
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
  const [railHidden, setRailHidden] = useState(() => { try { return localStorage.getItem("fb-rail") === "hidden"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem("fb-rail", railHidden ? "hidden" : "shown"); } catch {} }, [railHidden]);
  return (
    <div className={"app" + (railHidden ? " rail-hidden" : "")}>
      <aside className={"rail" + (railHidden ? " hidden" : "")}>
        <button className="railtoggle" aria-pressed={railHidden ? "true" : "false"} aria-label={railHidden ? "Show the sidebar" : "Hide the sidebar"} title={railHidden ? "Show the sidebar" : "Hide the sidebar"} onClick={() => setRailHidden((v) => !v)}>{railHidden ? "›" : "‹"}</button>
        {!railHidden && <>
          <div className="wordmark">Fog Belt<small>ideation pipeline</small></div>
          <nav className="nav" aria-label="Sections">
            <a href="#browse" className={view === "browse" ? "on" : ""}>browse</a>
            <a href="#draws" className={drawsView ? "on" : ""}>ideate {drawsOpen > 0 && <span>{drawsOpen} open</span>}</a>
          </nav>
          {status && <div className="pool"><b>{status.passages_eligible}</b>/{status.passages} passages<br /><b>{status.themes_eligible}</b>/{status.themes} themes<br /><b>{status.verdicts}</b> verdicts</div>}
        </>}
        {railHidden && <nav className="nav mini" aria-label="Sections">
          <a href="#browse" className={view === "browse" ? "on" : ""} title="browse">b</a>
          <a href="#draws" className={drawsView ? "on" : ""} title={"ideate" + (drawsOpen > 0 ? ` · ${drawsOpen} open` : "")}>i{drawsOpen > 0 && <i />}</a>
        </nav>}
      </aside>
      {view === "browse" && <Browser status={status} onVerdict={refresh} />}
      {drawsView && <Draws status={status} selected={view === "draw" ? arg : arg === "new" ? "new" : undefined} />}
    </div>
  );
}
