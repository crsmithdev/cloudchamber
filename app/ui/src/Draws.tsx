import React, { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { api, when, type Artifact, type Candidate, type Example, type Facets, type Draw, type Fork, type FullStep, type Origin, type Parts, type Repair, type Source, type Status, type Step } from "./api.ts";
import { ArchivedToggle, Bar, Btn, Caret, Chip, Field, Head, Icon, LinkBtn, Mark, Seg, hhmm, lastSelected, markFor, secs, usePoll, useRememberSelected, useTick, type MarkState } from "./ui.tsx";

export type Detail = { draw: Draw; origin: Origin | null; steps: Step[]; parts: Parts; checks_next: string[]; repair: Repair; artifacts: Artifact[]; candidates: Candidate[]; examples: Example[]; forks: Fork[] };
const STAGES = ["premises", "execute", "gate", "outline", "context", "ending", "brief"];
export const LABEL: Record<string, string> = {
  awaiting_gate: "choose a premise",
  done: "brief",
  awaiting_check_gate: "review findings",
  awaiting_draft_gate: "review draft",
  checking: "checking",
  repairing: "repairing",
  drafting: "drafting",
  drafted: "drafted",
  repaired: "repaired",
  running: "running",
};
export const label = (status: string) => LABEL[status] ?? status;
const choose = (index: number) => `Continue with premise ${index}: outline, two context vignettes, the ending, then the brief.`;
const SAMPLING_HELP: Record<string, string> = {
  tail: "The strangest readings of the seed: premises nobody else would file.",
  "off-centre": "Off the centre but inside the tradition: unusual without being absurd.",
  standard: "The strongest conventional treatment: what a good writer would reach for.",
};
const DARKNESS_HELP: Record<string, string> = {
  none: "Nothing asked: the seed and the examples set how dark the story is.",
  light: "The cost is real, but someone keeps something and a way out exists.",
  grey: "The cost is paid in full; whether it was worth it stays open.",
  dark: "The cost is total or the way out is closed; no consolation.",
  black: "The worst outcome the premise supports, reaching past the protagonist.",
};
const develop = (index: number) => `Develop premise ${index} as a draw of its own: the same seed and examples, its own outline, context vignettes, ending and brief.`;
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

/**
 * A list row's top line, the whole row when it is folded: the status mark, the
 * name, the round count, the date and the archive and delete controls. Delete
 * asks in the row before it acts.
 */
export function RowHead({
  name,
  status,
  mark,
  rounds = 1,
  at,
  archived,
  blocked,
  onArchive,
  onDelete,
}: {
  name: string;
  status: string;
  mark: MarkState;
  rounds?: number;
  at: string;
  archived: boolean;
  /** why this row cannot be deleted, or empty when it can */
  blocked: string;
  onArchive: () => void;
  onDelete?: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <>
      <div className="l1">
        <Mark state={mark} title={status} />
        <b>{name}</b>
        {rounds > 1 && (
          <span className="rounds" title={`${rounds} rounds`}>
            {rounds}r
          </span>
        )}
        <span className="when">{when(at).split(",")[0]}</span>
        <span className="tools" onClick={stop}>
          <button
            className="ico"
            title={archived ? "Put this back in the list." : "Hide this from the list. Nothing else about it changes."}
            aria-label={`${archived ? "Unarchive" : "Archive"} ${name}`}
            onClick={onArchive}
          >
            <Icon name={archived ? "unarchive" : "archive"} />
          </button>
          <button
            className="ico del"
            disabled={!!blocked}
            title={blocked ? `Cannot delete: ${blocked}.` : "Delete this and every step under it. There is no undo."}
            aria-label={`Delete ${name}`}
            onClick={() => setAsking(true)}
          >
            <Icon name="delete" />
          </button>
        </span>
      </div>
      {asking && (
        <div className="confirm" onClick={stop}>
          <span>Delete {name} and every step under it? There is no undo.</span>
          <Btn
            variant="pass"
            onClick={() => {
              setAsking(false);
              onDelete?.();
            }}
          >
            delete
          </Btn>
          <Btn variant="quiet" onClick={() => setAsking(false)}>
            keep
          </Btn>
        </div>
      )}
    </>
  );
}

/** Draws in the list pane, each opening into its facts and step log; the selected draw, a step, or the start form fills the rest. */
export function Draws({ status, selected, like }: { status: Status | null; selected: string | undefined; like?: string }) {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  // the current draw is the only row that can be open; this folds it
  const [folded, setFolded] = useState(false);
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
  const busy = draws.some((r) => r.running);
  usePoll(loadDraws, busy, [], 3000, 15000);

  // Archived draws stay out of the list until asked for, and the open one stays visible whatever its state.
  // a repair round ran no premises: it belongs to check alone
  const ideate = draws.filter((r) => !r.repaired_from);
  const archived = ideate.filter((r) => r.archived_at).length;
  // With nothing chosen, land on the draw last selected here while it is still in the list, else the newest; with no draws, the form.
  const live = ideate.filter((r) => !r.archived_at);
  const last = lastSelected("draws");
  // the form only once the list has loaded and is empty; before that the pane waits
  const current = selected ?? (ideate.find((r) => r.id === last) ?? live[0])?.id ?? (loaded && !live.length ? "new" : undefined);
  useRememberSelected("draws", selected && selected !== "new" ? selected : undefined);
  const shown = ideate.filter((r) => showArchived || !r.archived_at || r.id === current);
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
    setFolded(false);
  }, [current]);
  const d = current && !isForm ? details[current] : undefined;
  // the pane refreshes itself while the pipeline is working on this draw, and rarely once it stops
  const working = isWorking(d);
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
    setFolded((f) => !f);
  };
  const archiveRow = async (r: Draw) => {
    setErr("");
    try {
      await api.gate(r.id, { action: r.archived_at ? "unarchive" : "archive" });
      loadDraws();
      if (r.id === current) loadDetail(r.id);
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const deleteRow = async (r: Draw) => {
    setErr("");
    try {
      await api.deleteDraw(r.id);
      if (r.id === current) location.hash = "#draws";
      loadDraws();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  // superseded by a redraw is old; superseded by its own repair is a draw that went on to check
  const redrawn = (r: Draw) => !!r.superseded_by && !draws.some((x) => x.id === r.superseded_by && x.repaired_from === r.id);
  const gate = async (action: string, step_id?: string) => {
    if (!d) return;
    setErr("");
    try {
      const r = await api.gate(d.draw.id, { action, step_id, note });
      setNote("");
      if (r.draw && r.draw !== d.draw.id) location.hash = `#draw/${r.draw}`;
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
            {openCount} to choose
            <ArchivedToggle archived={archived} shown={showArchived} onToggle={() => setShowArchived((v) => !v)} />
          </span>
        </div>
        {shown.length === 0 && <div className="empty">No draws yet.</div>}
        {shown.map((r) => {
          const isOpen = r.id === current && !folded;
          return (
            <div
              key={r.id}
              className={"row" + (r.id === current ? " on" : "") + (isOpen ? " open" : "") + (r.running ? " running" : "") + (redrawn(r) || r.archived_at ? " old" : "")}
              onClick={() => select(r.id)}
            >
              <RowHead
                name={r.name ?? r.id}
                status={label(r.status)}
                mark={markFor(r)}
                at={r.created_at}
                archived={!!r.archived_at}
                blocked={r.actions.delete ?? ""}
                onArchive={() => archiveRow(r)}
                onDelete={() => deleteRow(r)}
              />
              {isOpen && (
                <>
                  <div className="l2">
                    <span className={r.running ? "sweep text-running" : ""}>{details[r.id] ? drawSummary(details[r.id]) : label(r.status)}</span>
                  </div>
                  <div className="l2 text-dim">
                    {r.setting ?? "unrestricted"} · {r.genre} · {r.sampling}
                    {r.flagged ? <span className="text-art"> · flagged</span> : null}
                    {r.forked_from && " · fork"}
                    {redrawn(r) && " · superseded"}
                    {r.archived_at && " · archived"}
                  </div>
                  <div className="sd">{r.seed_text}</div>
                </>
              )}
            </div>
          );
        })}
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
                <span className={"state " + (working ? "text-running" : d.draw.status === "awaiting_gate" ? "text-art" : d.draw.status === "failed" ? "text-pass" : "text-mute")}>
                  <Mark state={markFor(d.draw)} />
                  <span className={working ? "sweep" : ""}>
                    {label(d.draw.status)}
                    {working ? inFlight(d) : ""}
                  </span>
                </span>
                {!step && (
                  <span className="tools" role="group" aria-label="Draw">
                    <input type="text" name="gate-note" placeholder="note for the log" aria-label="Gate note" value={note} onChange={(e) => setNote(e.target.value)} />
                    <Btn variant="art" title="Mark this draw as a wrong call to look at later, with the note. It stays open and nothing else changes." onClick={() => gate("flag")}>
                      flag
                    </Btn>
                    {d.draw.status === "awaiting_gate" && (
                      <LinkBtn variant="quiet" href={`#draws/new/${d.draw.id}`} title="Open the draw form with this draw's options, to start another like it. This one stays open.">
                        redraw
                      </LinkBtn>
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
                      title={d.draw.actions.delete ?? "Remove this draw and every step under it. There is no undo."}
                      disabled={!!d.draw.actions.delete}
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
                <DrawBody
                  d={d}
                  onChoose={(id) => gate("choose", id)}
                  onFork={(id) => gate("fork", id)}
                  onVerdict={verdict}
                  aside={
                    <DrawAside
                      d={d}
                      ideation
                      onStep={setStepId}
                      rows={[
                        ...(d.draw.forked_from
                          ? [
                              [
                                "forked from",
                                <a href={`#draw/${d.draw.forked_from}`} className="num">
                                  {d.draw.forked_from}
                                </a>,
                              ] as Row,
                            ]
                          : []),
                        ...(d.draw.superseded_by
                          ? [
                              [
                                redrawn(d.draw) ? "superseded by" : "repaired in",
                                <a href={redrawn(d.draw) ? `#draw/${d.draw.superseded_by}` : `#check/${d.draw.superseded_by}`} className="num">
                                  {d.draw.superseded_by}
                                </a>,
                              ] as Row,
                            ]
                          : []),
                      ]}
                    />
                  }
                />
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

/** The open row's one summary line: where the draw stands, in a few words. The step log is in the reading pane. */
function drawSummary(d: Detail) {
  const running = d.steps.filter((s) => s.status === "running" && s.tab === "ideate");
  const chosen = d.candidates.find((c) => c.step_id === d.draw.chosen_step);
  const failed = d.steps.filter((s) => s.status === "failed" && s.tab === "ideate").length;
  if (running.length) return `running · ${stageNames(running)}`;
  if (d.draw.status === "awaiting_gate") return `choose a premise · ${d.candidates.length} written`;
  if (d.draw.status === "failed") return `failed · ${failed} step${failed === 1 ? "" : "s"}`;
  if (chosen) return `brief · #${chosen.index} chosen · in ${d.draw.stage}`;
  return label(d.draw.status);
}

/** What the step log calls each stage, and what the stage does: the row's tooltip. */
const STAGE: Record<string, { name: string; does: string }> = {
  premises: { name: "propose premises", does: "One model call proposes five premises from the seed and the six examples, each with its stated probability." },
  execute: { name: "write vignette", does: "Writes one premise as a vignette. The five calls run side by side, one for each premise." },
  gate: { name: "choose premise", does: "The draw stops here until a premise is chosen to develop." },
  outline: { name: "derive outline", does: "Derives the chosen vignette's structure: the one impossibility it buys, its settled numbers and dates, and who holds which evidence." },
  jobs: { name: "plan context", does: "Names the job of each of the two context vignettes: the one thing about the outline each vignette tests." },
  context: { name: "write context", does: "Writes one context vignette to its job from the plan. There are two." },
  ending: { name: "write ending", does: "Writes the last beat from the outline's numbers and its custody of the evidence." },
  brief: { name: "export brief", does: "The premise, the outline, the three vignettes and the ending, written to files under briefs/." },
  "repair-vignette": { name: "repair vignette", does: "A repair round starts from the chosen vignette: rewritten from itself when an accepted finding lands in it, carried over otherwise. The step's model says which." },
  "repair-context": { name: "repair context", does: "Rewrites one context vignette from itself under the replacements of the findings that landed in it. A context nothing landed in is carried over instead." },
  "repair-outline": { name: "repair outline", does: "Edits the outline as it stands under the replacements of the findings you accepted, and changes nothing else." },
  "repair-ending": { name: "repair ending", does: "Writes the ending again from the repaired outline." },
  "ledger-extract": { name: "extract ledger", does: "Lists every settled fact in the outline: times, details, who knows what, who holds what, the world's rules." },
  "check-derivation": { name: "check derivation", does: "Checks that every assertion in the vignettes and the ending follows from the outline's one impossibility, and does every sum." },
  "check-ledger": { name: "check ledger", does: "Checks the vignettes and the ending against the ledger of settled facts, and against each other." },
  "check-verify": { name: "verify findings", does: "Reads every finding back against the brief and keeps only those a reader of the vignettes and the ending would notice. A finding whose span is not in that prose is dropped first, with no call." },
  reconcile: { name: "reconcile fixes", does: "Reads the fixes an auto round is about to apply against each other and drops the lower-scoring side of each pair that cannot both hold." },
  "check-structure": { name: "check structure", does: "Seven present-or-absent questions about the brief, each answered with a quote." },
  "check-resemblance": { name: "check resemblance", does: "Matches the brief against the list of overused premises and names the nearest published work." },
  "check-claims-extract": { name: "find claims", does: "Lists the brief's factual claims that the setting's authority can confirm or deny." },
  "check-claims-verify": { name: "verify claim", does: "Checks one claim against the setting's authority: the setting file, its reference files or the web." },
  schedule: { name: "plan scenes", does: "Plans the story as beats: each beat's job, its word cap, what the reader knows by its end and what stays withheld." },
  scene: { name: "write scene", does: "Writes one beat of the schedule as a scene. A rewrite of a scene adds one more run." },
  "screen-ledger": { name: "screen facts", does: "Checks one scene against the ledger of settled facts and flags each contradiction with a replacement." },
  "screen-structure": { name: "screen structure", does: "Asks one scene the present-or-absent questions that mark a weak draft, each answered with a quote." },
  "screen-slop": { name: "count slop", does: "Counts overused words, not-X-but-Y turns, repeated trigrams and paragraph shape against the passage pool. No model call." },
};
export const stageName = (stage: string) => STAGE[stage]?.name ?? stage;
/** The distinct stage names of some steps, in the order they first appear. */
export const stageNames = (steps: { stage: string }[]) => [...new Set(steps.map((s) => stageName(s.stage)))].join(", ");
/** Whether the pipeline is working on a draw: its status says so, or a call is in flight. */
export const isWorking = (d: Detail | undefined | null) => !!d && (d.draw.running || d.steps.some((s) => s.status === "running"));
/** A person's flag, and why the last action failed, each said as what it is. */
export function DrawNotes({ draw }: { draw: Draw }) {
  return (
    <>
      {draw.error && <div className="err mt-2">{draw.status === "failed" ? "failed" : "the last action failed"}: {draw.error}</div>}
      {draw.flag_note && <div className="warn mt-2">flagged: {draw.flag_note}</div>}
    </>
  );
}
/** " · " and the stages of the calls in flight, or nothing when none is. */
export const inFlight = (d: Detail) => {
  const running = d.steps.filter((s) => s.status === "running");
  return running.length ? ` · ${stageNames(running)}` : "";
};

/**
 * The step log as a time table: step, started, seconds. Each row names its step in words, says which one of a
 * set it is under the name, and explains the step on hover. A running row sweeps; the gate waits; what is still
 * to come is faint.
 */
export function Log({ d, stepId, onStep, ideation }: { d: Detail; stepId: string | null; onStep: (id: string) => void; ideation?: boolean }) {
  const byParent = new Map<string | null, Step[]>();
  for (const s of d.steps) {
    const k = s.parent_id;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(s);
  }
  const flat: Step[] = [];
  const walk = (parent: string | null) => {
    for (const s of byParent.get(parent) ?? []) {
      flat.push(s);
      walk(s.id);
    }
  };
  walk(null);
  if (ideation) flat.splice(0, flat.length, ...flat.filter((s) => s.tab === "ideate"));
  useTick(d.steps.some((s) => s.status === "running" && Date.now() - Date.parse(s.started_at) < 30 * 60 * 1000));
  const cand = new Map(d.candidates.map((c) => [c.step_id, c]));
  // a stage that runs more than once (samples, claims, the two context vignettes) numbers each run
  const ofStage = new Map<string, Step[]>();
  for (const s of flat) ofStage.set(s.stage, [...(ofStage.get(s.stage) ?? []), s]);
  const seen = new Set(d.steps.map((s) => s.stage));
  const inFlight = d.draw.status === "awaiting_gate" || d.draw.status === "running";
  const developed = !["awaiting_gate", "running", "done", "failed"].includes(d.draw.status);
  const noteFor = (s: Step) => {
    const c = cand.get(s.id);
    const runs = ofStage.get(s.stage) ?? [];
    const parts = [
      c ? `premise #${c.index}` : runs.length > 1 ? `${runs.indexOf(s) + 1} of ${runs.length}` : "",
      s.id === d.draw.chosen_step ? "chosen" : "",
      s.attempt > 1 ? `attempt ${s.attempt}` : "",
      s.fail_reason ?? "",
    ];
    return parts.filter(Boolean).join(" · ");
  };
  const todo = (stage: string) => (
    <tr key={stage} className="todo" title={STAGE[stage]?.does}>
      <td>
        <Mark state="todo" />
      </td>
      <td className="n text-dim">
        {stageName(stage)}
        <small>to come</small>
      </td>
      <td className="num text-dim">—</td>
      <td className="num text-right text-dim">—</td>
    </tr>
  );
  return (
    <div className="log" onClick={(e) => e.stopPropagation()}>
      <table>
        <thead>
          <tr>
            <th className="head w-4"></th>
            <th className="head">step</th>
            <th className="head" title="When the step started, as hours and minutes.">
              started
            </th>
            <th className="head text-right" title="How long the step took, in seconds.">
              secs
            </th>
          </tr>
        </thead>
        <tbody>
          {flat.map((s) => {
            // a step still marked running after half an hour is stale, not in flight: no sweep, no tick, the count in mute
            const stale = s.status === "running" && Date.now() - Date.parse(s.started_at) > 30 * 60 * 1000;
            const running = s.status === "running" && !stale;
            const note = noteFor(s);
            return (
              <tr
                key={s.id}
                className={"pick" + (s.id === stepId ? " on" : "") + (running ? " sweep" : "")}
                onClick={() => onStep(s.id)}
                title={`${STAGE[s.stage]?.does ?? s.stage} Open the step to read its prompt and response.`}
              >
                <td>
                  <Mark state={s.status === "failed" ? "fail" : running ? "run" : stale ? "todo" : "held"} />
                </td>
                <td className={"n" + (running ? " text-running" : "")}>
                  {stageName(s.stage)}
                  {note && <small>{note}</small>}
                </td>
                <td className="num text-dim">{hhmm(s.started_at)}</td>
                <td className={"num text-right" + (running ? " text-running" : stale ? " text-dim" : "")} title={stale ? "still marked running after half an hour" : undefined}>
                  {secs(s.started_at, s.ended_at)}
                </td>
              </tr>
            );
          })}
          {d.draw.status === "awaiting_gate" && (
            <tr title={STAGE.gate.does}>
              <td>
                <Mark state="wait" />
              </td>
              <td className="n text-art">
                choose premise<small>{d.draw.mode === "auto" ? "chosen automatically" : "waiting for you"}</small>
              </td>
              <td className="num text-dim">{flat.length ? hhmm(flat[flat.length - 1].ended_at ?? flat[flat.length - 1].started_at) : "—"}</td>
              <td className="num text-right text-art">—</td>
            </tr>
          )}
          {inFlight && STAGES.filter((st) => !seen.has(st) && st !== "gate" && st !== "brief").map(todo)}
          {inFlight && todo("brief")}
          {(d.draw.status === "done" || developed) && (
            <tr title={STAGE.brief.does}>
              <td>
                <Mark state="held" />
              </td>
              <td className="n">
                export brief<small>to briefs/</small>
              </td>
              <td className="num text-dim">{d.draw.ended_at ? hhmm(d.draw.ended_at) : ""}</td>
              <td className="num text-right text-dim">—</td>
            </tr>
          )}
          {developed && (
            <tr className="pick" title={`The brief is in the ${d.draw.stage} tab now. Open it there.`} onClick={() => (location.hash = `#${d.draw.stage}/${d.draw.id}`)}>
              <td>
                <Mark state={markFor(d.draw)} />
              </td>
              <td className="n">
                open in {d.draw.stage}
                <small>{label(d.draw.status)}</small>
              </td>
              <td></td>
              <td className="text-right">
                <a href={`#${d.draw.stage}/${d.draw.id}`} className="link">
                  open <Icon name="arrow_forward" />
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
  aside,
}: {
  d: Detail;
  onChoose: (stepId: string) => void;
  onFork: (stepId: string) => void;
  onVerdict: (e: Example, v: "keep" | "pass", artifact?: boolean, note?: string) => void;
  aside: React.ReactNode;
}) {
  const [openVig, setOpenVig] = useState<string | null>(d.draw.chosen_step);
  const [openEx, setOpenEx] = useState<string | null>(null);
  const [exNote, setExNote] = useState<Record<string, string>>({});
  const cands = d.candidates;
  const maxP = Math.max(...cands.map((c) => c.probability), 0.01);
  const gating = d.draw.actions.choose === null;
  const running = d.steps.filter((s) => s.status === "running");
  const runningExec = new Set(running.filter((s) => s.stage === "execute").map((s) => s.id));
  return (
    <div className="drawbody">
      <div className="min-w-0">
        <Head>seed</Head>
        <SeedNote text={d.draw.seed_text} />
        <DrawNotes draw={d.draw} />
        {cands.length > 0 && (
          <>
            <Head className="mt-5" note="lowest probability first">
              premises
            </Head>
            <table className="mt-1">
              <thead>
                <tr>
                  <th className="head w-7">#</th>
                  <th className="head w-20" title="The probability the model stated for this premise.">
                    p
                  </th>
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
                              choose
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
        {d.steps.some((s) => s.stage === "ending" && s.status === "done") && (
          <>
            <Head className="mt-6" note="what the chosen premise became: the outline, its vignette, two context vignettes and the ending">
              brief
            </Head>
            <BriefFiles id={d.draw.id} />
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
              <th className="head">voice / mode</th>
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
                        {/* a passage in the pool is the default and carries no mark */}
                        {e.latest?.artifact ? <Mark state="art" title="marked as an artifact" /> : e.latest?.verdict === "pass" ? <Mark state="fail" title="passed: out of the pool" /> : null}
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
                            <Btn variant="keep" title="Keep this passage: it goes back in the pool for future draws." onClick={() => onVerdict(e, "keep", e.latest?.artifact ?? false, exNote[e.id] ?? "")}>
                              keep
                            </Btn>
                          ) : (
                            <Btn
                              variant="pass"
                              title="Pass on this passage: it leaves the pool for every future draw. This draw is unaffected."
                              onClick={() => onVerdict(e, "pass", e.latest?.artifact ?? false, exNote[e.id] ?? "")}
                            >
                              pass
                            </Btn>
                          )}
                          <Btn
                            variant="art"
                            title="Mark this passage as an extraction artifact, a passage the reader cut badly: it leaves the pool, and the note says what went wrong."
                            onClick={() => onVerdict(e, e.latest?.verdict ?? "keep", !e.latest?.artifact, exNote[e.id] ?? "")}
                          >
                            {e.latest?.artifact ? "unmark artifact" : "mark artifact"}
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
      <div className="aside min-w-0">{aside}</div>
    </div>
  );
}

/**
 * The reading pane's right column in every tab: what the draw was drawn under and what it has cost, then the
 * rounds of a repair chain, then the step log. Ideate counts its own stages only.
 */
type Row = [React.ReactNode, React.ReactNode];
export function DrawAside({ d, ideation, onStep, top, rows = [] }: { d: Detail; ideation?: boolean; onStep: (id: string) => void; top?: React.ReactNode; rows?: Row[] }) {
  const mine = d.steps.filter((s) => !ideation || s.tab === "ideate");
  const steps = mine.filter((s) => s.status === "done");
  const gating = d.draw.status === "awaiting_gate" || d.draw.status === "running";
  const total = mine.length + (ideation && gating ? STAGES.length - mine.length : 0);
  const callSecs = steps.reduce((n, s) => n + Number(secs(s.started_at, s.ended_at)), 0);
  // a repair round copies the chosen vignette: that step names no model
  const models = [...new Set(mine.map((s) => s.model).filter((m) => m && m !== "copied"))];
  const fact = (key: string, tip: string, value: React.ReactNode, cls = "") => (
    <tr key={key} title={tip}>
      <td className="w-24 whitespace-nowrap text-dim">{key}</td>
      <td className={"[overflow-wrap:anywhere] " + cls}>{value}</td>
    </tr>
  );
  return (
    <>
      <div className="facts-block mb-6">
        <Head as="div">draw</Head>
        <table className="mt-1">
          <tbody>
            {fact("id", "The draw's id: its folder under briefs/ and drafts/ has this name.", d.draw.id, "font-mono")}
            {d.origin &&
              fact(
                d.origin.id === d.draw.id ? "premise" : "from",
                d.origin.id === d.draw.id ? "The premise this draw developed, with its stated probability." : "The draw and premise this one was developed from, with the premise's stated probability.",
                <>
                  <a href={`#draw/${d.origin.id}`}>{d.origin.id === d.draw.id ? `#${d.origin.index}` : `${d.origin.name ?? d.origin.id}${d.origin.index ? ` #${d.origin.index}` : ""}`}</a>
                  {d.origin.probability != null && <span className="text-dim"> · {d.origin.probability.toFixed(2)}</span>}
                </>,
                "font-mono",
              )}
            {rows.map(([k, v], i) => (
              <tr key={i}>
                <td className="text-dim">{k}</td>
                <td>{v}</td>
              </tr>
            ))}
            {fact("setting", "The world each stage writes in. Unrestricted: no setting file.", d.draw.setting ?? "unrestricted")}
            {fact("genre", "The genre named in every prompt.", d.draw.genre)}
            {fact(
              "sampling",
              "The band of stated probability the premises were asked to fall in.",
              <>
                {d.draw.sampling} <span className="num text-dim">· {d.draw.sampling === "tail" ? "0 to 0.1" : d.draw.sampling === "off-centre" ? "0.1 to 0.35" : "0.35 to 1"}</span>
              </>,
            )}
            {fact("darkness", "How dark the ending was asked to be. None: the seed and the examples decide.", d.draw.darkness ?? "none")}
            {fact(
              "choice",
              "Manual: the draw stops for you to choose a premise. Auto: a model chooses.",
              <>
                {d.draw.mode}
                {d.draw.gate_method && d.draw.gate_method !== d.draw.mode ? <span className="text-dim"> · chosen {d.draw.gate_method}</span> : ""}
              </>,
            )}
            {models.length > 0 && fact("model", "The models the steps ran on.", models.join(" · "), "font-mono")}
            {fact(
              "model calls",
              "The model calls that finished, and their seconds added together.",
              <>
                {steps.length} <span className="text-dim">· {callSecs} s</span>
              </>,
              "font-mono",
            )}
            {fact("started", "When the draw started.", when(d.draw.created_at), "font-mono")}
            {d.draw.ended_at && fact("ended", "When the draw last stopped: to wait for a choice, or with its brief written.", when(d.draw.ended_at), "font-mono")}
          </tbody>
        </table>
      </div>
      {top}
      <div>
        <Head as="div" note={`${steps.length} of ${total} done · hover a step for what it does`}>
          steps
        </Head>
        <Log d={d} stepId={null} onStep={onStep} ideation={ideation} />
      </div>
    </>
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
        <b className="text-ink" title={step.stage}>
          {stageName(step.stage)}
        </b>
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

/** How a genre group reads on the form; the group keys in genres.toml stay lowercase. */
const GENRE_GROUP: Record<string, string> = { scifi: "Sci-fi" };

function StartForm({ status, like }: { status: Status | null; like?: string }) {
  const [facets, setFacets] = useState<Facets | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ mode: "manual", sampling: "tail" });
  // genre is the picked tokens, then any free text after them
  const [genreParts, setGenreParts] = useState<string[]>([]);
  const [genreText, setGenreText] = useState("");
  const genreInput = React.useRef<HTMLInputElement>(null);
  const [likedGenre, setLikedGenre] = useState<string | null>(null);
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
        setForm({ mode: o.mode, sampling: o.sampling ?? "tail", darkness: o.darkness ?? "", setting: o.setting ?? "", seed: o.seed_text });
        setLikedGenre(o.genre ?? "");
        setSeedTouched(false);
        setThemeId(o.seed?.mode === "picked" ? o.seed.themeId : "");
        const s = o.segment?.source;
        setSources(Array.isArray(s) ? s : s ? [s] : []);
      })
      .catch((e) => setErr(e.message));
  }, [like]);
  const known = useMemo(() => new Set(Object.values(facets?.genres ?? {}).flat()), [facets]);
  // a redrawn genre becomes tokens where every part is a known genre, and free text otherwise
  const setGenre = (g: string) => {
    const parts = g
      .split(" and ")
      .map((p) => p.trim())
      .filter(Boolean);
    const all = parts.length > 0 && parts.every((p) => known.has(p));
    setGenreParts(all ? parts : []);
    setGenreText(all ? "" : g);
  };
  // the redrawn genre waits for the genre list, which says which parts are tokens
  useEffect(() => {
    if (likedGenre !== null && facets) setGenre(likedGenre);
  }, [likedGenre, facets]);
  const toggleGenre = (v: string) => setGenreParts((ps) => (ps.includes(v) ? ps.filter((x) => x !== v) : [...ps, v]));
  // the prompt reads one line: the tokens joined with "and", the free text after them
  const genre = [genreParts.join(" and "), genreText.trim()].filter(Boolean).join(" ");
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
        genre,
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
        <p className="lede">Pulls six eligible passages and a seed, asks for five premises in the sampling band you pick, writes each as a 400-word vignette, then stops for a premise to be chosen.</p>
        <Field label="Choice" help={form.mode === "auto" ? "A model chooses the premise and the draw runs on to its brief." : "The draw stops for you to choose a premise."}>
          <Seg label="Choice" value={form.mode} options={["manual", "auto"]} onChange={(v) => setForm({ ...form, mode: v })} />
        </Field>
        <Field label="Setting" htmlFor="setting" help="A setting gives each stage the world to write in.">
          <select id="setting" className="sel" value={form.setting ?? ""} onChange={set("setting")}>
            <option value="">Unrestricted</option>
            {facets?.settings.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
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
        <Field label="Darkness" help={DARKNESS_HELP[form.darkness || "none"]}>
          <Seg label="Darkness" value={form.darkness || "none"} options={["none", ...(facets?.darkness ?? [])]} onChange={(v) => setForm({ ...form, darkness: v === "none" ? "" : v })} />
        </Field>
        <Field label="Genre" htmlFor="genre">
          <div className="flex flex-col gap-2">
            <div className="srcs" role="group" aria-label="Genre">
              {Object.entries(facets?.genres ?? {}).map(([g, vs]) => (
                <div key={g} className="srcgroup">
                  <span className="grouphd" aria-hidden="true">
                    {GENRE_GROUP[g] ?? g.charAt(0).toUpperCase() + g.slice(1)}
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
            <div className="tokens" onClick={() => genreInput.current?.focus()}>
              {genreParts.map((p) => (
                <span key={p} className="token">
                  {p}
                  <button type="button" aria-label={`Remove ${p}`} title={`Remove ${p}`} onClick={() => toggleGenre(p)}>
                    <Icon name="close" />
                  </button>
                </span>
              ))}
              <input
                ref={genreInput}
                id="genre"
                name="genre"
                type="text"
                value={genreText}
                placeholder={genreParts.length ? "" : "Empty: taken from the examples drawn"}
                onChange={(e) => setGenreText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !genreText && genreParts.length) setGenreParts(genreParts.slice(0, -1));
                }}
              />
            </div>
          </div>
        </Field>
        <Field label="Examples from" help={sources.length ? `${sources.reduce((n, id) => n + (eligible.get(id) ?? 0), 0)} eligible passages across ${sources.length} source${sources.length > 1 ? "s" : ""}.` : undefined}>
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
        <Field label="Seed" htmlFor="seed">
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
          {err && <div className="err basis-full">{err}</div>}
        </div>
      </form>
    </div>
  );
}

/** Markdown from the outline stage opens paragraphs with a label and a colon; the label reads better set bold. */
export const boldLabels = (md: string) => md.replace(/^([A-Z][A-Za-z0-9 ,'’/&-]{0,40}):(?=\s)/gm, "**$1:**");

export function useBrief(id: string) {
  const [brief, setBrief] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    setBrief(null);
    api
      .brief(id)
      .then(setBrief)
      .catch(() => setBrief({}));
  }, [id]);
  return brief;
}

export const BRIEF_FILES = ["outline.md", "vignette.md", "context-1.md", "context-2.md", "ending.md", "ending.previous.md"];

/** The brief's files as a table: one row per file, the open one's text under it. */
export function BriefFiles({ id, open = "outline.md" }: { id: string; open?: string }) {
  const brief = useBrief(id);
  const [openFile, setOpenFile] = useState<string | null>(open);
  useEffect(() => setOpenFile(open), [open, id]);
  if (!brief) return <span className="text-dim">loading the brief…</span>;
  return (
    <table className="mt-1">
      <tbody>
        {BRIEF_FILES.filter((f) => brief[f]).map((f) => (
          <React.Fragment key={f}>
            <tr className="pick" onClick={() => setOpenFile(openFile === f ? null : f)}>
              <td className="w-4">
                <Caret open={openFile === f} />
              </td>
              <td className="num whitespace-nowrap text-dim">{f}</td>
              <td className="text-mute">
                <span className="line-clamp-1">{firstParagraph(brief[f]).slice(0, 90)}</span>
              </td>
            </tr>
            {openFile === f && (
              <tr className="spans">
                <td colSpan={3} style={{ paddingLeft: "1.75rem" }}>
                  <Md text={boldLabels(brief[f])} />
                </td>
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}
