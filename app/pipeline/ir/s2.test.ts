import { describe, expect, test } from "bun:test";
import { parseSyms, l3Calendar, type Sym } from "./s2.ts";
import type { Schedule } from "../write.ts";

describe("parseSyms", () => {
  test("reads id, kind, from and any other attribute off a <sym> tag", () => {
    const text = `<symbols>
<sym id="varro" kind="person" from="ledger:detail">Knight Anselm Varro, sixth of the nine</sym>
<sym id="suit.third" kind="object" from="ledger:world; setting:bodies/Armoury" custody="varro" reused="yes">nine suits, one sealed per Tier</sym>
</symbols>`;
    const syms = parseSyms(text);
    expect(syms).toHaveLength(2);
    expect(syms[0]).toMatchObject({ id: "varro", kind: "person", from: "ledger:detail", text: "Knight Anselm Varro, sixth of the nine" });
    expect(syms[1]).toMatchObject({ id: "suit.third", kind: "object", attrs: expect.objectContaining({ custody: "varro", reused: "yes" }) });
  });

  test("a tag with no id is skipped", () => {
    expect(parseSyms(`<sym kind="person">no id</sym>`)).toHaveLength(0);
  });
});

describe("l3Calendar", () => {
  test("catches the 08aa calendar bug: day 1 = 3 March, and day 11 stated as 14 March, disagree with the day count", () => {
    const symbols = [
      { id: "day.1", kind: "time", from: "ledger:time", attrs: { day: "1", date: "3 March 1911" }, text: "day 1 is 3 March 1911" },
      { id: "day.11", kind: "time", from: "ledger:time", attrs: { day: "11", date: "14 March 1911" }, text: "the Door welds on day 11, 14 March 1911" },
    ];
    const findings = l3Calendar(symbols);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "calendar", symbols: ["day.1", "day.11"] });
    expect(findings[0]!.message).toContain("10 day(s) apart by the day count, 11 by the calendar dates");
  });

  test("a consistent calendar raises nothing", () => {
    const symbols = [
      { id: "day.1", kind: "time", from: "", attrs: { day: "1", date: "3 March 1911" }, text: "" },
      { id: "day.11", kind: "time", from: "", attrs: { day: "11", date: "13 March 1911" }, text: "" },
    ];
    expect(l3Calendar(symbols)).toHaveLength(0);
  });

  test("with the ledger given, an anchor whose date the ledger never writes is dropped, and one defect is one finding", () => {
    const ledger = "time — Descent begins 3 March 1911, sixth hour; welded shut 14 March at the eleventh hour.\ntime — Telemetry: day four at 19:40 the trace becomes a smear.";
    const symbols = [
      { id: "day.1", kind: "time", from: "", attrs: { day: "1", date: "3 March 1911" }, text: "" },
      { id: "day.1.session", kind: "time", from: "", attrs: { day: "1", date: "3 March 1911" }, text: "" },
      { id: "day.4", kind: "time", from: "", attrs: { day: "4", date: "6 March 1911" }, text: "a derived date" },
      { id: "day.11", kind: "time", from: "", attrs: { day: "11", date: "14 March 1911" }, text: "" },
    ];
    expect(l3Calendar(symbols).filter((f) => f.kind === "calendar")).toHaveLength(2);
    const stated = l3Calendar(symbols, ledger).filter((f) => f.kind === "calendar");
    expect(stated).toHaveLength(1);
    expect(stated[0]!.symbols.sort()).toEqual(["day.1", "day.1.session", "day.11"]);
  });

  test("an ISO date is read: the sonnet tables of 28 September", () => {
    const symbols = [
      { id: "day.1", kind: "time", from: "", attrs: { day: "1", date: "1911-03-03" }, text: "" },
      { id: "day.11", kind: "time", from: "", attrs: { day: "11", date: "1911-03-14" }, text: "" },
    ];
    expect(l3Calendar(symbols)).toHaveLength(1);
  });

  test("a yes/no tally that does not sum to the stated total is flagged", () => {
    const symbols = [{ id: "vote", kind: "count", from: "", attrs: { total: "12", yes: "6", no: "5" }, text: "" }];
    expect(l3Calendar(symbols).some((f) => f.message.includes("6 yes plus 5 no is 11, not the stated tally of 12"))).toBe(true);
  });

  test("the 08aa vote is a membership question: a named voter from another body, and one seat unaccounted for", () => {
    const symbols: Sym[] = [
      { id: "council", kind: "body", from: "", attrs: { seats: "12" }, text: "" },
      { id: "dace", kind: "person", from: "", attrs: { member_of: "guild", role: "Guild delegate" }, text: "" },
      { id: "mercer", kind: "person", from: "", attrs: { member_of: "council" }, text: "" },
      { id: "vote.day11", kind: "count", from: "", attrs: { body: "council", yes: "7", no: "5", total: "12", named_yes: "dace, mercer", named_no: "holt" }, text: "" },
    ];
    const f = l3Calendar(symbols);
    const q = f.filter((x) => x.kind === "membership");
    expect(q.every((x) => x.question)).toBe(true);
    expect(q.some((x) => x.message.includes("dace votes but is a member of guild, not of council; the tally is 12 against 12 seats, so one seat is unaccounted for"))).toBe(true);
    expect(q.some((x) => x.message.includes('"holt" votes but no symbol has that id'))).toBe(true);
    expect(q.some((x) => /mercer/.test(x.message))).toBe(false);
  });

  test("the old seats-against-voters check is gone: nine of twelve Knights is not a vote", () => {
    expect(l3Calendar([{ id: "knights", kind: "count", from: "", attrs: { seats: "12", voters: "9" }, text: "" }])).toHaveLength(0);
  });

  test("a symbol with no numeric attributes raises nothing", () => {
    expect(l3Calendar([{ id: "cadence", kind: "fact", from: "", attrs: {}, text: "three knocks" }])).toHaveLength(0);
  });
});
