import React, { useEffect, useMemo, useState } from "react";
import { api, type Draw, type DrawBase, type Example, type Status } from "./api.ts";
import { DrawAside, DrawBody, DrawNotes, RowHead, StartForm, StepView, inFlight, isWorking, label, type Detail } from "./Draws.tsx";
import { BriefReady, Building, PlanGate, StoryPane } from "./Develop.tsx";
import { ArchivedToggle, Btn, LinkBtn, Mark, lastSelected, markFor, onEnter, usePoll, useRememberSelected, useAddressBar } from "./ui.tsx";

/**
 * Stories (docs/specs/2026-09-30-stories.md): one row per story, grouped by who acts next, and a pane that
 * follows the story through its five stops. The strip picks the stop; each stop reuses the pane made for it.
 */

/** A repair chain: the root draw, its rounds oldest first, and the head. A draw with no repairs is a chain of one. */
type Chain = { root: Draw; rounds: Draw[]; head: Draw };
/** One chain per draw that nothing repairs, newest first. A draw repaired more than once is in several chains. */
function chainsOf(draws: Draw[]): Chain[] {
  const by = new Map(draws.map((r) => [r.id, r]));
  return draws
    .filter((r) => r.head)
    .map((head) => {
      const rounds = head.rounds.map((id) => by.get(id)).filter((r): r is Draw => !!r);
      return { root: rounds[0] ?? head, rounds, head };
    })
    .sort((a, b) => (a.head.created_at < b.head.created_at ? 1 : -1));
}

const STOPS = ["premises", "brief", "plan", "scenes", "report"] as const;
type Stop = (typeof STOPS)[number];

/** A brief that stands, with no schedule: ready to draft, repaired by a later round, or left at gate 1 before it was retired. */
const BRIEF = new Set(["done", "repaired", "awaiting_check_gate"]);
/** The statuses of a draw with a schedule: the plan gate, then the scenes. */
const PLANNED = new Set(["awaiting_plan_gate", "drafting", "awaiting_draft_gate", "drafted"]);

/** The stop a draw stands at, from its row alone: the list has no steps, so a draft in progress counts as scenes. */
function stopOfRow(r: DrawBase): Stop {
  if (!r.chosen_step && !r.repaired_from) return "premises";
  if (r.status === "awaiting_plan_gate") return "plan";
  if (r.status === "drafting" || r.status === "awaiting_draft_gate" || r.status === "drafted") return "scenes";
  return "brief";
}
/** The stop a draw stands at: a draft being planned has no scene yet, so it stands at the plan. */
function stopOf(d: Detail): Stop {
  const s = stopOfRow(d.draw);
  return s === "scenes" && d.draw.status === "drafting" && !d.steps.some((x) => x.stage === "scene") ? "plan" : s;
}

type Group = "needs" | "running" | "kept" | "other";
const GROUPS: { key: Group; name: string; className: string }[] = [
  { key: "needs", name: "needs you", className: "text-art" },
  { key: "running", name: "running", className: "text-running" },
  { key: "kept", name: "kept", className: "text-keep" },
  { key: "other", name: "other", className: "text-dim" },
];
const NEEDS = new Set(["awaiting_gate", "done", "awaiting_plan_gate", "awaiting_draft_gate"]);
const groupOf = (r: Draw): Group =>
  r.running ? "running" : r.superseded?.how === "redrawn" ? "other" : NEEDS.has(r.status) ? "needs" : r.status === "drafted" ? "kept" : "other";
const statusLine = (r: DrawBase) => (r.status === "done" ? "ready to draft" : label(r.status));
/** A draw's short name: the four characters after its timestamp. */
const short = (id: string) => id.split("-").at(-1) ?? id;

/** `sub` is the route's third part: a stop pins the strip, anything else names a step; none follows the story as it moves. */
export function Stories({ status, selected, like, sub }: { status: Status | null; selected: string | undefined; like?: string; sub?: string }) {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [d, setD] = useState<Detail | null>(null);
  // the chain's first round, which ran the premises, when it is not the draw open
  const [rootD, setRootD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const picked = sub && (STOPS as readonly string[]).includes(sub) ? (sub as Stop) : null;
  const stepId = picked ? undefined : sub;

  const loadDraws = () =>
    api
      .draws(true)
      .then((all) => {
        setDraws(all);
        setLoaded(true);
      })
      .catch(() => {});
  const all = useMemo(() => chainsOf(draws), [draws]);
  usePoll(loadDraws, draws.some((r) => r.running), [], 3000, 15000);

  const isForm = selected === "new";
  const live = all.filter((c) => !c.head.archived_at);
  const last = lastSelected("story");
  const current = isForm ? undefined : (selected ?? (draws.some((r) => r.id === last) ? last : live[0]?.head.id) ?? undefined);
  useRememberSelected("story", isForm ? undefined : selected);
  useAddressBar(isForm ? (like ? `new/${like}` : "new") : current ? (sub ? `story/${current}/${sub}` : `story/${current}`) : undefined);
  // with no draws at all, the form
  useEffect(() => {
    if (loaded && !draws.length && !selected) location.hash = "#new";
  }, [loaded, draws.length, selected]);

  // a draw repaired more than once is in several chains: the newest open one wins
  const chainOf = (id: string | undefined) => {
    const holds = (c: Chain) => c.rounds.some((r) => r.id === id) || c.head.id === id;
    return live.find(holds) ?? all.find(holds);
  };
  const chain = chainOf(current);
  // the draw that ran the premises: a repair round, a branch and a fork all trace back to it
  const origin = d?.origin?.id ?? chain?.root.id;
  const rootId = origin && origin !== current ? origin : null;

  const loadDetail = (id: string) =>
    api
      .draw(id)
      .then(setD)
      .catch((e) => setErr(e.message));
  useEffect(() => {
    setD(null);
    setRootD(null);
    setErr("");
    setNote("");
    setAsking(false);
  }, [current]);
  const working = isWorking(d);
  usePoll(
    () => {
      if (current) loadDetail(current);
    },
    working,
    [current],
  );

  const stands = d ? stopOf(d) : "premises";
  const reached = (s: Stop) => (s === "report" ? !!d?.report : STOPS.indexOf(s) <= STOPS.indexOf(stands));
  const stop: Stop = picked && reached(picked) ? picked : stands;
  useEffect(() => {
    if (d && stop === "premises" && rootId && rootD?.draw.id !== rootId)
      api
        .draw(rootId)
        .then(setRootD)
        .catch((e) => setErr(e.message));
  }, [d, stop, rootId, rootD]);

  // the routes (spec rule 5): `#story/<id>/<stop>` pins a stop, `#story/<id>/<step>` opens a step, `#story/<id>` follows the story
  const setStepId = (id: string | null) => {
    if (current) location.hash = id ? `#story/${current}/${id}` : `#story/${current}`;
  };
  const goStop = (s: Stop) => {
    if (current) location.hash = `#story/${current}/${s}`;
  };
  // the header's note goes to the log with the next action, whichever stop takes it; it clears once that action lands
  const act = async (fn: () => Promise<any>, go?: (r: any) => string | undefined) => {
    setErr("");
    try {
      const r = await fn();
      setNote("");
      const to = go?.(r);
      if (to && to !== current) location.hash = `#story/${to}`;
      else if (current) loadDetail(current);
      loadDraws();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  // the premises gate acts on the draw that ran them; a fork is a new draw, and the page follows it
  const premisesGate = (id: string, action: string, step_id?: string, premise?: string) =>
    act(
      () => api.gate(id, { action, step_id, note, premise }),
      (r) => r.draw,
    ).then(() => {
      if (rootId) api.draw(rootId).then(setRootD);
    });
  const verdict = async (e: Example, v: "keep" | "pass", artifact = false, vnote = "") => {
    await api.verdict({ kind: "example", target_id: e.id, verdict: v, artifact, note: vnote, method: "draw" });
    if (rootD) api.draw(rootD.draw.id).then(setRootD);
    else if (current) loadDetail(current);
  };
  const remove = async () => {
    if (!d) return;
    setAsking(false);
    try {
      await api.deleteDraw(d.draw.id);
      location.hash = "#story";
      loadDraws();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const archiveChain = (c: Chain) => act(() => api.gate(c.head.id, { action: c.head.archived_at ? "unarchive" : "archive" }));
  const deleteRow = (r: Draw) =>
    act(async () => {
      await api.deleteDraw(r.id);
      if (r.id === current) location.hash = "#story";
    });

  const shown = all.filter((c) => showArchived || !c.head.archived_at || c === chain);
  const archived = all.length - live.length;
  const step = d && stepId ? d.steps.find((s) => s.id === stepId) : undefined;

  // the versions: the repair chain's rounds, the draw this one branched from, and the draws branched or forked from it
  const versions = d
    ? [
        ...(chain && chain.rounds.length > 1 ? chain.rounds : []),
        ...draws.filter((r) => r.id === d.draw.branched_from),
        ...draws.filter((r) => r.branched_from === d.draw.id || r.forked_from === d.draw.id),
      ].filter((r, i, xs) => xs.findIndex((x) => x.id === r.id) === i)
    : [];
  // a chip's relation to the draw open, which the chip shows: its round in the chain, or the branch or fork link
  const relationOf = (r: Draw) => {
    const round = chain && chain.rounds.length > 1 ? chain.rounds.findIndex((x) => x.id === r.id) : -1;
    if (round >= 0) return `round ${round + 1}`;
    if (r.id === d?.draw.id) return "this draw";
    if (r.id === d?.draw.branched_from) return "branched from";
    return r.branched_from === d?.draw.id ? "branch" : "fork";
  };

  // a branch writes no brief of its own: it carries its source's
  const briefOf = (r: DrawBase): string => {
    const src = r.branched_from ? draws.find((x) => x.id === r.branched_from) : undefined;
    return src ? briefOf(src) : r.id;
  };
  const aside = (x: Detail, ideation = false) => <DrawAside d={x} ideation={ideation} onStep={setStepId} />;
  const body = (x: Detail) => {
    if (stop === "premises") {
      const p = rootId ? (rootD?.draw.id === rootId ? rootD : null) : x;
      // a fetch that failed shows its error above the strip; nothing else is coming
      if (!p) return err ? null : <span className="text-dim">loading the premises…</span>;
      return (
        <DrawBody
          d={p}
          onChoose={(id) => premisesGate(p.draw.id, "choose", id)}
          onFork={(id, premise) => premisesGate(p.draw.id, "fork", id, premise)}
          onVerdict={verdict}
          aside={aside(p, true)}
        />
      );
    }
    if (stop === "brief") {
      if (BRIEF.has(x.draw.status) || PLANNED.has(x.draw.status))
        return (
          <BriefReady
            d={x}
            brief={briefOf(x.draw)}
            controls={BRIEF.has(x.draw.status)}
            onDraft={(b) => act(() => api.draft(x.draw.id, b))}
            aside={aside(x)}
          />
        );
      return <Building d={x} aside={aside(x)} />;
    }
    if (stop === "report") return <iframe className="report" title="The report" src={api.reportPdf(x.draw.id)} />;
    if (stop === "plan" && x.draw.status === "awaiting_plan_gate") return <PlanGate d={x} onAct={act} aside={aside(x)} />;
    // plan and scenes share one gate 2 pane, so the ticks made in one survive a move to the other
    return <StoryPane d={x} note={note} onAct={act} aside={aside(x)} view={stop === "plan" ? "plan" : "story"} onView={(v) => goStop(v === "plan" ? "plan" : "scenes")} />;
  };

  return (
    <>
      <div className="pane list">
        <div className="listhead">
          <LinkBtn variant="primary" href="#new">
            draw
          </LinkBtn>
          {loaded && (
            <span className="head">
              {live.filter((c) => groupOf(c.head) === "needs").length} need you
              <ArchivedToggle archived={archived} shown={showArchived} onToggle={() => setShowArchived((v) => !v)} />
            </span>
          )}
        </div>
        {loaded && !shown.length && <div className="empty">No stories yet.</div>}
        {GROUPS.map((g) => {
          const cs = shown.filter((c) => groupOf(c.head) === g.key);
          if (!cs.length) return null;
          return (
            <React.Fragment key={g.key}>
              <div className="grouphead">
                <span className={"head " + g.className}>{g.name}</span>
                <span className="num text-dim">{cs.length}</span>
              </div>
              {cs.map((c) => {
                const r = c.head;
                const on = c === chain;
                const at = STOPS.indexOf(stopOfRow(r));
                return (
                  <div
                    key={r.id}
                    className={"row" + (on ? " on" : "") + (r.running ? " running" : "") + (r.archived_at ? " old" : "")}
                    tabIndex={0}
                    aria-current={on ? "true" : undefined}
                    onClick={() => (location.hash = `#story/${r.id}`)}
                    onKeyDown={onEnter(() => (location.hash = `#story/${r.id}`))}
                  >
                    <RowHead
                      name={c.root.name ?? c.root.id}
                      status={statusLine(r)}
                      mark={markFor(r)}
                      rounds={c.rounds.length}
                      at={r.created_at}
                      archived={!!r.archived_at}
                      blocked={r.actions.delete ?? ""}
                      onArchive={() => archiveChain(c)}
                      onDelete={() => deleteRow(r)}
                    />
                    <div className="l2 pathline">
                      <span className="minibar" aria-hidden="true">
                        {STOPS.map((s, i) => (
                          <i key={s} className={r.status === "drafted" || i < at ? "past" : i === at ? (r.running ? "run" : g.key === "needs" ? "now" : "past") : ""} />
                        ))}
                      </span>
                      <span className={r.running ? "sweep text-running" : g.key === "needs" ? "text-art" : "text-dim"}>{statusLine(r)}</span>
                      {r.branched_from && <span className="text-dim">· branch</span>}
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>

      {isForm ? (
        <StartForm status={status} like={like} />
      ) : (
        <div className="pane read tt">
          {!current ? (
            <span className="text-dim">{loaded ? "No story open." : "loading…"}</span>
          ) : !d ? (
            err ? (
              <div className="err">{err}</div>
            ) : (
              <span className="text-dim">loading the story…</span>
            )
          ) : (
            <>
              <div className={"strip" + (working ? " running" : "")}>
                <h1>{chain?.root.name ?? d.draw.name ?? d.draw.id}</h1>
                <span className={"state " + (working ? "text-running" : d.draw.at_gate ? "text-art" : d.draw.status === "failed" ? "text-pass" : "text-mute")} aria-live="polite">
                  <Mark state={markFor(d.draw)} />
                  <span className={working ? "sweep" : ""}>
                    {statusLine(d.draw)}
                    {working ? inFlight(d) : ""}
                  </span>
                </span>
                {versions.length > 1 || (versions.length === 1 && versions[0].id !== d.draw.id) ? (
                  <span className="versions" role="group" aria-label="Versions">
                    <span className="text-dim">versions</span>
                    {[...(versions.some((v) => v.id === d.draw.id) ? [] : [d.draw as Draw]), ...versions].map((v) => (
                      <a key={v.id} href={`#story/${v.id}`} className={"num" + (v.id === d.draw.id ? " on" : "")} title={`${relationOf(v)} · ${statusLine(v)}`}>
                        {short(v.id)} <span className="text-dim">{relationOf(v)}</span>
                      </a>
                    ))}
                  </span>
                ) : null}
                {!step && (
                  <span className="tools" role="group" aria-label="Draw">
                    <input type="text" name="gate-note" placeholder="note for the log" aria-label="Gate note" value={note} onChange={(e) => setNote(e.target.value)} />
                    <Btn variant="art" title="Mark this draw as a wrong call to look at later, with the note. It stays open and nothing else changes." onClick={() => act(() => api.gate(d.draw.id, { action: "flag", note }))}>
                      flag
                    </Btn>
                    {d.draw.status === "awaiting_gate" && (
                      <LinkBtn variant="quiet" href={`#new/${d.draw.id}`} title="Open the draw form with this draw's options, to start another like it. This one stays open.">
                        redraw
                      </LinkBtn>
                    )}
                    <Btn variant="quiet" title={d.draw.archived_at ? "Put this story back in the list." : "Hide this story from the list. Nothing else about it changes."} onClick={() => act(() => api.gate(d.draw.id, { action: d.draw.archived_at ? "unarchive" : "archive" }))}>
                      {d.draw.archived_at ? "unarchive" : "archive"}
                    </Btn>
                    <Btn variant="quiet" title={d.draw.actions.delete ?? "Remove this draw and every step under it. There is no undo."} disabled={!!d.draw.actions.delete} pressed={asking} onClick={() => setAsking((v) => !v)}>
                      delete
                    </Btn>
                  </span>
                )}
              </div>
              {asking && !step && (
                <div className="confirm mt-2">
                  <span>Delete {d.draw.name ?? d.draw.id} and every step under it? There is no undo.</span>
                  <Btn variant="pass" onClick={remove}>
                    delete
                  </Btn>
                  <Btn variant="quiet" onClick={() => setAsking(false)}>
                    keep
                  </Btn>
                </div>
              )}
              {err && <div className="err mt-2">{err}</div>}
              <DrawNotes draw={d.draw} />
              <div className="path" role="tablist" aria-label="The story's stops">
                {STOPS.map((s) => {
                  const can = reached(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      role="tab"
                      aria-selected={s === stop && !step}
                      disabled={!can}
                      className={(s === stands ? (d.draw.at_gate || d.draw.status === "done" ? "now" : working ? "run" : "at") : can ? "past" : "") + (s === stop ? " on" : "")}
                      onClick={() => goStop(s)}
                    >
                      <span className="name">{s}</span>
                      <span className="note num">{stopNote(s, d, rootD)}</span>
                    </button>
                  );
                })}
              </div>
              {step ? (
                <StepView step={step} chosen={step.id === d.draw.chosen_step} onBack={() => setStepId(null)} />
              ) : (
                body(d)
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

/** The line under a stop on the strip: what the stop holds, in a few words. */
function stopNote(s: Stop, d: Detail, root: Detail | null): string {
  const p = root && root.draw.id === d.origin?.id ? root : d;
  if (s === "premises") {
    const chosen = p.candidates.find((c) => c.step_id === p.draw.chosen_step);
    return chosen ? `#${chosen.index} of ${p.candidates.length}` : p.candidates.length ? `${p.candidates.length} to choose from` : p === d && d.origin && d.origin.id !== d.draw.id ? "chosen" : "being written";
  }
  if (s === "brief") {
    if (BRIEF.has(d.draw.status) || PLANNED.has(d.draw.status)) return "outline · ending";
    if (!d.draw.chosen_step && !d.draw.repaired_from) return "—";
    // a failed draw stops with what landed: the whole brief, or part of it
    if (d.draw.status === "failed") return d.parts.ending ? "outline · ending" : "stopped";
    return "being written";
  }
  if (s === "plan") return d.draw.status === "awaiting_plan_gate" ? "the plan gate" : PLANNED.has(d.draw.status) ? "beats · symbols" : "—";
  if (s === "scenes") return d.draw.status === "awaiting_draft_gate" ? "gate 2" : d.draw.status === "drafted" ? "kept" : d.draw.status === "drafting" ? "being written" : "—";
  return d.report ? "report.pdf" : "—";
}
