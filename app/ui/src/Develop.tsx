import React, { useEffect, useMemo, useState } from "react";
import { api, type Instruction, type DraftConfigView, type Findings, type Listen, type Story } from "./api.ts";
import { BriefFiles, Md, SeedNote, boldLabels, firstParagraph, label, stageName, stageNames, type Detail } from "./Draws.tsx";
import { Bar, Btn, Caret as Chevron, Chip, Facts, Field, Head, Icon, Keys, Mark, ModelPicks, Seg, onEnter, rowKeys, useRowsFromPage } from "./ui.tsx";

/** A quoted span is shown between the row's own quotation marks; a span the model already quoted would show two. */
const unquote = (s: string) => s.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "");

/**
 * A brief that stands. `brief` names the draw whose files hold it: a branch carries its source's brief. The flag
 * control is the pane header's; here the brief says only why it cannot be drafted, or shows its draft settings.
 */
export function BriefReady({ d, brief = d.draw.id, controls = true, onDraft, aside }: { d: Detail; brief?: string; controls?: boolean; onDraft: (b: DraftBody) => void; aside: React.ReactNode }) {
  return (
    <>
      {controls && d.draw.actions.draft && (
        <div className="controls">
          <span className="text-mute">{d.draw.actions.draft}</span>
        </div>
      )}
      {/* a brief ready to draft shows its settings at once */}
      {controls && !d.draw.actions.draft && <DraftSettings d={d} onDraft={onDraft} />}
      <div className="drawbody">
        <div className="max-w-[66rem]">
          <Head>seed</Head>
          <SeedNote text={d.draw.seed_text} />
          <Head
            className="mt-6"
            note={
              <a href={api.briefFile(brief, "trail.md")} target="_blank" rel="noopener" className="num">
                briefs/{brief}/trail.md
              </a>
            }
          >
            brief
          </Head>
          <BriefFiles id={brief} />
        </div>
        <div className="aside min-w-0">{aside}</div>
      </div>
    </>
  );
}

const BUILD = ["outline", "context", "ending"];

/**
 * A brief under construction. The premise and the vignette exist from the
 * gate; the outline, the two context vignettes and the ending land one at a
 * time, and a repair round writes them again under `repair-` names. Each part
 * is read from its artifact, because the files under briefs/ are written last
 * and all at once.
 */
export function Building({ d, aside }: { d: Detail; aside: React.ReactNode }) {
  const running = d.steps.filter((s) => s.status === "running");
  // a failed draw stops here with what landed; nothing is in flight and nothing refreshes
  const failed = d.draw.status === "failed";
  // a repair round's stages tick the same build steps: repair-outline is the outline written again
  const done = new Set(d.steps.filter((s) => s.status === "done").map((s) => s.stage.replace(/^repair-/, "")));
  const { vignette, outline, contexts, ending } = d.parts;
  const [openPart, setOpenPart] = useState<string | null>("outline.md");
  const part = (name: string, body: string | undefined) => (
    <React.Fragment key={name}>
      <tr className={body ? "pick" : "faded"} tabIndex={body ? 0 : undefined} onClick={() => body && setOpenPart(openPart === name ? null : name)} onKeyDown={onEnter(() => body && setOpenPart(openPart === name ? null : name))}>
        <td className="w-4">{body ? <Chevron open={openPart === name} /> : <Mark state={running.length ? "run" : "todo"} />}</td>
        <td className="num whitespace-nowrap text-dim">{name}</td>
        <td className="text-mute">{body ? <span className="line-clamp-1">{firstParagraph(body).slice(0, 90)}</span> : failed ? <span className="text-dim">not written</span> : <span className={running.length ? "sweep inline-block text-running" : ""}>waiting</span>}</td>
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
              {!failed && " · the page refreshes itself"}
            </>
          }
        >
          {running.length ? `${running.length} call${running.length > 1 ? "s" : ""} in flight: ${stageNames(running)}` : failed ? "the draw failed; nothing runs" : "waiting for the next step"}
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

type DraftBody = { plan?: boolean; profile?: string; overrides?: Record<string, string | number>; models?: Record<string, string> };

/** The drafting settings. `again`: at the plan gate, where the settings plan the draft again from its first beat. With no `onClose` there is no back link. */
export function DraftSettings({ d, onClose, onDraft, again }: { d: Detail; onClose?: () => void; onDraft: (b: DraftBody) => void; again?: boolean }) {
  const [cfg, setCfg] = useState<DraftConfigView | null>(null);
  const [profile, setProfile] = useState<string>("");
  const [models, setModels] = useState<Record<string, string>>({});
  const [v, setV] = useState<Record<string, string>>({});
  // a person's draft stops at the plan by default (docs/specs/2026-09-28-story-ir.md §15, T2)
  const [plan, setPlan] = useState(true);
  useEffect(() => {
    api.draftConfig().then(setCfg);
  }, []);
  if (!cfg) return <span className="text-dim">loading the draft defaults…</span>;
  // the profile fills the fields; a field you change after that is the override sent with it
  const def = cfg.byProfile[profile] ?? cfg.defaults;
  const pick = (p: string) => {
    setProfile(p === "default" ? "" : p);
    setV({});
  };
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
  const num = (k: string, label: string, w = "4rem") => <input type="text" className="num" style={{ width: w }} aria-label={label} value={val(k)} onChange={(e) => set(k)(e.target.value)} />;
  return (
    <div className="form mt-4">
      {onClose && (
        <button className="link" onClick={onClose}>
          <Icon name="arrow_back" /> back
        </button>
      )}
      <h1 className="mt-3">Draft</h1>
      <Field label="Profile" help="A profile fills the fields below. Change one after that and it goes as an override.">
        <Seg label="Profile" value={profile || "default"} options={["default", ...cfg.profiles]} onChange={pick} />
      </Field>
      <ModelPicks cfg={cfg} value={models} onChange={setModels} />
      <Field label="Length" htmlFor="words">
        <div className="ctls">
          <input id="words" type="text" className="num" style={{ width: "5rem" }} value={val("length.words")} onChange={(e) => set("length.words")(e.target.value)} />
          <span className="text-dim">
            words · <span className="num">±{Math.round(def.length.tolerance * 100)}%</span>
          </span>
        </div>
      </Field>
      <Field label="Beats" help="The schedule chooses the count within the range and assigns each beat its cap.">
        <div className="ctls">
          <Seg label="Beat count" value={val("beats.count") === "auto" ? "auto" : "fixed"} options={["auto", "fixed"]} onChange={(m) => set("beats.count")(m === "auto" ? "auto" : val("beats.min"))} />
          {val("beats.count") === "auto" ? (
            <>
              <span className="text-dim">between</span>
              {num("beats.min", "Minimum beats", "3.25rem")}
              <span className="text-dim tie">and</span>
              {num("beats.max", "Maximum beats", "3.25rem")}
            </>
          ) : (
            <>
              <span className="text-dim">exactly</span>
              {num("beats.count", "Beat count", "3.25rem")}
            </>
          )}
          <span className="text-dim">· each</span>
          {num("beats.words_min", "Minimum words per beat", "4.25rem")}
          <span className="text-dim tie">–</span>
          {num("beats.words_max", "Maximum words per beat", "4.25rem")}
          <span className="text-dim">words</span>
        </div>
      </Field>
      <Field label="Form" help="auto: the schedule derives the axis from the brief and states it. A fixed axis is checked on the schedule and fails shape when contradicted.">
        <div className="axes">
          {Object.entries(AXES).map(([axis, opts]) => (
            <React.Fragment key={axis}>
              <span className="axis">{axis}</span>
              <span className="ctls">
                <Seg label={axis} value={val(`form.${axis}`)} options={["auto", ...opts]} onChange={set(`form.${axis}`)} />
                {overrides[`form.${axis}`] !== undefined && <span className="text-art">overridden</span>}
              </span>
            </React.Fragment>
          ))}
          <span className="axis">ending</span>
          <span className="ctls">
            <Seg label="ending" value={val("form.ending")} options={["brief", "open"]} onChange={set("form.ending")} />
            {overrides["form.ending"] !== undefined && <span className="text-art">overridden</span>}
          </span>
        </div>
      </Field>
      <Field label="Scenes" help="Sequential carries the text so far into each scene call. Parallel writes all beats at once from the schedule alone. Acts writes three runs of consecutive beats at once, each run sequential.">
        <Seg label="Scene order" value={val("scenes.order")} options={["sequential", "parallel", "acts"]} onChange={set("scenes.order")} />
      </Field>
      {!again && (
        <Field label="Plan" help="Stop at the plan: plan the draft and check the plan, then wait before any scene. You fix the plan, plan it again from a beat, or write the draft from it.">
          <Seg label="Plan" value={plan ? "stop at the plan" : "write through"} options={["write through", "stop at the plan"]} onChange={(x) => setPlan(x === "stop at the plan")} />
        </Field>
      )}
      <div className="actions">
        <Btn variant="primary" pad onClick={() => onDraft({ plan: plan || undefined, profile: profile || undefined, overrides: Object.keys(overrides).length ? overrides : undefined, models: Object.keys(models).length ? models : undefined })}>
          {again ? "plan again under these settings" : "draft"}
        </Btn>
      </div>
    </div>
  );
}

// --- gate 2 ------------------------------------------------------------------

/** Gate 2. The view is the strip's: plan or scenes. A move to the other view keeps the ticks. */
export function StoryPane({ d, onAct, aside, view, onView: setView }: { d: Detail; onAct: (fn: () => Promise<any>, go?: (r: any) => string | undefined) => void; aside: React.ReactNode; view: "story" | "plan"; onView: (v: "story" | "plan") => void }) {
  const [s, setS] = useState<Story | null>(null);
  const [note, setNote] = useState("");
  const [k, setK] = useState(1);
  const [instruction, setInstruction] = useState("");
  // the flags ticked for a rewrite, each with the operator's note on it
  const [ticks, setTicks] = useState<Ticks>({});
  // beats picked by hand: a beat with no ticked flag is written again under all of its own
  const [picked, setPicked] = useState<number[]>([]);
  const [sym, setSym] = useState<string | null>(null);
  const [how, setHow] = useState<"rewrite" | "replan" | "plan">("rewrite");
  // under "fix the plan": a beat's lines rewritten in the plan view
  const [edits, setEdits] = useState<Edits>({});
  const [err, setErr] = useState("");
  const id = d.draw.id;
  const marks = useMarks(id, s);
  useEffect(() => {
    api
      .story(id)
      .then(setS)
      .catch((e) => setErr(`the story did not load: ${e.message}`));
  }, [id, d.steps.length]);
  // the keys act on the focused scene row: Enter opens its beat in the story
  const goBeat = (beat: number) => {
    setView("story");
    setK(beat);
    document.getElementById(`beat-${beat}`)?.scrollIntoView({ block: "start" });
  };
  const scenesEl = React.useRef<HTMLTableElement>(null);
  useRowsFromPage(scenesEl);
  const keys = rowKeys({
    Enter: (b) => goBeat(Number(b)),
    n: () => document.querySelector<HTMLInputElement>(".controls input[type=text]")?.focus(),
    i: () => document.getElementById("instruction")?.focus(),
  });
  if (!s) return err ? <div className="err mt-3">{err}</div> : <span className="text-dim">loading the story…</span>;
  const gating = d.draw.actions.keep === null;
  const gate = (action: string, extra: Record<string, unknown> = {}) => onAct(() => api.gate(id, { action, note, ...extra }));
  const M = s.scenes.length;
  const flags = [...s.screenFindings, ...s.planFindings];
  const beatOf = (id: string) => flags.find((f) => f.id === id)?.beat;
  const tickedOn = (b: number) => Object.keys(ticks).filter((id) => beatOf(id) === b).length;
  const beats = [...new Set([...Object.keys(ticks).map(beatOf).filter((b): b is number => b !== undefined), ...picked])].sort((x, y) => x - y);
  // a beat's chip picks it; on a beat with ticked flags it clears them
  const toggleBeat = (b: number) => {
    if (tickedOn(b)) setTicks(Object.fromEntries(Object.entries(ticks).filter(([id]) => beatOf(id) !== b)));
    setPicked(picked.includes(b) || tickedOn(b) ? picked.filter((x) => x !== b) : [...picked, b]);
  };
  const nTicked = Object.keys(ticks).length;
  const nNotes = Object.values(ticks).filter((v) => v.trim()).length;
  const nEdits = Object.keys(edits).length;
  // "fix the plan" takes plan findings only, each with a fix: its note, or its own patch
  const notPlan = Object.keys(ticks).filter((fid) => !s.planFindings.some((f) => f.id === fid)).length;
  const noFix = Object.entries(ticks).filter(([fid, v]) => {
    const f = s.planFindings.find((x) => x.id === fid);
    return f && !v.trim() && (!f.patch?.trim() || /^none\.?$/i.test(f.patch.trim()));
  }).length;
  const fixPlan = () => {
    const notes = Object.fromEntries(Object.entries(ticks).filter(([, v]) => v.trim()));
    const list = Object.entries(edits).map(([k, text]) => ({ beat: Number(k.split(".")[0]), field: k.split(".")[1], text }));
    gate("apply", { findings: Object.keys(ticks), notes, edits: list });
    setTicks({});
    setEdits({});
    setPicked([]);
  };
  const instruct = () => {
    const notes = Object.fromEntries(Object.entries(ticks).filter(([, v]) => v.trim()));
    // a re-plan is a branch from the first beat: this draft stays as it is
    gate(how === "rewrite" ? "rewrite" : "branch", how === "rewrite" ? { beats, findings: Object.keys(ticks), notes, instruction } : { at_beat: beats[0], instruction });
    setInstruction("");
    setTicks({});
    setPicked([]);
  };
  const flagsFor = (beat: number) => ({ ledger: s.screenFindings.filter((f) => f.beat === beat), plan: s.planFindings.filter((f) => f.beat === beat), structure: s.profiles.find((p) => p.beat === beat) });
  const onSym = (id: string) => {
    setView("plan");
    setSym(id);
  };
  const wordsOf = (t: string) => t.split(/\s+/).filter(Boolean).length;
  const words = s.scenes.reduce((a, x) => a + wordsOf(x.text), 0);
  const cfg = d.draw.draft_config ? JSON.parse(d.draw.draft_config) : null;
  const nStructure = s.profiles.reduce((a, p) => a + p.flags.length, 0);
  // what the draft was asked for and what it became; in the aside beside the draw's own facts, so the story starts at the top
  const draftFacts = (
    <div className="facts-block mb-6">
      <Head as="div">draft</Head>
      <Facts
        className="mt-1"
        rows={
          cfg
            ? ([
                ["length", `${cfg.config.length.words.toLocaleString()} words asked · ${words.toLocaleString()} written`],
                ["beats", `${M}${cfg.config.beats.count === "auto" ? ` · auto ${cfg.config.beats.min}–${cfg.config.beats.max}` : ""}`],
                ...Object.entries(s.schedule?.form ?? {}).map(([a, x]) => [a, x] as [React.ReactNode, React.ReactNode]),
                ["ending", cfg.config.form.ending],
                ["scenes", cfg.config.scenes.order],
                ...(cfg.profile ? [["profile", cfg.profile] as [React.ReactNode, React.ReactNode]] : []),
              ] as [React.ReactNode, React.ReactNode][])
            : ([["written", `${words.toLocaleString()} words`]] as [React.ReactNode, React.ReactNode][])
        }
      />
    </div>
  );
  // the report is printed after the draft settles, so the link appears on a later poll
  const report = d.report && (
    <a href={api.reportPdf(id)} target="_blank" rel="noopener" className="num" title={`The story and everything that made it, from output/${id}/report.pdf.`}>
      report.pdf
    </a>
  );
  return (
    <>
      {gating && (
        <div className="controls" role="group" aria-label="Draft review">
          <Btn variant="primary" onClick={() => gate("keep")} title={`Keep the story. It is exported to drafts/${id}/ with its schedule, findings, configuration and trail.`}>
            keep and export
          </Btn>
          <input type="text" placeholder="note for the log" aria-label="Gate note" value={note} onChange={(e) => setNote(e.target.value)} />
          <span className="end">
            {report}
          </span>
        </div>
      )}
      {gating && (
        <div className="mt-3 max-w-[48rem]" role="group" aria-label="Rewrite">
          <Head
            note={
              how === "rewrite"
                ? "tick flags in the story or the plan: each goes to its beat with your note under it. A beat picked with nothing ticked carries all of its own flags. The instruction goes to every beat"
                : how === "plan"
                  ? "tick plan findings to put their fix in the plan, or click a beat's line in the plan to rewrite it; the plan is checked again, and only the beats whose plan changed are written again"
                  : "a branch plans the story again from the first beat, under the instruction, and writes every beat from there; this draft stays as it is"
            }
          >
            rewrite
          </Head>
          <div className="mt-1 text-mute">
            {how === "plan" ? (
              <>
                {nTicked ? `${nTicked} finding${nTicked > 1 ? "s" : ""} ticked` : "nothing ticked"}
                {nEdits ? ` · ${nEdits} line${nEdits > 1 ? "s" : ""} edited` : ""}
                {notPlan ? <span className="text-art"> · {notPlan} ticked flag{notPlan > 1 ? "s are" : " is"} not on the plan: clear {notPlan > 1 ? "them" : "it"} or rewrite instead</span> : ""}
                {noFix ? <span className="text-art"> · {noFix} without a fix: write one in its note</span> : ""}
              </>
            ) : (
              <>
                {nTicked ? `${nTicked} flag${nTicked > 1 ? "s" : ""} ticked on beat${beats.length > 1 ? "s" : ""} ${beats.join(", ")}` : beats.length ? `beat${beats.length > 1 ? "s" : ""} ${beats.join(", ")}, under all of their own flags` : "nothing ticked"}
                {nNotes ? ` · ${nNotes} with a note` : ""}
              </>
            )}
          </div>
          {how !== "plan" && (
          <textarea
            id="instruction"
            className="mt-2 font-serif text-prose"
            rows={2}
            placeholder="optional: what should change, in your own words"
            aria-label="Instruction for the rewrite"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && beats.length && (how === "rewrite" || instruction.trim())) instruct();
            }}
          />
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {how !== "plan" && <span className="head">beats</span>}
            <span className="chips" role="group" aria-label="Beats to rewrite" hidden={how === "plan"}>
              {s.scenes.map((x) => (
                <Chip key={x.beat} className="num" pressed={beats.includes(x.beat)} onClick={() => toggleBeat(x.beat)} title={tickedOn(x.beat) ? `${tickedOn(x.beat)} flag(s) ticked; click to clear them` : undefined}>
                  {x.beat}
                  {tickedOn(x.beat) ? <b className="ml-1 font-medium text-art">✓{tickedOn(x.beat)}</b> : null}
                </Chip>
              ))}
            </span>
            <Seg
              label="How"
              value={how === "rewrite" ? "rewrite these" : how === "plan" ? "fix the plan" : `re-plan from ${beats[0] ?? 1}`}
              options={["rewrite these", "fix the plan", `re-plan from ${beats[0] ?? 1}`]}
              onChange={(v) => {
                const next = v === "rewrite these" ? "rewrite" : v === "fix the plan" ? "plan" : "replan";
                setHow(next);
                if (next === "plan") setView("plan");
                else setEdits({});
              }}
            />
            <span className="end ml-auto">
              {how === "plan" ? (
                <Btn variant="art" disabled={!(nTicked + nEdits) || notPlan > 0 || noFix > 0} onClick={fixPlan} title="Put each ticked finding's fix and each edited line in the plan, check the plan again, and write again only the beats whose plan changed.">
                  fix the plan{nTicked ? ` · ${nTicked} fix${nTicked > 1 ? "es" : ""}` : ""}
                  {nEdits ? ` · ${nEdits} edit${nEdits > 1 ? "s" : ""}` : ""}
                </Btn>
              ) : (
              <Btn
                variant="art"
                disabled={!beats.length || (how === "replan" && !instruction.trim())}
                onClick={instruct}
                title={
                  how === "rewrite"
                    ? "Write these beats again, in beat order, then screen each and the beat after it again."
                    : `A new draft, branched from this one: beats before ${beats[0] ?? 1} are carried word for word, the schedule is planned again from beat ${beats[0] ?? 1} under the instruction, and every beat from there is written under it. Ticked flags are not carried. This draft stays as it is.`
                }
              >
                {how === "rewrite" ? `rewrite${beats.length === 1 ? ` beat ${beats[0]}` : beats.length ? ` ${beats.length} beats` : ""}${nTicked ? ` · ${nTicked} flag${nTicked > 1 ? "s" : ""}` : ""}` : `branch and re-plan from ${beats[0] ?? 1}`}
              </Btn>
              )}
            </span>
          </div>
        </div>
      )}
      {s.directions.length > 0 && (
        <div className="mt-4 max-w-[48rem]">
          <Head note="the instructions this draft was rewritten under; a later rewrite of one of their beats carries them">directions</Head>
          <table className="mt-1">
            <tbody>
              {s.directions.map((x) => (
                <tr key={x.text}>
                  <td className="num w-28 text-dim">beat{x.beats.length > 1 ? "s" : ""} {x.beats.join(", ")}</td>
                  <td>{x.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
            {report}
          </span>
        </div>
      )}
      <div className="drawbody wide">
        <div className="min-w-0">
          {view === "plan" && s.schedule ? (
            <PlanView s={s} ticks={ticks} setTicks={setTicks} gating={gating} sym={sym} onSym={onSym} edits={edits} setEdits={gating && how === "plan" ? setEdits : undefined} {...marks} />
          ) : (
            s.scenes.map((sc) => {
              const fl = flagsFor(sc.beat),
                beat = s.schedule?.beats[sc.beat - 1];
              const n = wordsOf(sc.text);
              const over = beat ? n > beat.words * 1.1 : false;
              const nOpen = [...fl.ledger, ...fl.plan].filter((f) => f.decision === "open").length + (fl.structure?.flags.length ?? 0);
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
                        {beat && beat.absorbs !== "none" && <> · absorbs {beat.absorbs}</>} · <span className="text-mute">{nOpen ? `${nOpen} open flag${nOpen > 1 ? "s" : ""}` : "no open flags"}</span>
                        {fl.plan.length > 0 && <span className="text-running"> · {fl.plan.length} plan finding{fl.plan.length > 1 ? "s" : ""}</span>}
                      </>
                    }
                  >
                    beat {sc.beat}
                  </Head>
                  <Md className="mt-2" text={sc.text} />
                  <FlagTable fs={[...fl.ledger, ...fl.plan]} structure={fl.structure} ticks={ticks} setTicks={setTicks} gating={gating} rewritten={s.rewrittenUnder} syms={s.symbols} onSym={onSym} {...marks} />
                </div>
              );
            })
          )}
        </div>
        <div className="aside min-w-0">
          {draftFacts}
          {view === "plan" ? (
            <>
              <SymbolTable s={s} sym={sym} setSym={setSym} />
              <div className="mt-6">{aside}</div>
            </>
          ) : (
          <>
          <div className="mb-6">{aside}</div>
          <Head
            note={
              <>
                {words.toLocaleString()} words · {s.screenFindings.length} ledger flags · {nStructure} structure flags · <Keys keys={[["↓", "move"], ["⏎", "open"], ...(gating ? ([["n", "note"], ["i", "instruction"]] as [string, string][]) : [])]} />
              </>
            }
          >
            scenes
          </Head>
          <table className="mt-1" ref={scenesEl} onKeyDown={keys}>
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
                  <tr key={sc.beat} className={"pick" + (k === sc.beat ? " sel" : "")} data-row={String(sc.beat)} tabIndex={0} aria-current={k === sc.beat ? "true" : undefined} onClick={() => goBeat(sc.beat)}>
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
                      {fl.plan.map((f) => (
                        <React.Fragment key={f.id}>
                          <Mark state="run" small />{" "}
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
            <Mark state="fail" small /> ledger flag &nbsp; <Mark state="run" small /> plan finding &nbsp; <Mark state="art" small /> structure flag
          </div>
          </>
          )}
          {s.profiles.length > 0 && (
            <>
              <Head className="mt-6" note="present across the draft · a tell, not a score">
                structure
              </Head>
              <Facts
                className="mt-1"
                rows={[...new Set(s.profiles.flatMap((p) => Object.keys(p.answers)))].map((q) => {
                  // every question the screen asked, the paying beat's four included, so a flag the gate can act on is never invisible here
                  const hits = s.profiles.filter((p) => p.flags.includes(q));
                  return [
                    [
                      q.replace(/-/g, " "),
                      <span className="text-mute">
                        <Mark state={hits.length ? "art" : "held"} /> {hits.length ? `${hits.length} of ${M} · beats ${hits.map((h) => h.beat).join(", ")}` : "none"}
                      </span>,
                    ] as [React.ReactNode, React.ReactNode],
                  ][0];
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
                    "said again in dialogue",
                    s.slop.repeated_speech?.length ? (
                      <span className="chips">
                        {s.slop.repeated_speech.slice(0, 8).map((t) => (
                          <span key={t.phrase} className="chip num">
                            {t.phrase} <b className="font-semibold text-ink">{t.count}</b>
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
          {s.listen && (
            <>
              <Head className="mt-6" note={`deterministic · against the narrated pool · about ${s.listen.minutes} min at ${s.listen.pool_wpm} wpm`}>
                listen
              </Head>
              <Facts
                className="mt-1"
                rows={(
                  [
                    ["words per sentence", "sentence_mean"],
                    ["sentences over 30 words", "long_sentence_share"],
                    ["numerals per 1k", "numerals_per_1k"],
                    ["quote marks per 1k", "quotes_per_1k"],
                    ["the body named per 1k", "body_per_1k"],
                    ["the listener addressed per 1k", "you_per_1k"],
                    ["first person per 1k", "first_person_per_1k"],
                  ] as [string, keyof Listen["story"]][]
                ).map(([label, k]) => [
                  label,
                  <span className="num">
                    {s.listen!.story[k]} <span className="text-dim">· pool {s.listen!.pool[k]}</span>
                  </span>,
                ] as [React.ReactNode, React.ReactNode])}
              />
            </>
          )}
          {s.judge && <div className="judge">{s.judge}</div>}
        </div>
      </div>
    </>
  );
}

type Ticks = Record<string, string>;
type Flag = Story["screenFindings"][number];
type Sym = Story["symbols"][number];

/** Text with each symbol id it names made a link to the symbol table. */
function linkSyms(text: string, syms: Sym[], onSym: (id: string) => void): React.ReactNode {
  if (!syms.length) return text;
  const ids = syms.map((x) => x.id).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(?<=^|[\\s(,;])(${ids.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=[\\s:,;)]|$)`, "g");
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push(text.slice(last, m.index));
    out.push(
      <button key={m.index} type="button" className="link mono text-gold" onClick={() => onSym(m[1]!)} title="Show it in the symbol table">
        {m[1]}
      </button>,
    );
    last = m.index! + m[1]!.length;
  }
  out.push(text.slice(last));
  return out;
}

/** A person's reading of each plan finding: real, or not (plan step 5). */
type Readings = Record<string, "real" | "not real">;

/** The readings as stored, with the ones made on this page over them: a mark writes no step, so the story is not fetched again. */
function useMarks(id: string, s: Story | null) {
  const [mine, setMine] = useState<Readings>({});
  const readings = { ...(s?.readings ?? {}), ...mine };
  const onMark = (fid: string, real: boolean) => {
    setMine({ ...mine, [fid]: real ? "real" : "not real" });
    api.gate(id, { action: "mark", finding: fid, real }).catch(() => setMine(({ [fid]: _, ...rest }) => rest));
  };
  return { readings, onMark };
}

/** One flag or plan finding at gate 2: a box to tick while it is open, and a note under it once ticked. */
function FlagRow({ f, ticks, setTicks, gating, rewritten, syms, onSym, fixing, readings, onMark }: { f: Flag; ticks: Ticks; setTicks: (t: Ticks) => void; gating: boolean; rewritten: string[]; syms: Sym[]; onSym: (id: string) => void; fixing?: boolean; readings?: Readings; onMark?: (id: string, real: boolean) => void }) {
  const open = f.decision === "open";
  const on = f.id in ticks;
  const plan = f.source === "plan";
  const kind = plan ? "plan" : (f.screen ?? "ledger");
  const tick = (v: boolean) => {
    const next = { ...ticks };
    if (v) next[f.id] = "";
    else delete next[f.id];
    setTicks(next);
  };
  const n = Math.max(...f.samples, f.n);
  return (
    <>
      <tr className={(open ? "" : "old") + (on ? " ticked" : "")}>
        <td className="w-8">{gating && open && <input type="checkbox" checked={on} onChange={(e) => tick(e.target.checked)} aria-label={fixing ? `Tick this ${kind} finding to put its fix in the plan` : `Tick this ${kind} flag for the rewrite`} />}</td>
        <td className={"w-24 " + (plan ? "text-running" : kind === "ledger" ? "text-art" : "text-mute")}>
          {kind}
          {!plan && n > 1 && (
            <div className="text-dim">
              {f.n} of {n} samples
            </div>
          )}
          {f.decision === "accepted" && !rewritten.includes(f.id) && <div className="num text-keep">patched</div>}
          {f.decision === "dismissed" && <div className="num text-dim">dismissed</div>}
          {rewritten.includes(f.id) && <div className="num text-dim">rewritten under it</div>}
          {plan && onMark && (
            <div className="mt-1 flex gap-1" role="group" aria-label="Your reading of this plan finding">
              {(["real", "not real"] as const).map((r) => (
                <Chip key={r} pressed={readings?.[f.id] === r} onClick={() => onMark(f.id, r === "real")} title={r === "real" ? "This names a real problem in the plan." : "This names no real problem in the plan."}>
                  {r}
                </Chip>
              ))}
            </div>
          )}
        </td>
        <td>
          <div className="quote">{unquote(f.span)}</div>
          <div className="kv">
            {plan && (
              <>
                <b>plan says</b>
                <span>{f.statement}</span>
                <b>table</b>
                <span>{linkSyms(f.evidence, syms, onSym)}</span>
              </>
            )}
            {f.replacement && (
              <>
                <b>must hold</b>
                <span>{f.replacement}</span>
              </>
            )}
            {(!plan || fixing) && f.patch && !/^none\.?$/i.test(f.patch.trim()) && (
              <>
                <b>{plan ? "fix" : "patch"}</b>
                <span>{f.patch}</span>
              </>
            )}
          </div>
        </td>
      </tr>
      {on && (
        <tr className="ticked">
          <td></td>
          <td className="text-dim">note</td>
          <td>
            <input type="text" className="w-full" autoFocus value={ticks[f.id]} placeholder={fixing ? (f.patch && !/^none\.?$/i.test(f.patch.trim()) ? "optional: the words to put in the plan instead of the fix above" : "required: the words to put in the plan for the span quoted") : "optional: how to fix it, in your own words"} aria-label="Note on this flag" onChange={(e) => setTicks({ ...ticks, [f.id]: e.target.value })} />
          </td>
        </tr>
      )}
    </>
  );
}

/** A beat's flags: the open ones first, the lines a beat says again folded under one row, then its structure flags. */
function FlagTable({ fs, structure, ...row }: { fs: Flag[]; structure?: Story["profiles"][number] } & Omit<React.ComponentProps<typeof FlagRow>, "f">) {
  const [unfold, setUnfold] = useState(false);
  const main = fs.filter((f) => f.screen !== "restated").sort((a, b) => (a.decision === "open" ? 0 : 1) - (b.decision === "open" ? 0 : 1));
  const restated = fs.filter((f) => f.screen === "restated");
  const shown = unfold || restated.some((f) => f.id in row.ticks);
  if (!fs.length && !structure?.flags.length) return null;
  return (
    <table className="flags mt-3">
      <tbody>
        {main.map((f) => (
          <FlagRow key={f.id} f={f} {...row} />
        ))}
        {restated.length > 0 && (
          <tr className="pick" onClick={() => setUnfold(!shown)}>
            <td className="w-8 text-dim">{shown ? "▾" : "▸"}</td>
            <td colSpan={2} className="text-dim">
              {restated.length} restated line{restated.length > 1 ? "s" : ""}: a sentence this beat says again
            </td>
          </tr>
        )}
        {shown && restated.map((f) => <FlagRow key={f.id} f={f} {...row} />)}
        {structure?.flags.map((q) => (
          <tr key={q}>
            <td className="w-8"></td>
            <td className="w-24 text-art">
              structure
              <div className="text-dim">
                {q} · {structure.answers[q].answer}
              </div>
            </td>
            <td>
              <div className="quote">{unquote(structure.answers[q].quote)}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The plan the scenes were written from: the plan check's findings, the withholding, and each beat as planned with its findings. */
function PlanView({ s, ticks, setTicks, gating, sym, onSym, edits, setEdits, readings, onMark }: { s: Story; ticks: Ticks; setTicks: (t: Ticks) => void; gating: boolean; sym: string | null; onSym: (id: string) => void; edits?: Edits; setEdits?: (e: Edits) => void; readings?: Readings; onMark?: (id: string, real: boolean) => void }) {
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
  const count = (screen: string) => s.planFindings.filter((f) => f.screen === screen).length;
  const wide = s.planFindings.filter((f) => f.beat === undefined);
  // a symbol picked in the table: the beats that name it, by its id's words and the capitalised names in its text
  const picked = s.symbols.find((x) => x.id === sym);
  const words = picked ? [...picked.id.split("."), ...(picked.text.match(/\b\p{Lu}\p{Ll}{3,}/gu) ?? []).slice(0, 2)].map((w) => w.toLowerCase()).filter((w) => w.length > 3) : [];
  const names = (b: (typeof sched.beats)[number]) => {
    const text = [b.job, b.known, b.stakes, b.set_piece, ...s.planFindings.filter((f) => f.beat === b.n).map((f) => f.evidence)].join(" ").toLowerCase();
    return words.some((w) => text.includes(w));
  };
  const row = { ticks, setTicks, gating, rewritten: s.rewrittenUnder, syms: s.symbols, onSym, fixing: !!setEdits, readings, onMark };
  // at the plan gate a beat's fields can be rewritten in place; elsewhere they are read-only
  const field = (b: (typeof sched.beats)[number], f: EditField, value: string, className?: string) =>
    setEdits ? (
      <EditText value={value} edit={edits?.[`${b.n}.${f}`]} className={className} label={`beat ${b.n} ${f}`} onEdit={(t) => setEdits(Object.fromEntries(Object.entries({ ...edits, [`${b.n}.${f}`]: t }).filter(([, v]) => v !== undefined)) as Edits)} />
    ) : (
      <span className={className}>{value}</span>
    );
  return (
    <>
      <Head note={setEdits ? "the schedule read against the ledger; tick a finding to put its fix in the plan, or click a beat's text to rewrite it" : "the schedule read against the ledger before a scene was written; read-only unless a finding is ticked for a rewrite"}>plan check</Head>
      <div className="mt-1 flex flex-wrap gap-x-4 text-mute">
        {s.planFindings.length || s.symbols.length ? (
          <>
            <span>
              <b className="font-medium text-ink">{count("plan-ledger")}</b> against the ledger
            </span>
            {count("plan-claims") > 0 && (
              <span>
                <b className="font-medium text-ink">{count("plan-claims")}</b> against the setting
              </span>
            )}
            <span>
              <b className="font-medium text-ink">{count("plan-static")}</b> linter
            </span>
            <span>
              <b className="font-medium text-ink">{count("plan-calendar")}</b> calendar
            </span>
            <span>
              <b className="font-medium text-ink">{count("plan-membership")}</b> membership
            </span>
            <span>
              <b className="font-medium text-ink">{s.symbols.length}</b> symbols
            </span>
            {s.planCapped && <span className="text-art">the reading returned its maximum; the list may be short</span>}
          </>
        ) : (
          <span>no plan check ran on this draft</span>
        )}
      </div>
      {wide.length > 0 && (
        <table className="flags mt-2">
          <tbody>
            {wide.map((f) => (
              <tr key={f.id}>
                <td className="w-24 text-running">
                  {f.screen?.replace("plan-", "")}
                  {f.question && <div className="text-dim">a question</div>}
                </td>
                <td>
                  {f.statement}
                  <div className="text-dim">{linkSyms(f.evidence, s.symbols, onSym)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-6">
      <Head note="what stays hidden until which beat · shaded is withheld, the gold cell is the beat that reveals it">withholding</Head>
      <div className="mt-2 overflow-x-auto">
        <div className="chart" style={{ gridTemplateColumns: `minmax(14rem, 3fr) repeat(${M}, minmax(0, 1fr))` }}>
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
      </div>
      <Head className="mt-6" note={picked ? `beats that name ${picked.id} · the rest are dimmed` : "job · known by its end · withheld after it · stakes · set piece · the plan check's findings"}>
        beats
      </Head>
      <table className="plan-beats mt-1">
        <tbody>
          {sched.beats.map((b) => {
            const n = wordsOf(b.n);
            const pct = Math.min(100, Math.round((n / b.words) * 100));
            const pf = s.planFindings.filter((f) => f.beat === b.n);
            return (
              <tr key={b.n} id={`plan-${b.n}`} className={picked && !names(b) ? "old" : ""}>
                <td className="num w-8 font-semibold">{b.n}</td>
                <td className="w-28">
                  <span className="num">
                    {n} <span className="text-dim">/ {b.words}</span>
                  </span>
                  <Bar pct={pct} over={n > b.words * 1.1} />
                  {b.absorbs !== "none" && <div className="text-mute">absorbs {b.absorbs}</div>}
                  {b.pays && <div className="text-art">pays</div>}
                </td>
                <td>
                  <div className="num text-mute">{field(b, "when", b.when || (setEdits ? "no time" : ""))}</div>
                  <div className="serif-cell">{field(b, "job", b.job)}</div>
                  <div className="kv">
                    <b>known</b>
                    {field(b, "known", b.known)}
                    <b>withheld</b>
                    <span>{b.withheld.length ? b.withheld.map((w) => `${w.item} → ${w.until > M ? "never" : w.until}`).join(" · ") : "nothing"}</span>
                    <b>stakes</b>
                    {field(b, "stakes", b.stakes)}
                    {((b.set_piece && b.set_piece !== "none") || setEdits) && (
                      <>
                        <b>set piece</b>
                        {field(b, "set_piece", b.set_piece && b.set_piece !== "none" ? b.set_piece : "none")}
                      </>
                    )}
                  </div>
                  {pf.length > 0 && <FlagTable fs={pf} {...row} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-2 text-dim">
        form as derived:{" "}
        {Object.entries(sched.form)
          .map(([a, x]) => `${a} ${x}`)
          .join(" · ")}
      </div>
    </>
  );
}

type EditField = "job" | "when" | "known" | "stakes" | "set_piece";
/** A beat's fields rewritten at the plan gate, keyed "beat.field". */
type Edits = Record<string, string>;

/** Text that turns into a box on a click; a change back to the original drops the edit. */
function EditText({ value, edit, onEdit, className, label }: { value: string; edit?: string; onEdit: (t: string | undefined) => void; className?: string; label: string }) {
  const [open, setOpen] = useState(false);
  if (open)
    return (
      <textarea
        className="w-full font-serif text-prose"
        rows={Math.max(2, Math.ceil((edit ?? value).length / 90))}
        defaultValue={edit ?? value}
        aria-label={`Edit ${label}`}
        autoFocus
        onBlur={(e) => {
          const t = e.target.value.trim();
          onEdit(t && t !== value.trim() ? t : undefined);
          setOpen(false);
        }}
      />
    );
  return (
    <span className={`${className ?? ""} editable${edit !== undefined ? " edited" : ""}`} role="button" tabIndex={0} title="Click to rewrite this line of the plan" onClick={() => setOpen(true)} onKeyDown={(e) => e.key === "Enter" && setOpen(true)}>
      {edit ?? value}
    </span>
  );
}

/**
 * The plan gate (docs/specs/2026-09-28-story-ir.md §6, S3): the plan and its
 * check before any scene. Ticked findings put their fix in the plan (the note,
 * or the finding's own patch), edited lines replace the beat's, and the plan
 * is checked again; a re-plan plans it again from a beat; write drafts it.
 */
export function PlanGate({ d, onAct, aside }: { d: Detail; onAct: (fn: () => Promise<any>, go?: (r: any) => string | undefined) => void; aside: React.ReactNode }) {
  const [s, setS] = useState<Story | null>(null);
  const [ticks, setTicks] = useState<Ticks>({});
  const [edits, setEdits] = useState<Edits>({});
  const [sym, setSym] = useState<string | null>(null);
  const [from, setFrom] = useState(1);
  const [instruction, setInstruction] = useState("");
  const [settings, setSettings] = useState(false);
  // the brief's text checks ran in the draft (IR spec §15.3): the reader's questions and the profiles
  const [f, setF] = useState<Findings | null>(null);
  const [ins, setIns] = useState<Instruction>({ text: "", parts: [], kind: "direction" });
  const [err, setErr] = useState("");
  const id = d.draw.id;
  const marks = useMarks(id, s);
  useEffect(() => {
    api
      .story(id)
      .then(setS)
      .catch((e) => setErr(`the plan did not load: ${e.message}`));
    // the brief's checks are an aside here: a failed fetch leaves them out
    api
      .findings(id)
      .then(setF)
      .catch(() => {});
  }, [id, d.steps.length]);
  if (!s || !s.schedule) return err ? <div className="err mt-3">{err}</div> : <span className="text-dim">loading the plan…</span>;
  const partNames = ["vignette", "ending", ...d.parts.contexts.map((c) => `context ${c.index}`)];
  const questions = f?.listed.filter((x) => x.checkers.includes("reader")) ?? [];
  // the repair makes a new draw and plans it again; this one is superseded, and the check tab links to the new one
  const instruct = () =>
    onAct(
      () => api.gate(id, { action: "instruct", instructions: [{ ...ins, text: ins.text.trim() }] }),
      () => {
        location.hash = `#story/${id}`;
        return undefined;
      },
    );
  const gating = d.draw.actions.apply === null;
  const gate = (action: string, extra: Record<string, unknown> = {}) => onAct(() => api.gate(id, { action, ...extra }));
  const nTicked = Object.keys(ticks).length;
  const nEdits = Object.keys(edits).length;
  // a ticked finding needs a fix to put in: its note, or its own patch
  const noFix = Object.entries(ticks).filter(([fid, note]) => {
    const f = s.planFindings.find((x) => x.id === fid);
    return !note.trim() && (!f?.patch?.trim() || /^none\.?$/i.test(f.patch.trim()));
  }).length;
  const apply = () => {
    const notes = Object.fromEntries(Object.entries(ticks).filter(([, v]) => v.trim()));
    const list = Object.entries(edits).map(([k, text]) => ({ beat: Number(k.split(".")[0]), field: k.split(".")[1], text }));
    gate("apply", { findings: Object.keys(ticks), notes, edits: list });
    setTicks({});
    setEdits({});
  };
  const onSym = (x: string) => setSym(x);
  const M = s.schedule.beats.length;
  if (settings)
    return (
      <DraftSettings
        d={d}
        again
        onClose={() => setSettings(false)}
        onDraft={(b) => {
          setSettings(false);
          gate("replan", { at_beat: 1, profile: b.profile, overrides: b.overrides, models: b.models });
        }}
      />
    );
  return (
    <>
      {gating && (
        <div className="controls" role="group" aria-label="Plan gate">
          <Btn variant="primary" onClick={() => gate("write")} disabled={nTicked + nEdits > 0} title={nTicked + nEdits ? "Apply or clear the ticked findings and edits first." : "Write every scene from this plan, screen them, and stop at gate 2."}>
            write the draft
          </Btn>
          <span className="text-mute">{M} beats · no scene written yet</span>
          <span className="end">
            <Btn variant="quiet" onClick={() => setSettings(true)} title="The length, the beats, the form and the profile. New settings plan the draft again from its first beat.">
              settings
            </Btn>
          </span>
        </div>
      )}
      {gating && (
        <div className="mt-3 max-w-[48rem]" role="group" aria-label="Fix the plan">
          <Head note="fix the plan before any prose: the fixes go into the schedule word for word, and the plan is checked again (about $0.45)">plan</Head>
          <div className="mt-1 text-mute">
            {nTicked ? `${nTicked} finding${nTicked > 1 ? "s" : ""} ticked` : "nothing ticked"}
            {nEdits ? ` · ${nEdits} line${nEdits > 1 ? "s" : ""} edited` : ""}
            {noFix ? <span className="text-art"> · {noFix} without a fix: write one in its note</span> : ""}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Btn variant="art" disabled={!(nTicked + nEdits) || noFix > 0} onClick={apply} title="Put each ticked finding's fix and each edited line in the plan, then check the plan again.">
              apply{nTicked ? ` ${nTicked} fix${nTicked > 1 ? "es" : ""}` : ""}
              {nEdits ? ` · ${nEdits} edit${nEdits > 1 ? "s" : ""}` : ""}
            </Btn>
            {nTicked + nEdits > 0 && (
              <Btn variant="quiet" onClick={() => (setTicks({}), setEdits({}))}>
                clear
              </Btn>
            )}
          </div>
          <textarea
            className="mt-3 font-serif text-prose"
            rows={2}
            placeholder="or plan it again: what should change, in your own words"
            aria-label="Instruction for a re-plan"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="head">from beat</span>
            <span className="chips" role="group" aria-label="Re-plan from beat">
              {s.schedule.beats.map((b) => (
                <Chip key={b.n} className="num" pressed={from === b.n} onClick={() => setFrom(b.n)}>
                  {b.n}
                </Chip>
              ))}
            </span>
            <Btn
              variant="quiet"
              disabled={!instruction.trim()}
              onClick={() => (gate("replan", { at_beat: from, instruction }), setInstruction(""))}
              title={`Plan the schedule again from beat ${from} under the instruction; beats before it stay as they are. The new plan is checked again.`}
            >
              re-plan from {from}
            </Btn>
          </div>
        </div>
      )}
      {gating && (
        <div className="mt-5 max-w-[48rem]" role="group" aria-label="Instruction for the brief">
          <Head note="what should change in the brief's prose, in your own words; tick the parts it is for. The brief is repaired into a new draw, which is planned again and stops here">brief</Head>
          <textarea
            className="mt-1 font-serif text-prose"
            rows={2}
            placeholder="for example: the ending leaves the safe open, and the weight stays on the pier"
            aria-label="Instruction for the brief"
            value={ins.text}
            onChange={(e) => setIns({ ...ins, text: e.target.value })}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="head">for</span>
            <span className="chips" role="group" aria-label="Parts the instruction is for">
              {partNames.map((x) => (
                <Chip key={x} pressed={ins.parts.includes(x)} onClick={() => setIns({ ...ins, parts: ins.parts.includes(x) ? ins.parts.filter((y) => y !== x) : [...ins.parts, x] })}>
                  {x}
                </Chip>
              ))}
            </span>
            <Seg label="Kind" value={ins.kind} options={["direction", "fact"]} onChange={(k) => setIns({ ...ins, kind: k as Instruction["kind"] })} />
            <Btn variant="quiet" disabled={!ins.text.trim() || !ins.parts.length} onClick={instruct} title={ins.kind === "fact" ? "Rewrite the parts under it; it also becomes a ledger line the plan and the scenes are held to." : "Rewrite the parts under it; every later repair keeps it true."}>
              rewrite the brief
            </Btn>
          </div>
        </div>
      )}
      <div className="drawbody wide mt-4">
        <div className="min-w-0">
          <PlanView s={s} ticks={ticks} setTicks={setTicks} gating={gating} sym={sym} onSym={onSym} edits={edits} setEdits={gating ? setEdits : undefined} {...marks} />
        </div>
        <div className="aside min-w-0">
          <SymbolTable s={s} sym={sym} setSym={setSym} />
          {questions.length > 0 && (
            <>
              <Head className="mt-6" note="plot holes the reader check found in the brief; nothing acts on them">
                reader's questions
              </Head>
              <ul className="mt-1">
                {questions.map((q) => (
                  <li key={q.id} className="mt-2">
                    {q.statement}
                    <div className="text-dim">“{q.span}”</div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {f && (
            <div className="mt-6">
              <Profiles f={f} />
            </div>
          )}
          <div className="mt-6">{aside}</div>
        </div>
      </div>
    </>
  );
}

const SYM_KINDS = ["person", "body", "place", "object", "time", "count", "fact"];

/** The plan check's symbol table: the ledger as typed entities and facts, by kind; a click shows the beats that name one. */
function SymbolTable({ s, sym, setSym }: { s: Story; sym: string | null; setSym: (id: string | null) => void }) {
  const [q, setQ] = useState("");
  const hits = (id: string) => s.planFindings.filter((f) => f.evidence.split(/[\s:,;()]+/).includes(id)).length;
  const kinds = [...SYM_KINDS, ...new Set(s.symbols.map((x) => x.kind).filter((k) => !SYM_KINDS.includes(k)))];
  const match = (x: Sym) => !q || `${x.id} ${x.text}`.toLowerCase().includes(q.toLowerCase());
  useEffect(() => {
    if (sym) document.getElementById(`sym-${sym}`)?.scrollIntoView({ block: "nearest" });
  }, [sym]);
  return (
    <>
      <Head note={s.symbols.length ? `${s.symbols.length} · the ledger as the plan check read it` : "none: no plan check ran"}>symbols</Head>
      {s.symbols.length > 0 && <input type="text" className="mt-1 w-full" placeholder="filter symbols" aria-label="Filter symbols" value={q} onChange={(e) => setQ(e.target.value)} />}
      {kinds.map((k) => {
        const xs = s.symbols.filter((x) => x.kind === k && match(x));
        if (!xs.length) return null;
        return (
          <div key={k} className="mt-3">
            <div className="head">
              {k} · {xs.length}
            </div>
            <table className="mt-1">
              <tbody>
                {xs.map((x) => {
                  const h = hits(x.id);
                  const attrs = Object.entries(x.attrs).filter(([a]) => !["id", "kind", "from"].includes(a));
                  return (
                    <tr key={x.id} id={`sym-${x.id}`} className={"pick" + (sym === x.id ? " sel" : "")} tabIndex={0} onClick={() => setSym(sym === x.id ? null : x.id)} onKeyDown={(e) => e.key === "Enter" && setSym(sym === x.id ? null : x.id)}>
                      <td>
                        <span className="num text-gold">{x.id}</span>
                        {h > 0 && <span className="num text-running"> · {h} finding{h > 1 ? "s" : ""}</span>}
                        <div className="text-mute">{x.text}</div>
                        {attrs.length > 0 && (
                          <div className="chips mt-1">
                            {attrs.map(([a, v]) => (
                              <span key={a} className="chip num">
                                {a}={v}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="num text-dim">{x.from}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}
