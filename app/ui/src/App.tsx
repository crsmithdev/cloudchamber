import { useEffect, useState } from "react";
import { api, type Status } from "./api.ts";
import { Browser } from "./Browser.tsx";
import { Draws } from "./Draws.tsx";
import { Develop } from "./Develop.tsx";
import { Icon } from "./ui.tsx";

function useHash() {
  const [h, setH] = useState(location.hash.slice(1) || "browse");
  useEffect(() => {
    const f = () => setH(location.hash.slice(1) || "browse");
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return h;
}

const TABS: [string, string][] = [
  ["browse", "#browse"],
  ["ideate", "#draws"],
  ["check", "#check"],
  ["write", "#write"],
];

export function App() {
  const hash = useHash();
  const [status, setStatus] = useState<Status | null>(null);
  const refresh = () =>
    api
      .status()
      .then(setStatus)
      .catch(() => {});
  useEffect(() => {
    refresh();
  }, [hash]);
  const [view, arg, arg2] = hash.split("/");
  const drawsView = view === "draws" || view === "draw";
  // `develop` was check and write in one tab; an old link lands wherever its draw is now
  useEffect(() => {
    if (view !== "develop") return;
    if (!arg) {
      location.hash = "#check";
      return;
    }
    api
      .draw(arg)
      .then((d) => {
        location.hash = `#${d.draw.stage === "ideate" ? "draw" : d.draw.stage}/${arg}`;
      })
      .catch(() => {
        location.hash = "#check";
      });
  }, [view, arg]);
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem("fb-rail") === "hidden";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("fb-rail", folded ? "hidden" : "shown");
    } catch {}
  }, [folded]);
  const on = (name: string) => (name === "ideate" ? drawsView : view === name);
  const count = (name: string) => {
    if (!status) return null;
    const n =
      name === "ideate"
        ? status.draws.filter((d) => d.status === "awaiting_gate").reduce((a, d) => a + d.n, 0)
        : name === "check"
          ? status.draws.filter((d) => d.status === "awaiting_check_gate" || d.status === "done").reduce((a, d) => a + d.n, 0)
          : name === "write"
            ? status.draws.filter((d) => d.status === "awaiting_draft_gate").reduce((a, d) => a + d.n, 0)
            : 0;
    return n ? <span>{n}</span> : null;
  };
  return (
    <div className={"shell" + (folded ? " folded" : "")}>
      <aside className={"rail" + (folded ? " folded" : "")}>
        {!folded && (
          <>
            <div className="px-2 font-serif text-mark font-medium">
              Cloud
              <br />
              Chamber
            </div>
            <nav className="flex flex-col" aria-label="Sections">
              {TABS.map(([name, href]) => (
                <a key={name} href={href} className={"navlink" + (on(name) ? " on" : "")}>
                  {name}
                  {count(name)}
                </a>
              ))}
            </nav>
          </>
        )}
        {folded && (
          <nav className="flex flex-col items-center gap-1" aria-label="Sections">
            {TABS.map(([name, href]) => (
              <a key={name} href={href} className={"navlink mini" + (on(name) ? " on" : "")} title={name}>
                {name[0]}
              </a>
            ))}
          </nav>
        )}
        <button
          className="link mt-auto grid h-8 w-8 place-items-center self-start"
          aria-pressed={folded ? "true" : "false"}
          aria-label={folded ? "Show the sidebar" : "Hide the sidebar"}
          title={folded ? "Show the sidebar" : "Hide the sidebar"}
          onClick={() => setFolded((v) => !v)}
        >
          <Icon name={folded ? "keyboard_double_arrow_right" : "keyboard_double_arrow_left"} className="text-dim" />
        </button>
      </aside>
      {view === "browse" && <Browser status={status} onVerdict={refresh} />}
      {drawsView && <Draws status={status} selected={view === "draw" ? arg : arg === "new" ? "new" : undefined} like={arg === "new" ? arg2 : undefined} />}
      {view === "check" && <Develop stage="check" selected={arg} />}
      {view === "write" && <Develop stage="write" selected={arg} />}
    </div>
  );
}
