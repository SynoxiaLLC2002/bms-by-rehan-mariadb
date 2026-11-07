// Whether a document is visible to the public *right now*.
//
// `status = 'published'` was the whole test, so a publish date in the future
// changed the displayed date and nothing else — the post went live the moment
// it was saved. The editor said so honestly rather than pretending, because
// half-built scheduling is worse than none: a post that looks scheduled and is
// actually live is a leak you do not find out about.
//
// Being live is now two conditions, and they are written once here because the
// site asks the question in eighteen places. The language work taught the same
// lesson: a rule spread across eighteen call sites is a rule that will drift.

import { and, eq, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { Column } from "drizzle-orm";

/** The two columns this predicate needs from a content table. */
interface Publishable {
  status: Column;
  publishedAt: Column;
  /** Set when the document is in the trash. Null is the normal state. */
  deletedAt: Column;
}

/**
 * How far ahead of `now()` still counts as live.
 *
 * Pressing Publish stamps `published_at` and immediately redirects to the post.
 * Measured on this setup, the page 404s for roughly three seconds afterwards
 * even though the database already reports `published_at <= now()` — the write
 * and the read do not see the same instant, which is ordinary for a hosted
 * Postgres with connection pooling.
 *
 * Before scheduling existed, `status = 'published'` made publishing instant, so
 * this would be a regression the author sees every single time they publish.
 *
 * The cost is that a post scheduled for exactly five seconds from now appears
 * five seconds early. Scheduling is a feature people use at the granularity of
 * minutes; publishing is a thing they do constantly and watch. The trade is
 * plainly worth it in that direction.
 */
const GRACE_SECONDS = 5;

/**
 * A document is live when it is published *and* its publish date has arrived.
 *
 * `now()` is evaluated by the database rather than `new Date()` in Node, so the
 * comparison happens at query time against one clock. A JavaScript timestamp
 * would also be baked into a prerendered page, freezing "now" at build time.
 *
 * A null publish date counts as live: that is what an older row looks like, and
 * a document with no date has not been scheduled for anything.
 */
export function isLive<T extends Publishable>(table: T): SQL | undefined {
  return and(
    // Trashed documents are not live, and this is the one place that has to
    // know it. Eighteen call sites ask "is this public?" through this function;
    // adding the check to each of them separately is the drift this file was
    // written to prevent, and a missed one would serve deleted content.
    isNull(table.deletedAt),
    eq(table.status, "published"),
    or(isNull(table.publishedAt), lte(table.publishedAt, sql`NOW(3) + INTERVAL ${GRACE_SECONDS} SECOND`))
  );
}

/** Not in the trash — for admin listings, which show drafts as well. */
export function notTrashed<T extends Publishable>(table: T): SQL | undefined {
  return isNull(table.deletedAt);
}

/** In the trash — the Trash view's filter. */
export function isTrashed<T extends Publishable>(table: T): SQL | undefined {
  return isNotNull(table.deletedAt);
}

/**
 * The same rule for a row already in hand.
 *
 * Used where the document has been fetched by id or slug and the question is
 * whether to serve it, rather than whether to select it.
 */
export function isLiveNow(
  status: string | null | undefined,
  publishedAt: Date | string | null | undefined,
  /**
   * When the document was trashed, if it was.
   *
   * Added after a test caught the gap: `isLive` excludes trashed rows from
   * every *query*, so a trashed post vanished from the archive, the sitemap and
   * the feed — but its own URL still answered 200, because this row-level check
   * only knew about status and date. A listing that hides a document while its
   * permalink still serves it is the worst of both answers.
   */
  deletedAt?: Date | string | null
): boolean {
  if (deletedAt) return false;
  if (status !== "published") return false;
  if (!publishedAt) return true;
  const at = new Date(publishedAt);
  if (Number.isNaN(at.getTime())) return true;
  // A wider grace than the query predicate, on purpose.
  //
  // The query compares in Postgres and this compares in Node, and the two
  // clocks are not the same — measured 3.6 seconds apart on this setup, in
  // either direction depending on drift. A document that a listing shows but
  // its own URL 404s is the worst of both answers, so the row-level check is
  // the more permissive of the two: a listing never links to something this
  // will refuse.
  //
  // Scheduling is used at the granularity of minutes, so a minute of tolerance
  // costs nothing real and absorbs any plausible skew.
  return at.getTime() <= Date.now() + 60_000;
}

