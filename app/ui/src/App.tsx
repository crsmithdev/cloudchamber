import React, { useEffect, useState } from "react";
import { api, type Status } from "./api.ts";
import { Browser } from "./Browser.tsx";
import { Draws } from "./Draws.tsx";
import { Develop } from "./Develop.tsx";

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
  const [view, arg, arg2] = hash.split("/");
  const drawsView = view === "draws" || view === "draw";
  // `develop` was check and write in one tab; an old link lands wherever its draw is now
  useEffect(() => {
    if (view !== "develop") return;
    if (!arg) { location.hash = "#check"; return; }
    api.draw(arg).then((d) => { location.hash = `#${d.draw.stage === "ideate" ? "draw" : d.draw.stage}/${arg}`; }).catch(() => { location.hash = "#check"; });
  }, [view, arg]);
  const [railHidden, setRailHidden] = useState(() => { try { return localStorage.getItem("fb-rail") === "hidden"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem("fb-rail", railHidden ? "hidden" : "shown"); } catch {} }, [railHidden]);
  const tab = (name: string, href: string, on: boolean) => <a key={name} href={href} className={on ? "on" : ""}>{name}</a>;
  return (
    <div className={"app" + (railHidden ? " rail-hidden" : "")}>
      <aside className={"rail" + (railHidden ? " hidden" : "")}>
        <button className="railtoggle" aria-pressed={railHidden ? "true" : "false"} aria-label={railHidden ? "Show the sidebar" : "Hide the sidebar"} title={railHidden ? "Show the sidebar" : "Hide the sidebar"} onClick={() => setRailHidden((v) => !v)}>
          <span className="icon" aria-hidden="true">{railHidden ? "chevron_right" : "chevron_left"}</span>
        </button>
        {!railHidden && <>
          <div className="wordmark">Cloud Chamber<small>ideation pipeline</small></div>
          <nav className="nav" aria-label="Sections">
            {tab("browse", "#browse", view === "browse")}
            {tab("ideate", "#draws", drawsView)}
            {tab("check", "#check", view === "check")}
            {tab("write", "#write", view === "write")}
          </nav>
          {status && <div className="pool"><b>{status.passages_eligible}</b>/{status.passages} passages<br /><b>{status.themes_eligible}</b>/{status.themes} themes</div>}
        </>}
        {railHidden && <nav className="nav mini" aria-label="Sections">
          <a href="#browse" className={view === "browse" ? "on" : ""} title="browse">b</a>
          <a href="#draws" className={drawsView ? "on" : ""} title="ideate">i</a>
          <a href="#check" className={view === "check" ? "on" : ""} title="check">c</a>
          <a href="#write" className={view === "write" ? "on" : ""} title="write">w</a>
        </nav>}
      </aside>
      {view === "browse" && <Browser status={status} onVerdict={refresh} />}
      {drawsView && <Draws status={status} selected={view === "draw" ? arg : arg === "new" ? "new" : undefined} like={arg === "new" ? arg2 : undefined} />}
      {view === "check" && <Develop stage="check" selected={arg} />}
      {view === "write" && <Develop stage="write" selected={arg} />}
    </div>
  );
}
