import React, { useEffect, useMemo, useState } from "react";
import { api, when, type AutoResult, type Draw, type DraftConfig, type Finding, type Findings, type Story, type Step } from "./api.ts";
import { BriefFiles, DrawMeta, Log, Md, RUNNING_STATUS, RowHead, SeedNote, StepView, boldLabels, firstParagraph, label, useBrief, type Detail } from "./Draws.tsx";
import { Bar, Btn, Caret as Chevron, Facts, Field, Head, Icon, Mark, Seg, markFor, secs, usePoll } from "./ui.tsx";

/**
 * Develop a brief: the stages after a brief (docs/specs/2026-09-05-drafting-pipeline.md).
 * The list holds briefs from the moment they exist to the moment they are kept
 * or passed; the reading pane is the findings at gate 1, the story with its
 * screens at gate 2, or the running log in between.
 */
const OPEN = new Set(["awaiting_check_gate", "awaiting_draft_gate"]);
/** A repair chain: the root draw, its rounds oldest first, and the head. A draw with no repairs is a chain of one. */
type Chain = { root: Draw; rounds: Draw[]; head: Draw };
function chainsOf(draws: Draw[]): Chain[] {
  const by = new Map(draws.map((r) => [r.id, r]));
  const rootOf = (r: Draw) => {
    const seen = new Set<string>();
    while (r.repaired_from && by.has(r.repaired_from) && !seen.has(r.id)) {
      seen.add(r.id);
      r = by.get(r.repaired_from)!;
    }
    return r;
  };
  const groups = new Map<string, Draw[]>();
  for (const r of draws) {
    const root = rootOf(r).id;
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(r);
  }
  return [...groups.values()]
    .map((rounds) => {
      rounds.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      return { root: rounds[0], rounds, head: rounds[rounds.length - 1] };
    })
    .sort((a, b) => (a.head.created_at < b.head.created_at ? 1 : -1));
}
const INVALIDATES = ["debt audit", "arithmetic", "custody"];
/** A quoted span is shown between the row's own quotation marks; a span the model already quoted would show two. */
const unquote = (s: string) => s.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "");

export function Develop({ stage, selected }: { stage: "check" | "write"; selected: string | undefined }) {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [d, setD] = useState<Detail | null>(null);
  const [stepId, setStepId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [settings, setSettings] = useState(false);
  const [folded, setFolded] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const loadDraws = () =>
    api
      .draws(true)
      .then(setDraws)
      .catch(() => {});
  // one entry per repair chain, named for its root, shown where its head is; the rounds in order
  // a chain is archived when its head is: archive acts on every round, so the list never shows part of one
  const all = useMemo(() => chainsOf(draws).filter((c) => c.head.stage === stage), [draws, stage]);
  const chains = all.filter((c) => !c.head.archived_at);
  const archived = all.length - chains.length;
  const heads = chains.map((c) => c.head);
  const busy = heads.some((r) => RUNNING_STATUS.has(r.status));
  const summarising = chains.some((c) => c.rounds.some((r) => r.check === null && r.status !== "done"));
  usePoll(loadDraws, busy || summarising, [stage], 3000, 15000);
  const current = selected ?? (heads.find((r) => OPEN.has(r.status)) ?? heads[0])?.id;
  const chainOf = (id: string | undefined) => chains.find((c) => c.rounds.some((r) => r.id === id));
  const loadDetail = (id: string) =>
    api
      .draw(id)
      .then(setD)
      .catch((e) => setErr(e.message));
  useEffect(() => {
    if (!current) return;
    setD(null);
    setStepId(null);
    setErr("");
    setSettings(false);
    setFolded(false);
    return () => {};
  }, [current]);
  const working = !!d && (RUNNING_STATUS.has(d.draw.status) || d.steps.some((s) => s.status === "running"));
  usePoll(
    () => {
      if (current) loadDetail(current);
    },
    working,
    [current],
  );
  const act = async (fn: () => Promise<any>, go?: (r: any) => string | undefined) => {
    setErr("");
    try {
      const r = await fn();
      const to = go?.(r);
      if (to && to !== current) location.hash = `#${stage}/${to}`;
      else if (current) loadDetail(current);
      loadDraws();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const archiveChain = (c: Chain) => act(() => Promise.all(c.rounds.map((x) => api.gate(x.id, { action: c.head.archived_at ? "unarchive" : "archive" }))));
  const shown = all.filter((c) => showArchived || !c.head.archived_at || c.rounds.some((x) => x.id === current));
  const step = d && stepId ? d.steps.find((s) => s.id === stepId) : undefined;
  const statusLine = (r: Draw) => (r.status === "done" ? "brief · not yet checked" : label(r.status));
  const atGate = draws.filter((r) => OPEN.has(r.status)).length;
  return (
    <>
      <div className="pane list">
        <div className="listhead">
          <span className="head">
            {stage === "check"
              ? `${heads.filter((r) => OPEN.has(r.status)).length} at gate 1 · ${heads.filter((r) => r.status === "done").length} unchecked`
              : `${heads.filter((r) => OPEN.has(r.status)).length} at gate 2 · ${heads.filter((r) => r.status === "drafted").length} kept`}
            {chains.some((c) => c.rounds.length > 1) && <span className="note"> · {chains.filter((c) => c.rounds.length > 1).length} repair chains</span>}
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
        {chains.length === 0 && <div className="empty">{stage === "check" ? "No briefs yet. Choose a candidate at a gate under ideate." : "Nothing drafted yet. Send a checked brief here from check."}</div>}
        {shown.map((c) => {
          const r = c.head;
          const on = c.rounds.some((x) => x.id === current);
          const isOpen = on && !folded;
          const max = Math.max(...c.rounds.map((x) => x.check?.total ?? 0), 1);
          const lowest = c.rounds.reduce((m, x) => (x.check && (!m || x.check.total < m.check!.total) ? x : m), null as Draw | null);
          return (
            <div
              key={c.root.id}
              className={"row" + (on ? " on" : "") + (isOpen ? " open" : "") + (RUNNING_STATUS.has(r.status) ? " running" : "") + (r.archived_at ? " old" : "")}
              onClick={() => {
                if (!on) location.hash = `#${stage}/${r.id}`;
                else if (stepId) setStepId(null);
                else setFolded((f) => !f);
              }}
            >
              <RowHead
                name={c.root.name ?? c.root.id}
                status={statusLine(r)}
                mark={markFor(r.status)}
                rounds={c.rounds.length}
                at={r.created_at}
                archived={!!r.archived_at}
                blocked="it developed a candidate; archive it instead"
                onArchive={() => archiveChain(c)}
                onDelete={() => {}}
              />
              {isOpen && (
                <>
                  <div className="l2">
                    <span className={RUNNING_STATUS.has(r.status) ? "sweep text-running" : ""}>{statusLine(r)}</span>
                    <span className="text-dim">
                      {c.rounds.length > 1 && ` · round ${c.rounds.length} of ${c.rounds.length}`}
                      {r.origin?.index ? (
                        <span className="num text-mute">
                          {" "}
                          · #{r.origin.index}
                          {r.origin.probability != null ? ` · ${r.origin.probability.toFixed(2)}` : ""}
                        </span>
                      ) : null}{" "}
                      · {r.setting ?? "unrestricted"} · {r.genre}
                      {r.flagged ? <span className="text-art"> · flagged</span> : null}
                    </span>
                  </div>
                  <div className="sd">{r.seed_text}</div>
                  {c.rounds.length > 1 && (
                    <table className="ledger" onClick={(e) => e.stopPropagation()}>
                      <tbody>
                        {c.rounds.map((x, i) => (
                          <tr
                            key={x.id}
                            className={x.id === current ? "sel" : ""}
                            onClick={() => {
                              location.hash = `#${x.stage}/${x.id}`;
                            }}
                            title={x.check ? `round ${i + 1} · ${x.check.reported} reported · ${x.check.accepted} accepted · score ${x.check.total}` : `round ${i + 1} · ${statusLine(x)}`}
                          >
                            <td className="num w-4">{i + 1}</td>
                            <td>
                              <Bar pct={x.check ? (x.check.total / max) * 100 : 0} gold={x === lowest} />
                            </td>
                            <td className={"num text-right" + (x === lowest ? " text-keep" : "")}>{x.check ? x.check.total : x.status === "done" ? "—" : "…"}</td>
                            <td className="num text-right text-dim">{x.check ? `${x.check.accepted}/${x.check.reported}` : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="rid">{r.id}</div>
                  {stage === "check" && r.status === "done" && (
                    <div className="acts" onClick={(e) => e.stopPropagation()}>
                      <Btn
                        onClick={() =>
                          act(
                            () => api.check(r.id),
                            () => r.id,
                          )
                        }
                      >
                        check this brief
                      </Btn>
                      <span className="text-dim">derivation, ledger, structure, resemblance</span>
                    </div>
                  )}
                  {d && <Log d={d} stepId={stepId} onStep={setStepId} />}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="pane read tt">
        {!current ? (
          <div className="empty">{stage === "check" ? "Nothing to check yet." : "Nothing to write yet."}</div>
        ) : !d ? (
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
              <span className={"state " + (working ? "text-running" : OPEN.has(d.draw.status) ? "text-art" : d.draw.status === "failed" ? "text-pass" : "text-mute")}>
                <Mark state={markFor(d.draw.status)} />
                <span className={working ? "sweep" : ""}>
                  {d.draw.status === "done" ? "brief · not yet checked" : label(d.draw.status)}
                  {working && d.steps.some((s) => s.status === "running") ? ` · ${[...new Set(d.steps.filter((s) => s.status === "running").map((s) => s.stage))].join(", ")}` : ""}
                </span>
              </span>
              <DrawMeta d={d}>
                {d.origin && (
                  <>
                    {d.origin.id === d.draw.id ? "candidate" : "from"}{" "}
                    <a href={`#draw/${d.origin.id}`} className="num">
                      {d.origin.id === d.draw.id
                        ? `#${d.origin.index}${d.origin.probability != null ? ` · ${d.origin.probability.toFixed(2)}` : ""}`
                        : `${d.origin.name ?? d.origin.id}${d.origin.index ? ` #${d.origin.index}` : ""}`}
                    </a>{" "}
                    ·{" "}
                  </>
                )}
              </DrawMeta>
              {chainOf(d.draw.id) && chainOf(d.draw.id)!.rounds.length > 1 && (
                <span className="text-dim">
                  round <b className="num text-ink">{chainOf(d.draw.id)!.rounds.findIndex((x) => x.id === d.draw.id) + 1}</b> of {chainOf(d.draw.id)!.rounds.length}
                  {d.draw.repaired_from && (
                    <>
                      {" "}
                      · repairs{" "}
                      <a href={`#${stage}/${d.draw.repaired_from}`} className="num">
                        {d.draw.repaired_from}
                      </a>
                    </>
                  )}
                </span>
              )}
              {d.draw.superseded_by && (
                <span className="text-dim">
                  superseded by{" "}
                  <a href={`#${stage}/${d.draw.superseded_by}`} className="num">
                    {d.draw.superseded_by}
                  </a>
                </span>
              )}
            </div>
            {err && <div className="err mt-2">{err}</div>}
            {step ? (
              <StepView step={step} chosen={false} onBack={() => setStepId(null)} />
            ) : settings ? (
              <DraftSettings
                d={d}
                onClose={() => setSettings(false)}
                onDraft={(b) =>
                  act(async () => {
                    await api.draft(d.draw.id, b);
                    location.hash = `#write/${d.draw.id}`;
                  })
                }
              />
            ) : stage === "write" ? (
              <StoryPane d={d} onAct={act} />
            ) : d.draw.status === "awaiting_check_gate" || d.draw.status === "repaired" ? (
              <GateOne d={d} onAct={act} onDraft={() => setSettings(true)} />
            ) : d.draw.status === "done" || d.draw.status === "passed" ? (
              <BriefReady
                d={d}
                onCheck={() => act(() => api.check(d.draw.id))}
                onAuto={() => act(() => api.gate(d.draw.id, { action: "auto" }))}
                onDraft={() => setSettings(true)}
                onPass={(note) => act(() => api.gate(d.draw.id, { action: "pass", note }))}
              />
            ) : (
              <Building d={d} />
            )}
          </>
        )}
      </div>
    </>
  );
}

function BriefReady({ d, onCheck, onAuto, onDraft, onPass }: { d: Detail; onCheck: () => void; onAuto: () => void; onDraft: () => void; onPass: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <>
      <div className="controls" role="group" aria-label="Brief">
        <Btn variant="primary" onClick={onCheck}>
          check · derivation, ledger, structure, resemblance{d.draw.setting ? ", claims" : ""}
        </Btn>
        <Btn variant="art" onClick={onAuto} title="Check, then repair round after round without asking, until nothing scores over the floor or the rounds run out.">
          check and auto-repair
        </Btn>
        <Btn onClick={onDraft}>
          draft without checking <Chevron open />
        </Btn>
        <Btn variant="pass" onClick={() => onPass(note)}>
          pass brief
        </Btn>
        <input type="text" placeholder="note for the log" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="drawbody one">
        <div className="max-w-[66rem]">
          <Head>seed</Head>
          <SeedNote text={d.draw.seed_text} />
          <Head
            className="mt-6"
            note={
              <a href={api.briefFile(d.draw.id, "trail.md")} target="_blank" rel="noopener" className="num">
                briefs/{d.draw.id}/trail.md
              </a>
            }
          >
            brief
          </Head>
          <BriefFiles id={d.draw.id} />
        </div>
      </div>
    </>
  );
}

const BUILD = ["outline", "jobs", "context", "ending"];

/**
 * A brief under construction. The premise and the vignette exist from the
 * gate; the outline, the two context vignettes and the ending land one at a
 * time. Each part is read from its artifact, because the files under briefs/
 * are written last and all at once.
 */
function Building({ d }: { d: Detail }) {
  const stageOfStep = new Map(d.steps.map((s) => [s.id, s.stage]));
  const running = d.steps.filter((s) => s.status === "running");
  const done = new Set(d.steps.filter((s) => s.status === "done").map((s) => s.stage));
  const chosen = d.artifacts.find((a) => a.kind === "vignette" && a.step_id === d.draw.chosen_step);
  const outline = [...d.artifacts].reverse().find((a) => a.kind === "outline");
  const contexts = d.artifacts.filter((a) => a.kind === "vignette" && stageOfStep.get(a.step_id) === "context");
  const ending = [...d.artifacts].reverse().find((a) => a.kind === "ending");
  const [openPart, setOpenPart] = useState<string | null>("outline.md");
  const part = (name: string, body: string | undefined) => (
    <React.Fragment key={name}>
      <tr className={body ? "pick" : "faded"} onClick={() => body && setOpenPart(openPart === name ? null : name)}>
        <td className="w-4">{body ? <Chevron open={openPart === name} /> : <Mark state={running.length ? "run" : "todo"} />}</td>
        <td className="num whitespace-nowrap text-dim">{name}</td>
        <td className="text-mute">{body ? <span className="line-clamp-1">{firstParagraph(body).slice(0, 90)}</span> : <span className={running.length ? "sweep inline-block text-running" : ""}>waiting</span>}</td>
      </tr>
      {body && openPart === name && (
        <tr className="spans">
          <td colSpan={3} style={{ paddingLeft: "1.75rem" }}>
            <Md className="text-[14.5px]" text={boldLabels(body)} />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
  return (
    <div className="drawbody one">
      <div className="max-w-[66rem]">
        <Head
          note={
            <>
              {BUILD.map((s, i) => (
                <React.Fragment key={s}>
                  {i > 0 && " · "}
                  {s}
                  {done.has(s) && <Icon name="check" />}
                </React.Fragment>
              ))}
              {" · the page refreshes itself"}
            </>
          }
        >
          {running.length ? `${running.length} call${running.length > 1 ? "s" : ""} in flight: ${[...new Set(running.map((s) => s.stage))].join(", ")}` : "waiting for the next step"}
        </Head>
        <Head className="mt-6">the brief, as it lands</Head>
        <table className="mt-1">
          <tbody>
            {part("premise and vignette", chosen?.content)}
            {part("outline.md", outline?.content)}
            {contexts.length ? contexts.map((a, i) => part(`context-${i + 1}.md`, a.content)) : part("context-1.md", undefined)}
            {part("ending.md", ending?.content)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- gate 1 ------------------------------------------------------------------

function GateOne({ d, onAct, onDraft }: { d: Detail; onAct: (fn: () => Promise<any>, go?: (r: any) => string | undefined) => void; onDraft: () => void }) {
  const [f, setF] = useState<Findings | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [examined, setExamined] = useState(false);
  const [floor, setFloor] = useState(DEFAULT_FLOOR);
  const [showAll, setShowAll] = useState(false);
  const id = d.draw.id;
  useEffect(() => {
    api
      .findings(id, showAll)
      .then(setF)
      .catch(() => {});
  }, [id, d.steps.length, showAll]);
  // only a gate action that returns a draw may move the pane; dismiss returns the finding
  const gate = (action: string, extra: Record<string, unknown> = {}) =>
    onAct(
      () => api.gate(id, { action, note, ...extra }),
      (r) => (r?.id && String(r.id).startsWith("f-") ? undefined : r?.id),
    );
  const open = f?.findings.filter((x) => x.decision === "open") ?? [];
  const accepted = f?.findings.filter((x) => x.decision === "accepted") ?? [];
  const repaired = d.draw.status === "repaired";
  const outline = [...d.artifacts].reverse().find((a) => a.kind === "outline");
  const meta = outline ? JSON.parse(outline.meta) : {};
  const constraints: string[] = meta.constraints ?? [];
  const jobs: string[] = (meta.jobs ?? []).filter((j: string) => !INVALIDATES.includes(j) || true);
  const toggle = (fid: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(fid) ? n.delete(fid) : n.add(fid);
      return n;
    });
  const atFloor = open.filter((x) => x.score >= floor && !x.relitigates);
  const reopened = f?.findings.filter((x) => x.relitigates) ?? [];
  const autoCfg = (d.draw.draft_config ? JSON.parse(d.draw.draft_config).config.repair : null) ?? { rounds: 4, stop_score: 7, patience: 2 };
  const autoArt = [...d.artifacts].reverse().find((a) => a.kind === "auto");
  const auto: AutoResult | null = autoArt ? JSON.parse(autoArt.content) : null;
  const checkSteps = d.steps.filter((s) => s.stage.startsWith("check-") && s.status === "done");
  const checkSecs = checkSteps.reduce((n, s) => n + Number(secs(s.started_at, s.ended_at)), 0);
  const reported = f?.findings.filter((x) => x.reported) ?? [];
  const S = f?.findings[0]?.samples_run ?? 3;
  return (
    <>
      {!repaired && (
        <div className="controls" role="group" aria-label="Gate 1 judgement">
          <span className="end">
            <input type="text" placeholder="note for the log" aria-label="Gate note" value={note} onChange={(e) => setNote(e.target.value)} />
            <Btn variant="art" onClick={() => gate("flag")} title="Mark a check call as looking wrong. Nothing runs.">
              flag · a check looks wrong
            </Btn>
            <Btn variant="quiet" onClick={() => gate("hold")} title="Leave the brief here. Nothing runs.">
              hold
            </Btn>
            <Btn variant="pass" onClick={() => gate("pass")} title="Pass over this brief. Its verdict goes to the log.">
              pass brief
            </Btn>
          </span>
        </div>
      )}
      {!repaired && (
        <div className="controls" role="group" aria-label="Gate 1 repair">
          <Btn
            variant="primary"
            disabled={!sel.size && !accepted.length}
            onClick={() => gate("accept", { findings: [...sel] })}
            title="Accept the selected findings. The brief is repaired into a new draw under their replacements and re-checked."
          >
            accept {sel.size || accepted.length} · repair and re-check
          </Btn>
          <span className="group">
            <Btn
              variant="keep"
              disabled={!open.some((x) => !x.relitigates)}
              onClick={() => setSel(new Set(open.filter((x) => !x.relitigates).map((x) => x.id)))}
              title="Select every open finding that does not re-open a settled fix."
            >
              all {open.filter((x) => !x.relitigates).length}
            </Btn>
            <Btn variant="keep" disabled={!atFloor.length} onClick={() => setSel(new Set(atFloor.map((x) => x.id)))} title={`Select every open finding scoring ${floor} or more.`}>
              ≥ {floor} · {atFloor.length}
            </Btn>
            <input type="range" min={1} max={SCORE_MAX} step={1} value={floor} aria-label="Score floor" onChange={(e) => setFloor(Number(e.target.value))} />
            <Btn variant="quiet" disabled={!sel.size} onClick={() => setSel(new Set())} title="Clear the selection.">
              none
            </Btn>
          </span>
          <Btn
            variant="art"
            disabled={!open.length}
            onClick={() => gate("auto")}
            title={`Repair round after round without asking: accept everything scoring ${autoCfg.stop_score} or more, dismiss the rest, re-check, repeat. It stops when nothing reaches the floor, after ${autoCfg.rounds} rounds, or when the total score has not fallen for ${autoCfg.patience} rounds.`}
          >
            auto · ≥ {autoCfg.stop_score}, to {autoCfg.rounds} rounds
          </Btn>
          <span className="end">
            <Btn onClick={onDraft} disabled={accepted.length > 0} title={accepted.length ? "Accepted findings are pending repair." : "Schedule and write the story from this brief as it stands."}>
              draft{d.draw.draft_config ? ` · ${JSON.parse(d.draw.draft_config).config.length.words} words` : ""} <Chevron open />
            </Btn>
          </span>
        </div>
      )}
      {repaired && (
        <p className="seed">
          This brief was repaired into{" "}
          <a href={`#check/${d.draw.superseded_by}`} className="num not-italic">
            {d.draw.superseded_by}
          </a>
          ; its findings and their decisions are kept here for the record.
        </p>
      )}
      {auto && (
        <div className="mt-4 max-w-[46rem]">
          <Head
            note={
              auto.stopped === "floor"
                ? `stopped on the floor: nothing scored ${auto.floor} or more`
                : auto.stopped === "patience"
                  ? "stopped on patience: the total score stopped falling"
                  : auto.stopped === "budget"
                    ? `stopped on the call budget, at ${auto.calls} calls`
                    : "stopped on the round cap"
            }
          >
            auto · {auto.rounds.length} round{auto.rounds.length > 1 ? "s" : ""}
          </Head>
          <table className="mt-1">
            <thead>
              <tr>
                <th className="head">round</th>
                <th className="head">brief</th>
                <th className="head text-right">open</th>
                <th className="head text-right">total score</th>
                <th className="head text-right">accepted</th>
                <th className="head text-right">calls</th>
              </tr>
            </thead>
            <tbody>
              {auto.rounds.map((r) => (
                <tr key={r.id} className={r.round === auto.best.round ? "text-keep" : ""}>
                  <td className="num">
                    {r.round}
                    {r.round === auto.best.round ? <span className="text-dim"> · lowest</span> : ""}
                  </td>
                  <td>
                    {r.id === id ? (
                      <span className="num text-dim">{r.id}</span>
                    ) : (
                      <a className="num" href={`#check/${r.id}`}>
                        {r.id}
                      </a>
                    )}
                  </td>
                  <td className="num text-right">{r.open}</td>
                  <td className="num text-right">{r.total}</td>
                  <td className="num text-right">{r.accepted}</td>
                  <td className="num text-right text-dim">{r.calls}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {auto.best.id !== auto.id && <div className="mt-2 text-dim">Round {auto.best.round} scored lowest. It is superseded, so auto left it where it is: read it if this round reads worse.</div>}
          {!!auto.left_open && (
            <div className="mt-2 text-mute">
              {auto.left_open} finding{auto.left_open > 1 ? "s" : ""} at or above the floor {auto.left_open > 1 ? "are" : "is"} still open here: auto stopped before repairing {auto.left_open > 1 ? "them" : "it"}.
            </div>
          )}
        </div>
      )}
      <div className="drawbody wide">
        <div className="min-w-0">
          <Head
            note={
              <>
                {f ? `${reported.length} reported${f.findings.some((x) => !x.reported) ? ` · ${f.findings.filter((x) => !x.reported).length} below the bar` : ""}` : "…"}
                {f?.pass ? ` · pass ${f.pass.slice(0, 16).replace("T", " ")}` : ""}
                {checkSteps.length ? ` · ${checkSteps.length} checker calls · ${checkSecs} s` : ""} · by score · merged across checkers ·{" "}
                <button className="link" aria-pressed={showAll} onClick={() => setShowAll((v) => !v)} title="A cluster one sample found is not reported, but it is still a reading. Nothing is re-run to show these.">
                  {showAll ? "hide" : "show"} one-sample findings
                </button>
              </>
            }
          >
            findings
          </Head>
          {f && f.findings.length === 0 && <div className="mt-2 text-mute">Nothing recurred in enough samples to report. What each checker examined is listed beside.</div>}
          {f && f.findings.length > 0 && (
            <div className="findings mt-1">
              {f.findings
                .filter((x) => !x.relitigates)
                .map((x) => (
                  <FindingRow key={x.id} f={x} S={x.samples_run ?? S} selected={sel.has(x.id)} onToggle={() => toggle(x.id)} onDismiss={() => gate("dismiss", { finding: x.id })} readOnly={repaired} />
                ))}
              {reopened.length > 0 && (
                <>
                  <Head as="div" className="mt-5" note={`${reopened.length} finding${reopened.length > 1 ? "s" : ""} against a fix you already accepted · auto will not act on ${reopened.length > 1 ? "these" : "this"}`}>
                    re-opened
                  </Head>
                  <div className="mt-1 mb-2 max-w-[66ch] text-mute">
                    A repair round is free to trade one fix for another, and the checkers then report the fix as the defect. Either the earlier decision was wrong, in which case accept this and say so in the note, or
                    this is the loop arguing with itself, in which case dismiss it.
                  </div>
                  {reopened.map((x) => (
                    <FindingRow key={x.id} f={x} S={x.samples_run ?? S} selected={sel.has(x.id)} onToggle={() => toggle(x.id)} onDismiss={() => gate("dismiss", { finding: x.id })} readOnly={repaired} />
                  ))}
                </>
              )}
            </div>
          )}
          {f && (
            <>
              <Head
                className="mt-6"
                note={
                  f.claims.length
                    ? `${f.claims.length} verified · ${f.claims.filter((c) => c.result === "supported").length} supported · ${f.claims.filter((c) => c.result === "contradicted").length} contradicted · ${f.claims[0].authority === "world" ? "the web, on sonnet" : f.claims[0].authority === "setting" ? "the setting file" : "the setting's reference files"}`
                    : "off · no claims authority declared on the setting"
                }
              >
                claims
              </Head>
              {f.claims.length > 0 && (
                <table className="mt-1">
                  <tbody>
                    {f.claims.map((c, i) => (
                      <tr key={i}>
                        <td className="w-4">
                          <Mark state={c.result === "supported" ? "held" : c.result === "contradicted" ? "fail" : ""} />
                        </td>
                        <td className={"num w-28 " + (c.result === "supported" ? "text-keep" : c.result === "contradicted" ? "text-pass" : "text-dim")}>{c.result}</td>
                        <td>
                          {c.statement}
                          <div className="mt-1 text-dim">{c.evidence}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
          {jobs.length > 0 && meta.words && (
            <>
              <Head className="mt-6" note="from the outline · the words each carries">
                jobs
              </Head>
              <table className="mt-1">
                <thead>
                  <tr>
                    <th className="head">job</th>
                    <th className="head text-right">words</th>
                    <th className="head text-right">findings against it</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j}>
                      <td className="num">{j}</td>
                      <td className="num text-right">{meta.words[j]}</td>
                      <td className="num text-right">{f?.findings.filter((x) => x.invalidates === j).length ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {constraints.length > 0 && (
            <>
              <Head className="mt-6" note="the accepted replacements, verbatim, in the repair prompts">
                constraints
              </Head>
              <table className="mt-1">
                <tbody>
                  {constraints.map((c, i) => (
                    <tr key={i}>
                      <td className="num w-8 text-dim">{i + 1}</td>
                      <td>{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
        <div className="aside min-w-0">
          {f && <Profiles f={f} />}
          {f && f.examined.length > 0 && (
            <>
              <Head className="mt-6" note="what an empty result would have looked at">
                examined
              </Head>
              <table className="mt-1">
                <tbody>
                  <tr className="pick" onClick={() => setExamined((e) => !e)}>
                    <td className="w-4">
                      <Chevron open={examined} />
                    </td>
                    <td className="num">{f.examined.length} lists</td>
                    <td className="text-dim">{[...new Set(f.examined.map((e) => e.stage))].join(", ")}</td>
                  </tr>
                  {examined &&
                    f.examined.map((e, i) => (
                      <tr key={i}>
                        <td></td>
                        <td colSpan={2} className="num whitespace-pre-wrap text-dim">
                          <span className="text-mute">
                            {e.stage} · sample {e.sample}
                          </span>
                          {"\n"}
                          {e.examined}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}
          <Head
            className="mt-6"
            note={
              <a href={api.briefFile(id, "trail.md")} target="_blank" rel="noopener" className="num">
                briefs/{id}/trail.md
              </a>
            }
          >
            brief
          </Head>
          <BriefFiles id={id} open={d.draw.repaired_from ? "ending.previous.md" : "outline.md"} />
          {f?.judge && <div className="judge">{f.judge}</div>}
        </div>
      </div>
    </>
  );
}

/** A finding as a row: score, recurrence as marks, the job it breaks, the checkers, then the span, the statement and the ledger of result, evidence and replacement. */
/** A finding: the values on one ruled line, then the span, the statement and the ledger at full width. */
function FindingRow({ f, S, selected, onToggle, onDismiss, readOnly }: { f: Finding; S: number; selected: boolean; onToggle: () => void; onDismiss: () => void; readOnly: boolean }) {
  const acc = f.decision === "accepted" || selected;
  const cls = "finding" + (acc ? " sel" : "") + (f.decision === "dismissed" ? " old" : "");
  return (
    <div className={cls}>
      <div className="line">
        <span className="num w-6 font-semibold" title={`score ${f.score} of ${SCORE_MAX}: recurrence, a second checker, what it invalidates, the kind of result, and whether it quotes evidence`}>
          {f.score}
        </span>
        <span className="whitespace-nowrap" title={`recurred in ${f.n} of ${S} samples`}>
          {Array.from({ length: S }, (_, i) => (
            <React.Fragment key={i}>
              <Mark state={i < f.n ? "held" : ""} />{" "}
            </React.Fragment>
          ))}
          <span className="num">
            {f.n}/{S}
          </span>
        </span>
        <span className="num text-dim">
          breaks <b className={"font-normal " + (f.invalidates === "none" ? "" : "text-ink")}>{f.invalidates}</b>
        </span>
        <span className="num text-dim">{f.checkers.join(" · ")}</span>
        {f.relitigates && (
          <a className="link text-pass" href={`#check/${f.relitigates.draw}`} title={`Accepted in round ${f.relitigates.round}: ${f.relitigates.replacement}`}>
            re-opens round {f.relitigates.round}
          </a>
        )}
        <Mark state={acc ? "held" : f.decision === "dismissed" ? "fail" : ""} title={f.decision} />
        <span className="acts">
          {f.decision === "accepted" ? (
            <span className="num text-keep">accepted{f.note ? ` · ${f.note}` : ""}</span>
          ) : f.decision === "dismissed" ? (
            <span className="num text-dim">dismissed{f.note ? ` · ${f.note}` : ""}</span>
          ) : readOnly ? (
            <span className="num text-dim">open</span>
          ) : (
            <>
              <Btn variant={selected ? "keep" : undefined} pressed={selected} onClick={onToggle}>
                {selected ? "selected" : "accept"}
              </Btn>
              <button className="link" onClick={onDismiss}>
                dismiss
              </button>
            </>
          )}
        </span>
      </div>
      <div className="quote">{unquote(f.span)}</div>
      <div className="mt-0.5">{f.statement}</div>
      <div className="kv">
        <b>result</b>
        <span className="font-mono">{f.result}</span>
        <b>evidence</b>
        <span>{f.evidence}</span>
        <b>replacement</b>
        <span className="text-ink">{f.replacement}</span>
        {f.patch ? (
          <>
            <b>patch</b>
            <span className="num text-keep" title="Accepting this substitutes the span for these words. Nothing is regenerated.">
              {f.patch}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

export const SCORE_MAX = 10;
const DEFAULT_FLOOR = 7;

const STRUCTURE_Q = ["threat", "category-violation", "agency", "obscurity", "thickening", "spectacle", "consequence"];
/** The seven questions as the checker is asked them (app/pipeline/prompts.ts, checkStructure). */
const STRUCTURE_DEF: Record<string, string> = {
  threat: "Something in the brief would harm or endanger someone in it.",
  "category-violation": "A boundary is violated: between living and dead, self and other, inside and outside, one thing and another. Not: something is disgusting.",
  agency: "There is an unresolved question of what is acting: something acting with no visible actor, or an actor-shaped absence.",
  obscurity: "What is withheld is withheld deliberately and legibly, leaving something for the imagination to enlarge. Absent means the brief is merely underspecified.",
  thickening: "The brief contains material for development beyond its own statement, rather than a single image or a single reveal.",
  spectacle: "The brief's entire payload is a shock, a gross-out or a final twist.",
  consequence: "The point of departure from the actual has its consequences taken seriously.",
};
const STRUCTURE_TIP =
  "Seven binary questions about the brief, from the evaluation review's list of what a judge can answer with a quote. Each is present or absent with one verbatim quote; they are a profile, never summed into a score.";
const RESEMBLANCE_TIP =
  "Retrieval, not judgement: the brief is matched against the enumerated list of overused premises in app/pipeline/premises.md, and the nearest published work is named with one sentence on what is shared. Nothing is asked about originality.";
const PREMISES_FILE = "app/pipeline/premises.md";

function Profiles({ f }: { f: Findings }) {
  const structure = f.profiles.find((p) => p.checker === "structure");
  const resemblance = f.profiles.find((p) => p.checker === "resemblance");
  return (
    <>
      {structure?.answers && (
        <>
          <Head note="present or absent · never summed">
            <span title={STRUCTURE_TIP}>structure</span>
          </Head>
          <table className="mt-1">
            <tbody>
              {STRUCTURE_Q.map((q) => {
                const a = structure.answers![q];
                const present = a?.answer === "present";
                return (
                  <tr key={q} title={STRUCTURE_DEF[q]}>
                    <td className="w-4">
                      <Mark state={present ? "held" : ""} />
                    </td>
                    <td className={"num whitespace-nowrap " + (present ? "" : "text-dim")}>{q.replace("category-violation", "category")}</td>
                    <td className="text-mute">
                      <div className="line-clamp-1">
                        <span className="quote">{a?.quote}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      {resemblance && (
        <>
          <Head
            className="mt-6"
            note={
              <>
                retrieval, not judgement · against <span className="num">{PREMISES_FILE.split("/").pop()}</span>
              </>
            }
          >
            <span title={RESEMBLANCE_TIP}>resemblance</span>
          </Head>
          <table className="mt-1">
            <tbody>
              {(resemblance.matches ?? []).length === 0 && (
                <tr>
                  <td className="text-dim">no list entry matched</td>
                </tr>
              )}
              {(resemblance.matches ?? []).map((m, i) => (
                <tr key={i}>
                  <td className="num w-16 whitespace-nowrap text-dim">matches</td>
                  <td title={`Entry ${/^\d+/.exec(m.entry)?.[0] ?? "?"} of ${PREMISES_FILE}, quoted by the checker verbatim; the span is where the brief matches it.`}>
                    <div>{m.entry}</div>
                    <div className="quote mt-1 text-mute">{unquote(m.span)}</div>
                  </td>
                </tr>
              ))}
              {resemblance.nearest && (
                <tr>
                  <td className="num whitespace-nowrap text-dim">nearest</td>
                  <td>
                    <span className="serif-cell">{resemblance.nearest.title}</span>, {resemblance.nearest.author}
                    <div className="mt-1 text-mute">{resemblance.nearest.shared}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

// --- draft settings ----------------------------------------------------------

const AXES: Record<string, string[]> = { tense: ["past", "present"], person: ["first", "second", "third"], chronology: ["linear", "nonlinear"], container: ["prose", "document", "interleaved"] };

function DraftSettings({ d, onClose, onDraft }: { d: Detail; onClose: () => void; onDraft: (b: { auto?: boolean; profile?: string; overrides?: Record<string, string | number> }) => void }) {
  const [cfg, setCfg] = useState<{ defaults: DraftConfig; profiles: string[] } | null>(null);
  const [profile, setProfile] = useState<string>("");
  const [v, setV] = useState<Record<string, string>>({});
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    api.draftConfig().then(setCfg);
  }, []);
  if (!cfg) return <span className="text-dim">loading the draft defaults…</span>;
  const def = cfg.defaults;
  const base: Record<string, string> = {
    "length.words": String(def.length.words),
    "beats.count": String(def.beats.count),
    "beats.min": String(def.beats.min),
    "beats.max": String(def.beats.max),
    "beats.words_min": String(def.beats.words_min),
    "beats.words_max": String(def.beats.words_max),
    "form.tense": def.form.tense,
    "form.person": def.form.person,
    "form.chronology": def.form.chronology,
    "form.container": def.form.container,
    "form.ending": def.form.ending,
    "scenes.order": def.scenes.order,
  };
  const val = (k: string) => v[k] ?? base[k];
  const set = (k: string) => (x: string) => setV({ ...v, [k]: x });
  const overrides: Record<string, string | number> = {};
  for (const [k, x] of Object.entries(v)) if (x !== base[k] && x !== "") overrides[k] = x;
  const checked = d.artifacts.some((a) => a.kind === "ledger");
  const num = (k: string, label: string, w = "4rem") => <input type="text" className="num" style={{ width: w }} aria-label={label} value={val(k)} onChange={(e) => set(k)(e.target.value)} />;
  return (
    <div className="form mt-4">
      <button className="link" onClick={onClose}>
        <Icon name="arrow_back" /> back
      </button>
      <h1 className="mt-3">Draft</h1>
      <p className="lede">
        Defaults from <span className="num">app/pipeline/draft.toml</span>. Whatever you change here is written to the trail and to <span className="num">config.toml</span> on keep.
      </p>
      <Field label="Profile" help="A profile bundles overrides; the flags below override it again.">
        <Seg label="Profile" value={profile || "default"} options={["default", ...cfg.profiles]} onChange={(p) => setProfile(p === "default" ? "" : p)} />
      </Field>
      <Field label="Length" htmlFor="words">
        <div className="inline">
          <input id="words" type="text" className="num" style={{ width: "6rem" }} value={val("length.words")} onChange={(e) => set("length.words")(e.target.value)} />
          <span className="text-dim">words · ±{Math.round(def.length.tolerance * 100)}%</span>
        </div>
      </Field>
      <Field label="Beats" help="The schedule chooses the count within the range and assigns each beat its cap.">
        <div className="inline">
          <Seg label="Beat count" value={val("beats.count") === "auto" ? "auto" : "fixed"} options={["auto", "fixed"]} onChange={(m) => set("beats.count")(m === "auto" ? "auto" : val("beats.min"))} />
          {val("beats.count") === "auto" ? (
            <>
              <span className="text-dim">between</span>
              {num("beats.min", "Minimum beats", "3.5rem")}
              <span className="text-dim">and</span>
              {num("beats.max", "Maximum beats", "3.5rem")}
            </>
          ) : (
            <>
              <span className="text-dim">exactly</span>
              {num("beats.count", "Beat count", "3.5rem")}
            </>
          )}
          <span className="text-dim">· each</span>
          {num("beats.words_min", "Minimum words per beat")}
          <span className="text-dim">–</span>
          {num("beats.words_max", "Maximum words per beat")}
          <span className="text-dim">words</span>
        </div>
      </Field>
      <Field label="Form" help="auto: the schedule derives the axis from the brief and states it. A fixed axis is checked on the schedule and fails shape when contradicted.">
        <div className="grid gap-2">
          {Object.entries(AXES).map(([axis, opts]) => (
            <div key={axis} className="inline">
              <span className="num w-24 text-dim">{axis}</span>
              <Seg label={axis} value={val(`form.${axis}`)} options={["auto", ...opts]} onChange={set(`form.${axis}`)} />
              {overrides[`form.${axis}`] !== undefined && <span className="text-art">overridden</span>}
            </div>
          ))}
          <div className="inline">
            <span className="num w-24 text-dim">ending</span>
            <Seg label="ending" value={val("form.ending")} options={["brief", "open"]} onChange={set("form.ending")} />
          </div>
        </div>
      </Field>
      <Field label="Scenes" help="Sequential carries the text so far into each scene call. Parallel writes all beats at once from the schedule alone.">
        <Seg label="Scene order" value={val("scenes.order")} options={["sequential", "parallel"]} onChange={set("scenes.order")} />
      </Field>
      {!checked && (
        <Field
          label="Gate 1"
          help="This brief has not been checked. Skip drafts it as it stands (one ledger extraction supplies the ledger). Auto runs the check, accepts what recurred in every sample with evidence, dismisses the rest, repairs once and re-checks, then drafts and stops at gate 2."
        >
          <Seg label="Gate 1" value={auto ? "auto" : "skip"} options={["skip", "auto"]} onChange={(x) => setAuto(x === "auto")} />
        </Field>
      )}
      <div className="actions">
        <Btn variant="primary" pad onClick={() => onDraft({ auto, profile: profile || undefined, overrides: Object.keys(overrides).length ? overrides : undefined })}>
          draft
        </Btn>
        <span className="text-dim">One schedule call, then the scene calls in sequence, then the screens. About eight minutes at the defaults.</span>
      </div>
    </div>
  );
}

// --- gate 2 ------------------------------------------------------------------

function StoryPane({ d, onAct }: { d: Detail; onAct: (fn: () => Promise<any>, go?: (r: any) => string | undefined) => void }) {
  const [s, setS] = useState<Story | null>(null);
  const [note, setNote] = useState("");
  const [k, setK] = useState(1);
  const [view, setView] = useState<"story" | "schedule">("story");
  const id = d.draw.id;
  useEffect(() => {
    api
      .story(id)
      .then(setS)
      .catch(() => {});
  }, [id, d.steps.length]);
  if (!s) return <span className="text-dim">loading the story…</span>;
  const gating = d.draw.status === "awaiting_draft_gate";
  const gate = (action: string, extra: Record<string, unknown> = {}) => onAct(() => api.gate(id, { action, note, ...extra }));
  const M = s.scenes.length;
  const flagsFor = (beat: number) => ({ ledger: s.screenFindings.filter((f) => f.beat === beat), structure: s.profiles.find((p) => p.beat === beat) });
  const wordsOf = (t: string) => t.split(/\s+/).filter(Boolean).length;
  const words = s.scenes.reduce((a, x) => a + wordsOf(x.text), 0);
  const cfg = d.draw.draft_config ? JSON.parse(d.draw.draft_config) : null;
  const nStructure = s.profiles.reduce((a, p) => a + p.flags.length, 0);
  return (
    <>
      {gating && (
        <div className="controls" role="group" aria-label="Gate 2">
          <Btn variant="primary" onClick={() => gate("keep")} title={`Keep the story. It is exported to drafts/${id}/ with its schedule, findings, configuration and trail.`}>
            keep · export drafts/{id}/
          </Btn>
          <span className="group">
            <Btn variant="art" onClick={() => gate("rewrite", { beat: k })} title="Regenerate one scene from its beat under its flags' replacements, then screen it and the next scene again.">
              rewrite scene
            </Btn>
            <select className="sel" style={{ minWidth: "4rem", padding: "0.15rem 1.6rem 0.2rem 0.5rem" }} aria-label="Scene to rewrite" value={k} onChange={(e) => setK(Number(e.target.value))}>
              {s.scenes.map((x) => (
                <option key={x.beat} value={x.beat}>
                  {x.beat}
                </option>
              ))}
            </select>
            <span className="text-dim">
              screens {k}
              {k < M ? ` and ${k + 1}` : ""} run again
            </span>
          </span>
          <Btn variant="pass" onClick={() => gate("pass")} title="Pass over this draft. Its verdict goes to the log.">
            pass
          </Btn>
          <input type="text" placeholder="note for the log" aria-label="Gate note" value={note} onChange={(e) => setNote(e.target.value)} />
          <span className="end">
            <Btn variant="quiet" pressed={view === "schedule"} onClick={() => setView(view === "schedule" ? "story" : "schedule")}>
              {view === "schedule" ? "story" : "schedule"}
            </Btn>
          </span>
        </div>
      )}
      {!gating && (
        <div className="controls">
          <span className="text-mute">
            {d.draw.status === "drafted" ? (
              <>
                Kept and exported to <span className="num">drafts/{id}/</span>.
              </>
            ) : d.draw.status === "passed" ? (
              "Passed over."
            ) : (
              label(d.draw.status)
            )}
            {d.draw.flag_note && <span className="text-dim"> · {d.draw.flag_note}</span>}
          </span>
          <span className="end">
            <Btn variant="quiet" pressed={view === "schedule"} onClick={() => setView(view === "schedule" ? "story" : "schedule")}>
              {view === "schedule" ? "story" : "schedule"}
            </Btn>
          </span>
        </div>
      )}
      <Facts
        className="mt-3 max-w-[48rem]"
        rows={[
          ...(cfg
            ? ([
                ["length", `${cfg.config.length.words.toLocaleString()} words · ${words.toLocaleString()} written`],
                ["beats", `${M}${cfg.config.beats.count === "auto" ? ` · auto ${cfg.config.beats.min}–${cfg.config.beats.max}` : ""}`],
                ...Object.entries(s.schedule?.form ?? {}).map(([a, x]) => [a, x] as [React.ReactNode, React.ReactNode]),
                ["ending", cfg.config.form.ending],
                ["scenes", cfg.config.scenes.order],
                ...(cfg.profile ? [["profile", cfg.profile] as [React.ReactNode, React.ReactNode]] : []),
              ] as [React.ReactNode, React.ReactNode][])
            : ([["written", `${words.toLocaleString()} words`]] as [React.ReactNode, React.ReactNode][])),
        ]}
      />
      <div className="drawbody wide">
        <div className="min-w-0">
          {view === "schedule" && s.schedule ? (
            <ScheduleView s={s} />
          ) : (
            s.scenes.map((sc) => {
              const fl = flagsFor(sc.beat),
                beat = s.schedule?.beats[sc.beat - 1];
              const n = wordsOf(sc.text);
              const over = beat ? n > beat.words * 1.1 : false;
              const nf = fl.ledger.length + (fl.structure?.flags.length ?? 0);
              return (
                <div key={sc.beat} className="mb-6 max-w-[66ch]" id={`beat-${sc.beat}`}>
                  <Head
                    note={
                      <>
                        <span>
                          {n}
                          {beat ? ` / ${beat.words}` : ""}
                          {over ? " · over cap" : ""}
                        </span>
                        {beat && beat.absorbs !== "none" && <> · absorbs {beat.absorbs}</>} · <span className="text-mute">{nf ? `${nf} flag${nf > 1 ? "s" : ""}` : "no flags"}</span>
                      </>
                    }
                  >
                    beat {sc.beat}
                  </Head>
                  <Md className="mt-2" text={sc.text} />
                  {fl.ledger.length > 0 || fl.structure?.flags.length ? (
                    <table className="mt-3">
                      <tbody>
                        {fl.ledger.map((f) => (
                          <tr key={f.id} className={f.decision === "accepted" ? "old" : ""}>
                            <td className="num w-28 text-art">
                              ledger
                              <div className="text-dim">
                                ×{f.n} of {Math.max(...f.samples, f.n)}
                              </div>
                            </td>
                            <td>
                              <div className="quote">{f.span}</div>
                              <div className="kv">
                                <b>replacement</b>
                                <span>{f.replacement}</span>
                                {f.patch && (
                                  <>
                                    <b>patch</b>
                                    <span>{f.patch}</span>
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="text-right whitespace-nowrap">
                              {gating && f.decision === "open" && (
                                <>
                                  {f.patch && (
                                    <Btn onClick={() => gate("patch", { finding: f.id })} title="Put this flag's own rewrite of the span into the scene, word for word. No model call.">
                                      apply patch
                                    </Btn>
                                  )}
                                  <div className="mt-1">
                                    <Btn variant="art" onClick={() => gate("rewrite", { beat: sc.beat, finding: f.id })}>
                                      rewrite with this
                                    </Btn>
                                  </div>
                                </>
                              )}
                              {f.decision === "accepted" && <span className="num text-keep">applied</span>}
                            </td>
                          </tr>
                        ))}
                        {fl.structure?.flags.map((q) => (
                          <tr key={q}>
                            <td className="num w-28 text-art">
                              structure
                              <div className="text-dim">
                                {q} · {fl.structure!.answers[q].answer}
                              </div>
                            </td>
                            <td>
                              <div className="quote">{fl.structure!.answers[q].quote}</div>
                            </td>
                            <td></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        <div className="aside min-w-0">
          <Head note={`${words.toLocaleString()} words · ${s.screenFindings.length} ledger flags · ${nStructure} structure flags`}>scenes</Head>
          <table className="mt-1">
            <thead>
              <tr>
                <th className="head w-8">beat</th>
                <th className="head">job</th>
                <th className="head text-right">words</th>
                <th className="head text-right">flags</th>
              </tr>
            </thead>
            <tbody>
              {s.scenes.map((sc) => {
                const fl = flagsFor(sc.beat),
                  beat = s.schedule?.beats[sc.beat - 1];
                const n = wordsOf(sc.text);
                return (
                  <tr
                    key={sc.beat}
                    className={"pick" + (k === sc.beat ? " sel" : "")}
                    onClick={() => {
                      setView("story");
                      setK(sc.beat);
                      document.getElementById(`beat-${sc.beat}`)?.scrollIntoView({ block: "start" });
                    }}
                  >
                    <td className="num">{sc.beat}</td>
                    <td className="serif-cell">
                      <span className="line-clamp-2">{beat?.job ?? firstParagraph(sc.text)}</span>
                    </td>
                    <td className="num text-right">{n}</td>
                    <td className="text-right whitespace-nowrap">
                      {fl.ledger.map((f) => (
                        <React.Fragment key={f.id}>
                          <Mark state="fail" small />{" "}
                        </React.Fragment>
                      ))}
                      {fl.structure?.flags.map((q) => (
                        <React.Fragment key={q}>
                          <Mark state="art" small />{" "}
                        </React.Fragment>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2 text-dim">
            <Mark state="fail" small /> ledger flag &nbsp; <Mark state="art" small /> structure flag
          </div>
          {s.profiles.length > 0 && (
            <>
              <Head className="mt-6" note="present across the draft · a tell, not a score">
                structure
              </Head>
              <Facts
                className="mt-1"
                rows={["theme-stated", "bodily-emotion", "withheld-revealed", "protagonist-never-wrong", "resolved", "resolves-everything"].flatMap((q) => {
                  const hits = s.profiles.filter((p) => p.flags.includes(q));
                  if (!hits.length && q !== "theme-stated" && q !== "bodily-emotion") return [];
                  return [
                    [
                      q.replace(/-/g, " "),
                      <span className="text-mute">
                        <Mark state={hits.length ? "art" : "held"} /> {hits.length ? `${hits.length} of ${M} · beats ${hits.map((h) => h.beat).join(", ")}` : "none"}
                      </span>,
                    ] as [React.ReactNode, React.ReactNode],
                  ];
                })}
              />
            </>
          )}
          {s.slop && (
            <>
              <Head className="mt-6" note="deterministic · against the passage pool">
                slop
              </Head>
              <Facts
                className="mt-1"
                rows={[
                  [
                    "lexicon hits",
                    s.slop.lexicon.length ? (
                      <span className="chips">
                        {s.slop.lexicon.slice(0, 12).map((l) => (
                          <span key={l.term} className="chip num">
                            {l.term} <b className="text-ink">{l.count}</b>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-dim">none</span>
                    ),
                  ],
                  [
                    "not X but Y",
                    <span className="num">
                      {s.slop.not_but.per_10k} per 10k <span className="text-dim">· pool {s.slop.not_but.pool_per_10k}</span>
                    </span>,
                  ],
                  [
                    "trigrams ×3+",
                    s.slop.trigrams.length ? (
                      <span className="chips">
                        {s.slop.trigrams.slice(0, 10).map((t) => (
                          <span key={t.trigram} className="chip num">
                            {t.trigram} <b className="text-ink">{t.count}</b>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-dim">none</span>
                    ),
                  ],
                  [
                    "paragraphs",
                    <div className="paras">
                      {s.slop.paragraphs.map((p) => {
                        const max = Math.max(...s.slop!.paragraphs.map((x) => x.mean_words), 1);
                        return (
                          <i
                            key={p.beat}
                            className={p.single_sentence_share > 0.5 ? "hi" : ""}
                            style={{ height: `${Math.max(8, Math.round((p.mean_words / max) * 100))}%` }}
                            title={`beat ${p.beat}: ${p.paragraphs} paragraphs, mean ${p.mean_words} words, ${Math.round(p.single_sentence_share * 100)}% single-sentence`}
                          />
                        );
                      })}
                    </div>,
                  ],
                ]}
              />
            </>
          )}
          {s.judge && <div className="judge">{s.judge}</div>}
        </div>
      </div>
    </>
  );
}

function ScheduleView({ s }: { s: Story }) {
  const sched = s.schedule!;
  const M = sched.beats.length;
  // one row per withheld item: first beat that lists it, and the beat that reveals it
  const rows = useMemo(() => {
    const m = new Map<string, { from: number; until: number }>();
    for (const b of sched.beats)
      for (const w of b.withheld) {
        const key = w.item.toLowerCase();
        if (!m.has(key)) m.set(key, { from: b.n, until: w.until });
      }
    return [...m.entries()].map(([, v], i) => ({ item: [...new Set(sched.beats.flatMap((b) => b.withheld.map((w) => w.item)))][i] ?? "", ...v })).sort((a, b) => a.until - b.until);
  }, [sched]);
  const wordsOf = (beat: number) =>
    s.scenes
      .find((x) => x.beat === beat)
      ?.text.split(/\s+/)
      .filter(Boolean).length ?? 0;
  return (
    <>
      <Head note="what stays hidden until which beat · shaded is withheld, the gold cell is the beat that reveals it">withholding</Head>
      <div className="mt-2 overflow-x-auto">
        <div className="chart" style={{ gridTemplateColumns: `minmax(0, 2fr) repeat(${M}, minmax(0, 1fr))` }}>
          <div className="h" style={{ textAlign: "right", paddingRight: 12 }}>
            beat
          </div>
          {sched.beats.map((b) => (
            <div key={b.n} className="h">
              {b.n}
              {b.n === M ? " · ending" : ""}
            </div>
          ))}
          {rows.map((r) => (
            <React.Fragment key={r.item}>
              <div className="lbl" title={r.item}>
                {r.item}
              </div>
              {sched.beats.map((b) => (
                <div key={b.n} className={"c " + (b.n === r.until ? "rev" : b.n >= r.from && b.n < r.until ? "held" : "")} />
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="mt-2 text-dim">
        form as derived:{" "}
        {Object.entries(sched.form)
          .map(([a, x]) => `${a} ${x}`)
          .join(" · ")}
      </div>
      <Head className="mt-6" note="job · known by its end · withheld after it · cap and words written">
        beats
      </Head>
      <table className="mt-1">
        <thead>
          <tr>
            <th className="head w-8">#</th>
            <th className="head w-24">words</th>
            <th className="head w-20"></th>
            <th className="head">beat</th>
          </tr>
        </thead>
        <tbody>
          {sched.beats.map((b) => {
            const n = wordsOf(b.n);
            const pct = Math.min(100, Math.round((n / b.words) * 100));
            return (
              <tr key={b.n}>
                <td className="num font-semibold">{b.n}</td>
                <td className="num">
                  {n} <span className="text-dim">/ {b.words}</span>
                  {n > b.words * 1.1 ? <div className="text-art">over cap</div> : null}
                  {b.absorbs !== "none" && <div className="text-mute">absorbs {b.absorbs}</div>}
                </td>
                <td className="pt-4">
                  <Bar pct={pct} over={n > b.words * 1.1} />
                </td>
                <td>
                  <div className="serif-cell">{b.job}</div>
                  <div className="kv">
                    <b>known</b>
                    <span>{b.known}</span>
                    <b>withheld</b>
                    <span>{b.withheld.length ? b.withheld.map((w) => `${w.item} → ${w.until}`).join(" · ") : "nothing"}</span>
                    <b>stakes</b>
                    <span>{b.stakes}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

export type { Step };
