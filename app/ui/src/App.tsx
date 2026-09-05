import React, { useEffect, useState } from "react";
import { api } from "./api.ts";
import { Queue } from "./Queue.tsx";
import { Browser } from "./Browser.tsx";
import { Runs } from "./Runs.tsx";
import { RunDetail } from "./RunDetail.tsx";

function useHash() {
  const [h, setH] = useState(location.hash.slice(1) || "queue");
  useEffect(() => { const f = () => setH(location.hash.slice(1) || "queue"); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return h;
}

export function App() {
  const hash = useHash();
  const [status, setStatus] = useState<any>(null);
  useEffect(() => { api.status().then(setStatus).catch(() => {}); }, [hash]);
  const view = hash.split("/")[0];
  return (
    <>
      <nav>
        <a href="#queue" className={view === "queue" ? "on" : ""}>Queue</a>
        <a href="#browse" className={view === "browse" ? "on" : ""}>Browse</a>
        <a href="#runs" className={view === "runs" || view === "run" ? "on" : ""}>Runs</a>
        {status && <span className="status">{status.passages_eligible}/{status.passages} passages · {status.themes_eligible}/{status.themes} themes · {status.verdicts} verdicts</span>}
      </nav>
      <main>
        {view === "queue" && <Queue />}
        {view === "browse" && <Browser />}
        {view === "runs" && <Runs />}
        {view === "run" && <RunDetail id={hash.split("/")[1]} />}
      </main>
    </>
  );
}
