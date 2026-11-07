// Version history for posts and pages.
//
// A save used to overwrite the previous content and that was the end of it. A
// mangled paste, a bad find-and-replace, or an editor crash mid-edit meant
// retyping the article.
//
// Two constraints shape this, and both come from how the editor actually
// behaves rather than from the idea of revisions:
//
//   • **The editor autosaves.** Snapshotting every save would store dozens of
//     near-identical rows per session, which is the failure mode WordPress is
//     known for. A revision is only kept when the content, the title, or the
//     SEO/featured/slug/category bundle actually changed.
//   • **History must be bounded.** Content here runs to ~9 KB a post, so an
//     uncapped history is tens of megabytes for one heavily-edited article and
//     grows forever. Old revisions are pruned.

import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { revisions } from "@/lib/db/schema";
import { getSiteSettings } from "@/lib/settings";
import { rawExec } from "@/lib/db/raw";
import { intIn } from "@/lib/speed";

export type RevisionKind = "post" | "page";

/**
 * How many versions of one document to keep.
 *
 * Enough to undo a bad session, few enough that a long-lived post does not
 * become the largest thing in the database.
 */
export const REVISION_LIMIT = 30;

/** The limit in force: Speed → Database → "Revisions to keep", else the default. */
export async function revisionLimit(): Promise<number> {
  try {
    return intIn((await getSiteSettings()).revisions_keep, 1, 500, REVISION_LIMIT);
  } catch {
    return REVISION_LIMIT;
  }
}

/**
 * Trims every document to the limit at once — what "Clean revisions now" on
 * the Speed screen runs after the limit was lowered. Returns how many went.
 */
export async function pruneAllRevisions(): Promise<number> {
  const limit = await revisionLimit();
  return rawExec(
    `DELETE FROM revisions WHERE id IN (
       SELECT id FROM (
         SELECT id, row_number() OVER (PARTITION BY document_kind, document_id ORDER BY created_at DESC, id DESC) AS rn
         FROM revisions
       ) ranked WHERE rn > ?
     )`,
    [limit]
  );
}

/**
 * Everything a restore has to put back besides title, excerpt and content.
 *
 * These lived only on the document row, so a revision of an SEO-only save
 * was never recorded, and restoring one left the featured image, slug and
 * robots flags exactly as the bad edit had left them.
 */
export interface RevisionMeta {
  slug?: string | null;
  featuredImage?: string | null;
  categoryId?: number | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  twitterTitle?: string | null;
  twitterDescription?: string | null;
  twitterImage?: string | null;
  canonicalUrl?: string | null;
  noIndex?: boolean | null;
  noFollow?: boolean | null;
  robotsAdvanced?: string | null;
  schemaType?: string | null;
  schemas?: unknown;
  direction?: string | null;
}

const META_KEYS = [
  "slug",
  "featuredImage",
  "categoryId",
  "seoTitle",
  "seoDescription",
  "seoKeywords",
  "ogTitle",
  "ogDescription",
  "ogImage",
  "twitterTitle",
  "twitterDescription",
  "twitterImage",
  "canonicalUrl",
  "noIndex",
  "noFollow",
  "robotsAdvanced",
  "schemaType",
  "schemas",
  "direction",
] as const satisfies readonly (keyof RevisionMeta)[];

/** Picks the snapshot fields off a post or page row (or a PATCH body). */
export function revisionMetaOf(row: Partial<RevisionMeta> | null | undefined): RevisionMeta {
  const out: RevisionMeta = {};
  if (!row) return out;
  for (const key of META_KEYS) {
    if (key in row) (out as Record<string, unknown>)[key] = row[key];
  }
  return out;
}

export interface Snapshot {
  title: string | null;
  content: unknown;
  excerpt?: string | null;
  meta?: RevisionMeta | null;
}

/**
 * Compares what is about to be overwritten with what is replacing it.
 *
 * `JSON.stringify` is exact rather than semantic: reordering a block's props
 * would read as a change. That is the safe direction to be wrong in — a
 * needless revision costs a row, a missed one costs the author their work.
 */
function changed(before: Snapshot, after: Snapshot): boolean {
  if ((before.title ?? "") !== (after.title ?? "")) return true;
  if ((before.excerpt ?? "") !== (after.excerpt ?? "")) return true;
  if (JSON.stringify(before.meta ?? null) !== JSON.stringify(after.meta ?? null)) return true;
  return JSON.stringify(before.content ?? null) !== JSON.stringify(after.content ?? null);
}

/**
 * Stores the pre-save state of a document, if it differs from what is replacing
 * it.
 *
 * Never throws. Losing a revision must not fail the save that produced it —
 * the author's actual work is the thing that matters, and a history that
 * refuses writes is worse than no history.
 */
/**
 * How close together two autosave revisions may be.
 *
 * The editor autosaves a draft every 20 seconds and each save stored a full
 * copy, so the 30 kept revisions covered about ten minutes of typing — the
 * version from yesterday was gone by lunchtime, and every copy was the whole
 * article, on a 0.5 GB database. An autosave now adds a revision only when
 * the newest one is older than this (or was someone else's); a save the
 * person makes themselves always adds one.
 */
const AUTOSAVE_GAP_MS = 10 * 60_000;

export async function snapshotRevision(
  kind: RevisionKind,
  documentId: number,
  before: Snapshot,
  after: Snapshot,
  authorId?: string | null,
  opts: { autosave?: boolean } = {}
): Promise<void> {
  try {
    if (!changed(before, after)) return;

    if (opts.autosave) {
      const [latest] = await db
        .select({ createdAt: revisions.createdAt, authorId: revisions.authorId })
        .from(revisions)
        .where(and(eq(revisions.documentKind, kind), eq(revisions.documentId, documentId)))
        .orderBy(desc(revisions.createdAt), desc(revisions.id))
        .limit(1);
      if (
        latest &&
        (latest.authorId ?? null) === (authorId ?? null) &&
        Date.now() - new Date(latest.createdAt).getTime() < AUTOSAVE_GAP_MS
      ) {
        return;
      }
    }

    await db.insert(revisions).values({
      documentKind: kind,
      documentId,
      title: before.title ?? null,
      content: before.content ?? null,
      excerpt: before.excerpt ?? null,
      meta: before.meta ?? null,
      authorId: authorId ?? null,
    });

    await pruneRevisions(kind, documentId);
  } catch {
    // Deliberately silent: see the note above.
  }
}

/**
 * Drops everything past the limit for one document.
 *
 * Deletes by id rather than `created_at`, because two saves can land in the
 * same millisecond and a timestamp cut-off would take both or neither.
 */
export async function pruneRevisions(kind: RevisionKind, documentId: number): Promise<void> {
  const limit = await revisionLimit();
  const keep = await db
    .select({ id: revisions.id })
    .from(revisions)
    .where(and(eq(revisions.documentKind, kind), eq(revisions.documentId, documentId)))
    .orderBy(desc(revisions.createdAt), desc(revisions.id))
    .limit(limit);

  if (keep.length < limit) return;

  const oldest = keep[keep.length - 1].id;
  await db
    .delete(revisions)
    .where(
      and(
        eq(revisions.documentKind, kind),
        eq(revisions.documentId, documentId),
        lt(revisions.id, oldest)
      )
    );
}

export interface RevisionSummary {
  id: number;
  title: string | null;
  createdAt: Date;
  authorName: string | null;
  /** Rough size, so the list can show how much changed without loading it. */
  blocks: number;
}

/** The history of one document, newest first. */
export async function listRevisions(
  kind: RevisionKind,
  documentId: number
): Promise<RevisionSummary[]> {
  try {
    const rows = await db.query.revisions.findMany({
      where: and(eq(revisions.documentKind, kind), eq(revisions.documentId, documentId)),
      orderBy: [desc(revisions.createdAt), desc(revisions.id)],
      limit: await revisionLimit(),
      with: { author: { columns: { name: true } } },
      // `content` is the heavy column and the list never shows it.
      columns: { id: true, title: true, createdAt: true, content: true },
    });

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt,
      authorName: (r as { author?: { name: string | null } }).author?.name ?? null,
      blocks: Array.isArray(r.content) ? r.content.length : 0,
    }));
  } catch {
    return [];
  }
}

/** One revision, with its content, for previewing or restoring. */
export async function getRevision(id: number) {
  return db.query.revisions.findFirst({ where: eq(revisions.id, id) });
}

/** Removes a document's history — called when the document itself is deleted. */
export async function deleteRevisionsFor(
  kind: RevisionKind,
  documentIds: number[]
): Promise<void> {
  if (documentIds.length === 0) return;
  try {
    await db
      .delete(revisions)
      .where(and(eq(revisions.documentKind, kind), inArray(revisions.documentId, documentIds)));
  } catch {
    // A stranded history row is harmless; a failed delete must not fail the
    // deletion of the document.
  }
}
