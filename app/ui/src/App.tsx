import { useEffect, useState } from "react";
import { api, type Status } from "./api.ts";
import { Browser } from "./Browser.tsx";
import { Draws } from "./Draws.tsx";
import { Develop } from "./Develop.tsx";
import { Icon } from "./ui.tsx";

function useHash() {
  const [h, setH] = useState(location.hash.slice(1) || "draws");
  useEffect(() => {
    const f = () => setH(location.hash.slice(1) || "draws");
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return h;
}

/** The logo: an unseen seed turns visible at the gold vertex and splits into two spirals. */
function Logo({ label }: { label?: string }) {
  return (
    <svg className="logo" viewBox="-2 20 100 58" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : "true"}>
      <path d="M34 54 A30 30 0 0 1 94 54 A20 20 0 0 1 54 54 A10 10 0 0 1 74 54" />
      <path d="M34 54 A16 16 0 0 0 2 54 A8 8 0 0 0 18 54" />
      <circle cx="34" cy="54" r="11" />
    </svg>
  );
}

const TABS: [string, string][] = [
  ["ideate", "#draws"],
  ["check", "#check"],
  ["write", "#write"],
];
/** Below the pipeline tabs, after a separator: the corpus the draws pull from. */
const SOURCES: [string, string] = ["sources", "#sources"];

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
  // `#go/<draw>` names a draw without its stage; `develop` was check and write in one tab
  useEffect(() => {
    if (view !== "go" && view !== "develop") return;
    const fallback = view === "go" ? "#draws" : "#check";
    if (!arg) {
      location.hash = fallback;
      return;
    }
    api
      .draw(arg)
      .then((d) => {
        location.hash = `#${d.draw.stage === "ideate" ? "draw" : d.draw.stage}/${arg}`;
      })
      .catch(() => {
        location.hash = fallback;
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
  // `browse` was the sources tab's old name; its links still land there
  const sourcesView = view === "sources" || view === "browse";
  const on = (name: string) => (name === "ideate" ? drawsView : name === "sources" ? sourcesView : view === name);
  const count = (name: string) => {
    if (!status) return null;
    const n = name === "ideate" || name === "check" || name === "write" ? status.waiting[name] : 0;
    return n ? <span>{n}</span> : null;
  };
  // folded, a link is its initial with the name as its title; open, it is the name and its count
  const navLink = ([name, href]: [string, string]) => (
    <a key={name} href={href} className={"navlink" + (folded ? " mini" : "") + (on(name) ? " on" : "")} title={folded ? name : undefined}>
      {folded ? name[0] : name}
      {!folded && count(name)}
    </a>
  );
  return (
    <div className={"shell" + (folded ? " folded" : "")}>
      <aside className={"rail" + (folded ? " folded" : "")}>
        {folded ? (
          <Logo label="Cloud Chamber" />
        ) : (
          <div className="brand">
            <Logo />
            <div className="font-serif text-mark font-medium">
              Cloud
              <br />
              Chamber
            </div>
          </div>
        )}
        <nav className={"flex flex-col" + (folded ? " items-center gap-1" : "")} aria-label="Sections">
          {TABS.map(navLink)}
          <span className="railsep" aria-hidden="true" />
          {navLink(SOURCES)}
        </nav>
        <button
          className="railfold"
          aria-pressed={folded ? "true" : "false"}
          aria-label={folded ? "Expand the sidebar" : "Collapse the sidebar"}
          title={folded ? "Expand the sidebar" : "Collapse the sidebar"}
          onClick={() => setFolded((v) => !v)}
        >
          <Icon name={folded ? "keyboard_double_arrow_right" : "keyboard_double_arrow_left"} />
          {!folded && <span>collapse</span>}
        </button>
      </aside>
      {sourcesView && <Browser status={status} onVerdict={refresh} />}
      {drawsView && (
        <Draws status={status} selected={view === "draw" ? arg : arg === "new" ? "new" : undefined} like={arg === "new" ? arg2 : undefined} step={view === "draw" ? arg2 : undefined} />
      )}
      {view === "check" && <Develop stage="check" selected={arg} step={arg2} />}
      {view === "write" && <Develop stage="write" selected={arg} step={arg2} />}
    </div>
  );
}
