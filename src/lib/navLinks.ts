// Menu links, from what they point at.
//
// A menu item stores its address as text, written when the menu was saved,
// and also which page, post or category it points to. Only the text was ever
// used, so renaming a post's slug, changing the permalink structure,
// renaming a category or moving a language prefix left every menu pointing
// at the old address: each click a 301 (slower, and internal links to
// redirects are a quality signal to Google), or a 404 where no redirect was
// recorded.
//
// Items linked to a document now get the document's current address when the
// page is drawn. The stored text is still the answer when the target is gone
// or not live (a redirect may cover it), and for custom links. A `#section`
// or `?query` the stored link carried is kept on the resolved address.

import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, pages, posts } from "@/lib/db/schema";
import { categoryPath, pagePath, postPath } from "@/lib/permalinks";
import { isLiveNow } from "@/lib/publishState";
import type { SiteSettings } from "@/lib/settings";

interface LinkedItem {
  url: string;
  objectType?: string | null;
  objectId?: number | null;
}

/** The part after the path — `#team`, `?tab=2` — kept from the stored link. */
function suffixOf(url: string): string {
  const m = url.match(/[?#].*$/);
  return m ? m[0] : "";
}

export async function resolveNavUrls<T extends LinkedItem>(items: T[], settings: SiteSettings): Promise<T[]> {
  const ids = (type: string) =>
    [...new Set(items.filter((i) => i.objectType === type && i.objectId).map((i) => i.objectId as number))];
  const postIds = ids("post");
  const pageIds = ids("page");
  const catIds = ids("category");
  if (!postIds.length && !pageIds.length && !catIds.length) return items;

  const [postRows, pageRows, catRows] = await Promise.all([
    postIds.length
      ? db.query.posts.findMany({
          where: inArray(posts.id, postIds),
          columns: { id: true, slug: true, language: true, status: true, publishedAt: true, createdAt: true, deletedAt: true },
          with: { category: { columns: { slug: true, name: true } } },
        })
      : [],
    pageIds.length
      ? db.query.pages.findMany({
          where: inArray(pages.id, pageIds),
          columns: { id: true, slug: true, language: true, status: true, publishedAt: true, deletedAt: true },
        })
      : [],
    catIds.length
      ? db.query.categories.findMany({ where: inArray(categories.id, catIds), columns: { id: true, slug: true, language: true } })
      : [],
  ]);

  const paths = new Map<string, string>();
  for (const p of postRows) {
    if (isLiveNow(p.status, p.publishedAt, p.deletedAt)) paths.set(`post:${p.id}`, postPath(p, settings));
  }
  for (const p of pageRows) {
    if (isLiveNow(p.status, p.publishedAt, p.deletedAt)) paths.set(`page:${p.id}`, pagePath(p, settings));
  }
  for (const c of catRows) paths.set(`category:${c.id}`, categoryPath(c.slug, c.language, settings));

  return items.map((item) => {
    const path = paths.get(`${item.objectType}:${item.objectId}`);
    if (!path) return item;
    const url = path + suffixOf(item.url);
    return url === item.url ? item : { ...item, url };
  });
}

/**
 * After a linked document moved: every cached page draws the menu, so they
 * are rebuilt when it is in one. Next's copies only — Cloudflare keeps its
 * copies until they expire, and the old link they carry still redirects, so
 * emptying the whole zone for a rename is not worth it.
 */
export async function refreshMenusIfLinked(objectType: "post" | "page", objectId: number): Promise<void> {
  const { and, eq } = await import("drizzle-orm");
  const { navItems } = await import("@/lib/db/schema");
  const [hit] = await db
    .select({ id: navItems.id })
    .from(navItems)
    .where(and(eq(navItems.objectType, objectType), eq(navItems.objectId, objectId)))
    .limit(1);
  if (hit) (await import("@/lib/revalidateSite")).revalidatePublicSite({ cloudflarePaths: [] });
}
