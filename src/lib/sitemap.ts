// The XML sitemap, split the way Rank Math splits it.
//
//   /sitemap_index.xml     → post-sitemap.xml, page-sitemap.xml,
//                            category-sitemap.xml, author-sitemap.xml
//
// One flat `/sitemap.xml` listed everything together. That works, but the
// split index is what every WordPress site an owner has ever looked at
// produces, and Search Console reports per child sitemap — "pages: 12
// indexed, posts: 3 discovered" — which a single file cannot give. Each file
// also references `main-sitemap.xsl`, so a browser shows a readable table
// instead of raw XML.
//
// `/sitemap.xml` still answers — with a 301 to /sitemap_index.xml, so there is
// one official address — because it is what robots.txt once advertised, what
// Search Console may already hold, and what the keep-alive cron requests.

import { db } from "@/lib/db";
import { schemaUrl } from "@/lib/seoMeta";
import { siteUrl } from "@/lib/siteUrl";
import type { SiteSettings } from "@/lib/settings";
import { rollUpCategoryStats } from "@/lib/categoryRollup";
import { liveLanguageRoots } from "@/lib/liveLanguages";
import { absoluteUrlFor, postUrl, pagePath, rootPath, categoryPath, tagPath, authorPath } from "@/lib/permalinks";
import { contentLanguages } from "@/lib/locale";
import { posts, pages, postTags, tags, users } from "@/lib/db/schema";
import { isLive } from "@/lib/publishState";
import { and, count, desc, eq, max } from "drizzle-orm";
import { LS_CACHE, feedCacheHeader } from "@/lib/lscache";

export const SITEMAP_KINDS = ["post", "page", "category", "tag", "author"] as const;
export type SitemapKind = (typeof SITEMAP_KINDS)[number];

/** Lifetime from Speed → Cache → "Feeds and sitemaps". */
export async function sitemapHeaders(): Promise<Record<string, string>> {
  const ls = await feedCacheHeader();
  return {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": `public, max-age=${ls.match(/max-age=(\d+)/)?.[1] ?? "0"}`,
    [LS_CACHE]: ls,
    // The stylesheet only styles; a bot ignoring it loses nothing.
    "X-Robots-Tag": "noindex",
  };
}

export interface SitemapUrl {
  loc: string;
  lastmod?: Date | null;
  images?: string[];
}

const on = (settings: SiteSettings, seoKey: string, oldKey: string) =>
  (settings[seoKey] ?? settings[oldKey] ?? "true") !== "false";

export const sitemapEnabled = (s: SiteSettings) => on(s, "seo_sitemap_enabled", "sitemap_enabled");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * A URL as a `<loc>` is allowed to contain it.
 *
 * Two different escapes are needed and only the XML one was being applied. The
 * sitemap protocol requires the URL itself to be percent-encoded, so an Arabic
 * slug was going out raw:
 *
 *     <loc>https://example.net/category/مدونة</loc>
 *
 * The page's own canonical link is percent-encoded (it goes through
 * `schemaUrl`), so the sitemap and the canonical were naming the same page with
 * two different strings — the one thing a sitemap exists to avoid.
 *
 * Order matters: percent-encode first, then XML-escape, or the `%` sequences
 * and a query string's `&` end up escaped in the wrong order. `schemaUrl`
 * decodes before encoding, so a URL that is already encoded is left alone.
 */
const locValue = (url: string) => esc(schemaUrl(url));

/**
 * Whether a document names another URL as its canonical. Its own page then
 * says "index that one instead", and listing it here contradicts that —
 * Search Console files it under "Alternate page with proper canonical tag".
 */
function canonicalElsewhere(canonical: string | null | undefined, own: string, base: string): boolean {
  const c = (canonical ?? "").trim();
  if (!c) return false;
  const abs = c.startsWith("http") ? c : absoluteUrlFor(base, c.startsWith("/") ? c : `/${c}`);
  const norm = (u: string) => schemaUrl(u).replace(/\/+$/, "");
  return norm(abs) !== norm(own);
}

const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : undefined);

/** The newest change per language, so the roots and archives carry a truthful `lastmod`. */
async function newestPerLanguage(): Promise<Map<string, Date>> {
  const newest = new Map<string, Date>();
  try {
    const latest = await db.query.posts.findMany({
      where: isLive(posts),
      columns: { language: true, updatedAt: true, publishedAt: true },
      orderBy: [desc(posts.updatedAt)],
      limit: 200,
    });
    for (const p of latest) {
      const when = p.updatedAt ?? p.publishedAt;
      if (!when) continue;
      const seen = newest.get(p.language);
      if (!seen || when > seen) newest.set(p.language, when);
    }
  } catch {
    // Dates are an optimisation; the entries stand without them.
  }
  return newest;
}

/**
 * Live-post count and newest change per term, in one GROUP BY.
 *
 * A term absent from the map has no live posts and no archive worth listing.
 * `max()` is mapped through the column, so the date comes back as a Date on
 * both drivers.
 */
async function termStats(kind: "category" | "tag"): Promise<Map<number, { n: number; newest: Date | null }>> {
  const out = new Map<number, { n: number; newest: Date | null }>();
  const newest = max(posts.updatedAt);
  const rows =
    kind === "category"
      ? await db
          .select({ id: posts.categoryId, n: count(), newest })
          .from(posts)
          .where(isLive(posts))
          .groupBy(posts.categoryId)
      : await db
          .select({ id: postTags.tagId, n: count(), newest })
          .from(postTags)
          .innerJoin(posts, eq(posts.id, postTags.postId))
          .where(isLive(posts))
          .groupBy(postTags.tagId);
  for (const r of rows) {
    if (r.id == null || !r.n) continue;
    out.set(r.id, { n: Number(r.n), newest: r.newest ? new Date(r.newest) : null });
  }
  return out;
}

/**
 * The URLs of one child sitemap. Empty when that kind is switched off, marked
 * noindex site-wide, or simply has nothing — the index omits empty children,
 * the same as Rank Math.
 */
/**
 * URLs per child file. Google rejects a sitemap past 50,000 URLs (or 50 MB);
 * 10,000 keeps each file well inside both and quick to generate.
 */
export const MAX_PER_SITEMAP = 10_000;

/**
 * Recent answers, per kind.
 *
 * The index needs every kind's URLs to date and count them, so each uncached
 * request for it ran every child's full query. A crawler fetching the index
 * and then each child ran them all twice. Five minutes is short enough that a
 * new post appears promptly and long enough to absorb that burst; the key
 * includes the settings, so a sitemap setting change takes effect at once.
 */
const URL_CACHE_MS = 5 * 60_000;
const urlCache = new Map<string, { at: number; urls: Promise<SitemapUrl[]> }>();

export async function sitemapUrls(kind: SitemapKind, settings: SiteSettings): Promise<SitemapUrl[]> {
  const key = `${kind}|${JSON.stringify(settings)}`;
  const hit = urlCache.get(key);
  if (hit && Date.now() - hit.at < URL_CACHE_MS) return hit.urls;
  // Only the newest settings' entries are worth keeping.
  for (const k of urlCache.keys()) if (k.startsWith(`${kind}|`)) urlCache.delete(k);
  const urls = buildSitemapUrls(kind, settings);
  urlCache.set(key, { at: Date.now(), urls });
  return urls;
}

/** Where part `n` of a kind's sitemap lives. Part 1 keeps the classic name. */
export function sitemapPartPath(kind: SitemapKind, n: number): string {
  return n <= 1 ? `/${kind}-sitemap.xml` : `/sitemap-part/${kind}/${n}.xml`;
}

/** The same list, always built fresh — for the cache warmer, which runs right after a publish. */
export async function buildSitemapUrls(kind: SitemapKind, settings: SiteSettings): Promise<SitemapUrl[]> {
  const base = siteUrl(settings);
  const out: SitemapUrl[] = [];
  if (!sitemapEnabled(settings)) return out;

  // No catch: during an outage an empty sitemap would tell Google there are no
  // URLs, and the caches would keep it. The error becomes a 500, which
  // nothing caches (server.js). The inner catches cover unmigrated columns.
  switch (kind) {
    case "post": {
      if (!on(settings, "seo_sitemap_posts", "sitemap_include_posts")) break;
      if ((settings.seo_post_noindex ?? "false") === "true") break;
      const includeImages = on(settings, "seo_sitemap_images", "sitemap_include_images");
      const rows = await db.query.posts.findMany({
        where: isLive(posts),
        columns: { id: true, slug: true, updatedAt: true, publishedAt: true, createdAt: true, noIndex: true, language: true, featuredImage: true, ogImage: true, canonicalUrl: true },
        orderBy: [desc(posts.publishedAt), desc(posts.id)],
      });
      for (const p of rows) {
        if (p.noIndex || canonicalElsewhere(p.canonicalUrl, postUrl(p, settings, base), base)) continue;
        // Absolute: a sitemap is read with no page to resolve against.
        const img = p.featuredImage || p.ogImage || "";
        const imageUrl = img.startsWith("http") ? img : img ? `${base}${img}` : "";
        out.push({
          loc: postUrl(p, settings, base),
          lastmod: p.updatedAt ?? p.publishedAt,
          ...(includeImages && imageUrl ? { images: [imageUrl] } : {}),
        });
      }
      break;
    }

    case "page": {
      if (!on(settings, "seo_sitemap_pages", "sitemap_include_pages")) break;
      if ((settings.seo_page_noindex ?? "false") === "true") break;
      const includeImages = on(settings, "seo_sitemap_images", "sitemap_include_images");
      // Every language root first — a homepage answers there, not at its slug.
      const newest = await newestPerLanguage();
      const rows = await db.query.pages.findMany({
        where: isLive(pages),
        columns: { id: true, slug: true, updatedAt: true, publishedAt: true, noIndex: true, language: true, canonicalUrl: true, featuredImage: true, ogImage: true },
        orderBy: [desc(pages.updatedAt)],
      });
      const roots = new Set<string>();
      // Only roots with something live on them (lib/liveLanguages).
      const liveRoots = await liveLanguageRoots(settings);
      for (const code of contentLanguages(settings)) {
        if (!liveRoots.has(code)) continue;
        // The default language's root is the bare origin — the one spelling
        // the page itself uses (see absoluteUrlFor).
        const root = absoluteUrlFor(base, rootPath(code, settings));
        roots.add(root);
        out.push({ loc: root, lastmod: newest.get(code) });
      }
      for (const pg of rows) {
        const loc = absoluteUrlFor(base, pagePath(pg, settings));
        if (pg.noIndex || canonicalElsewhere(pg.canonicalUrl, loc, base)) continue;
        // Pages too, not only posts: without it every page row read "0 images".
        const img = pg.featuredImage || pg.ogImage || "";
        const imageUrl = img.startsWith("http") ? img : img ? `${base}${img}` : "";
        const images = includeImages && imageUrl ? { images: [imageUrl] } : {};
        // A homepage's path is its language root, already listed above —
        // its own date is the truer one, so it replaces the archive-derived
        // guess rather than appearing twice.
        const root = [...roots].find((r) => r === loc || r === `${loc}/`);
        if (root) {
          const entry = out.find((e) => e.loc === root);
          if (entry) Object.assign(entry, { lastmod: pg.updatedAt ?? pg.publishedAt ?? entry.lastmod }, images);
          continue;
        }
        out.push({ loc, lastmod: pg.updatedAt ?? pg.publishedAt, ...images });
      }
      break;
    }

    case "category": {
      if (!on(settings, "seo_sitemap_categories", "sitemap_include_categories")) break;
      if ((settings.seo_category_noindex ?? "false") === "true") break;
      // A term belongs to one language, so its archive exists under that
      // language only.
      //
      // Three things used to be ignored here, and each put a URL in the
      // sitemap that the page itself contradicts:
      //   • the term's own "No index" flag — the archive said `noindex` while
      //     the sitemap asked for it to be indexed ("Submitted URL marked
      //     noindex" in Search Console);
      //   • an empty term — a listing of nothing, submitted as a page;
      //   • the date — no `lastmod`, so a crawler could not tell a category
      //     that changed yesterday from one untouched for a year.
      const [cats, stats] = await Promise.all([
        db.query.categories.findMany({ columns: { id: true, slug: true, language: true, noIndex: true, parentId: true } }),
        termStats("category"),
      ]);
      // A parent's archive lists its children's posts, so it is not empty
      // when they are all filed one level down (see lib/categoryRollup).
      const rolled = rollUpCategoryStats(stats, new Map(cats.map((c) => [c.id, c.parentId])));
      for (const c of cats) {
        if (c.noIndex) continue;
        const s = rolled.get(c.id);
        if (!s) continue;
        out.push({ loc: `${base}${categoryPath(c.slug, c.language, settings)}`, lastmod: s.newest });
      }
      break;
    }

    case "tag": {
      if (!on(settings, "seo_sitemap_tags", "sitemap_include_tags")) break;
      // The site-wide "No index" for tag archives, which the category case
      // has honoured all along and this one never checked.
      if ((settings.seo_tag_noindex ?? "false") === "true") break;
      const [rows, stats] = await Promise.all([
        db.select({ id: tags.id, slug: tags.slug, language: tags.language }).from(tags),
        termStats("tag"),
      ]);
      for (const t of rows) {
        const s = stats.get(t.id);
        if (!s) continue;
        out.push({ loc: `${base}${tagPath(t.slug, t.language, settings)}`, lastmod: s.newest });
      }
      break;
    }

    case "author": {
      // One entry per author per language they have published in; the
      // archive 404s otherwise. Opted-out and noindex profiles never appear.
      try {
        const authored = await db
          .selectDistinct({ slug: users.slug, language: posts.language })
          .from(posts)
          .innerJoin(users, eq(users.id, posts.authorId))
          .where(and(isLive(posts), eq(users.publicProfile, true), eq(users.noIndex, false)));
        for (const a of authored) {
          if (a.slug) out.push({ loc: `${base}${authorPath(a.slug, a.language, settings)}` });
        }
      } catch {
        // Profile columns not migrated yet.
      }
      break;
    }
  }
  return out;
}

// Relative on purpose: a browser only applies a same-origin stylesheet, and
// the absolute site URL is a setting that can lag behind the real address
// (staging, a preview port, the day before DNS moves). Relative can never miss.
const STYLESHEET = (_base: string) => `<?xml-stylesheet type="text/xsl" href="/main-sitemap.xsl"?>`;

/** A child sitemap as XML. */
export function renderUrlset(urls: SitemapUrl[], base: string): string {
  const hasImages = urls.some((u) => u.images?.length);
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    STYLESHEET(base),
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${hasImages ? ` xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"` : ""}>`,
  ];
  for (const u of urls) {
    lines.push(`<url><loc>${locValue(u.loc)}</loc>`);
    const mod = iso(u.lastmod);
    if (mod) lines.push(`<lastmod>${mod}</lastmod>`);
    for (const img of u.images ?? []) lines.push(`<image:image><image:loc>${locValue(img)}</image:loc></image:image>`);
    lines.push(`</url>`);
  }
  lines.push(`</urlset>`);
  return lines.join("\n");
}

/**
 * The index. Each child is listed with the newest date it contains, and a
 * child with nothing in it is left out — an index entry that opens to an
 * empty file reads as a broken site.
 */
export async function renderIndex(settings: SiteSettings): Promise<string> {
  const base = siteUrl(settings);
  const lines = [`<?xml version="1.0" encoding="UTF-8"?>`, STYLESHEET(base), `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`];
  if (sitemapEnabled(settings)) {
    for (const kind of SITEMAP_KINDS) {
      const urls = await sitemapUrls(kind, settings);
      if (urls.length === 0) continue;
      // One entry per part, each dated by the newest URL it holds.
      for (let part = 1; (part - 1) * MAX_PER_SITEMAP < urls.length; part++) {
        let newest: Date | null = null;
        for (const u of urls.slice((part - 1) * MAX_PER_SITEMAP, part * MAX_PER_SITEMAP)) {
          if (u.lastmod && (!newest || u.lastmod > newest)) newest = new Date(u.lastmod);
        }
        lines.push(`<sitemap><loc>${locValue(`${base}${sitemapPartPath(kind, part)}`)}</loc>${newest ? `<lastmod>${newest.toISOString()}</lastmod>` : ""}</sitemap>`);
      }
    }
  }
  lines.push(`</sitemapindex>`);
  return lines.join("\n");
}

/** Response for one child sitemap route. */
export async function childSitemapResponse(kind: SitemapKind, settings: SiteSettings, part = 1): Promise<Response> {
  const urls = await sitemapUrls(kind, settings);
  const slice = urls.slice((part - 1) * MAX_PER_SITEMAP, part * MAX_PER_SITEMAP);
  // Part 1 always answers (an empty urlset is valid); a later part that does
  // not exist is a 404, not an empty file that looks like a broken site.
  if (part > 1 && slice.length === 0) return new Response("Not found", { status: 404 });
  return new Response(renderUrlset(slice, siteUrl(settings)), { headers: await sitemapHeaders() });
}

/**
 * The stylesheet that turns any of the files above into a readable page: a
 * heading band, one line saying what the file is, and a table of URL /
 * images / last modified. Served from its own route so it is same-origin,
 * which is the one thing a browser requires of an XSL reference.
 */
export function renderStylesheet(siteName: string): string {
  const name = esc(siteName || "This site");
  return `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
<xsl:output method="html" encoding="UTF-8" indent="yes"/>
<xsl:template match="/">
<html>
<head>
<title>XML Sitemap — ${name}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
body{margin:0;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#333;background:#fff}
.band{background:#4275f4;color:#fff;padding:22px 24px 26px}
.band h1{margin:0 0 14px;font-size:22px;font-weight:600}
.band p{margin:0 0 6px;font-size:13px;opacity:.95}
.band a{color:#fff}
.wrap{max-width:1100px;margin:0 auto;padding:24px 16px}
.count{margin:0 0 12px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#4275f4;color:#fff;text-align:left;padding:10px 8px;font-weight:600}
td{padding:8px;border-bottom:1px solid #e9e9e9;vertical-align:top}
tr:nth-child(even) td{background:#f7f7f7}
td a{color:#3b5bdb;text-decoration:none;word-break:break-all}
td a:hover{text-decoration:underline}
.num{width:70px;text-align:center}
.date{width:190px;white-space:nowrap}
</style>
</head>
<body>
<div class="band">
<h1>XML Sitemap</h1>
<p>This XML sitemap is generated by ${name}. Search engines such as Google use it to index and re-index the posts, pages and archives on the site.</p>
<p>Learn more about <a href="https://www.sitemaps.org/">XML sitemaps</a>.</p>
</div>
<div class="wrap">
<xsl:choose>
<xsl:when test="sitemap:sitemapindex">
<p class="count">This XML sitemap index contains <strong><xsl:value-of select="count(sitemap:sitemapindex/sitemap:sitemap)"/></strong> sitemaps.</p>
<table>
<thead><tr><th>Sitemap</th><th class="date">Last modified</th></tr></thead>
<tbody>
<xsl:for-each select="sitemap:sitemapindex/sitemap:sitemap">
<tr>
<td><a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a></td>
<td class="date"><xsl:if test="sitemap:lastmod"><xsl:value-of select="concat(substring(sitemap:lastmod,1,10),' ',substring(sitemap:lastmod,12,5),' +00:00')"/></xsl:if></td>
</tr>
</xsl:for-each>
</tbody>
</table>
</xsl:when>
<xsl:otherwise>
<p class="count">This XML sitemap contains <strong><xsl:value-of select="count(sitemap:urlset/sitemap:url)"/></strong> URLs.</p>
<table>
<thead><tr><th>URL</th><th class="num">Images</th><th class="date">Last modified</th></tr></thead>
<tbody>
<xsl:for-each select="sitemap:urlset/sitemap:url">
<tr>
<td><a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a></td>
<td class="num"><xsl:value-of select="count(image:image)"/></td>
<td class="date"><xsl:if test="sitemap:lastmod"><xsl:value-of select="concat(substring(sitemap:lastmod,1,10),' ',substring(sitemap:lastmod,12,5),' +00:00')"/></xsl:if></td>
</tr>
</xsl:for-each>
</tbody>
</table>
</xsl:otherwise>
</xsl:choose>
</div>
</body>
</html>
</xsl:template>
</xsl:stylesheet>`;
}
