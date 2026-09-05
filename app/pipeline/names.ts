/**
 * A readable name for a draw, built from its seed. Three salient words of the
 * seed in the order they appear, lowercased and hyphenated; draws that share a
 * seed get -2, -3 … in order of creation. Deterministic over the set of draws,
 * so nothing is stored.
 */
const STOP = new Set(["about", "after", "again", "against", "because", "before", "being", "between", "could", "every", "might", "never", "often", "other", "should", "since", "still", "their", "there", "these", "they", "thing", "things", "those", "through", "under", "until", "until", "where", "which", "while", "whose", "would", "without", "within"]);

export function seedSlug(seed: string): string {
  const words = seed.toLowerCase().replace(/[’']/g, "").match(/[a-z]+/g) ?? [];
  const picked = words.filter((w) => w.length >= 5 && !STOP.has(w)).slice(0, 3);
  const fallback = words.filter((w) => w.length >= 3).slice(0, 3);
  return (picked.length ? picked : fallback.length ? fallback : ["untitled"]).join("-");
}

export function drawNames(draws: { id: string; seed_text: string; created_at: string }[]): Map<string, string> {
  const ordered = [...draws].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const r of ordered) {
    const slug = seedSlug(r.seed_text);
    const n = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, n);
    out.set(r.id, n === 1 ? slug : `${slug}-${n}`);
  }
  return out;
}
