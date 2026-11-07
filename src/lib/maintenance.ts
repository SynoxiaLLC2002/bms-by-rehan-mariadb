// Database housekeeping — the rows that only ever grow.
//
// A trash that is never emptied, an error log nobody prunes, a 404 log that
// remembers every bot probe from two years ago: none of it breaks anything,
// but on a free-tier database it is the difference between 20 MB and the
// 500 MB cap, and it makes every backup bigger. WordPress does the same job
// with "empty trash after 30 days" and a handful of clean-up plugins.
//
// Two halves: `previewCleanup` counts what would go (shown in Site Health) and
// `runCleanup` deletes it. The publish cron runs the second once a day, and
// the Site Health button runs it on demand. Nothing here touches content
// that is live, drafted or scheduled — only trash past its keep time and logs.

import { rawExec, rawQuery } from "@/lib/db/raw";
import { getSiteSettings } from "@/lib/settings";
import type { CleanupPreview, CleanupItem } from "@/lib/siteHealthTypes";

export const LAST_CLEANUP_KEY = "maintenance_last_cleanup";
const DEFAULT_TRASH_DAYS = 30;
const ERROR_LOG_DAYS = 30;
const NOT_FOUND_DAYS = 90;

async function trashDays(): Promise<number> {
  const s = await getSiteSettings();
  const n = parseInt(s.cleanup_trash_days ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_TRASH_DAYS;
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  try {
    const [row] = await rawQuery<{ n: number }>(`SELECT count(*) AS n FROM (${sql}) q`, params);
    return row?.n ?? 0;
  } catch {
    // A table that is not there yet (older schema) simply has nothing to clean.
    return 0;
  }
}

export async function previewCleanup(): Promise<CleanupPreview> {
  const days = await trashDays();
  // No "expired sessions": sign-in is a signed cookie (JWT), so the sessions
  // table is never written, and listing it promised a job that did nothing.
  const [trashPosts, trashPages, errors, notFound] = await Promise.all([
    count("SELECT id FROM posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL ? DAY", [String(days)]),
    count("SELECT id FROM pages WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL ? DAY", [String(days)]),
    count("SELECT id FROM error_log WHERE created_at < now() - INTERVAL ? DAY", [String(ERROR_LOG_DAYS)]),
    count("SELECT id FROM not_found_log WHERE last_hit < now() - INTERVAL ? DAY", [String(NOT_FOUND_DAYS)]),
  ]);
  const last = (await rawQuery<{ value: string }>("SELECT value FROM site_settings WHERE `key` = ?", [LAST_CLEANUP_KEY]).catch(() => []))[0]?.value ?? null;

  const items: CleanupItem[] = [
    { id: "trash-posts", label: "Trashed posts", count: trashPosts, detail: `In the trash for more than ${days} days. Their revisions go too.` },
    { id: "trash-pages", label: "Trashed pages", count: trashPages, detail: `In the trash for more than ${days} days.` },
    { id: "errors", label: "Old error entries", count: errors, detail: `Older than ${ERROR_LOG_DAYS} days.` },
    { id: "not-found", label: "Old 404 entries", count: notFound, detail: `Addresses not hit in ${NOT_FOUND_DAYS} days.` },
  ];
  return { items, total: items.reduce((a, b) => a + b.count, 0), lastRun: last, trashDays: days };
}

export interface CleanupResult {
  removed: Record<string, number>;
  total: number;
  ranAt: string;
}

async function del(sql: string, params: unknown[] = []): Promise<number> {
  try {
    return await rawExec(sql, params);
  } catch {
    return 0;
  }
}

export async function runCleanup(): Promise<CleanupResult> {
  const days = String(await trashDays());
  const removed: Record<string, number> = {};

  // Revisions first, while the documents that own them still exist to be found.
  removed["revisions"] =
    (await del(
      `DELETE FROM revisions WHERE (document_kind = 'post' AND document_id IN (SELECT id FROM posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL ? DAY))
                              OR (document_kind = 'page' AND document_id IN (SELECT id FROM pages WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL ? DAY))`,
      [days, days]
    )) || 0;
  removed["trash-posts"] = await del("DELETE FROM posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL ? DAY", [days]);
  removed["trash-pages"] = await del("DELETE FROM pages WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL ? DAY", [days]);
  removed["errors"] = await del("DELETE FROM error_log WHERE created_at < now() - INTERVAL ? DAY", [String(ERROR_LOG_DAYS)]);
  removed["not-found"] = await del("DELETE FROM not_found_log WHERE last_hit < now() - INTERVAL ? DAY", [String(NOT_FOUND_DAYS)]);

  const ranAt = new Date().toISOString();
  await rawQuery(
    "INSERT INTO site_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
    [LAST_CLEANUP_KEY, ranAt]
  ).catch(() => {});

  return { removed, total: Object.values(removed).reduce((a, b) => a + b, 0), ranAt };
}

const RESANITIZED_KEY = "embeds_resanitized_v1";

/**
 * Once per site: puts every non-administrator's stored content through the
 * same filter a save now applies (lib/contentPolicy).
 *
 * The HTML Embed sanitiser only runs on save, so embeds an author or editor
 * saved before it existed are still stored with their scripts, and render
 * that way until someone edits the document. This re-saves exactly those
 * documents' content, filtered; everything else is left untouched, and a
 * flag makes it a one-off.
 *
 * "Whose content" is the person who last *saved* it, not the document's
 * current author. An administrator adding a tracking snippet to an editor's
 * post is the owner's call, and judging by the byline stripped it. The last
 * saver is the newest revision's author (a revision row is written by the
 * save that replaced it, under that saver's id); a document with no history
 * falls back to its author. When that person is unknown — deleted, or never
 * matched on import — nothing proves a non-admin wrote the script, so the
 * document is left alone. Every document changed gets a revision first, so
 * the stripped version can be restored from History.
 */
export async function resanitizeLegacyEmbedsOnce(): Promise<number> {
  const done = await rawQuery<{ value: string }>("SELECT value FROM site_settings WHERE `key` = ?", [RESANITIZED_KEY]).catch(() => []);
  if (done[0]?.value) return 0;
  const { contentForRole } = await import("@/lib/contentPolicy");
  let changed = 0;
  for (const [table, kind] of [["posts", "post"], ["pages", "page"]] as const) {
    // The last saver: the newest revision's author when there is a revision,
    // otherwise the document's author. MariaDB has no LATERAL join, so the
    // newest revision is found with correlated subqueries (one row each).
    const found = await rawQuery<{ id: number; content: string | null; title: string | null; excerpt: string | null; saver_role: string | null }>(
      `SELECT d.id, d.content, d.title, ${kind === "post" ? "d.excerpt" : "NULL AS excerpt"},
              u.role AS saver_role
       FROM ${table} d
       LEFT JOIN users u ON u.id = CASE
         WHEN EXISTS (SELECT 1 FROM revisions r WHERE r.document_kind = '${kind}' AND r.document_id = d.id)
         THEN (SELECT r.author_id FROM revisions r WHERE r.document_kind = '${kind}' AND r.document_id = d.id
               ORDER BY r.created_at DESC, r.id DESC LIMIT 1)
         ELSE d.author_id END
       WHERE d.content LIKE '%htmlEmbed%'`
    );
    // JSON columns arrive as text through raw SQL on MariaDB.
    const rows = found.map((r) => ({ ...r, content: r.content == null ? null : (JSON.parse(r.content) as unknown) }));
    // No .catch: a failed read must not set the done-flag below, or the
    // clean-up would be skipped for good. The caller swallows the error and
    // the next dashboard visit tries again.
    for (const r of rows) {
      // Unknown saver (null) or an administrator: keep as written.
      if (!r.saver_role || r.saver_role === "admin") continue;
      const { content, stripped } = contentForRole(r.content, false);
      if (!stripped) continue;
      // The unfiltered version goes into History first, so an admin can put
      // it back. Written directly rather than through snapshotRevision, which
      // swallows its own errors: no copy, no change.
      try {
        await rawQuery(
          "INSERT INTO revisions (document_kind, document_id, title, content, excerpt, author_id) VALUES (?, ?, ?, ?, ?, NULL)",
          [kind, r.id, r.title, JSON.stringify(r.content), r.excerpt]
        );
      } catch {
        continue;
      }
      await rawQuery(`UPDATE ${table} SET content = ? WHERE id = ?`, [JSON.stringify(content), r.id]);
      changed++;
    }
  }
  await rawQuery(
    "INSERT INTO site_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
    [RESANITIZED_KEY, new Date().toISOString()]
  );
  // The pages showing those embeds are cached; refresh them.
  if (changed > 0) (await import("@/lib/revalidateSite")).revalidatePublicSite();
  return changed;
}

/** Runs the cleanup if the last one was more than a day ago. For the cron. */
export async function cleanupIfDue(): Promise<CleanupResult | null> {
  await resanitizeLegacyEmbedsOnce().catch(() => 0);
  // Speed → Database → "Clean up automatically". Off, only the button runs it.
  if ((await getSiteSettings()).cleanup_auto === "false") return null;
  const last = (await rawQuery<{ value: string }>("SELECT value FROM site_settings WHERE `key` = ?", [LAST_CLEANUP_KEY]).catch(() => []))[0]?.value;
  const lastMs = last ? Date.parse(last) : NaN;
  if (Number.isFinite(lastMs) && Date.now() - lastMs < 24 * 3600 * 1000) return null;
  return runCleanup();
}
