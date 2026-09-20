/** The primitives every page is built from. Each is one class in styles.css with its states. */
import React, { useEffect, useState } from "react";

/** A Material Symbol by ligature name; the subset in index.html carries every name used here. */
export function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={"icon " + className} aria-hidden="true">
      {name}
    </span>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "keep" | "pass" | "art" | "quiet"; pad?: boolean; pressed?: boolean };
/** A control: small caps in a hairline box. One `primary` per surface. */
export function Btn({ variant, pad, pressed, className = "", type = "button", ...rest }: BtnProps) {
  return <button type={type} className={["btn", variant, pad ? "pad" : "", className].filter(Boolean).join(" ")} aria-pressed={pressed === undefined ? undefined : pressed ? "true" : "false"} {...rest} />;
}
/** A link that looks like a control. */
export function LinkBtn({ variant, pad, className = "", ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: BtnProps["variant"]; pad?: boolean }) {
  return <a className={["btn", variant, pad ? "pad" : "", className].filter(Boolean).join(" ")} {...rest} />;
}

/** A pressable filter. */
export function Chip({ pressed, className = "", type = "button", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean }) {
  return <button type={type} className={"chip " + className} aria-pressed={pressed ? "true" : "false"} {...rest} />;
}


/** " · show N archived", or nothing when none are. */
export function ArchivedToggle({ archived, shown, onToggle }: { archived: number; shown: boolean; onToggle: () => void }) {
  if (archived <= 0) return null;
  return (
    <>
      {" "}
      ·{" "}
      <button className="link" onClick={onToggle}>
        {shown ? "hide" : "show"} {archived} archived
      </button>
    </>
  );
}

export type MarkState = "" | "held" | "wait" | "run" | "fail" | "todo" | "rep" | "art" | "gold";
/** State is a mark in a fixed cell: filled holds, hollow does not. Its title is also its name for a reader; a mark with no title is decoration. */
export function Mark({ state = "", small, title }: { state?: MarkState; small?: boolean; title?: string }) {
  return <span className={["mark", state, small ? "small" : ""].filter(Boolean).join(" ")} title={title} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : "true"} />;
}

/**
 * Keys on a list of rows, each a `[data-row=<id>]` with tabindex 0: ↑↓ and j move the focus between them, Enter
 * and each letter in `keys` act on the focused row. A key from an input or a control inside the row is left alone.
 */
export function rowKeys(keys: Record<string, (id: string) => void>): React.KeyboardEventHandler<HTMLElement> {
  return (e) => {
    const t = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName)) return;
    const row = t.closest<HTMLElement>("[data-row]");
    if (!row) return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-row]")];
    const move = e.key === "ArrowDown" || e.key === "j" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (move) {
      e.preventDefault();
      rows[rows.indexOf(row) + move]?.focus();
      return;
    }
    const act = keys[e.key];
    if (!act) return;
    e.preventDefault();
    act(row.dataset.row!);
  };
}
/** With nothing focused, ↓ or j lands on the first row of `ref`, so a list answers the keys from the page. */
export function useRowsFromPage(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target !== document.body || (e.key !== "ArrowDown" && e.key !== "j")) return;
      const first = ref.current?.querySelector<HTMLElement>("[data-row]");
      if (!first) return;
      e.preventDefault();
      first.focus();
    };
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, [ref]);
}
/** Enter or Space on a row that is clicked: the row itself, not a control inside it. */
export const onEnter =
  (fn: () => void): React.KeyboardEventHandler<HTMLElement> =>
  (e) => {
    if ((e.key !== "Enter" && e.key !== " ") || e.target !== e.currentTarget) return;
    e.preventDefault();
    fn();
  };
/** The keys a list answers, as a head note: `[["↓", "move"], ["⏎", "read"]]`. */
export function Keys({ keys }: { keys: [string, string][] }) {
  return (
    <span className="keys">
      {keys.map(([k, what]) => (
        <span key={k}>
          <kbd>{k}</kbd> {what}
        </span>
      ))}
    </span>
  );
}
/** The mark for a draw: running and waiting come from the server, the rest from the status it names. */
export const markFor = ({ status, running, at_gate }: { status: string; running: boolean; at_gate: boolean }): MarkState =>
  running
    ? "run"
    : at_gate
      ? "wait"
      : status === "failed"
        ? "fail"
        : status === "repaired"
          ? "rep"
          : status === "done" || status === "drafted"
            ? "held"
            : "";

/** A section head: small caps, with a dim note after it. */
export function Head({ children, note, className = "", as: As = "h2" }: { children: React.ReactNode; note?: React.ReactNode; className?: string; as?: "h2" | "div" }) {
  return (
    <As className={"head " + className}>
      {children}
      {note && <span className="note"> · {note}</span>}
    </As>
  );
}

/** A probability or word-count bar. */
export function Bar({ pct, over, gold }: { pct: number; over?: boolean; gold?: boolean }) {
  return (
    <div className="bar">
      <i className={over ? "over" : gold ? "gold" : ""} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/** The disclosure chevron. */
export function Caret({ open }: { open?: boolean }) {
  return <Icon name={open ? "expand_more" : "chevron_right"} className="text-dim" />;
}

/** A segmented choice. */
export function Seg({ value, options, onChange, label }: { value: string; options: string[]; onChange: (v: string) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** A form row: the label column, the control, its help under the control. */
export function Field({ label, htmlFor, help, children }: { label: string; htmlFor?: string; help?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="field">
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="lbl">{label}</span>}
      {children}
      {help && <span className="help">{help}</span>}
    </div>
  );
}

/** Key and value pairs. */
export function Facts({ rows, className = "" }: { rows: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <dl className={"facts " + className}>
      {rows.map(([k, v], i) => (
        <React.Fragment key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/** Seconds between two timestamps, or "running". */
/** Seconds from a start to an end, or to now while the step still runs; pair with useTick so the cell ticks. */
export const secs = (a: string, b: string | null) => `${Math.max(0, Math.round(((b ? Date.parse(b) : Date.now()) - Date.parse(a)) / 1000))}`;
/** Poll: call fn now and every `fast` ms while active, every `slow` ms otherwise, again whenever deps change. */
export function usePoll(fn: () => void, active: boolean, deps: unknown[], fast = 2500, slow = 20000) {
  useEffect(() => {
    fn();
    const t = setInterval(fn, active ? fast : slow);
    return () => clearInterval(t);
  }, [active, fast, slow, ...deps]);
}
/** Re-render once a second while something runs, so an elapsed cell ticks between polls. */
export function useTick(active: boolean, ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [active, ms]);
}
/** The draw last selected in a tab, kept in this browser so going back to the tab reopens it. */
export const lastSelected = (tab: string) => {
  try {
    return localStorage.getItem(`fb-last-${tab}`) ?? undefined;
  } catch {
    return undefined;
  }
};
export function useRememberSelected(tab: string, id: string | undefined) {
  useEffect(() => {
    if (!id) return;
    try {
      localStorage.setItem(`fb-last-${tab}`, id);
    } catch {}
  }, [tab, id]);
}
export const hhmm = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/**
 * Name in the address bar what the page already shows, without a new history entry.
 * A tab that opens on a default draw then has a link you can copy or send.
 */
export function useAddressBar(hash: string | undefined) {
  useEffect(() => {
    if (!hash || location.hash === `#${hash}`) return;
    history.replaceState(null, "", `#${hash}`);
    dispatchEvent(new HashChangeEvent("hashchange"));
  }, [hash]);
}


/** The two model selects a form offers: one for the prose stages, one for the judgement stages. "default" sends nothing for that group. */
export function ModelPicks({ cfg, value, onChange }: { cfg: { stages: Record<string, string>; groups: Record<string, string[]>; models: string[] } | null; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  if (!cfg) return null;
  const short = (m: string) => m.replace(/^claude-/, "").replace(/-(\d)-(\d)$/, " $1.$2").replace(/-(\d)$/, " $1");
  const dflt = (g: string) => { const ms = [...new Set((cfg.groups[g] ?? []).map((s) => cfg.stages[s]))]; return ms.length === 1 ? short(ms[0]) : "per stage"; };
  return (
    <Field label="Models" help="The model each group of stages runs on for this draw and the draws made from it. default: stages.toml. Prose writes the story; judgement checks and screens it.">
      <div className="ctls">
        {["prose", "judgement"].map((g) => (
          <React.Fragment key={g}>
            <span className="text-dim">{g}</span>
            <select className="sel" aria-label={`${g} model`} value={value[g] ?? ""} onChange={(e) => { const v = { ...value }; if (e.target.value) v[g] = e.target.value; else delete v[g]; onChange(v); }}>
              <option value="">default · {dflt(g)}</option>
              {cfg.models.map((m) => (
                <option key={m} value={m}>
                  {short(m)}
                </option>
              ))}
            </select>
          </React.Fragment>
        ))}
      </div>
    </Field>
  );
}

/** Tokens and list-price cost summed over steps that recorded usage, as one line; null when none did. */
export function usageLine(steps: { usage?: string | null }[]): string | null {
  let n = 0, inp = 0, out = 0, think = 0, cached = 0, cost = 0;
  for (const s of steps) {
    if (!s.usage) continue;
    try { const u = JSON.parse(s.usage); n++; inp += (u.input ?? 0) + (u.cache_write ?? 0); cached += u.cache_read ?? 0; out += u.output ?? 0; think += u.thinking ?? 0; cost += u.cost_usd ?? 0; } catch { /* a row written before usage was recorded */ }
  }
  if (!n) return null;
  const k = (x: number) => (x >= 1000 ? `${Math.round(x / 1000)}k` : String(x));
  return `${n} calls · ${k(inp)} in + ${k(cached)} cached · ${k(out)} out (${k(think)} thinking) · $${cost.toFixed(2)} at list`;
}
