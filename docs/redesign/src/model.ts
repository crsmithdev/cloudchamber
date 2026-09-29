/**
 * The content every direction renders: the fixture in data.json, read into the
 * rows and facts the four screens show. Directions differ in form, never in facts.
 */
import raw from "./data.json";

export const D = raw;

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const TZ = "America/Los_Angeles";
export const time = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).format(new Date(iso));
export const day = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: TZ }).format(new Date(iso));
export const num = (n: number) => n.toLocaleString("en-US");

/** Paragraphs from generated text; *italic* spans become <em>. */
export const paras = (t: string) =>
  t
    .split(/\n\n+/)
    .map((p) => `<p>${esc(p.trim()).replace(/\*([^*]+)\*/g, "<em>$1</em>")}</p>`)
    .join("");

/** Generated text inline: *italic* spans become <em>. */
export const inline = (t: string) => esc(t).replace(/\*([^*]+)\*/g, "<em>$1</em>");

export type Mark = "done" | "wait" | "run" | "todo" | "fail";
export type Tab = "ideate" | "check" | "write" | "sources";

/** The state word a draw shows, in the operator's terms, and its mark. */
const STATE: Record<string, [string, Mark]> = {
  awaiting_gate: ["choose a premise", "wait"],
  awaiting_check_gate: ["review findings", "wait"],
  awaiting_draft_gate: ["review the draft", "wait"],
  drafted: ["drafted", "done"],
  done: ["ready to draft", "done"],
  failed: ["failed", "fail"],
};

export type Row = { id: string; name: string; state: string; mark: Mark; when: string; day: string; seed: string; note: string };

/**
 * The draw list of each tab. One row is synthetic: `disturbing-story-large-49`
 * is shown running so every direction has to draw the running state.
 */
export function rows(tab: Tab): Row[] {
  const stage = tab === "sources" ? "ideate" : tab;
  return D.draws
    .filter((d) => d.stage === stage && d.status !== "repaired")
    .map((d) => {
      const running = d.name === "disturbing-story-large-49";
      const [state, mark] = running ? ["write vignette 4 of 5", "run" as Mark] : (STATE[d.status] ?? [d.status, "done" as Mark]);
      const note =
        d.status === "awaiting_check_gate" ? `${d.open} findings open` : d.status === "awaiting_gate" && !running ? "5 premises written" : "";
      return { id: d.id, name: d.name, state, mark, when: time(d.created), day: day(d.created), seed: d.seed, note };
    });
}

export const WAITING = D.status.waiting as Record<"ideate" | "check" | "write", number>;

/** The ideate draw's step log: six real calls, the gate, and the five calls choosing runs. */
export type Step = { label: string; sub: string; at: string; secs: number | null; mark: Mark };
export function steps(): Step[] {
  const real = D.ideate.steps.map((s, i) => ({
    label: s.stage === "premises" ? "propose premises" : "write vignette",
    sub: s.stage === "premises" ? "5 premises" : `premise #${i}`,
    at: time(s.started),
    secs: s.secs,
    mark: "done" as Mark,
  }));
  const todo = ["derive outline", "plan contexts", "write context 1", "write context 2", "write ending"].map((label) => ({
    label,
    sub: "runs after the choice",
    at: "",
    secs: null,
    mark: "todo" as Mark,
  }));
  return [...real, { label: "choose premise", sub: "waiting for you", at: "06:57", secs: null, mark: "wait" }, ...todo];
}

/** The ideate draw's facts. */
export const facts = () => [
  ["id", D.ideate.id],
  ["setting", "unrestricted"],
  ["genre", D.ideate.genre],
  ["sampling", "tail · 0 to 0.1"],
  ["choice", "manual"],
  ["model", D.ideate.model],
  ["calls", `${D.ideate.calls} · ${D.ideate.secs} s`],
  ["cost", `$${D.ideate.cost.toFixed(2)}`],
  ["started", `${time(D.ideate.created)} today`],
];

/** The premise the mockups show opened. */
export const OPEN = 2;

/**
 * Where the draw is in the whole pipeline: the route every direction may draw.
 * Times are the draw's own step starts; stops a repair round inherited from its
 * origin draw show no time.
 */
export type Stop = { label: string; at: string; mark: Mark };
export function route(tab: Tab): Stop[] {
  const labels = ["seed", "premises", "choose", "develop", "check", "review", "plan", "scenes", "screen", "keep"];
  const at = { ideate: 2, check: 5, write: 9, sources: 0 }[tab];
  const times: Record<Tab, Record<string, string>> = {
    ideate: { seed: "06:56", premises: "06:56", choose: "06:57" },
    check: { develop: "15:39", check: "15:39" },
    write: { develop: "15:47", check: "15:47", plan: "15:51", scenes: "15:52", screen: "15:52" },
    sources: {},
  };
  return labels.map((label, i) => ({ label, at: times[tab][label] ?? "", mark: i < at ? "done" : i === at ? "wait" : "todo" }));
}

export const checkTitle = D.check.name;
export const findings = D.check.findings;
export const DISMISS = ["wrong", "bad fix", "duplicate", "trivial"];
export const checkFacts = () => [
  ["reported", `${D.check.summary.reported} of ${D.check.summary.total}`],
  ["dropped", `${D.check.dropped} by the verify pass`],
  ["checker calls", "12 · 887 s"],
  ["checked", "Sep 26, 15:39"],
  ["accepted", "0"],
];
/** Outline sections and how many open findings break each. */
export function sections() {
  const names = ["departure", "particulars", "arrival", "knowledge", "return"];
  return names.map((s) => ({ name: s, n: findings.filter((f) => f.invalidates === s).length }));
}

export const W = D.write;
export const writeFacts = () => [
  ["length", `1,400 words · ${num(W.scenes.reduce((t, s) => t + s.words, 0))} written`],
  ["beats", String(W.beats.length)],
  ["tense", W.form.tense],
  ["person", W.form.person],
  ["chronology", W.form.chronology],
  ["container", W.form.container],
  ["profile", "flash"],
];
export const flagsOf = (beat: number) => W.flags.filter((f) => f.beat === beat);

/** Wrap each flag's span in a scene in <mark>, numbered across the draft. */
export function flagged(text: string, beat: number, start = 1) {
  let html = paras(text);
  flagsOf(beat).forEach((f, i) => {
    const needle = esc(f.span.slice(0, 48));
    const at = html.indexOf(needle);
    if (at < 0) return;
    const end = html.indexOf("</p>", at);
    const stop = Math.min(end, at + esc(f.span).length);
    html = html.slice(0, at) + `<mark data-n="${start + i}">` + html.slice(at, stop) + "</mark>" + html.slice(stop);
  });
  return html;
}

export const passages = D.passages;
export const sources = D.status.per_source;
export const cells = D.cells;
