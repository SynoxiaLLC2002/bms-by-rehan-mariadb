import type { HealthCheck } from "@/lib/siteHealthTypes";
import type { SiteSettings } from "@/lib/settings";
import { rawQuery } from "@/lib/db/raw";
import { readSeo } from "@/lib/seo";
import { contentLanguages, defaultContentLanguage, languageDir } from "@/lib/locale";
import { homepageId, postsPageId, categoryBaseRemoved } from "@/lib/permalinks";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The checks added once Site Health had a guide for every finding: the
 * things WordPress site owners look for first (homepage set? permalinks
 * sane? search hidden? keep-alive cron alive?) and the content problems
 * that decide rankings (thin posts, duplicate titles, pages without a
 * description). Each id has an entry in siteHealthGuides.ts.
 */
export async function extraHealthChecks(s: SiteSettings, dbReachable: boolean): Promise<HealthCheck[]> {
  const out: HealthCheck[] = [];
  const seo = readSeo(s);
  const languages = contentLanguages(s);
  const defaultLang = defaultContentLanguage(s);

  // ── Settings-only ────────────────────────────────────────────────────────
  const structure = s.permalink_structure || "post-name";
  out.push(
    structure === "post-name" || structure === "custom"
      ? { id: "permalinks", label: "Permalinks", status: "ok", detail: structure === "custom" ? `Custom: ${s.permalink_custom || ""}` : "Post name (/my-post) — the structure that reads and ranks best.", category: "seo" }
      : { id: "permalinks", label: "Permalinks", status: "info", detail: `${structure} — dates in the URL make every post look old. Post name is the usual choice.`, category: "seo" }
  );
  out.push(
    seo.seo_search_noindex !== "true"
      ? { id: "search-noindex", label: "Search results indexable", status: "warn", detail: "Search result pages can be indexed — thin, duplicate pages that dilute the site.", category: "seo" }
      : { id: "search-noindex", label: "Search results", status: "ok", detail: "Hidden from search engines.", category: "seo" }
  );
  out.push(
    seo.seo_fb_page?.trim()
      ? { id: "fb-page", label: "Facebook page", status: "ok", detail: "Set — emitted as article:publisher on posts.", category: "seo" }
      : { id: "fb-page", label: "Facebook page", status: "info", detail: "Not set. Facebook cannot tie shared posts to a page without article:publisher.", category: "seo" }
  );
  const robots = (seo.seo_robots_txt || "").split("\n").map((l) => l.trim().toLowerCase());
  out.push(
    robots.includes("disallow: /")
      ? { id: "robots-txt", label: "robots.txt", status: "fail", detail: "Contains 'Disallow: /' — every crawler is told to ignore the whole site.", category: "seo" }
      : { id: "robots-txt", label: "robots.txt", status: "ok", detail: "Allows crawling; the sitemap is advertised.", category: "seo" }
  );
  out.push({
    id: "category-base", label: "Category URLs", status: "ok",
    detail: categoryBaseRemoved(s) ? "/<category> — base removed." : "/category/<category>. The base can be removed, the way Rank Math offers.",
    category: "seo",
  });
  out.push({
    id: "paginated", label: "Paginated listings", status: "ok",
    detail: seo.seo_paginated_noindex === "true" ? "Page 2 onwards is noindex." : "Page 2 onwards is indexable (the usual, correct default).",
    category: "seo",
  });
  const dirChosen = s.site_direction ?? "auto";
  const dirNatural = languageDir(defaultLang);
  out.push(
    dirChosen !== "auto" && dirChosen !== dirNatural
      ? { id: "direction-mismatch", label: "Text direction", status: "warn", detail: `The default language (${defaultLang}) is written ${dirNatural.toUpperCase()} but the site is set to ${dirChosen.toUpperCase()}.`, category: "identity" }
      : { id: "direction-mismatch", label: "Text direction", status: "ok", detail: `${dirChosen === "auto" ? "Automatic" : dirChosen.toUpperCase()} for ${defaultLang}.`, category: "identity" }
  );
  out.push(
    (s.cache_litespeed ?? "true") !== "false"
      ? { id: "lscache", label: "Page cache", status: "ok", detail: "LiteSpeed page cache on; a save clears it.", category: "server" }
      : { id: "lscache", label: "Page cache", status: "info", detail: "LiteSpeed page cache is off — every visit renders the page in Node.", category: "server" }
  );
  out.push(
    s.cf_zone_id?.trim() && s.cf_api_token?.trim()
      ? { id: "cloudflare", label: "Cloudflare purge", status: "ok", detail: "Configured — a save also clears Cloudflare's edge cache.", category: "integrations" }
      : { id: "cloudflare", label: "Cloudflare purge", status: "info", detail: "Not configured. If the site is behind Cloudflare, published changes can sit in its edge cache after the origin has them.", category: "integrations" }
  );
  const lastRun = Date.parse(s.cron_last_publish_check || "");
  const ageMin = Number.isFinite(lastRun) ? Math.round((Date.now() - lastRun) / 60000) : null;
  out.push(
    ageMin === null
      ? { id: "keepalive", label: "Publish cron", status: "warn", detail: "Has never run. Scheduled posts will not go live and the daily clean-up will not happen.", category: "integrations" }
      : ageMin > 40
        ? { id: "keepalive", label: "Publish cron", status: "warn", detail: `Last ran ${ageMin < 120 ? `${ageMin} minutes` : `${Math.round(ageMin / 60)} hours`} ago — it should run every 15 minutes.`, category: "integrations" }
        : { id: "keepalive", label: "Publish cron", status: "ok", detail: `Ran ${ageMin} minute${ageMin === 1 ? "" : "s"} ago.`, category: "integrations" }
  );

  if (!dbReachable) return out;

  // ── Content ──────────────────────────────────────────────────────────────
  try {
    const [pc] = await rawQuery<{ live: number }>("SELECT COUNT(CASE WHEN status = 'published' AND deleted_at IS NULL THEN 1 END) AS live FROM posts");
    for (const code of languages) {
      const home = homepageId(code, s);
      const prefix = code === defaultLang ? "/" : `/${code}`;
      if (!home && pc.live === 0) {
        out.push({ id: "homepage", label: `Homepage (${code})`, status: "warn", detail: `No page is chosen for ${prefix} and there are no posts, so the front page is an empty list.`, category: "content" });
      } else if (!home) {
        out.push({ id: "homepage", label: `Homepage (${code})`, status: "info", detail: `${prefix} shows the latest posts. Choose a page to show a designed front page instead.`, category: "content" });
      }
      if (languages.length === 1) break;
    }
    if (!out.some((c) => c.id === "homepage")) out.push({ id: "homepage", label: "Homepage", status: "ok", detail: "A page is chosen for every language.", category: "content" });
    out.push(
      postsPageId(defaultLang, s)
        ? { id: "posts-page", label: "Posts page", status: "ok", detail: "A page lists the posts.", category: "content" }
        : { id: "posts-page", label: "Posts page", status: pc.live > 0 && homepageId(defaultLang, s) ? "info" : "ok", detail: pc.live > 0 && homepageId(defaultLang, s) ? "No listing page: posts are reachable only by direct link, category or search." : "None chosen — nothing to list yet, or the front page lists them.", category: "content" }
    );

    const [pg] = await rawQuery<{ live: number; nodesc: number; nofeat: number }>(
      `SELECT COUNT(CASE WHEN status = 'published' AND deleted_at IS NULL THEN 1 END) AS live,
              COUNT(CASE WHEN status = 'published' AND deleted_at IS NULL AND (seo_description IS NULL OR seo_description = '') THEN 1 END) AS nodesc,
              COUNT(CASE WHEN status = 'published' AND deleted_at IS NULL AND (featured_image IS NULL OR featured_image = '') AND (og_image IS NULL OR og_image = '') THEN 1 END) AS nofeat
       FROM pages`
    );
    out.push(
      pg.nodesc > 0
        ? { id: "page-descriptions", label: "Page descriptions", status: "warn", detail: `${plural(pg.nodesc, "published page")} ha${pg.nodesc === 1 ? "s" : "ve"} no meta description.`, category: "seo" }
        : { id: "page-descriptions", label: "Page descriptions", status: "ok", detail: pg.live ? "Every published page has one." : "No pages yet.", category: "seo" }
    );
    out.push(
      pg.nofeat > 0
        ? { id: "page-featured", label: "Page share images", status: "info", detail: `${plural(pg.nofeat, "published page")} ha${pg.nofeat === 1 ? "s" : "ve"} no featured or share image${seo.seo_og_default_image ? " (the default share image is used)" : ""}.`, category: "seo" }
        : { id: "page-featured", label: "Page share images", status: "ok", detail: pg.live ? "Every published page has one." : "No pages yet.", category: "seo" }
    );

    const [thin] = await rawQuery<{ n: number }>(
      "SELECT count(*) AS n FROM posts WHERE status = 'published' AND deleted_at IS NULL AND (CHAR_LENGTH(TRIM(REGEXP_REPLACE(coalesce(search_text, ''), '\\s+', ' '))) - CHAR_LENGTH(REPLACE(TRIM(REGEXP_REPLACE(coalesce(search_text, ''), '\\s+', ' ')), ' ', '')) + 1) < 300"
    );
    out.push(
      thin.n > 0
        ? { id: "thin-content", label: "Thin posts", status: "info", detail: `${plural(thin.n, "published post")} under 300 words.`, category: "seo" }
        : { id: "thin-content", label: "Post length", status: "ok", detail: pc.live ? "Every published post is over 300 words." : "Nothing published yet.", category: "seo" }
    );

    const [dup] = await rawQuery<{ n: number }>(
      `SELECT count(*) AS n FROM (
         SELECT t FROM (
           SELECT lower(title) t, language FROM posts WHERE status = 'published' AND deleted_at IS NULL
           UNION ALL SELECT lower(title), language FROM pages WHERE status = 'published' AND deleted_at IS NULL
         ) d GROUP BY t, language HAVING count(*) > 1
       ) dups`
    );
    out.push(
      dup.n > 0
        ? { id: "duplicate-titles", label: "Duplicate titles", status: "warn", detail: `${plural(dup.n, "title")} used by more than one published document.`, category: "seo" }
        : { id: "duplicate-titles", label: "Titles", status: "ok", detail: "No two published documents share a title.", category: "seo" }
    );

    const [dc] = await rawQuery<{ n: number }>(
      "SELECT count(*) AS n FROM posts p JOIN categories c ON c.id = p.category_id WHERE c.slug = 'uncategorized' AND p.status = 'published' AND p.deleted_at IS NULL"
    );
    out.push(
      dc.n > 0
        ? { id: "default-category", label: "Uncategorized posts", status: "info", detail: `${plural(dc.n, "published post")} still filed under Uncategorized.`, category: "content" }
        : { id: "default-category", label: "Uncategorized posts", status: "ok", detail: "None.", category: "content" }
    );

    const [ut] = await rawQuery<{ n: number; total: number }>(
      "SELECT count(*) AS total, COUNT(CASE WHEN NOT EXISTS (SELECT 1 FROM post_tags pt JOIN posts p ON p.id = pt.post_id WHERE pt.tag_id = t.id AND p.status = 'published' AND p.deleted_at IS NULL) THEN 1 END) AS n FROM tags t"
    ).catch(() => [{ n: 0, total: 0 }]);
    out.push(
      ut.n > 0
        ? { id: "unused-tags", label: "Unused tags", status: "info", detail: `${ut.n} of ${ut.total} tags have no published posts; each has an empty archive page.`, category: "content" }
        : { id: "unused-tags", label: "Tags", status: "ok", detail: ut.total ? `${plural(ut.total, "tag")}, all in use.` : "No tags yet.", category: "content" }
    );

    // A parameter, not text joined into the SQL: the values are the site's
    // own settings, but that is a habit worth keeping everywhere.
    const [str] = await rawQuery<{ n: number }>(
      `SELECT (SELECT count(*) FROM posts WHERE deleted_at IS NULL AND language NOT IN (?)) + (SELECT count(*) FROM pages WHERE deleted_at IS NULL AND language NOT IN (?)) AS n`,
      [languages, languages]
    );
    out.push(
      str.n > 0
        ? { id: "stranded-language", label: "Stranded documents", status: "warn", detail: `${plural(str.n, "document")} in a language the site no longer publishes — no public address.`, category: "content" }
        : { id: "stranded-language", label: "Document languages", status: "ok", detail: "Every document is in a published language.", category: "content" }
    );
  } catch {
    // A missing table on an older install must not take the report down.
  }

  return out;
}
