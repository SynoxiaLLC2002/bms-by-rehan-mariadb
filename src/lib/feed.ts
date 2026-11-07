// The RSS feed, for one language.
//
// There was a single `/feed.xml` listing every language's posts together, while
// every other listing on the site — archives, search, the sidebar, related
// posts — had been scoped. Worse, the autodiscovery link on a French page
// pointed at it, so a French reader subscribing got English articles. A feed is
// a listing; it follows the same rule.

import { db } from "@/lib/db";
import { posts } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { absoluteUrlFor, feedPath, postUrl, rootPath } from "@/lib/permalinks";
import { schemaUrl } from "@/lib/seoMeta";
import { postsPagePath } from "@/lib/postsPage";
import type { SiteSettings } from "@/lib/settings";
import { isLive } from "@/lib/publishState";
import { LS_CACHE, feedCacheHeader } from "@/lib/lscache";
import { cache } from "react";

/**
 * A URL as the feed writes it: percent-encoded, as the sitemap and the
 * canonical tag write the same address (schemaUrl), and XML-escaped. Post
 * links, their <guid> and the channel link went out with raw Arabic
 * characters, which feed validators reject and some readers mishandle.
 */
function feedUrl(url: string): string {
  return escapeXml(schemaUrl(url));
}

/**
 * Whether this language has a single live post, so the page can advertise
 * the feed only when there is one. A site built from pages alone had every
 * page pointing readers at an empty feed. Memoised per request.
 */
export const hasLivePosts = cache(async (language: string): Promise<boolean> => {
  try {
    const row = await db.query.posts.findFirst({ where: and(isLive(posts), eq(posts.language, language)), columns: { id: true } });
    return !!row;
  } catch {
    // Unknown: keep the link, as before this check existed.
    return true;
  }
});

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function buildFeed(
  language: string,
  settings: SiteSettings,
  base: string
): Promise<string> {
  const title = settings.site_name || "Blog";
  const description = settings.site_description || "";

  // The rows are kept whole rather than projected: `postUrl` needs the id
  // and both dates, and a lossy map is what hid that requirement.
  type FeedItem = {
    id: number; title: string; slug: string; excerpt: string | null; searchText: string | null;
    publishedAt: Date | null; updatedAt: Date | null; createdAt: Date | null; language: string;
  };
  // No catch: an empty feed during an outage would be cached as the real one.
  const items: FeedItem[] = await db.query.posts.findMany({
    where: and(isLive(posts), eq(posts.language, language)),
    orderBy: [desc(posts.publishedAt), desc(posts.id)],
    columns: {
      id: true, title: true, slug: true, excerpt: true, searchText: true,
      publishedAt: true, updatedAt: true, createdAt: true, language: true,
    },
    limit: 30,
  });

  // Most posts on the site have no excerpt, and an <item> with no
  // <description> shows readers (and the feed-driven aggregators) a bare
  // title. The body's first sentences stand in, cut at a word.
  const summary = (p: FeedItem): string => {
    const own = (p.excerpt ?? "").trim();
    if (own) return own;
    const text = (p.searchText ?? "").replace(/\s+/g, " ").trim();
    if (text.length <= 300) return text;
    const cut = text.slice(0, 300);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 200))}…`;
  };

  const itemsXml = items
    .map(
      (p) => `
    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${feedUrl(postUrl(p, settings, base))}</link>
      <guid isPermaLink="true">${feedUrl(postUrl(p, settings, base))}</guid>
      ${summary(p) ? `<description>${escapeXml(summary(p))}</description>` : ""}
      ${summary(p) ? `<content:encoded><![CDATA[<p>${escapeXml(summary(p)).replace(/]]>/g, "]]&gt;")}</p>]]></content:encoded>` : ""}
      ${p.publishedAt ? `<pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>` : ""}
    </item>`
    )
    .join("");

  // When the feed last changed: the newest publish or edit among its items.
  // Readers use it to decide whether to fetch at all.
  const lastBuilt = items.reduce<number>((max, p) => {
    for (const d of [p.updatedAt, p.publishedAt]) if (d) max = Math.max(max, new Date(d).getTime());
    return max;
  }, 0);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${feedUrl(absoluteUrlFor(base, (await postsPagePath(language, settings)) ?? rootPath(language, settings)))}</link>
    <description>${escapeXml(description)}</description>
    <language>${escapeXml(language)}</language>
    ${lastBuilt ? `<lastBuildDate>${new Date(lastBuilt).toUTCString()}</lastBuildDate>` : ""}
    <atom:link href="${base}${feedPath(language, settings)}" rel="self" type="application/rss+xml" />
    ${itemsXml}
  </channel>
</rss>`;
}

/**
 * Both feed.xml routes have a `.xml` extension, so they bypass
 * src/middleware.ts entirely and never get its page-cache header — this is
 * the only place that can tell LiteSpeed to keep a copy. Lifetime from
 * Speed → Cache → "Feeds and sitemaps".
 */
export async function feedHeaders(): Promise<Record<string, string>> {
  const ls = await feedCacheHeader();
  const seconds = ls.match(/max-age=(\d+)/)?.[1] ?? "0";
  return {
    "Content-Type": "application/rss+xml; charset=utf-8",
    "Cache-Control": `public, max-age=${seconds}, s-maxage=${seconds}`,
    [LS_CACHE]: ls,
  };
}
