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

export type MarkState = "" | "held" | "wait" | "run" | "fail" | "todo" | "rep" | "art" | "gold";
/** State is a mark in a fixed cell: filled holds, hollow does not. */
export function Mark({ state = "", small, title }: { state?: MarkState; small?: boolean; title?: string }) {
  return <span className={["mark", state, small ? "small" : ""].filter(Boolean).join(" ")} title={title} />;
}
/** The mark for a draw or step status. */
export const markFor = (status: string): MarkState =>
  status === "running" || status === "checking" || status === "repairing" || status === "drafting"
    ? "run"
    : status.startsWith("awaiting")
      ? "wait"
      : status === "failed"
        ? "fail"
        : status === "repaired"
          ? "rep"
          : status === "done" || status === "drafted" || status === "passed"
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
export const hhmm = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
