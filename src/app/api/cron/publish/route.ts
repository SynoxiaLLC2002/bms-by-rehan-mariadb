import { NextRequest, NextResponse } from "next/server";
import { cleanupIfDue } from "@/lib/maintenance";
import { refreshPublic } from "@/lib/publishCache";
import { postsPagePath } from "@/lib/postsPage";
import { cronSecret, presentedToken, secretMatches } from "@/lib/secretCompare";
import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, pages, posts } from "@/lib/db/schema";
import { rawQuery } from "@/lib/db/raw";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { categoryPath, feedPath, pagePath, postPath, rootPath } from "@/lib/permalinks";
import { pingIndexNow } from "@/lib/indexnow";
import { crawlBatch } from "@/lib/warmCache";
import { conditionBoundaries } from "@/lib/conditions";
import { siteTimeZone } from "@/lib/locale";
import { revalidatePublicSite } from "@/lib/revalidateSite";
import { purgeAll } from "@/lib/lscache";
import { releaseRedirectFrom } from "@/lib/autoRedirect";

/**
 * Makes scheduled posts appear on time.
 *
 * A post scheduled for 09:00 is published in the database at 09:00 — but
 * the pages that would show it (home, blog, its category, the sitemap) were
 * rendered earlier and are cached for up to an hour, so it surfaced whenever
 * the cache happened to expire. This endpoint, hit by a cron every few
 * minutes, finds anything that has gone live since the last run and refreshes
 * exactly those pages, then tells IndexNow.
 *
 * It replaces the keep-alive cron: hitting it warms the app and the database
 * the same way, and does useful work. cPanel → Cron Jobs → every 15 minutes
 * (not every 3: each run wakes the database, and on Neon that never let it
 * sleep — INCIDENT-2026-10-21.md):
 *
 *     curl -s "https://example.com/api/cron/publish?token=…" >/dev/null
 *
 * Protected by CRON_TOKEN (BACKUP_TOKEN is accepted too, so one secret can
 * serve both crons). Without a token configured the route does nothing.
 */
const LAST_RUN = "cron_last_publish_check";

export async function GET(req: NextRequest) {
  const expected = cronSecret();
  const given = presentedToken(req);
  if (!secretMatches(expected, given)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const settings = await getSiteSettings();
    const now = new Date();
    const lastRows = await rawQuery<{ value: string }>("SELECT value FROM site_settings WHERE `key` = ?", [LAST_RUN]);
    const lastRaw = lastRows[0]?.value;
    // First run, or a gap: look back a day so nothing scheduled is missed.
    const since = lastRaw && !Number.isNaN(Date.parse(lastRaw)) ? new Date(lastRaw) : new Date(now.getTime() - 24 * 3600 * 1000);

    const wentLive = await db.query.posts.findMany({
      where: and(eq(posts.status, "published"), isNull(posts.deletedAt), gt(posts.publishedAt, since), lte(posts.publishedAt, now)),
      columns: { id: true, slug: true, language: true, publishedAt: true, createdAt: true, categoryId: true },
    });
    const pagesLive = await db.query.pages.findMany({
      where: and(eq(pages.status, "published"), isNull(pages.deletedAt), gt(pages.publishedAt, since), lte(pages.publishedAt, now)),
      columns: { id: true, slug: true, language: true },
    });

    // One query for every category involved, not one per post: a batch of
    // scheduled posts usually shares a handful of categories, so the loop was
    // asking for the same row over and over.
    const catIds = [...new Set(wentLive.map((p) => p.categoryId).filter((id): id is number => id != null))];
    const cats = catIds.length
      ? await db.query.categories.findMany({
          where: inArray(categories.id, catIds),
          columns: { id: true, slug: true, language: true },
        })
      : [];
    const catById = new Map(cats.map((c) => [c.id, c]));

    const paths = new Set<string>();
    const languages = new Set<string>();
    for (const p of wentLive) {
      const cat = p.categoryId != null ? catById.get(p.categoryId) : undefined;
      // With its category, or a %category% structure is spelled "uncategorised".
      const own = postPath({ ...p, category: cat ?? null }, settings);
      paths.add(own);
      // A scheduled post takes its address now, not when it was saved (see
      // refreshPost): an old redirect from here stops only at go-live.
      await releaseRedirectFrom(own);
      paths.add(rootPath(p.language, settings));
      languages.add(p.language);
      const listing = await postsPagePath(p.language, settings).catch(() => null);
      if (listing) paths.add(listing);
      if (cat) paths.add(categoryPath(cat.slug, cat.language, settings));
    }
    for (const pg of pagesLive) {
      await releaseRedirectFrom(pagePath(pg, settings));
      paths.add(pagePath(pg, settings));
      paths.add(rootPath(pg.language, settings));
      languages.add(pg.language);
    }

    // Blocks with a date rule ("on or after", "before") whose moment passed
    // since the last run: their page changes now, not when its cache expires.
    const tz = siteTimeZone(settings);
    const crossed = (json: string | null) =>
      !!json && conditionBoundaries(json, tz).some((at) => at > since.getTime() && at <= now.getTime());
    let everywhere = false;
    try {
      const pattern = "%after%";
      const [ruledPosts, ruledPages, ruledElements] = await Promise.all([
        rawQuery<{ id: number; slug: string; language: string; published_at: string | null; created_at: string | null; c: string }>(
          `SELECT id, slug, language, published_at, created_at, content AS c FROM posts
           WHERE status = 'published' AND deleted_at IS NULL AND (content LIKE ? OR content LIKE '%before%')`,
          [pattern]
        ),
        rawQuery<{ id: number; slug: string; language: string; c: string }>(
          `SELECT id, slug, language, content AS c FROM pages
           WHERE status = 'published' AND deleted_at IS NULL AND (content LIKE ? OR content LIKE '%before%')`,
          [pattern]
        ),
        rawQuery<{ c: string }>(
          `SELECT content AS c FROM elements WHERE status = 'published' AND (content LIKE ? OR content LIKE '%before%')`,
          [pattern]
        ),
      ]);
      for (const p of ruledPosts) {
        if (!crossed(p.c)) continue;
        paths.add(postPath({ id: p.id, slug: p.slug, language: p.language, publishedAt: p.published_at ? new Date(p.published_at) : null, createdAt: p.created_at ? new Date(p.created_at) : null }, settings));
        languages.add(p.language);
      }
      for (const pg of ruledPages) {
        if (!crossed(pg.c)) continue;
        paths.add(pagePath({ id: pg.id, slug: pg.slug, language: pg.language }, settings));
        paths.add(rootPath(pg.language, settings));
        languages.add(pg.language);
      }
      // An Element is on every page it targets — refresh the lot.
      everywhere = ruledElements.some((e) => crossed(e.c));
    } catch {
      // Date rules are a refinement; the cron's main job must still run.
    }

    // Something went live: the home page, its archives, the sitemaps and the
    // document itself are stale in Next, LiteSpeed and Cloudflare. The same
    // targeted refresh a publish from the editor does (lib/publishCache.ts):
    // those URLs, not the whole site. The cron runs without a session, so the
    // LiteSpeed purge has to travel on this response — LiteSpeed acts on the
    // header as it passes, and the warm-up is queued behind it.
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (paths.size > 0) {
      for (const language of languages) paths.add(feedPath(language, settings));
      const language = [...languages][0] ?? "en";
      refreshPublic({ kind: wentLive.length ? "post" : "page", language, paths: [...paths], settings, headers });
      void pingIndexNow(siteUrl(settings), [...paths].filter((p) => !p.endsWith(".xml")), settings);
    }
    // After the targeted refresh, so the whole-site purge is the one that stands.
    if (everywhere) {
      revalidatePublicSite();
      purgeAll(headers);
    }

    await rawQuery(
      `INSERT INTO site_settings (\`key\`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [LAST_RUN, now.toISOString()]
    );

    // Housekeeping rides along once a day: old trash, stale logs, dead sessions.
    const cleaned = await cleanupIfDue().catch(() => null);

    // Speed → Preload: one batch of the site-wide crawl per run.
    const crawl = await crawlBatch(settings).catch(() => null);

    return NextResponse.json(
      {
        ok: true,
        since: since.toISOString(),
        posts: wentLive.length,
        pages: pagesLive.length,
        refreshed: [...paths],
        cleaned: cleaned?.total ?? null,
        warmed: paths.size > 0 && settings.warm_after_publish !== "false" ? "queued" : null,
        crawl: crawl && !crawl.skipped ? { fetched: crawl.fetched, failed: crawl.failed.length, cursor: crawl.cursor, total: crawl.total } : crawl?.skipped ?? null,
      },
      { headers }
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Cron failed." }, { status: 500 });
  }
}
