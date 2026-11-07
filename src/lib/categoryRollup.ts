// Per-category post counts that include every category beneath it.
//
// A category archive lists its descendants' posts (see `categoryTree` in
// BlogArchive), so anything that decides whether that archive exists, or how
// many pages it has, has to count the same way. Counting only posts filed
// directly under a term said a parent whose posts all sit in child categories
// was empty: it was left out of the sitemap, and its page 2 was never
// prerendered, while the archive itself listed them.

export interface TermStat {
  n: number;
  newest: Date | null;
}

/**
 * Adds each category's own stat to itself and every ancestor.
 *
 * `parents` maps a category to its parent. A chain that loops back on itself
 * (the schema permits one) is walked once per category and then stops.
 */
export function rollUpCategoryStats(
  own: Map<number, TermStat>,
  parents: Map<number, number | null>
): Map<number, TermStat> {
  const out = new Map<number, TermStat>();
  for (const [id, stat] of own) {
    const seen = new Set<number>();
    let cur: number | null | undefined = id;
    while (cur != null && !seen.has(cur)) {
      seen.add(cur);
      const acc = out.get(cur) ?? { n: 0, newest: null };
      acc.n += stat.n;
      if (stat.newest && (!acc.newest || stat.newest > acc.newest)) acc.newest = stat.newest;
      out.set(cur, acc);
      cur = parents.get(cur);
    }
  }
  return out;
}
