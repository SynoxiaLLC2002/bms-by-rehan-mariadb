import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pages } from "@/lib/db/schema";
import type { SiteSettings } from "@/lib/settings";
import { homepageId, languagePrefix, pagePath, postsPageId } from "@/lib/permalinks";
import { isLiveNow } from "@/lib/publishState";

/**
 * Where a language's post listing lives, or null when it has none.
 *
 * Two ways a listing can exist, both the WordPress ones:
 *   • the language root, when no page has been chosen as the homepage, so the
 *     front page itself shows the latest posts;
 *   • the page chosen as the Posts page, at that page's own URL.
 *
 * Neither is true on a fresh site, and then there is no listing anywhere: no
 * URL, no breadcrumb, no "All" chip, no sitemap entry. Cached per request —
 * the breadcrumb, the archive chips and the feed all ask.
 */
export const postsPagePath = cache(async (language: string, settings: SiteSettings): Promise<string | null> => {
  const id = postsPageId(language, settings);
  if (id) {
    const pg = await db.query.pages.findFirst({
      where: eq(pages.id, id),
      columns: { id: true, slug: true, language: true, status: true, publishedAt: true, deletedAt: true },
    });
    if (pg && isLiveNow(pg.status, pg.publishedAt, pg.deletedAt)) return pagePath(pg, settings);
    return null;
  }
  if (!homepageId(language, settings)) return languagePrefix(language, settings) || "/";
  return null;
});
