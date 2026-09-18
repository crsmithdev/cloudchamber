import React, { useEffect, useMemo, useState } from "react";
import { api, type AutoResult, type Draw, type DraftConfig, type Finding, type Findings, type Story, type Step } from "./api.ts";
import { BriefFiles, DrawAside, Md, RowHead, SeedNote, StepView, boldLabels, firstParagraph, DrawNotes, inFlight, isWorking, label, stageName, stageNames, type Detail } from "./Draws.tsx";
import { ArchivedToggle, Bar, Btn, Caret as Chevron, Facts, Field, Head, Icon, Mark, Seg, lastSelected, markFor, secs, usePoll, useRememberSelected } from "./ui.tsx";

/**
 * Develop a brief: the stages after a brief (docs/specs/2026-09-05-drafting-pipeline.md).
 * The list holds briefs from the moment they exist to the moment they are kept;
 * the reading pane is the findings at gate 1, the story with its
 * screens at gate 2, or the running log in between.
 */
/** A repair chain: the root draw, its rounds oldest first, and the head. A draw with no repairs is a chain of one. */
type Chain = { root: Draw; rounds: Draw[]; head: Draw };
/**
 * One chain per draw that nothing repairs: its rounds are its ancestry, as the repair itself reads them.
 * A draw repaired more than once starts several chains, and each of them holds it.
 */
function chainsOf(draws: Draw[]): Chain[] {
  const by = new Map(draws.map((r) => [r.id, r]));
  const repaired = new Set(draws.map((r) => r.repaired_from));
  return draws
    .filter((head) => !repaired.has(head.id))
    .map((head) => {
      const rounds = [head];
      for (let r = head; r.repaired_from && by.has(r.repaired_from) && !rounds.includes(by.get(r.repaired_from)!); ) rounds.unshift((r = by.get(r.repaired_from)!));
      return { root: rounds[0], rounds, head };
    })
    .sort((a, b) => (a.head.created_at < b.head.created_at ? 1 : -1));
}
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
  const busy = heads.some((r) => r.running);
  usePoll(loadDraws, busy, [stage], 3000, 15000);
  // with nothing chosen, the draw last selected in this tab while its chain is still here, else the newest
  const last = lastSelected(stage);
  const current = selected ?? (all.some((c) => c.rounds.some((r) => r.id === last)) ? last : heads[0]?.id);
  useRememberSelected(stage, selected);
  // a draw repaired more than once is in several chains: the newest open one wins
  const chainOf = (id: string | undefined) => {
    const holds = (c: Chain) => c.rounds.some((r) => r.id === id);
    return chains.find(holds) ?? all.find(holds);
  };
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
  }, [current]);
  const working = isWorking(d);
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
  // a round another chain also holds stays as it is
  const archiveChain = (c: Chain) => {
    const own = c.rounds.filter((x) => !all.some((o) => o !== c && o.rounds.includes(x)));
    return act(() => Promise.all(own.map((x) => api.gate(x.id, { action: c.head.archived_at ? "unarchive" : "archive" }))));
  };
  const shown = all.filter((c) => showArchived || !c.head.archived_at || c === chainOf(current));
  const step = d && stepId ? d.steps.find((s) => s.id === stepId) : undefined;
  const statusLine = (r: Draw) => (r.status === "done" ? "unchecked" : label(r.status));
  // the open row's one summary line; the step log is in the reading pane
  const summary = (r: Draw, detail: Detail | null) => {
    const running = detail?.steps.filter((s) => s.status === "running") ?? [];
    if (running.length) return `${label(r.status)} · ${running.length} call${running.length > 1 ? "s" : ""} in flight`;
    const round = chainOf(r.id)!.rounds.length > 1 ? ` · round ${chainOf(r.id)!.rounds.length}` : "";
    if (r.check && r.at_gate) return `${statusLine(r)}${round} · ${r.check.reported} findings · total score ${r.check.total}`;
    return `${statusLine(r)}${round}`;
  };
  const chain = chainOf(current);
  const aside = d && (
    <DrawAside
      d={d}
      onStep={setStepId}
      top={
        <>
          {stage === "check" && autoOf(d) && <AutoRuns auto={autoOf(d)!} id={d.draw.id} />}
          {chain && chain.rounds.length > 1 && <Rounds chain={chain} current={d.draw.id} statusLine={statusLine} />}
        </>
      }
      rows={[
        ...(d.draw.repaired_from
          ? [
              [
                "repairs",
                <a href={`#${stage}/${d.draw.repaired_from}`} className="num">
                  {d.draw.repaired_from}
                </a>,
              ] as [React.ReactNode, React.ReactNode],
            ]
          : []),
        ...(d.draw.superseded_by
          ? [
              [
                "superseded by",
                <a href={`#${stage}/${d.draw.superseded_by}`} className="num">
                  {d.draw.superseded_by}
                </a>,
              ] as [React.ReactNode, React.ReactNode],
            ]
          : []),
      ]}
    />
  );
  return (
    <>
      <div className="pane list">
        <div className="listhead">
          <span className="head">
            {stage === "check"
              ? `${heads.filter((r) => r.at_gate).length} to review · ${heads.filter((r) => r.status === "done").length} unchecked`
              : `${heads.filter((r) => r.at_gate).length} to review · ${heads.filter((r) => r.status === "drafted").length} kept`}
            {chains.some((c) => c.rounds.length > 1) && <span className="note"> · {chains.filter((c) => c.rounds.length > 1).length} repair chains</span>}
            <ArchivedToggle archived={archived} shown={showArchived} onToggle={() => setShowArchived((v) => !v)} />
          </span>
        </div>
        {chains.length === 0 && <div className="empty">{stage === "check" ? "No briefs yet. Choose a premise in ideate to make one." : "Nothing drafted yet. Draft a brief from check."}</div>}
        {shown.map((c) => {
          const r = c.head;
          const on = chain === c;
          const isOpen = on && !folded;
          return (
            <div
              key={c.head.id}
              className={"row" + (on ? " on" : "") + (isOpen ? " open" : "") + (r.running ? " running" : "") + (r.archived_at ? " old" : "")}
              onClick={() => {
                if (!on) location.hash = `#${stage}/${r.id}`;
                else if (stepId) setStepId(null);
                else setFolded((f) => !f);
              }}
            >
              <RowHead
                name={c.root.name ?? c.root.id}
                status={statusLine(r)}
                mark={markFor(r)}
                rounds={c.rounds.length}
                at={r.created_at}
                archived={!!r.archived_at}
                blocked="a premise was chosen from it; archive it instead"
                onArchive={() => archiveChain(c)}
              />
              {isOpen && (
                <>
                  <div className="l2">
                    <span className={r.running ? "sweep text-running" : ""}>{summary(r, on ? d : null)}</span>
                  </div>
                  <div className="l2">
                    <span className="text-dim">
                      {r.origin?.index ? (
                        <span className="num text-mute">
                          #{r.origin.index}
                          {r.origin.probability != null ? ` · ${r.origin.probability.toFixed(2)}` : ""} ·
                        </span>
                      ) : null}{" "}
                      {r.setting ?? "unrestricted"} · {r.genre}
                      {r.flagged ? <span className="text-art"> · flagged</span> : null}
                    </span>
                  </div>
                  <div className="sd">{r.seed_text}</div>
                  {stage === "check" && r.status === "done" && (
                    <div className="acts" onClick={(e) => e.stopPropagation()}>
                      <Btn
                        title={`Run the checkers once (derivation, ledger, structure, resemblance${r.setting ? ", claims" : ""}) and stop for you to review the findings.`}
                        onClick={() =>
                          act(
                            () => api.check(r.id),
                            () => r.id,
                          )
                        }
                      >
                        check
                      </Btn>
                    </div>
                  )}
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
              <span className={"state " + (working ? "text-running" : d.draw.at_gate ? "text-art" : d.draw.status === "failed" ? "text-pass" : "text-mute")}>
                <Mark state={markFor(d.draw)} />
                <span className={working ? "sweep" : ""}>
                  {d.draw.status === "done" ? "unchecked" : label(d.draw.status)}
                  {working ? inFlight(d) : ""}
                </span>
              </span>
            </div>
            {err && <div className="err mt-2">{err}</div>}
            {stage !== "write" && <DrawNotes draw={d.draw} />}
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
              <StoryPane d={d} onAct={act} aside={aside} />
            ) : d.draw.status === "awaiting_check_gate" || d.draw.status === "repaired" ? (
              <GateOne d={d} onAct={act} onDraft={() => setSettings(true)} aside={aside} />
            ) : d.draw.status === "done" ? (
              <BriefReady d={d} onCheck={() => act(() => api.check(d.draw.id))} onAuto={() => act(() => api.gate(d.draw.id, { action: "auto" }))} onFlag={(note) => act(() => api.gate(d.draw.id, { action: "flag", note }))} onDraft={() => setSettings(true)} aside={aside} />
            ) : (
              <Building d={d} aside={aside} />
            )}
          </>
        )}
      </div>
    </>
  );
}

/** A repair chain's rounds, oldest first: score bar, score, accepted over reported. A row opens its round; the lowest score is gold. */
function Rounds({ chain, current, statusLine }: { chain: Chain; current: string; statusLine: (r: Draw) => string }) {
  const max = Math.max(...chain.rounds.map((x) => x.check?.total ?? 0), 1);
  const lowest = chain.rounds.reduce((m, x) => (x.check && (!m || x.check.total < m.check!.total) ? x : m), null as Draw | null);
  const at = chain.rounds.findIndex((x) => x.id === current) + 1;
  return (
    <div className="mb-6">
      <Head as="div" note={`round ${at} of ${chain.rounds.length}${lowest ? ` · lowest score in round ${chain.rounds.indexOf(lowest) + 1}` : ""}`}>
        rounds
      </Head>
      <table className="ledger">
        <thead>
          <tr>
            <th className="head" title="One row per brief in the whole repair chain: every repair that reached this brief, including any before the last auto run.">
              round
            </th>
            <th className="head"></th>
            <th className="head text-right" title="The findings' scores added up. Lower is better.">
              score
            </th>
            <th className="head text-right" title="Findings accepted for repair, of those reported.">
              accepted
            </th>
          </tr>
        </thead>
        <tbody>
          {chain.rounds.map((x, i) => (
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
              <td className={"num text-right" + (x === lowest ? " text-keep" : "")}>{x.check ? x.check.total : "—"}</td>
              <td className="num text-right text-dim">{x.check ? `${x.check.accepted}/${x.check.reported}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The auto repair run recorded on a brief, if one reached it: the newest artifact wins. */
function autoOf(d: Detail): AutoResult | null {
  const art = [...d.artifacts].reverse().find((a) => a.kind === "auto");
  return art ? JSON.parse(art.content) : null;
}

/**
 * The auto repair run that ended at this brief, one row per round. It counts the
 * rounds of one run: a round that accepts nothing re-checks the same brief, so two
 * rows can name one brief. The rounds table under it counts the briefs of the whole
 * chain, repairs before the run included, so the two totals rarely agree.
 */
function AutoRuns({ auto, id }: { auto: AutoResult; id: string }) {
  return (
    <div className="mb-6">
      <Head
        as="div"
        note={
          auto.stopped === "floor"
            ? `stopped: nothing scored ${auto.floor} or more`
            : auto.stopped === "patience"
              ? "stopped: the total score stopped falling"
              : auto.stopped === "budget"
                ? `stopped: reached the call budget at ${auto.calls} calls`
                : "stopped: reached the round limit"
        }
      >
        auto repair · {auto.rounds.length} round{auto.rounds.length > 1 ? "s" : ""}
      </Head>
      <table className="ledger">
        <thead>
          <tr>
            <th className="head" title="One row per round of this auto run. A round that accepts nothing re-checks the same brief instead of repairing it, so two rounds can name one brief.">
              round
            </th>
            <th className="head">brief</th>
            <th className="head text-right" title="Findings open when the round began.">
              open
            </th>
            <th className="head text-right" title="Those findings' scores added up. Lower is better.">
              score
            </th>
            <th className="head text-right" title="Findings the round accepted for repair.">
              accepted
            </th>
            <th className="head text-right" title="Model calls the chain had made when the round began.">
              calls
            </th>
          </tr>
        </thead>
        <tbody>
          {auto.rounds.map((r) => (
            <tr
              key={r.round}
              className={r.id === id ? "sel" : ""}
              onClick={() => {
                if (r.id !== id) location.hash = `#check/${r.id}`;
              }}
              title={`round ${r.round} · brief ${r.id}${r.round === auto.best.round ? " · lowest score" : ""}`}
            >
              <td className="num w-4">{r.round}</td>
              <td className={"num" + (r.id === id ? " text-dim" : "")}>{r.id}</td>
              <td className="num text-right">{r.open}</td>
              <td className={"num text-right" + (r.round === auto.best.round ? " text-keep" : "")}>{r.total}</td>
              <td className="num text-right text-dim">{r.accepted}</td>
              <td className="num text-right text-dim">{r.calls}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {auto.best.id !== auto.id && <div className="mt-2 text-dim">Round {auto.best.round} scored lowest, but a later round replaced it. Open it if this round reads worse.</div>}
      {!!auto.left_open && (
        <div className="mt-2 text-mute">
          {auto.left_open} finding{auto.left_open > 1 ? "s" : ""} at or above the floor {auto.left_open > 1 ? "are" : "is"} still open here: auto stopped before repairing {auto.left_open > 1 ? "them" : "it"}.
        </div>
      )}
    </div>
  );
}

/**
 * The check tab's controls, in the same places for every state of a brief: the actions on the left, the note and
 * the gate calls on the right. A control that does not apply to the state stays in its place, disabled, and its
 * tooltip says why.
 */
function CheckControls({
  d,
  note,
  onNote,
  onAuto,
  onCheck,
  onDraft,
  onFlag,
  onHold,
  openFindings = 0,
  pendingRepair = 0,
}: {
  d: Detail;
  note: string;
  onNote: (v: string) => void;
  onAuto: () => void;
  onCheck?: () => void;
  onDraft: () => void;
  onFlag?: () => void;
  onHold?: () => void;
  openFindings?: number;
  pendingRepair?: number;
}) {
  const unchecked = d.draw.status === "done";
  const atGate = d.draw.status === "awaiting_check_gate";
  const a = d.draw.actions;
  const replaced = "This brief was repaired into a new round. Work there.";
  // a refused action says why: the server's reason, or on a superseded round where to work instead
  const why = (reason: string | null) => (d.draw.status === "repaired" ? replaced : (reason ?? ""));
  const repair = d.repair;
  const checks = d.checks_next.join(", ");
  // the words a draft would run to, once the draw has settled a config of its own
  const drafted = d.draw.draft_config ? JSON.parse(d.draw.draft_config).config : null;
  return (
    <div className="controls" role="group" aria-label="Brief">
      <Btn
        variant="primary"
        disabled={!!a.auto || (atGate && openFindings === 0)}
        onClick={onAuto}
        title={
          !a.auto
            ? `${unchecked ? `Check the brief (${checks}), then repair` : "Repair"} round after round without asking: accept every finding scoring ${repair.stop_score} or more, dismiss the rest, re-check, repeat. It stops when nothing reaches ${repair.stop_score}, after ${repair.rounds} rounds, after ${repair.max_calls} model calls, or when the total score has not fallen for ${repair.patience} rounds.${atGate && !openFindings ? " No finding is open." : ""}`
            : why(a.auto)
        }
      >
        check – auto repair
      </Btn>
      <Btn
        disabled={!!a.check || atGate}
        onClick={onCheck}
        title={unchecked ? `Run the checkers once (${checks}) and stop for you to review the findings.` : atGate ? "Checked already: rule on the findings below, or auto repair them." : why(a.check)}
      >
        check
      </Btn>
      <Btn
        disabled={!!a.draft || pendingRepair > 0}
        onClick={onDraft}
        title={
          a.draft ? why(a.draft) : pendingRepair ? "Accepted findings are waiting for their repair." : `Set up the draft and write the story from this brief as it stands${unchecked ? ", unchecked" : ""}.`
        }
      >
        draft{drafted ? ` · ${drafted.length.words} words` : ""} <Chevron open />
      </Btn>
      <span className="end">
        <input type="text" placeholder="note for the log" aria-label="Note for the log" value={note} onChange={(e) => onNote(e.target.value)} />
        <Btn variant="art" disabled={!!a.flag || !onFlag} onClick={onFlag} title={a.flag ?? "Mark this brief as looking wrong, with the note. Nothing runs."}>
          flag
        </Btn>
        <Btn variant="quiet" disabled={!!a.hold || !onHold} onClick={onHold} title={a.hold ? (unchecked ? "Nothing is checked yet." : why(a.hold)) : "Leave the findings open to review later. Nothing runs."}>
          hold
        </Btn>
      </span>
    </div>
  );
}

function BriefReady({ d, onCheck, onAuto, onFlag, onDraft, aside }: { d: Detail; onCheck: () => void; onAuto: () => void; onFlag: (note: string) => void; onDraft: () => void; aside: React.ReactNode }) {
  const [note, setNote] = useState("");
  return (
    <>
      <CheckControls d={d} note={note} onNote={setNote} onAuto={onAuto} onCheck={onCheck} onFlag={() => onFlag(note)} onDraft={onDraft} />
      <div className="drawbody">
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
        <div className="aside min-w-0">{aside}</div>
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
function Building({ d, aside }: { d: Detail; aside: React.ReactNode }) {
  const running = d.steps.filter((s) => s.status === "running");
  const done = new Set(d.steps.filter((s) => s.status === "done").map((s) => s.stage));
  const { vignette, outline, contexts, ending } = d.parts;
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
            <Md text={boldLabels(body)} />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
  return (
    <div className="drawbody">
      <div className="max-w-[66rem]">
        <Head
          note={
            <>
              {BUILD.map((s, i) => (
                <React.Fragment key={s}>
                  {i > 0 && " · "}
                  {stageName(s)}
                  {done.has(s) && <Icon name="check" />}
                </React.Fragment>
              ))}
              {" · the page refreshes itself"}
            </>
          }
        >
          {running.length ? `${running.length} call${running.length > 1 ? "s" : ""} in flight: ${stageNames(running)}` : "waiting for the next step"}
        </Head>
        <Head className="mt-6">the brief, as it lands</Head>
        <table className="mt-1">
          <tbody>
            {part("premise and vignette", vignette?.text)}
            {part("outline.md", outline?.text)}
            {contexts.length ? contexts.map((c, i) => part(`context-${i + 1}.md`, c.text)) : part("context-1.md", undefined)}
            {part("ending.md", ending?.text)}
          </tbody>
        </table>
      </div>
      <div className="aside min-w-0">{aside}</div>
    </div>
  );
}

// --- gate 1 ------------------------------------------------------------------

function GateOne({ d, onAct, onDraft, aside }: { d: Detail; onAct: (fn: () => Promise<any>, go?: (r: any) => string | undefined) => void; onDraft: () => void; aside: React.ReactNode }) {
  const [f, setF] = useState<Findings | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [examined, setExamined] = useState(false);
  const [floor, setFloor] = useState(d.repair.stop_score);
  const [showAll, setShowAll] = useState(false);
  // a dismissal adds no step, so the list also reloads on demand: without this it kept showing the finding as open
  const [ruled, setRuled] = useState(0);
  const id = d.draw.id;
  useEffect(() => {
    api
      .findings(id, showAll)
      .then(setF)
      .catch(() => {});
  }, [id, d.steps.length, showAll, ruled]);
  // the command names the draw to show next; dismiss names none, so the pane stays where it is
  const gate = (action: string, extra: Record<string, unknown> = {}) =>
    onAct(
      () => api.gate(id, { action, note, ...extra }).then((r) => { setRuled((n) => n + 1); return r; }),
      (r) => r?.draw ?? undefined,
    );
  const open = f?.findings.filter((x) => x.decision === "open") ?? [];
  const accepted = f?.findings.filter((x) => x.decision === "accepted") ?? [];
  const repaired = d.draw.status === "repaired";
  const meta = d.parts.outline?.meta ?? {};
  const constraints: string[] = meta.constraints ?? [];
  const jobs: string[] = meta.jobs ?? [];
  const toggle = (fid: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(fid) ? n.delete(fid) : n.add(fid);
      return n;
    });
  // a bulk selector offers only what the gate acts on: auto skips a dropped finding, and so does "all"
  const selectable = open.filter((x) => x.reported && !x.relitigates);
  const atFloor = selectable.filter((x) => x.score >= floor);
  const reopened = f?.findings.filter((x) => x.relitigates) ?? [];
  // the gate's own list: reported, or already ruled on. What the verify pass or the sample bar took
  // off it is shown only when asked for, under its own head, and never by a bulk selector.
  const listed = f?.findings.filter((x) => !x.relitigates && (x.reported || x.decision !== "open")) ?? [];
  const left = f?.findings.filter((x) => !x.relitigates && !x.reported && x.decision === "open") ?? [];
  const checkSteps = d.steps.filter((s) => s.stage.startsWith("check-") && s.status === "done");
  const checkSecs = checkSteps.reduce((n, s) => n + Number(secs(s.started_at, s.ended_at)), 0);
  const reported = f?.findings.filter((x) => x.reported) ?? [];
  // the open list and the list that undoes an earlier fix are the same row
  const row = (x: Finding) => (
    <FindingRow key={x.id} f={x} S={x.samples_run ?? S} scoreMax={f!.score_max} selected={sel.has(x.id)} onToggle={() => toggle(x.id)} onDismiss={() => gate("dismiss", { finding: x.id })} readOnly={repaired} />
  );
  const S = f?.findings[0]?.samples_run ?? 3;
  return (
    <>
      {!repaired && (
        <CheckControls
          d={d}
          note={note}
          onNote={setNote}
          onAuto={() => gate("auto")}
          onDraft={onDraft}
          onFlag={() => gate("flag")}
          onHold={() => gate("hold")}
          openFindings={selectable.length}
          pendingRepair={accepted.length}
        />
      )}
      {!repaired && (
        <div className="controls" role="group" aria-label="Repair">
          <Btn
            variant="keep"
            disabled={!sel.size && !accepted.length}
            onClick={() => gate("accept", { findings: [...sel] })}
            title="Accept the selected findings. The brief is repaired into a new draw under their replacements and re-checked."
          >
            repair {sel.size || accepted.length} and re-check
          </Btn>
          <span className="group">
            <Btn
              variant="keep"
              disabled={!selectable.length}
              onClick={() => setSel(new Set(selectable.map((x) => x.id)))}
              title="Select every open finding that was reported and does not undo a fix accepted in an earlier round."
            >
              all ({selectable.length})
            </Btn>
            <Btn variant="keep" disabled={!atFloor.length} onClick={() => setSel(new Set(atFloor.map((x) => x.id)))} title={`Select every reported finding scoring ${floor} or more.`}>
              ≥ {floor} ({atFloor.length})
            </Btn>
            <input type="range" min={1} max={f?.score_max ?? floor} step={1} value={floor} aria-label="Score floor" onChange={(e) => setFloor(Number(e.target.value))} />
            <Btn variant="quiet" disabled={!sel.size} onClick={() => setSel(new Set())} title="Clear the selection.">
              clear
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
      <div className="drawbody wide">
        <div className="min-w-0">
          <Head
            note={
              <>
                {f ? `${reported.length} reported${f.off_list.dropped ? ` · ${f.off_list.dropped} the verify pass dropped` : ""}${f.off_list.rare ? ` · ${f.off_list.rare} too rare to report` : ""}` : "…"}
                {f?.pass ? ` · checked ${f.pass.slice(0, 16).replace("T", " ")}` : ""}
                {checkSteps.length ? ` · ${checkSteps.length} checker calls · ${checkSecs} s` : ""} · highest score first · duplicates merged across checkers ·{" "}
                <button
                  className="link"
                  aria-pressed={showAll}
                  onClick={() => setShowAll((v) => !v)}
                  title="The verify pass reads every finding back against the brief and keeps only what a reader of the vignettes and the ending would notice; a finding seen in too few samples is not reported either. Both stay open for you, and nothing runs again to show them."
                >
                  {showAll ? "hide" : "show"} what left the list
                </button>
              </>
            }
          >
            findings
          </Head>
          {f && listed.length === 0 && (
            <div className="mt-2 text-mute">
              {f.off_list.dropped
                ? `Nothing to rule on: the verify pass dropped ${f.off_list.dropped} finding${f.off_list.dropped > 1 ? "s" : ""} as invisible to a reader of the vignettes and the ending. Show them to read why.`
                : "Nothing recurred in enough samples to report. What each checker examined is listed beside."}
            </div>
          )}
          {f && (listed.length > 0 || reopened.length > 0) && (
            <div className="findings mt-1">
              {listed.map(row)}
              {reopened.length > 0 && (
                <>
                  <Head as="div" className="mt-5" note={`${reopened.length} finding${reopened.length > 1 ? "s" : ""} that would undo a fix you accepted · auto repair skips ${reopened.length > 1 ? "them" : "it"}`}>
                    undoes an earlier fix
                  </Head>
                  <div className="mt-1 mb-2 max-w-[66ch] text-mute">
                    A repair round is free to trade one fix for another, and the checkers then report the fix as the defect. Either the earlier decision was wrong, in which case accept this and say so in the note, or
                    this is the loop arguing with itself, in which case dismiss it.
                  </div>
                  {reopened.map(row)}
                </>
              )}
            </div>
          )}
          {f && left.length > 0 && (
            <>
              <Head as="div" className="mt-5" note={`${f.off_list.dropped} the verify pass dropped${f.off_list.rare ? ` · ${f.off_list.rare} seen in too few samples` : ""} · auto repair skips them`}>
                taken off the list
              </Head>
              <div className="mt-1 mb-2 max-w-[66ch] text-mute">
                The verify pass keeps only what a reader of the vignettes and the ending would notice, and a finding seen in too few samples is not reported. Each of these is still open: accept one from its own
                row if you disagree.
              </div>
              <div className="findings">{left.map(row)}</div>
            </>
          )}
          {f && (
            <>
              <Head
                className="mt-6"
                note={
                  f.claims.length
                    ? `${f.claims.length} verified · ${f.claims.filter((c) => c.result === "supported").length} supported · ${f.claims.filter((c) => c.result === "contradicted").length} contradicted · ${f.claims[0].authority === "world" ? "the web, on sonnet" : f.claims[0].authority === "setting" ? "the setting file" : "the setting's reference files"}`
                    : "not run: the setting names no source to check claims against"
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
              <Head className="mt-6" note="the words each section carries, and the findings that break it">
                outline sections
              </Head>
              <table className="mt-1">
                <thead>
                  <tr>
                    <th className="head">section</th>
                    <th className="head text-right">words</th>
                    <th className="head text-right">findings</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j}>
                      <td>{j}</td>
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
              <Head className="mt-6" note="the replacements you accepted, given word for word to every later repair">
                accepted fixes
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
          <div className="mb-6">{aside}</div>
          {f && <Profiles f={f} />}
          {f && f.examined.length > 0 && (
            <>
              <Head className="mt-6" note="what each checker call looked at, so an empty result can be read">
                examined
              </Head>
              <table className="mt-1">
                <tbody>
                  <tr className="pick" onClick={() => setExamined((e) => !e)}>
                    <td className="w-4">
                      <Chevron open={examined} />
                    </td>
                    <td className="num">{f.examined.length} lists</td>
                    <td className="text-dim">{stageNames(f.examined)}</td>
                  </tr>
                  {examined &&
                    f.examined.map((e, i) => (
                      <tr key={i}>
                        <td></td>
                        <td colSpan={2} className="num whitespace-pre-wrap text-dim">
                          <span className="text-mute">
                            {stageName(e.stage)} · sample {e.sample}
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
function FindingRow({ f, S, scoreMax, selected, onToggle, onDismiss, readOnly }: { f: Finding; S: number; scoreMax: number; selected: boolean; onToggle: () => void; onDismiss: () => void; readOnly: boolean }) {
  const acc = f.decision === "accepted" || selected;
  const cls = "finding" + (acc ? " sel" : "") + (f.decision === "dismissed" ? " old" : "");
  return (
    <div className={cls}>
      <div className="line">
        <span className="num w-6 font-semibold" title={`score ${f.score} of ${scoreMax}: recurrence, a second checker, what it invalidates, the kind of result, and whether it quotes evidence`}>
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
        <span className="text-dim">
          breaks <b className={"font-normal " + (f.invalidates === "none" ? "" : "text-ink")}>{f.invalidates === "none" ? "no section" : f.invalidates}</b>
        </span>
        <span className="text-dim">{f.checkers.join(" · ")}</span>
        {f.dropped && (
          <span className="text-dim" title={f.dropped}>
            dropped: {f.dropped}
          </span>
        )}
        {f.relitigates && (
          <a className="link text-pass" href={`#check/${f.relitigates.draw}`} title={`This finding would undo the fix you accepted in round ${f.relitigates.round}: ${f.relitigates.replacement}`}>
            undoes round {f.relitigates.round} fix
          </a>
        )}
        <Mark state={acc ? "held" : f.decision === "dismissed" ? "fail" : ""} title={f.decision} />
        <span className="acts">
          {f.decision === "accepted" ? (
            <span className="text-keep">accepted{f.note ? ` · ${f.note}` : ""}</span>
          ) : f.decision === "dismissed" ? (
            <span className="text-dim">dismissed{f.note ? ` · ${f.note}` : ""}</span>
          ) : readOnly ? (
            <span className="text-dim">open</span>
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

/** The questions as the checker is asked them (app/pipeline/prompts.ts, checkStructure); the server names which it asks and in what order. */
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
              {f.structure.map((q) => {
                const a = structure.answers![q];
                const present = a?.answer === "present";
                return (
                  <tr key={q} title={STRUCTURE_DEF[q]}>
                    <td className="w-4">
                      <Mark state={present ? "held" : ""} />
                    </td>
                    <td className={"whitespace-nowrap " + (present ? "" : "text-dim")}>{q.replace("category-violation", "category")}</td>
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
                  <td className="w-16 whitespace-nowrap text-dim">matches</td>
                  <td title={`Entry ${/^\d+/.exec(m.entry)?.[0] ?? "?"} of ${PREMISES_FILE}, quoted by the checker verbatim; the span is where the brief matches it.`}>
                    <div>{m.entry}</div>
                    <div className="quote mt-1 text-mute">{unquote(m.span)}</div>
                  </td>
                </tr>
              ))}
              {resemblance.nearest && (
                <tr>
                  <td className="whitespace-nowrap text-dim">nearest</td>
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
              <span className="w-24 text-dim">{axis}</span>
              <Seg label={axis} value={val(`form.${axis}`)} options={["auto", ...opts]} onChange={set(`form.${axis}`)} />
              {overrides[`form.${axis}`] !== undefined && <span className="text-art">overridden</span>}
            </div>
          ))}
          <div className="inline">
            <span className="w-24 text-dim">ending</span>
            <Seg label="ending" value={val("form.ending")} options={["brief", "open"]} onChange={set("form.ending")} />
          </div>
        </div>
      </Field>
      <Field label="Scenes" help="Sequential carries the text so far into each scene call. Parallel writes all beats at once from the schedule alone.">
        <Seg label="Scene order" value={val("scenes.order")} options={["sequential", "parallel"]} onChange={set("scenes.order")} />
      </Field>
      {!checked && (
        <Field
          label="Check"
          help="This brief has not been checked. Skip drafts it as it stands (one ledger extraction supplies the ledger). Auto runs the check, accepts what recurred in every sample with evidence, dismisses the rest, repairs once and re-checks, then drafts and stops for you to review the draft."
        >
          <Seg label="Check" value={auto ? "auto" : "skip"} options={["skip", "auto"]} onChange={(x) => setAuto(x === "auto")} />
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

function StoryPane({ d, onAct, aside }: { d: Detail; onAct: (fn: () => Promise<any>, go?: (r: any) => string | undefined) => void; aside: React.ReactNode }) {
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
  const gating = d.draw.actions.keep === null;
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
        <div className="controls" role="group" aria-label="Draft review">
          <Btn variant="primary" onClick={() => gate("keep")} title={`Keep the story. It is exported to drafts/${id}/ with its schedule, findings, configuration and trail.`}>
            keep and export
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
              then screens scene {k}
              {k < M ? ` and ${k + 1}` : ""} again
            </span>
          </span>
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
            ) : (
              label(d.draw.status)
            )}
            {d.draw.flag_note && <span className="text-dim"> · flagged: {d.draw.flag_note}</span>}
            {d.draw.error && <span className="text-pass"> · the last action failed: {d.draw.error}</span>}
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
                          {over ? " · over the word cap" : ""}
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
                            <td className="w-28 text-art">
                              ledger
                              {Math.max(...f.samples, f.n) > 1 && (
                                <div className="text-dim">
                                  {f.n} of {Math.max(...f.samples, f.n)} samples
                                </div>
                              )}
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
                            <td className="w-28 text-art">
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
          <div className="mb-6">{aside}</div>
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
                            {l.term} <b className="font-semibold text-ink">{l.count}</b>
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
                    "phrases repeated 3+",
                    s.slop.trigrams.length ? (
                      <span className="chips">
                        {s.slop.trigrams.slice(0, 10).map((t) => (
                          <span key={t.trigram} className="chip num">
                            {t.trigram} <b className="font-semibold text-ink">{t.count}</b>
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
    const m = new Map<string, { item: string; from: number; until: number }>();
    for (const b of sched.beats)
      for (const w of b.withheld) {
        const key = w.item.toLowerCase();
        if (!m.has(key)) m.set(key, { item: w.item, from: b.n, until: w.until });
      }
    return [...m.values()].sort((a, b) => a.until - b.until);
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
                  {n > b.words * 1.1 ? <div className="text-art">over the word cap</div> : null}
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
