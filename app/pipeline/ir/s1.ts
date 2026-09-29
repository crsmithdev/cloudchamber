/**
 * S1: static checks on the schedule (docs/specs/2026-09-28-story-ir.md §5, §13.3, §14.5 S1′).
 * A linter over what `parseSchedule` already parses, plus a typed reading of
 * `when` it does not attempt today (`write.ts`'s `cleanWhen` keeps `when` a
 * free string). No model call; every check here runs at $0 on a stored
 * schedule and ledger.
 *
 * `uses`, `present`, `exit`, `may_invent` are the fields S0 added to `Beat`
 * (branch `ir-s0`, `write.ts`): stored, passed to the scene ask, never
 * checked. This is the first thing that checks them.
 */
import type { Schedule } from "../write.ts";

export type S1Finding = {
  /** Which check raised this. */
  check: "when" | "monotonic" | "offset" | "withheld" | "absorbs-pays";
  beat: number | null;
  message: string;
};

// --- typed `when` -----------------------------------------------------------

/**
 * `day` is the story's day count; `era` is a "Year N" of the story's own
 * reckoning ("Year 400, Day 40"); `date` and `year` are the calendar's.
 */
export type When = {
  day: number | null; era: number | null; date: { day: number; month: number } | null; year: number | null; hour: number | null;
  /** How many day numbers and how many dates the text mentions: a beat that names two of either ("day 31 morning; events of day 1, 4 March") does not say which pair goes together. */
  mentions: { days: number; dates: number };
};

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const UNITS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9 };
const TEENS: Record<string, number> = {
  tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const TENS_ORDINAL: Record<string, number> = { twentieth: 20, thirtieth: 30, fortieth: 40, fiftieth: 50, sixtieth: 60, seventieth: 70, eightieth: 80, ninetieth: 90 };
const UNIT_CARDINALS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const CARDINALS: Record<string, number> = {
  ...UNIT_CARDINALS, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, ...TENS,
};

const alt = (o: Record<string, number>) => Object.keys(o).join("|");
/** "ninth", "eleventh", "twentieth", "fifty-second": one ordinal, at a word start (never the tail of a hyphenated one). Five groups. */
const ORDINAL = `(?<![a-z-])(?:(${alt(TENS)})-(${alt(UNITS)})|(${alt(TENS_ORDINAL)})|(${alt(TEENS)})|(${alt(UNITS)}))`;
const ordinalValue = (m: RegExpExecArray, at: number): number | null => {
  const [tens, unit, tensOrd, teen, u] = [m[at], m[at + 1], m[at + 2], m[at + 3], m[at + 4]];
  if (tens && unit) return TENS[tens]! + UNITS[unit]!;
  if (tensOrd) return TENS_ORDINAL[tensOrd]!;
  if (teen) return TEENS[teen]!;
  if (u) return UNITS[u]!;
  return null;
};
/** "ten", "eleven", "fifty-two": one cardinal, at a word start. Three groups. */
const CARDINAL = `(?<![a-z-])(?:(${alt(TENS)})-(${alt(UNIT_CARDINALS)})|(${alt(CARDINALS)}))`;
const cardinalValue = (m: RegExpExecArray, at: number): number | null =>
  m[at] && m[at + 1] ? TENS[m[at]!]! + UNIT_CARDINALS[m[at + 1]!]! : m[at + 2] ? CARDINALS[m[at + 2]!]! : null;

const ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const YEAR = /\b(1[5-9]\d{2}|20\d{2})\b/;
const ERA = /\byears?\s+(\d+)\b/;
const MONTH_ALT = alt(MONTHS);

/**
 * A best-effort reading of `when` as day number, era, date, year and hour,
 * over the free prose the schedule prompt asks for today ("Ninth day, 11
 * March 1911, morning session"; "Day 31, 1400 to 1850"; "Year 400, Day 40";
 * "12 September, fifty-second day"; "1911-03-14"). Each part is independently
 * optional: a schedule that says only "late September 2026" types a year and
 * no day number; one field missing does not fail the others. A range takes
 * its first value ("Days 5–11" is day 5; "12–14 March" is 12 March).
 */
export function parseWhen(raw: string): When {
  const s = raw.toLowerCase();

  const e = ERA.exec(s);
  const era = e ? Number(e[1]) : null;

  // the day count in whichever form comes first in the text: "Day 31", "ninth day", "day ten"; "second to fifth day" is a range and gives its first value, as "Days 5–11" gives 5
  const forms: { index: number; value: number | null }[] = [];
  const dayNum = /\bdays?\s*(\d+)\b/.exec(s);
  if (dayNum) forms.push({ index: dayNum.index, value: Number(dayNum[1]) });
  const ord = new RegExp(`${ORDINAL}\\s+(?:to|through|–|-)\\s+${ORDINAL}\\s+day\\b`).exec(s) ?? new RegExp(`${ORDINAL}\\s+day\\b`).exec(s);
  if (ord) forms.push({ index: ord.index, value: ordinalValue(ord, 1) });
  const card = new RegExp(`\\bdays?\\s+${CARDINAL}\\b`).exec(s);
  if (card) forms.push({ index: card.index, value: cardinalValue(card, 1) });
  const day = forms.length ? forms.sort((a, b) => a.index - b.index)[0]!.value : null;

  let date: { day: number; month: number } | null = null;
  let year: number | null = null;
  const iso = ISO.exec(s);
  if (iso) {
    const month = Number(iso[2]), dnum = Number(iso[3]);
    if (month >= 1 && month <= 12 && dnum >= 1 && dnum <= 31) { date = { day: dnum, month }; year = Number(iso[1]); }
  } else {
    const dm = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*[-–—]\\s*\\d{1,2}(?:st|nd|rd|th)?)?\\s+(${MONTH_ALT})\\b`).exec(s)
      ?? new RegExp(`\\b(${MONTH_ALT})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(s);
    if (dm) {
      const isMonthFirst = !!MONTHS[dm[1]!];
      const month = MONTHS[isMonthFirst ? dm[1]! : dm[2]!]!;
      const dnum = Number(isMonthFirst ? dm[2] : dm[1]);
      if (month && dnum >= 1 && dnum <= 31) date = { day: dnum, month };
    }
    const yr = YEAR.exec(s);
    if (yr) year = Number(yr[1]);
  }

  // the hour, with the year, the ISO date, "Year N" and "Day N" taken out first: "1911" is not 19:11 and "Day 319" is not 03:19
  const h = s.replace(ISO, " ").replace(YEAR, " ").replace(ERA, " ").replace(/\bdays?\s*\d+/g, " ");
  let hour: number | null = null;
  const hhmm = /\b([01]?\d|2[0-3])[:.]?([0-5]\d)\b/.exec(h.replace(/\b(\d{3,4})\b/, (m) => (m.length === 4 ? `${m.slice(0, 2)}:${m.slice(2)}` : `0${m[0]}:${m.slice(1)}`)));
  if (hhmm) hour = Number(hhmm[1]);
  else {
    const oh = new RegExp(`${ORDINAL}\\s+hour\\b`).exec(h);
    if (oh) hour = ordinalValue(oh, 1);
    else { const nh = /\b(\d{1,2})(?:th|st|nd|rd)?\s+hour\b/.exec(h); if (nh) hour = Number(nh[1]); }
  }
  const mentions = {
    days: (s.match(/\bdays?\s*\d+/g) ?? []).length + (s.match(new RegExp(`${ORDINAL}\\s+day\\b`, "g")) ?? []).length + (s.match(new RegExp(`\\bdays?\\s+${CARDINAL}\\b`, "g")) ?? []).length,
    dates: (s.match(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?(?:\\s*[-–—]\\s*\\d{1,2}(?:st|nd|rd|th)?)?\\s+(?:${MONTH_ALT})\\b`, "g")) ?? []).length
      + (s.match(new RegExp(`\\b(?:${MONTH_ALT})\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "g")) ?? []).length + (s.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []).length,
  };
  return { day, era, date, year, hour, mentions };
}

/** A date's serial day number within a year, for comparison across months (leap years not modelled: nothing in the corpus needs one). */
const DAYS_BEFORE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
export const serial = (d: { day: number; month: number }): number => DAYS_BEFORE[d.month - 1]! + d.day;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** The serial back to "3 March"; a serial off the year's ends prints as an offset. */
const dateOf = (n: number): string => {
  if (n < 1 || n > 365) return `an offset of ${n} days`;
  let m = 0;
  while (m < 11 && DAYS_BEFORE[m + 1]! < n) m++;
  return `${n - DAYS_BEFORE[m]!} ${MONTH_NAMES[m]}`;
};

/**
 * Does `cur` read earlier in the story than `prev`? Day numbers compare with
 * day numbers (with the era when both state one), dates with dates (with the
 * year when both state one). A day number is never compared to a date, and
 * two beats with no shared domain are not comparable (`null`).
 */
export function readsEarlier(prev: When, cur: When): boolean | null {
  if (prev.day !== null && cur.day !== null) {
    if (prev.era !== null && cur.era !== null && prev.era !== cur.era) return cur.era < prev.era;
    return cur.day < prev.day;
  }
  if (prev.date && cur.date) {
    if (prev.year !== null && cur.year !== null && prev.year !== cur.year) return cur.year < prev.year;
    return serial(cur.date) < serial(prev.date);
  }
  return null;
}

// --- withheld consistency ----------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const beatList = (ns: number[]): string => (ns.length === 1 ? `beat ${ns[0]}` : `beats ${ns.join(", ")}`);
const plural = (ns: number[], one: string, many: string) => (ns.length === 1 ? one : many);

// --- the linter ---------------------------------------------------------------

/**
 * Every S1 check over one schedule: typed `when` monotonicity under `linear`,
 * one day-to-date offset across the schedule, withheld consistency across
 * beats. `absorbs`/`pays` are
 * checked in `parseSchedule` already (§13.3: "as today, don't break it") and
 * are not repeated here.
 *
 * Chronology is read off the schedule's own `<form>` line, not the draw's
 * config: under `chronology = "auto"` the config never says `linear`, but the
 * schedule states which one it derived, and that is the value the beats were
 * actually planned under (`write.ts`'s `parseSchedule` holds `cfg`'s fixed
 * value to the same line when `cfg` fixes it).
 */
export function lintS1(schedule: Schedule): S1Finding[] {
  const out: S1Finding[] = [];
  const beats = schedule.beats;
  const M = beats.length;
  const whens = beats.map((b) => ({ n: b.n, raw: b.when, w: b.when ? parseWhen(b.when) : null }));

  // --- monotonic `when` under `linear`: each beat against the nearest earlier beat it can be compared with ---
  const chronology = schedule.form.chronology ?? "";
  if (/(^|[^a-z-])linear(?![a-z])/i.test(chronology)) {
    for (let i = 0; i < whens.length; i++) {
      const cur = whens[i]!;
      if (!cur.w) continue;
      for (let j = i - 1; j >= 0; j--) {
        const prev = whens[j]!;
        if (!prev.w) continue;
        const earlier = readsEarlier(prev.w, cur.w);
        if (earlier === null) continue;
        if (earlier) out.push({ check: "monotonic", beat: cur.n, message: `chronology is linear, but beat ${cur.n} ("${cur.raw}") reads earlier in the story than beat ${prev.n} ("${prev.raw}")` });
        break;
      }
    }
  }

  // --- one day-to-date offset: every beat that states one day number and one date must put day 1 on the same date ---
  const byDay1 = new Map<number, number[]>();
  for (const { n, w } of whens) {
    if (!w || w.day === null || !w.date || w.mentions.days !== 1 || w.mentions.dates !== 1) continue;
    const day1 = serial(w.date) - (w.day - 1);
    (byDay1.get(day1) ?? byDay1.set(day1, []).get(day1)!).push(n);
  }
  if (byDay1.size > 1) {
    const groups = [...byDay1.entries()].sort((a, b) => b[1].length - a[1].length);
    out.push({ check: "offset", beat: groups[1]![1][0]!, message: `the day numbers and the dates disagree on where day 1 falls: ${groups.map(([d1, ns]) => `${beatList(ns)} ${plural(ns, "puts", "put")} day 1 on ${dateOf(d1)}`).join("; ")}` });
  }

  // --- withheld consistency across beats: one finding per item ---
  const byItem = new Map<string, { beat: number; until: number }[]>();
  for (const b of beats) for (const w of b.withheld) {
    const key = norm(w.item);
    (byItem.get(key) ?? byItem.set(key, []).get(key)!).push({ beat: b.n, until: w.until });
  }
  const untilText = (u: number) => (u > M ? "never" : String(u));
  for (const [item, rows] of byItem) {
    const untils = [...new Set(rows.map((r) => r.until))];
    if (untils.length > 1) {
      const first = rows[0]!.until;
      const offending = rows.find((r) => r.until !== first)!;
      const groups = untils.map((u) => { const ns = rows.filter((r) => r.until === u).map((r) => r.beat); return `${beatList(ns)} ${plural(ns, "says", "say")} ${untilText(u)}`; });
      out.push({ check: "withheld", beat: offending.beat, message: `"${item}" is withheld with a different \`until\` in different beats: ${groups.join("; ")}` });
      continue;
    }
    const until = untils[0]!;
    const late = rows.find((r) => until <= M && r.beat >= until);
    if (late) out.push({ check: "withheld", beat: late.beat, message: `"${item}" was due at beat ${until} but beat ${late.beat} still lists it withheld` });
    if (until > M + 1) out.push({ check: "withheld", beat: rows[0]!.beat, message: `"${item}": until ${until} is past the last beat (${M}) and is not the "never" value` });
  }

  return out;
}

/** One line per finding, for a report or a console table. */
export const formatS1 = (findings: S1Finding[]): string =>
  findings.map((f) => `[${f.check}]${f.beat ? ` beat ${f.beat}:` : ""} ${f.message}`).join("\n");
