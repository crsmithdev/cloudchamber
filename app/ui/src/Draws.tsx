import React, { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { api, when, type Artifact, type Candidate, type Example, type Facets, type Draw, type Fork, type FullStep, type Origin, type Source, type Status, type Step } from "./api.ts";
import { Bar, Btn, Caret, Chip, Facts, Field, Head, Icon, LinkBtn, Mark, Seg, hhmm, markFor, secs, usePoll, useTick } from "./ui.tsx";

export type Detail = { draw: Draw; origin: Origin | null; steps: Step[]; artifacts: Artifact[]; candidates: Candidate[]; examples: Example[]; forks: Fork[] };
const STAGES = ["premises", "execute", "gate", "outline", "context", "ending", "brief"];
export const LABEL: Record<string, string> = {
  awaiting_gate: "awaiting the gate",
  done: "brief",
  awaiting_check_gate: "gate 1",
  awaiting_draft_gate: "gate 2",
  checking: "checking",
  repairing: "repairing",
  drafting: "drafting",
  drafted: "drafted",
  passed: "passed",
  repaired: "repaired",
  running: "running",
};
export const label = (status: string) => LABEL[status] ?? status;
/** The statuses that mean a model call is in flight, so the views refresh while they hold. */
export const RUNNING_STATUS = new Set(["running", "checking", "repairing", "drafting"]);
const choose = (index: number) => `Continue with premise ${index}: outline, two context vignettes, the ending, then the brief.`;
const SAMPLING_HELP: Record<string, string> = {
  tail: "The strangest readings of the seed: premises nobody else would file.",
  "off-centre": "Off the centre but inside the tradition: unusual without being absurd.",
  standard: "The strongest conventional treatment: what a good writer would reach for.",
};
const develop = (index: number) => `Develop premise ${index} as a draw of its own: the same seed and examples, its own outline, context vignettes, ending and brief.`;
/** The band a stated probability falls in, as the sampling modes name them. */
export const band = (p: number) => (p < 0.1 ? "tail" : p < 0.35 ? "off-centre" : "standard");
export const firstParagraph = (s: string) =>
  s
    .trim()
    .split(/\n\s*\n/)[0]
    .replace(/[*_#>`]/g, "");

/** Model output and brief files are markdown written by this pipeline; rendered as written. */
export function Md({ text, className = "" }: { text: string; className?: string }) {
  const html = useMemo(() => marked.parse(text, { async: false }) as string, [text]);
  return <div className={"prose " + className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The seed as a two-line head note; a long seed unfolds in place. */
export function SeedNote({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 200 || text.includes("\n");
  return (
    <div>
      <p className={"seed" + (long && !open ? " line-clamp-2" : "")}>{text}</p>
      {long && (
        <button className="link mt-1" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <Caret open={open} /> {open ? "fold" : "unfold"}
        </button>
      )}
    </div>
  );
}

/** The keys every stage prints about a draw: what it was drawn under. */
export function DrawMeta({ d, children }: { d: Detail; children?: React.ReactNode }) {
  return (
    <span className="text-mute">
      {children}
      {d.draw.setting ?? "unrestricted"} · {d.draw.genre} · {d.draw.sampling}
    </span>
  );
}

/** Draws in the list pane, each opening into its facts and step log; the selected draw, a step, or the start form fills the rest. */
export function Draws({ status, selected, like }: { status: Status | null; selected: string | undefined; like?: string }) {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [stepId, setStepId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  const loadDraws = () =>
    api
      .draws(true)
      .then((all) => {
        setDraws(all);
        setLoaded(true);
      })
      .catch(() => {});
  const busy = draws.some((r) => RUNNING_STATUS.has(r.status));
  usePoll(loadDraws, busy, [], 3000, 15000);

  // Archived draws stay out of the list until asked for, and the open one stays visible whatever its state.
  const archived = draws.filter((r) => r.archived_at).length;
  // With nothing chosen, land on the draw that needs attention, else the newest; with no draws, the form.
  const live = draws.filter((r) => !r.archived_at);
  // the form only once the list has loaded and is empty; before that the pane waits
  const current = selected ?? (live.find((r) => r.status === "awaiting_gate") ?? live[0])?.id ?? (loaded && !live.length ? "new" : undefined);
  const shown = draws.filter((r) => showArchived || !r.archived_at || r.id === current);
  const isForm = current === "new";
  const loadDetail = (id: string) =>
    api
      .draw(id)
      .then((d) => setDetails((m) => ({ ...m, [id]: d })))
      .catch((e) => setErr(e.message));
  useEffect(() => {
    if (!current || isForm) return;
    setStepId(null);
    setErr("");
    setOpen((o) => new Set(o).add(current));
    return () => {};
  }, [current]);
  useEffect(() => {
    // the current draw is loaded by the poll; this fetches the other rows the operator opened
    for (const id of open) if (id !== current && !details[id]) loadDetail(id);
  }, [open]);
  const d = current && !isForm ? details[current] : undefined;
  // the pane refreshes itself while the pipeline is working on this draw, and rarely once it stops
  const working = !!d && (RUNNING_STATUS.has(d.draw.status) || d.steps.some((s) => s.status === "running"));
  usePoll(
    () => {
      if (current && !isForm) loadDetail(current);
    },
    working,
    [current, isForm],
  );

  const select = (id: string) => {
    if (id !== current) {
      location.hash = `#draw/${id}`;
      return;
    }
    if (stepId) {
      setStepId(null);
      return;
    } // a step log is open: back to the draw before folding the row
    setOpen((o) => {
      const n = new Set(o);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const gate = async (action: string, step_id?: string) => {
    if (!d) return;
    setErr("");
    try {
      const r = await api.gate(d.draw.id, { action, step_id, note });
      setNote("");
      if (r.id && r.id !== d.draw.id) location.hash = `#draw/${r.id}`;
      else loadDetail(d.draw.id);
      loadDraws();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const remove = async () => {
    if (!d || !confirm(`Delete ${d.draw.name ?? d.draw.id} and every step under it? There is no undo.`)) return;
    try {
      await api.deleteDraw(d.draw.id);
      location.hash = "#draws";
      loadDraws();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const verdict = async (e: Example, v: "keep" | "pass", artifact = false, note = "") => {
    await api.verdict({ kind: "example", target_id: e.id, verdict: v, artifact, note, method: "draw" });
    if (d) loadDetail(d.draw.id);
  };
  const step = d && stepId ? d.steps.find((s) => s.id === stepId) : undefined;
  const openCount = live.filter((r) => r.status === "awaiting_gate").length;

  return (
    <>
      <div className="pane list">
        <div className="listhead">
          <LinkBtn variant="primary" href="#draws/new">
            draw
          </LinkBtn>
          <span className="head">
            {openCount} open
            {archived > 0 && (
              <>
                {" "}
                ·{" "}
                <button className="link" onClick={() => setShowArchived((v) => !v)}>
                  {showArchived ? "hide" : "show"} {archived} archived
                </button>
              </>
            )}
          </span>
        </div>
        {shown.length === 0 && <div className="empty">No draws yet.</div>}
        {shown.map((r) => (
          <div key={r.id} className={"row" + (r.id === current ? " on" : "") + (RUNNING_STATUS.has(r.status) ? " running" : "") + (r.superseded_by || r.archived_at ? " old" : "")} onClick={() => select(r.id)}>
            <div className="l1">
              <b>{r.name ?? r.id}</b>
              <span className="when">{when(r.created_at)}</span>
            </div>
            <div className="l2">
              <Mark state={markFor(r.status)} />
              <span className={RUNNING_STATUS.has(r.status) ? "sweep text-running" : ""}>{label(r.status)}</span>
              <span className="text-dim">
                · {r.setting ?? "unrestricted"} · {r.genre} · {r.sampling}
                {r.flagged ? <span className="text-art"> · flagged</span> : null}
                {r.forked_from && " · fork"}
                {r.superseded_by && " · superseded"}
                {r.archived_at && " · archived"}
              </span>
            </div>
            <div className="sd">{r.seed_text}</div>
            <div className="rid">{r.id}</div>
            {open.has(r.id) && details[r.id] && (
              <>
                <RowFacts d={details[r.id]} />
                <Log
                  d={details[r.id]}
                  stepId={r.id === current ? stepId : null}
                  onStep={(id) => {
                    if (r.id !== current) location.hash = `#draw/${r.id}`;
                    setStepId(id);
                  }}
                />
              </>
            )}
          </div>
        ))}
      </div>

      {isForm ? (
        <StartForm status={status} like={like} />
      ) : !current ? (
        <div className="pane read">
          <span className="text-dim">loading the draw…</span>
        </div>
      ) : (
        <div className="pane read tt">
          {!d ? (
            err ? (
              <div className="err">{err}</div>
            ) : (
              <span className="text-dim">loading the draw…</span>
            )
          ) : (
            <>
              <div className={"strip" + (working ? " running" : "")}>
                <h1>{d.draw.name ?? d.draw.id}</h1>
                <span className="num text-dim">{d.draw.id}</span>
                <span className={"state " + (working ? "text-running" : d.draw.status === "awaiting_gate" ? "text-art" : d.draw.status === "failed" ? "text-pass" : "text-mute")}>
                  <Mark state={markFor(d.draw.status)} />
                  <span className={working ? "sweep" : ""}>
                    {label(d.draw.status)}
                    {working && d.steps.some((s) => s.status === "running") ? ` · ${[...new Set(d.steps.filter((s) => s.status === "running").map((s) => s.stage))].join(", ")}` : ""}
                  </span>
                </span>
                <DrawMeta d={d} />
                {d.draw.forked_from && (
                  <span className="text-dim">
                    forked from{" "}
                    <a href={`#draw/${d.draw.forked_from}`} className="num">
                      {d.draw.forked_from}
                    </a>
                  </span>
                )}
                {d.draw.superseded_by && (
                  <span className="text-dim">
                    superseded by{" "}
                    <a href={`#draw/${d.draw.superseded_by}`} className="num">
                      {d.draw.superseded_by}
                    </a>
                  </span>
                )}
                {!step && (
                  <span className="tools" role="group" aria-label="Draw">
                    <input type="text" name="gate-note" placeholder="note for the log" aria-label="Gate note" value={note} onChange={(e) => setNote(e.target.value)} />
                    {d.draw.status === "awaiting_gate" && (
                      <>
                        <Btn variant="art" title="Mark this draw as a wrong call for later review. It stays open and nothing else changes." onClick={() => gate("flag")}>
                          flag
                        </Btn>
                        <LinkBtn variant="quiet" href={`#draws/new/${d.draw.id}`} title="Open the draw form with this draw's options, to start another like it. This one stays open.">
                          redraw
                        </LinkBtn>
                      </>
                    )}
                    <Btn
                      variant="quiet"
                      title={d.draw.archived_at ? "Put this draw back in the list." : "Hide this draw from the lists. Nothing else about it changes."}
                      onClick={() => gate(d.draw.archived_at ? "unarchive" : "archive")}
                    >
                      {d.draw.archived_at ? "unarchive" : "archive"}
                    </Btn>
                    <Btn
                      variant="quiet"
                      title={d.draw.chosen_step ? "This draw produced a brief; archive it instead." : "Remove this draw and every step under it. There is no undo."}
                      disabled={!!d.draw.chosen_step}
                      onClick={remove}
                    >
                      delete
                    </Btn>
                  </span>
                )}
              </div>
              {err && <div className="err mt-2">{err}</div>}
              {step ? (
                <StepView step={step} chosen={step.id === d.draw.chosen_step} onBack={() => setStepId(null)} />
              ) : (
                <DrawBody d={d} onChoose={(id) => gate("choose", id)} onFork={(id) => gate("fork", id)} onVerdict={verdict} />
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

function RowFacts({ d }: { d: Detail }) {
  const chosen = d.candidates.find((c) => c.step_id === d.draw.chosen_step);
  const lowest = d.candidates[0];
  const since = d.steps.reduce((m, s) => (s.ended_at && s.ended_at > m ? s.ended_at : m), "");
  const failed = d.steps.filter((s) => s.status === "failed").length;
  const rows: [React.ReactNode, React.ReactNode][] =
    d.draw.status === "awaiting_gate"
      ? [
          ["candidates", d.candidates.length],
          ...(lowest
            ? [
                [
                  "lowest",
                  <span className="num">
                    #{lowest.index} · {lowest.probability.toFixed(2)}
                  </span>,
                ] as [React.ReactNode, React.ReactNode],
              ]
            : []),
          ...(since ? [["waiting since", when(since)] as [React.ReactNode, React.ReactNode]] : []),
        ]
      : [
          ...(d.draw.gate_method ? [["gate", d.draw.gate_method] as [React.ReactNode, React.ReactNode]] : []),
          ...(chosen
            ? [
                [
                  "chosen",
                  <span className="num">
                    #{chosen.index} · {chosen.probability.toFixed(2)}
                  </span>,
                ] as [React.ReactNode, React.ReactNode],
              ]
            : []),
          ["started", when(d.draw.created_at)],
          ...(d.draw.ended_at ? [["ended", when(d.draw.ended_at)] as [React.ReactNode, React.ReactNode]] : []),
          [
            "steps",
            <>
              {d.steps.length}
              {failed ? <span className="text-pass"> · {failed} failed</span> : null}
            </>,
          ],
        ];
  if (d.draw.flagged) rows.push(["flag", <span className="text-art">{d.draw.flag_note || "flagged"}</span>]);
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Facts rows={rows} className="mt-2 text-head" />
    </div>
  );
}

/** The step log as a time table: stage, started, seconds. A running row sweeps; the gate waits; what is still to come is faint. */
export function Log({ d, stepId, onStep, wide }: { d: Detail; stepId: string | null; onStep: (id: string) => void; wide?: boolean }) {
  const byParent = new Map<string | null, Step[]>();
  for (const s of d.steps) {
    const k = s.parent_id;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(s);
  }
  const flat: { s: Step; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const s of byParent.get(parent) ?? []) {
      flat.push({ s, depth });
      walk(s.id, depth + 1);
    }
  };
  walk(null, 0);
  useTick(d.steps.some((s) => s.status === "running" && Date.now() - Date.parse(s.started_at) < 30 * 60 * 1000));
  const cand = new Map(d.candidates.map((c) => [c.step_id, c]));
  const seen = new Set(d.steps.map((s) => s.stage));
  const inFlight = d.draw.status === "awaiting_gate" || d.draw.status === "running";
  const developed = !["awaiting_gate", "running", "done", "failed", "rejected"].includes(d.draw.status);
  const todo = (stage: string) => (
    <tr key={stage} className="todo">
      <td>
        <Mark state="todo" />
      </td>
      <td className="n text-dim">{stage}</td>
      {wide && <td className="text-dim">—</td>}
      <td className="text-right text-dim">—</td>
    </tr>
  );
  return (
    <div className="log" onClick={(e) => e.stopPropagation()}>
      <table>
        {wide && (
          <thead>
            <tr>
              <th className="head w-4"></th>
              <th className="head">stage</th>
              <th className="head">started</th>
              <th className="head text-right">s</th>
            </tr>
          </thead>
        )}
        <tbody>
          {flat.map(({ s, depth }) => {
            const c = cand.get(s.id);
            // a step still marked running after half an hour is stale, not in flight: no sweep, no tick, the count in mute
            const stale = s.status === "running" && Date.now() - Date.parse(s.started_at) > 30 * 60 * 1000;
            const running = s.status === "running" && !stale;
            return (
              <tr key={s.id} className={"pick" + (s.id === stepId ? " on" : "") + (running ? " sweep" : "")} onClick={() => onStep(s.id)}>
                <td>
                  <Mark state={s.status === "failed" ? "fail" : running ? "run" : stale ? "todo" : "held"} />
                </td>
                <td className={"n" + (running ? " text-running" : "")} style={{ paddingLeft: `${0.4 + depth * 0.8}rem` }}>
                  {s.stage}
                  <small>
                    {c ? ` #${c.index}` : ""}
                    {s.attempt > 1 ? ` · attempt ${s.attempt}` : ""}
                    {s.fail_reason ? ` · ${s.fail_reason}` : ""}
                    {s.id === d.draw.chosen_step ? " · chosen" : ""}
                  </small>
                </td>
                {wide && <td className="text-dim">{hhmm(s.started_at)}</td>}
                <td className={"text-right" + (running ? " text-running" : stale ? " text-dim" : "")} title={stale ? "still marked running after half an hour" : undefined}>
                  {secs(s.started_at, s.ended_at)}
                </td>
              </tr>
            );
          })}
          {d.draw.status === "awaiting_gate" && (
            <tr>
              <td>
                <Mark state="wait" />
              </td>
              <td className="n text-art">
                gate<small> · {d.draw.mode}</small>
              </td>
              {wide && <td className="text-dim">{flat.length ? hhmm(flat[flat.length - 1].s.ended_at ?? flat[flat.length - 1].s.started_at) : "—"}</td>}
              <td className="text-right text-art">waiting</td>
            </tr>
          )}
          {inFlight && STAGES.filter((st) => !seen.has(st) && st !== "gate" && st !== "brief").map(todo)}
          {inFlight && todo("brief")}
          {(d.draw.status === "done" || developed) && (
            <tr>
              <td>
                <Mark state="held" />
              </td>
              <td className="n">
                brief<small> · exported</small>
              </td>
              {wide && <td className="text-dim">{d.draw.ended_at ? hhmm(d.draw.ended_at) : ""}</td>}
              <td className="text-right text-dim">{d.draw.ended_at ? when(d.draw.ended_at).replace(" today", "") : ""}</td>
            </tr>
          )}
          {developed && (
            <tr className="pick">
              <td>
                <Mark state={d.draw.status.startsWith("awaiting") ? "wait" : markFor(d.draw.status)} />
              </td>
              <td className="n">
                <a href={`#${d.draw.stage}/${d.draw.id}`}>
                  {d.draw.stage}
                  <small> · {label(d.draw.status)}</small>
                </a>
              </td>
              {wide && <td></td>}
              <td className="text-right">
                <a href={`#${d.draw.stage}/${d.draw.id}`} className="link">
                  open
                </a>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** The draw as a table: five premises as five rows ranked by probability, the prose a row that opens. */
function DrawBody({
  d,
  onChoose,
  onFork,
  onVerdict,
}: {
  d: Detail;
  onChoose: (stepId: string) => void;
  onFork: (stepId: string) => void;
  onVerdict: (e: Example, v: "keep" | "pass", artifact?: boolean, note?: string) => void;
}) {
  const [openVig, setOpenVig] = useState<string | null>(d.draw.chosen_step);
  const [openEx, setOpenEx] = useState<string | null>(null);
  const [exNote, setExNote] = useState<Record<string, string>>({});
  const cands = d.candidates;
  const maxP = Math.max(...cands.map((c) => c.probability), 0.01);
  const gating = d.draw.status === "awaiting_gate";
  const running = d.steps.filter((s) => s.status === "running");
  const runningExec = new Set(running.filter((s) => s.stage === "execute").map((s) => s.id));
  const landed = cands.filter((c) => !runningExec.has(c.step_id)).length;
  const steps = d.steps.filter((s) => s.status === "done");
  const callSecs = steps.reduce((n, s) => n + Number(secs(s.started_at, s.ended_at)), 0);
  return (
    <div className="drawbody">
      <div className="min-w-0">
        <Head>seed</Head>
        <SeedNote text={d.draw.seed_text} />
        {d.draw.flag_note && <div className="warn mt-2">flagged: {d.draw.flag_note}</div>}
        {cands.length > 0 && (
          <>
            <Head className="mt-5" note={<>lowest probability first · {runningExec.size ? `${landed} of ${cands.length} vignettes landed` : `${cands.length} vignettes`}</>}>
              premises
            </Head>
            <table className="mt-1">
              <thead>
                <tr>
                  <th className="head w-7">#</th>
                  <th className="head w-20">p</th>
                  <th className="head w-20"></th>
                  <th className="head premise">premise</th>
                  <th className="head w-12 text-center">state</th>
                  <th className="head w-24"></th>
                </tr>
              </thead>
              <tbody>
                {cands.map((c) => {
                  const chosen = c.step_id === d.draw.chosen_step;
                  const fork = d.forks.find((f) => f.step_id === c.step_id);
                  const isOpen = openVig === c.step_id;
                  const writing = runningExec.has(c.step_id);
                  return (
                    <React.Fragment key={c.step_id}>
                      <tr className={isOpen || chosen ? "sel" : openVig ? "faded" : ""}>
                        <td className="num">{c.index}</td>
                        <td className="num">
                          <b className="font-semibold">{c.probability.toFixed(2)}</b>
                          <div className="text-dim">{band(c.probability)}</div>
                        </td>
                        <td className="pt-4">
                          <Bar pct={(c.probability / maxP) * 100} gold={chosen} />
                        </td>
                        <td className="premise serif-cell">
                          {c.premise}
                          {c.warnings.length > 0 && <span className="warn font-sans text-chrome"> {c.warnings.join(", ")}</span>}
                          {writing && <div className="sweep mt-2 inline-block font-sans text-running">writing the vignette</div>}
                        </td>
                        <td className="text-center">
                          <Mark state={chosen ? "gold" : fork ? "held" : ""} title={chosen ? "chosen" : fork ? "developed as a fork" : "open"} />
                        </td>
                        <td className="text-right whitespace-nowrap">
                          {gating && (
                            <Btn title={choose(c.index)} onClick={() => onChoose(c.step_id)}>
                              choose
                            </Btn>
                          )}
                          {chosen && (
                            <a className="link num" href={`#check/${d.draw.id}`}>
                              in check <Icon name="arrow_forward" />
                            </a>
                          )}
                          {fork && (
                            <a className="link num" href={`#check/${fork.id}`}>
                              in check <Icon name="arrow_forward" />
                            </a>
                          )}
                          {!gating && !chosen && !fork && d.draw.chosen_step && (
                            <Btn title={develop(c.index)} onClick={() => onFork(c.step_id)}>
                              develop too
                            </Btn>
                          )}
                          {!writing && (
                            <div className="mt-1">
                              <button className="link" aria-expanded={isOpen} onClick={() => setOpenVig(isOpen ? null : c.step_id)}>
                                {isOpen ? "close" : "read"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="spans">
                          <td colSpan={6}>
                            <Md text={c.vignette} />
                            <div className="num mt-3 text-dim">{c.vignette.split(/\s+/).length} words</div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
        <Head className="mt-6" note={`${d.examples.length} passages the premises were drawn against`}>
          examples
        </Head>
        <table className="mt-1">
          <thead>
            <tr>
              <th className="head">passage</th>
              <th className="head">author</th>
              <th className="head">cell</th>
              <th className="head w-12 text-center">state</th>
              <th className="head w-20"></th>
            </tr>
          </thead>
          <tbody>
            {d.examples.map((e) => {
              const isOpen = openEx === e.id;
              return (
                <React.Fragment key={e.id}>
                  {e.text === null ? (
                    <tr className="faded">
                      <td colSpan={5}>
                        <span className="num">{e.id}</span> · not in the current pool; the passages were re-extracted after this draw
                      </td>
                    </tr>
                  ) : (
                    <tr className={isOpen ? "sel" : ""}>
                      <td className="serif-cell">{e.title}</td>
                      <td className="text-mute">{e.author || "unknown"}</td>
                      <td className="num text-dim">{e.cell}</td>
                      <td className="text-center">
                        <Mark
                          state={e.latest?.artifact ? "art" : e.latest?.verdict === "pass" ? "fail" : "held"}
                          title={e.latest?.artifact ? "flagged as an artifact" : e.latest?.verdict === "pass" ? "excluded from the pool" : "in the pool"}
                        />
                      </td>
                      <td className="text-right">
                        <button className="link" aria-expanded={isOpen} onClick={() => setOpenEx(isOpen ? null : e.id)}>
                          {isOpen ? "close" : "read"}
                        </button>
                      </td>
                    </tr>
                  )}
                  {isOpen && e.text !== null && (
                    <tr className="spans">
                      <td colSpan={5}>
                        <p className="prose passage m-0">{e.text}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {e.latest?.verdict === "pass" ? (
                            <Btn variant="keep" title="Put this passage back in the pool for future draws." onClick={() => onVerdict(e, "keep", e.latest?.artifact ?? false, exNote[e.id] ?? "")}>
                              include
                            </Btn>
                          ) : (
                            <Btn
                              variant="pass"
                              title="Drop this passage from the pool for every future draw. This draw is unaffected."
                              onClick={() => onVerdict(e, "pass", e.latest?.artifact ?? false, exNote[e.id] ?? "")}
                            >
                              exclude
                            </Btn>
                          )}
                          <Btn
                            variant="art"
                            title="Mark this passage as an extraction artifact: it leaves the pool and the note says what the reader got wrong."
                            onClick={() => onVerdict(e, e.latest?.verdict ?? "keep", !e.latest?.artifact, exNote[e.id] ?? "")}
                          >
                            {e.latest?.artifact ? "unflag" : "flag"}
                          </Btn>
                          <input type="text" placeholder="note for the log" aria-label="Example note" value={exNote[e.id] ?? ""} onChange={(ev) => setExNote((m) => ({ ...m, [e.id]: ev.target.value }))} />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="aside min-w-0">
        <div>
          <Head as="div" note={`${steps.length} of ${d.steps.length + (gating || d.draw.status === "running" ? STAGES.length - d.steps.length : 0)}`}>
            steps
          </Head>
          <Log d={d} stepId={null} onStep={() => {}} wide />
        </div>
        <div className="facts-block mt-6">
          <Head as="div">draw</Head>
          <table className="mt-1">
            <tbody>
              <tr>
                <td className="w-24 text-dim">setting</td>
                <td>{d.draw.setting ?? "unrestricted"}</td>
              </tr>
              <tr>
                <td className="text-dim">genre</td>
                <td>{d.draw.genre}</td>
              </tr>
              <tr>
                <td className="text-dim">sampling</td>
                <td>
                  {d.draw.sampling} <span className="text-dim">· {d.draw.sampling === "tail" ? "0 to 0.1" : d.draw.sampling === "off-centre" ? "0.1 to 0.35" : "0.35 to 1"}</span>
                </td>
              </tr>
              <tr>
                <td className="text-dim">gate</td>
                <td>
                  {d.draw.mode}
                  {d.draw.gate_method ? ` · ${d.draw.gate_method}` : ""}
                </td>
              </tr>
              {d.steps[0] && (
                <tr>
                  <td className="text-dim">model</td>
                  <td className="num">{d.steps[0].model}</td>
                </tr>
              )}
              <tr>
                <td className="text-dim">calls</td>
                <td>
                  {steps.length} <span className="text-dim">· {callSecs} s</span>
                </td>
              </tr>
              <tr>
                <td className="text-dim">started</td>
                <td className="num">{when(d.draw.created_at)}</td>
              </tr>
              {d.draw.ended_at && (
                <tr>
                  <td className="text-dim">ended</td>
                  <td className="num">{when(d.draw.ended_at)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** The step's own text is fetched here: a draw's steps arrive without it. */
export function StepView({ step, chosen, onBack }: { step: Step; chosen: boolean; onBack: () => void }) {
  const [full, setFull] = useState<{ step: FullStep; artifacts: Artifact[] } | null>(null);
  useTick(!step.ended_at);
  useEffect(() => {
    setFull(null);
    api
      .step(step.id)
      .then(setFull)
      .catch(() => {});
  }, [step.id]);
  const raw = (() => {
    const r = full?.step.raw_response;
    if (!r) return null;
    try {
      return JSON.parse(r).result ?? r;
    } catch {
      return r;
    }
  })();
  return (
    <div className="mt-4 max-w-[66rem]">
      <button className="link" onClick={onBack}>
        <Icon name="arrow_back" /> back to the draw
      </button>
      <div className="mt-3 flex flex-wrap gap-4 text-mute">
        <b className="num text-ink">{step.stage}</b>
        <span className={step.status === "failed" ? "text-pass" : ""}>
          {step.status}
          {step.fail_reason ? ` (${step.fail_reason})` : ""}
        </span>
        <span className="num">{step.model}</span>
        <span className="num">{secs(step.started_at, step.ended_at)} s</span>
        {step.attempt > 1 && <span>attempt {step.attempt}</span>}
        {chosen && <span className="text-keep">chosen</span>}
      </div>
      {step.error && <div className="err mt-3">{step.error}</div>}
      <Head className="mt-5">system</Head>
      <div className="text-mute">{step.system_prompt}</div>
      <Head className="mt-5" note={`${step.prompt_chars} chars`}>
        prompt
      </Head>
      <pre>{full ? full.step.prompt : "…"}</pre>
      {raw && (
        <>
          <Head>raw response</Head>
          <pre>{raw}</pre>
        </>
      )}
      {full?.step.parsed && (
        <>
          <Head>parsed</Head>
          <pre>{full.step.parsed}</pre>
        </>
      )}
      {(full?.artifacts ?? []).map((a) => {
        const m = JSON.parse(a.meta);
        return (
          <div key={a.id}>
            <Head
              note={
                <>
                  <span className="num">{a.id}</span>
                  {m.warnings?.length ? <span className="warn"> · {m.warnings.join(", ")}</span> : null}
                </>
              }
            >
              {a.kind}
            </Head>
            <pre>{a.content}</pre>
          </div>
        );
      })}
    </div>
  );
}

function StartForm({ status, like }: { status: Status | null; like?: string }) {
  const [facets, setFacets] = useState<Facets | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ mode: "manual", sampling: "tail" });
  const [genreParts, setGenreParts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.facets().then(setFacets);
  }, []);
  const [sources, setSources] = useState<string[]>([]);
  // "redraw": every option of the draw this one is being started from
  const [seedTouched, setSeedTouched] = useState(false);
  const [themeId, setThemeId] = useState("");
  useEffect(() => {
    if (!like) return;
    api
      .like(like)
      .then((o) => {
        setForm({ mode: o.mode, sampling: o.sampling ?? "tail", setting: o.setting ?? "", genre: o.genre ?? "", seed: o.seed_text });
        setGenreParts([]);
        setSeedTouched(false);
        setThemeId(o.seed?.mode === "picked" ? o.seed.themeId : "");
        const s = o.segment?.source;
        setSources(Array.isArray(s) ? s : s ? [s] : []);
      })
      .catch((e) => setErr(e.message));
  }, [like]);
  // the chips are shortcuts into one free-text field: picking several joins them, typing clears them
  const toggleGenre = (v: string) => {
    const next = genreParts.includes(v) ? genreParts.filter((x) => x !== v) : [...genreParts, v];
    setGenreParts(next);
    setForm({ ...form, genre: next.join(" and ") });
  };
  const typeGenre = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGenreParts([]);
    setForm({ ...form, genre: e.target.value });
  };
  // sources grouped by the author or editor on the file, so a whole shelf goes in or out at once
  const groups = useMemo(() => {
    const m = new Map<string, Source[]>();
    for (const s of facets?.sources ?? []) {
      if (!m.has(s.group)) m.set(s.group, []);
      m.get(s.group)!.push(s);
    }
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [facets]);
  const toggleSource = (id: string) => setSources((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleGroup = (rows: Source[]) => setSources((s) => (rows.every((r) => s.includes(r.id)) ? s.filter((x) => !rows.some((r) => r.id === x)) : [...s, ...rows.map((r) => r.id).filter((id) => !s.includes(id))]));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const keepsTheme = !!themeId && !seedTouched;
    try {
      const { id } = await api.startDraw({
        ...form,
        seed: keepsTheme ? undefined : form.seed,
        seed_id: keepsTheme ? themeId : undefined,
        source: sources.join(",") || undefined,
      });
      location.hash = `#draw/${id}`;
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const eligible = new Map(status?.per_source.map((s) => [s.source, s.eligible]) ?? []);
  return (
    <div className="pane read">
      <form className="form" onSubmit={start}>
        <h1>{like ? "Redraw" : "Start a draw"}</h1>
        {like && (
          <p className="lede mb-3">
            Every option below comes from{" "}
            <a href={`#draw/${like}`} className="num">
              {like}
            </a>
            , which stays open. Change what you want and start.
          </p>
        )}
        <p className="lede">
          Pulls six eligible passages and a seed, asks for five premises off the centre of the distribution, writes each as a 400-word vignette, then stops at the gate for you. After the gate: a reverse outline, two
          context vignettes, the ending, and a brief in <span className="num">briefs/</span>.
        </p>
        <Field label="Gate" help="Manual waits for you after the vignettes. Auto takes the lowest-probability premise and keeps going.">
          <Seg label="Gate" value={form.mode} options={["manual", "auto"]} onChange={(v) => setForm({ ...form, mode: v })} />
        </Field>
        <Field label="Setting" htmlFor="setting" help="A setting gives each stage the world to write in. Unrestricted gives none.">
          <select id="setting" className="sel" value={form.setting ?? ""} onChange={set("setting")}>
            <option value="">Unrestricted</option>
            {facets?.settings.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Sampling"
          help={
            <>
              {SAMPLING_HELP[form.sampling] ?? ""} Stated probability {form.sampling === "standard" ? "over 0.35" : form.sampling === "off-centre" ? "0.10 to 0.35" : "under 0.10"}.
            </>
          }
        >
          <Seg label="Sampling" value={form.sampling} options={(facets?.sampling ?? []).map((s) => s.mode)} onChange={(v) => setForm({ ...form, sampling: v })} />
        </Field>
        <Field label="Genre" htmlFor="genre" help="Chips fill the field, joined with “and”; type over it for anything else. It reaches one line of the premises ask.">
          <div className="flex flex-col gap-2">
            <div className="srcs" role="group" aria-label="Genre">
              {Object.entries(facets?.genres ?? {}).map(([g, vs]) => (
                <div key={g} className="srcgroup">
                  <span className="grouphd" aria-hidden="true">
                    {g}
                  </span>
                  <div className="chips">
                    {vs.map((v) => (
                      <Chip key={v} pressed={genreParts.includes(v)} onClick={() => toggleGenre(v)}>
                        {v}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <input id="genre" name="genre" type="text" value={form.genre ?? ""} placeholder="Empty: taken from the examples drawn" onChange={typeGenre} />
          </div>
        </Field>
        <Field
          label="Examples from"
          help={
            sources.length
              ? `${sources.reduce((n, id) => n + (eligible.get(id) ?? 0), 0)} eligible passages across ${sources.length} source${sources.length > 1 ? "s" : ""}.`
              : `None selected: all ${status?.passages_eligible ?? ""} eligible passages.`
          }
        >
          <div className="srcs" role="group" aria-label="Sources">
            {groups.map(([g, rows]) => (
              <div key={g} className="srcgroup">
                <button type="button" className="grouphd" aria-pressed={rows.every((r) => sources.includes(r.id))} onClick={() => toggleGroup(rows)}>
                  {g}
                </button>
                <div className="chips">
                  {rows.map((r) => (
                    <Chip key={r.id} pressed={sources.includes(r.id)} title={r.id} onClick={() => toggleSource(r.id)}>
                      {r.title}
                      {eligible.has(r.id) ? <span className="text-dim"> · {eligible.get(r.id)}</span> : null}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Field>
        <Field label="Seed" htmlFor="seed" help={<>{status ? `${status.themes_eligible} eligible themes in the bank. ` : ""}A typed seed is logged as “typed”, a drawn one as “drawn”.</>}>
          <textarea
            id="seed"
            name="seed"
            value={form.seed ?? ""}
            onChange={(e) => {
              setSeedTouched(true);
              setForm({ ...form, seed: e.target.value });
            }}
            placeholder="Leave empty to draw a theme from the bank, or type one…"
          />
        </Field>
        <div className="actions">
          <Btn type="submit" variant="primary" pad disabled={busy}>
            {busy ? "starting…" : "start"}
          </Btn>
          <span className="text-dim">About a minute to the gate, a few more to a brief.</span>
          {err && <div className="err basis-full">{err}</div>}
        </div>
      </form>
    </div>
  );
}
