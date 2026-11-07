// Which language roots have something to show.
//
// A language can be added in one click from "Translate" — and from that moment
// its root (`/fr`) was in the sitemap and in every page's hreflang, while all
// it could show was an empty listing or a homepage still in draft. A crawler
// was invited to index a blank page in a new language. A root counts as live
// once its homepage is published or it has at least one live post.

import { cache } from "react";
import { and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { pages, posts } from "@/lib/db/schema";
import { isLive } from "@/lib/publishState";
import { contentLanguages, defaultContentLanguage } from "@/lib/locale";
import { homepageId } from "@/lib/permalinks";
import type { SiteSettings } from "@/lib/settings";

export const liveLanguageRoots = cache(async function liveLanguageRoots(settings: SiteSettings): Promise<Set<string>> {
  const all = contentLanguages(settings);
  // The default language's root is the site itself — always listed.
  const out = new Set<string>([defaultContentLanguage(settings)]);
  try {
    const withPosts = await db.selectDistinct({ language: posts.language }).from(posts).where(isLive(posts));
    for (const r of withPosts) out.add(r.language);
    const homeIds = all.map((c) => homepageId(c, settings)).filter((id): id is number => id != null);
    if (homeIds.length) {
      const live = await db
        .select({ language: pages.language })
        .from(pages)
        .where(and(inArray(pages.id, homeIds), isLive(pages)));
      for (const r of live) out.add(r.language);
    }
  } catch {
    // Unknown: list every configured language, as before.
    for (const c of all) out.add(c);
  }
  return new Set(all.filter((c) => out.has(c)));
});

