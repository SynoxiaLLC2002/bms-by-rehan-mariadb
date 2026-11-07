import { sql, type SQL } from "drizzle-orm";

// When a document says it went live.
//
// `published_at` was only ever "now, the first time you pressed Publish". That
// is fine for something written today and wrong for everything else: imported
// content lands with today's date, a piece written last week cannot say so, and
// under a dated permalink structure the date is *in the URL*, so a wrong date is
// a wrong address. It also feeds `article:published_time` and `datePublished`.

/**
 * Reads an author-supplied publish date.
 *
 * Returns `undefined` when there is nothing usable, so a caller can fall back to
 * its existing behaviour rather than storing a broken date. Rejects anything
 * that is not a real instant, and anything absurd — a typo in the year field
 * would otherwise put a post in 0202 or 20260, which no listing sorts sensibly.
 */
export function parsePublishDate(raw: unknown): Date | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return undefined;
  const year = date.getUTCFullYear();
  if (year < 1970 || year > 2200) return undefined;
  return date;
}

/**
 * The value to store, given what the author sent and what is already there.
 *
 * The rules, in order:
 *   • An explicit date always wins — that is the whole point of the field.
 *   • A draft saved from the editor (which always sends the field, "" when
 *     empty) has no publish date; clearing it is what "unpublish" means.
 *   • A status-only change — the list's bulk "Switch to draft", which sends no
 *     date at all — keeps the date. Clearing it there meant a later bulk
 *     Publish stamped today, and a years-old article jumped to the top of
 *     the blog, the feed and the sitemap as if it were new.
 *   • An already-published document keeps the date it had, so re-saving does
 *     not silently move it to today.
 *   • Publishing for the first time with no date given stamps now.
 */
export function resolvePublishedAt(
  supplied: unknown,
  status: string,
  existing: Date | null | undefined
): Date | SQL | null {
  const explicit = parsePublishDate(supplied);
  if (explicit) return explicit;
  if (status !== "published") return supplied === undefined ? existing ?? null : null;
  if (existing) return existing;

  // The database's clock, not Node's.
  //
  // Visibility is decided by `published_at <= now()` evaluated *in the database*.
  // Stamping this with `new Date()` compares two different clocks, so a machine
  // running even a second ahead of the database publishes a post that 404s
  // until the database catches up — measured at 3.6s of skew on this setup,
  // and unbounded on a distributed one. Asking the database for its own time
  // removes the comparison entirely. NOW(3): MariaDB's bare NOW() drops the
  // milliseconds the column keeps (datetime(3)).
  return sql`NOW(3)`;
}
