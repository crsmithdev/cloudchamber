/**
 * A readable name for a draw, built from its seed: three salient words in the
 * order they appear, lowercased and hyphenated, and -2, -3 … for draws that
 * slug the same way. The name is written to the row when the draw is created
 * and never recomputed, so nothing that happens to any other draw can change
 * it.
 */
const STOP = new Set(["about", "after", "again", "against", "because", "before", "being", "between", "could", "every", "might", "never", "often", "other", "should", "since", "still", "their", "there", "these", "they", "thing", "things", "those", "through", "under", "until", "until", "where", "which", "while", "whose", "would", "without", "within"]);

export function seedSlug(seed: string): string {
  const words = seed.toLowerCase().replace(/[’']/g, "").match(/[a-z]+/g) ?? [];
  const picked = words.filter((w) => w.length >= 5 && !STOP.has(w)).slice(0, 3);
  const fallback = words.filter((w) => w.length >= 3).slice(0, 3);
  return (picked.length ? picked : fallback.length ? fallback : ["untitled"]).join("-");
}

/**
 * The name a new draw takes: the seed's slug, or the next free suffix after
 * the highest one already used. Numbers are never reused, so a name is free
 * of every other draw once it is written.
 */
export function nextName(existing: Iterable<string>, seed: string): string {
  const slug = seedSlug(seed);
  const suffix = new RegExp(`^${slug}-(\\d+)$`);
  let max = 0;
  for (const name of existing) {
    if (name === slug) max = Math.max(max, 1);
    const m = suffix.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max === 0 ? slug : `${slug}-${max + 1}`;
}
