import { db } from "@/lib/db";
import { affectedRows } from "@/lib/db/write";
import { redirects, siteSettings } from "@/lib/db/schema";
import { invalidateRedirects, normalisePath } from "@/lib/redirects";
import { and, eq } from "drizzle-orm";

/**
 * A document is now published at `path`, so no redirect may lead away from it.
 *
 * Renaming `/guide` to `/guide-2024` keeps a redirect from `/guide`. When a
 * new post, page, duplicate or translation later takes `/guide`, that rule
 * still ran first — redirects are checked before pages — and the new
 * document could not be reached, with nothing in the admin saying why. The
 * rule is switched off rather than deleted, so one an administrator wrote by
 * hand is still there on the Redirects screen to see and re-enable.
 *
 * Best-effort, like recordSlugChange.
 */
export async function releaseRedirectFrom(path: string) {
  if (!path) return;
  try {
    const off = await db
      .update(redirects)
      .set({ enabled: false })
      .where(and(eq(redirects.source, normalisePath(path)), eq(redirects.enabled, true)));
    if (affectedRows(off)) invalidateRedirects();
  } catch {
    /* never block the save */
  }
}

/**
 * When a post or page slug changes, the old URL is already out there — in
 * search results, in other people's links. This records a 301 from the old
 * path to the new one so those links keep working.
 *
 * Takes whole paths rather than a slug and a `"/blog"` prefix. A post's URL is
 * whatever the permalink structure says it is — it may carry a date, or be an
 * id under `/archives` — so only the caller can say where the post used to
 * live. Passing a slug and gluing `/blog` on the front wrote a redirect for a
 * URL the post had not lived at since permalinks became a setting, and left
 * the address people actually had bookmarked pointing at a 404.
 *
 * Best-effort: a failure here must never stop the save that triggered it.
 */
export async function recordSlugChange(oldPath: string, newPath: string) {
  if (!oldPath || !newPath || oldPath === newPath) return;

  try {
    const rows = await db
      .select({ value: siteSettings.value })
      .from(siteSettings)
      .where(eq(siteSettings.key, "seo_auto_redirect"));

    // Default on: only an explicit "false" disables it.
    if (rows[0]?.value === "false") return;

    const source = normalisePath(oldPath);
    const destination = newPath;

    // The new address is live now, so nothing may redirect away from it.
    // Renaming `/a` → `/b` and then back to `/a` left the first rule
    // (`/a` → `/b`) in place — and the re-pointing below turned it into
    // `/a` → `/a`. Redirects run before the page, so undoing a slug change
    // made the document unreachable behind a redirect loop.
    await db.delete(redirects).where(eq(redirects.source, normalisePath(newPath)));

    // Any existing rule that pointed at the old path should now point at the
    // new one, otherwise a second rename leaves a chain or a dead end.
    await db.update(redirects).set({ destination }).where(eq(redirects.destination, oldPath));

    await db
      .insert(redirects)
      .values({ source, destination, type: 301, enabled: true })
      .onDuplicateKeyUpdate({ set: { destination, enabled: true } });

    invalidateRedirects();
  } catch {
    /* never block the save */
  }
}
