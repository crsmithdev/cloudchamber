/**
 * Calling the panel.
 *
 * `evals/judge.py` runs its passes in sequence, one pair per process, which is
 * most of the 35–45 minutes an experiment takes. Every pass is independent — a
 * different judge, or the same judge on a different pair or reading order — so
 * they all go at once here.
 *
 * Nothing about the protocol changes: the ask is `rubric.ts`'s word for word,
 * the order swaps on alternate passes, and a reply that does not answer every
 * axis is a failed call that is tried again rather than a verdict (ADR-0011).
 */
import { JUDGE_SYSTEM, complete, followedOrder, judgePrompt, parseVerdict, type Parsed } from "./rubric.ts";

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

/** One pass to run: which pair, which judge, and which way round. */
export type PassAsk = { ours: string; source: string; judge: string; pass: number; flipped: boolean };

/** What came back, with what it cost and how long it took. */
export type PassResult = PassAsk & { parsed: Parsed; complete: boolean; followed_order: boolean; cost_usd: number | null; ms: number; attempts: number; error?: string };

export type CallOpts = {
  key?: string;
  /** Tries per pass before it is recorded incomplete. `judge.py` uses 3. */
  tries?: number;
  /** How many calls may be in flight at once. */
  concurrency?: number;
  fetch?: typeof globalThis.fetch;
  onPass?: (r: PassResult) => void;
};

export function judgeKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set: source ~/.config/cloudchamber/env");
  return key;
}

/** One call to one judge. Returns the reply text and what the provider reported it cost. */
export async function callJudge(prompt: string, model: string, key: string, f: typeof globalThis.fetch = fetch): Promise<{ text: string; cost_usd: number | null }> {
  const r = await f(OPENROUTER, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 16000, reasoning: { effort: "low" }, usage: { include: true },
      messages: [{ role: "system", content: JUDGE_SYSTEM }, { role: "user", content: prompt }],
    }),
  });
  const d = (await r.json()) as any;
  if (d?.error) throw new Error(`openrouter: ${JSON.stringify(d.error).slice(0, 300)}`);
  const text = d?.choices?.[0]?.message?.content ?? "";
  // the provider reports what it actually billed; nothing here estimates a price
  return { text, cost_usd: typeof d?.usage?.cost === "number" ? d.usage.cost : null };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run one pass, trying again while the reply does not answer every axis. */
export async function runPass(ask: PassAsk, texts: { ours: string; source: string }, o: CallOpts = {}): Promise<PassResult> {
  const key = o.key ?? judgeKey();
  const f = o.fetch ?? fetch;
  const [one, two] = ask.flipped ? [texts.source, texts.ours] : [texts.ours, texts.source];
  const prompt = judgePrompt(one, two);
  const started = Date.now();
  let parsed: Parsed = { axes: {}, scores: {}, whys: [], overall: "?", needs: "", raw: "" };
  let cost: number | null = null;
  let error: string | undefined;
  const tries = o.tries ?? 3;
  let attempt = 0;
  for (; attempt < tries; attempt++) {
    try {
      const r = await callJudge(prompt, ask.judge, key, f);
      cost = r.cost_usd ?? cost;
      parsed = parseVerdict(r.text, ask.flipped);
      if (complete(parsed)) break;
      error = `incomplete: ${Object.keys(parsed.axes).length}/8 axes`;
    } catch (e) {
      error = String((e as Error)?.message ?? e).slice(0, 300);
      await sleep(4000 * (attempt + 1));
    }
  }
  const ok = complete(parsed);
  return {
    ...ask, parsed, complete: ok, followed_order: followedOrder(parsed.overall, ask.flipped),
    cost_usd: cost, ms: Date.now() - started, attempts: Math.min(attempt + 1, tries),
    ...(ok ? {} : { error: error ?? "incomplete" }),
  };
}

/**
 * Every pass at once, up to `concurrency`. The passes of a run are independent,
 * so the wall time of the judging phase is one pass plus the queue, not the sum
 * of them; on the runs of 23 September that phase was 36 calls in sequence.
 */
export async function runPasses(asks: PassAsk[], text: (drawId: string) => string, o: CallOpts = {}): Promise<PassResult[]> {
  const key = o.key ?? judgeKey();
  const limit = Math.max(1, o.concurrency ?? 12);
  const out: PassResult[] = new Array(asks.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < asks.length; i = next++) {
      const a = asks[i]!;
      const r = await runPass(a, { ours: text(a.ours), source: text(a.source) }, { ...o, key });
      out[i] = r;
      o.onPass?.(r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, asks.length) }, worker));
  return out;
}
