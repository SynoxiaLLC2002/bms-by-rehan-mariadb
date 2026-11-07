// What a document save has to refresh — and only that.
//
// Until 1.9.47 every post or page save did three things to the whole site:
// `revalidatePath("/", "layout")` emptied Next's cache of every page in every
// language; the middleware answered the same request with
// `X-LiteSpeed-Purge: *`; and the next visitor to each page paid a cold
// render — 15–20 sequential round trips to a database in another region.
// That happened on *every* save, and the editor autosaves drafts every 20
// seconds. A person writing a draft for an hour emptied the public site 180
// times, for a document nobody could see.
//
// Two rules replace that:
//
//   1. A save that changes nothing public refreshes nothing. A draft staying a
//      draft, a scheduled post not yet due: the visitor's site is exactly as
//      it was, so the caches are left alone. `publicChanged()` decides.
//   2. A save that does change something public refreshes the pages that show
//      it — the document, the home page, the listings and archives it appears
//      in, the sitemaps and feed — and no more. LiteSpeed gets a list of URLs
//      and tags instead of `*`; Cloudflare gets the same URLs; Next gets the
//      internal (language-prefixed) paths its cache is actually keyed by.
//
// What is deliberately *not* refreshed: other documents that mention this one
// in a related-posts or latest-posts block. They pick the change up at their
// hourly ISR revalidation, which is the same trade WordPress cache plugins
// make — purging every post because one title changed is the behaviour this
// file exists to end.
//
// Then the pages just cleared are fetched once (`warmPaths`), after the
// response has gone out, so the first real visitor finds them cached.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, users } from "@/lib/db/schema";
import { contentLanguages, defaultContentLanguage } from "@/lib/locale";
import { authorPath, categoryPath, feedPath, pagePath, postPath, rootPath, type PostLike } from "@/lib/permalinks";
import { postsPagePath } from "@/lib/postsPage";
import { isLiveNow } from "@/lib/publishState";
import type { SiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { LS_PURGE } from "@/lib/lscache";
import { on } from "@/lib/speed";
import { purgeCloudflareUrls } from "@/lib/cloudflarePurge";
import { warmPaths } from "@/lib/warmCache";
import { releaseRedirectFrom } from "@/lib/autoRedirect";

/** The three columns that decide whether a document is on the public site. */
export interface LiveState {
  status?: string | null;
  publishedAt?: Date | string | null;
  deletedAt?: Date | string | null;
}

/**
 * Whether a save moved anything a visitor can see: the document was live
 * before, or is live after. A draft edited into another draft is neither.
 */
export function publicChanged(before: LiveState | null | undefined, after: LiveState | null | undefined): boolean {
  const live = (s: LiveState | null | undefined) => !!s && isLiveNow(s.status, s.publishedAt, s.deletedAt);
  return live(before) || live(after);
}

/**
 * The path Next's cache is keyed by. The middleware rewrites the default
 * language's unprefixed public URL to `/<lang>/…`, so `revalidatePath("/about")`
 * matched nothing — the entry is `/ar/about`. Non-default languages are
 * already prefixed and pass through unchanged.
 */
export function internalPath(publicPath: string, settings: SiteSettings): string {
  const def = defaultContentLanguage(settings);
  const first = publicPath.split("/")[1] ?? "";
  if (first === def) return publicPath;
  // A configured non-default language keeps its prefix; anything else is the
  // default language written without one.
  if (first && contentLanguages(settings).includes(first)) return publicPath;
  return `/${def}${publicPath === "/" ? "" : publicPath}`;
}

/** The sitemap files, and both addresses of a language's feed. */
function fileRoutes(language: string, settings: SiteSettings): string[] {
  const out = ["/sitemap_index.xml", "/sitemap.xml", "/post-sitemap.xml", "/page-sitemap.xml", "/category-sitemap.xml", "/tag-sitemap.xml", "/author-sitemap.xml"];
  const feed = feedPath(language, settings);
  out.push(feed);
  if (feed !== "/feed.xml") out.push(`/${language}/feed.xml`);
  return out;
}

export type PostRow = PostLike & { categoryId?: number | null; authorId?: string | null };
export type PageRow = { id?: number; slug: string; language: string };

/**
 * The post's own address, with its category loaded when the row only
 * carries `categoryId`. Rows from `.returning()` or a column-picked query have
 * no `category`, and `postPath` then spells `%category%` as "uncategorised" —
 * the wrong URL to purge, and the wrong one to redirect from.
 */
export async function fullPostPath(post: PostRow, settings: SiteSettings): Promise<string> {
  if (post.category === undefined && post.categoryId && /%category%/.test(settings.permalink_custom || "")) {
    const cat = await db.query.categories.findFirst({ where: eq(categories.id, post.categoryId), columns: { slug: true, name: true } }).catch(() => null);
    return postPath({ ...post, category: cat ?? null }, settings);
  }
  return postPath(post, settings);
}

/**
 * Public paths a post appears on: itself, its language's home and posts page,
 * its category archive, its author's page. Slugs the caller already knows
 * (an old slug before a rename) are added by the caller.
 */
export async function postPublicPaths(post: PostRow, settings: SiteSettings): Promise<string[]> {
  const paths = new Set<string>([await fullPostPath(post, settings), rootPath(post.language, settings)]);
  const listing = await postsPagePath(post.language, settings).catch(() => null);
  if (listing) paths.add(listing);
  if (post.categoryId) {
    const cat = await db.query.categories.findFirst({ where: eq(categories.id, post.categoryId), columns: { slug: true, language: true } }).catch(() => null);
    if (cat) paths.add(categoryPath(cat.slug, cat.language || post.language, settings));
  }
  if (post.authorId) {
    const author = await db.query.users.findFirst({ where: eq(users.id, post.authorId), columns: { slug: true } }).catch(() => null);
    if (author?.slug) paths.add(authorPath(author.slug, post.language, settings));
  }
  return [...paths];
}

/** Public paths a page appears on: itself and its language's home (menus, footers). */
export function pagePublicPaths(page: PageRow, settings: SiteSettings): string[] {
  return [...new Set([pagePath(page, settings), rootPath(page.language, settings)])];
}

/**
 * The route patterns whose every instance is dropped on a document change:
 * listings shift by one when a post arrives or leaves, and the pages past the
 * first cannot be enumerated cheaply. Each is a handful of small pages.
 * Written with the route group, which is how Next tags them.
 */
const LISTING_ROUTES = [
  "/(site)/[lang]/page/[page]",
  "/(site)/[lang]/category/[slug]/page/[page]",
  "/(site)/[lang]/tag/[slug]",
  "/(site)/[lang]/tag/[slug]/page/[page]",
];

const MAX_URL_PURGE = 25;

export interface RefreshOptions {
  /** Which kind of document; a page changes no post listings. */
  kind: "post" | "page";
  language: string;
  /** Public paths (unprefixed for the default language), as the caller collected them. */
  paths: string[];
  settings: SiteSettings;
  /**
   * The response headers of the request that made the change. The LiteSpeed
   * purge is a response header, and this request went through LiteSpeed, so
   * it is the one place the purge can be said.
   */
  headers?: Headers;
}

/**
 * Refreshes every cache layer for a public change, then warms what it cleared.
 *
 *   • Next: the internal path of each URL, the listing patterns for a post,
 *     the sitemaps and the feed. `revalidatePath` is synchronous bookkeeping.
 *   • LiteSpeed: `X-LiteSpeed-Purge` with the public URLs plus the `home` and
 *     `archive` tags the middleware stamps on cached listings (`X-LiteSpeed-Tag`).
 *     Past ~25 URLs it falls back to `*` rather than send a header LiteSpeed
 *     might truncate. Governed by Speed → Cache → "Clear on every save".
 *   • Cloudflare, by URL, when a zone is configured (Speed → Cloudflare).
 *   • Warm-up of the HTML pages after the response — Speed → Preload.
 */
/**
 * A path that can go into an HTTP header.
 *
 * Header values are ByteStrings: `Headers.set` **throws** on any character
 * above U+00FF. Slugs keep the language they were written in (see
 * `toSlug`), so an Arabic, Hindi or Greek slug made this throw — and it threw
 * from `refreshPublic`, which runs *after* the database write has committed.
 * The result was the worst shape a failure can take:
 *
 *   • the row was already saved;
 *   • the editor showed "Failed to update post";
 *   • the cache purge, IndexNow ping and slug-change redirect were all skipped;
 *   • the editor never got the new `updatedAt`, so the *next* save hit the
 *     409 "changed somewhere else" guard and looked like a conflict.
 *
 * Trash, restore and the scheduled-publish cron take the same path. On a site
 * with non-Latin slugs every publish of those documents failed this way.
 *
 * Percent-encoding is also what LiteSpeed wants: its cache key is the encoded
 * URL, so the decoded form would not have matched even if the header had been
 * accepted. `encodeURI` leaves `/`, `?`, `&` and `#` alone, which is right —
 * these are paths, not single components.
 */
function headerSafePath(path: string): string {
  try {
    // Already-encoded paths must not be encoded twice: %D9 would become %25D9.
    return /%[0-9A-Fa-f]{2}/.test(path) ? path : encodeURI(path);
  } catch {
    // Lone surrogate or similar: drop it rather than throw away the whole save.
    return "";
  }
}

/**
 * The first few pages of each listing a new post appears on.
 *
 * `publicPaths` holds the post's own URL plus the archive roots it belongs to
 * (the language home, its category, its tags). Page 2 upwards of those never
 * reached Cloudflare, so a reader on `/page/2` saw a listing that predated the
 * post — and archives are exactly where an older post gets pushed to.
 *
 * Only listing roots are expanded; the post's own URL has no pages. Kept to
 * `PURGE_PAGES` because every URL costs against Cloudflare's daily purge
 * allowance.
 */
const PURGE_PAGES = 3;

function paginationPaths(publicPaths: string[]): string[] {
  const out: string[] = [];
  for (const p of publicPaths) {
    // A listing root: the language home, or an archive base. A document URL
    // is deeper and is not paginated.
    const isListing = p === "/" || /^\/[a-z-]{2,5}$/i.test(p) || /\/(category|tag|author)\//.test(p);
    if (!isListing) continue;
    const base = p === "/" ? "" : p.replace(/\/$/, "");
    for (let n = 2; n <= PURGE_PAGES + 1; n++) out.push(`${base}/page/${n}`);
  }
  return [...new Set(out)];
}

export function refreshPublic(opts: RefreshOptions): void {
  const { kind, language, settings, headers } = opts;
  const publicPaths = [...new Set(opts.paths)].filter(Boolean);
  const html = publicPaths.filter((p) => !p.endsWith(".xml"));

  for (const p of publicPaths) revalidatePath(internalPath(p, settings));
  for (const f of fileRoutes(language, settings)) revalidatePath(f);
  if (kind === "post") for (const r of LISTING_ROUTES) revalidatePath(r, "page");

  if (headers && on(settings.cache_purge_on_save ?? "true")) {
    // Tags the middleware stamps on cached listings (`X-LiteSpeed-Tag`): the
    // home page and every archive page, whatever their page numbers.
    const tags = kind === "post" ? ["tag=home", "tag=archive"] : ["tag=home"];
    headers.set(
      LS_PURGE,
      publicPaths.length > MAX_URL_PURGE
        ? "*"
        : [...tags, ...publicPaths.map(headerSafePath), ...fileRoutes(language, settings)].join(", ")
    );
  }

  // Everything below is network, and none of it may delay the save.
  after(async () => {
    const base = siteUrl(settings);
    if (settings.cf_purge_on_save !== "false") {
      // Paginated listings too. LiteSpeed is already covered, because the
      // purge header carries `tag=home` and `tag=archive` and the middleware
      // stamps those tags on every page of every listing. Cloudflare has no
      // tags on a non-Enterprise plan — it purges by exact URL — so `/page/2`
      // and `/category/x/page/2` were never cleared and kept serving a
      // listing without the new post until their TTL ran out.
      //
      // Bounded on purpose. Cloudflare caps purges at roughly a thousand a
      // day, and a publish already spends several; the first few pages are
      // where nearly all the traffic is, and the rest expire normally.
      const paginated = kind === "post" ? paginationPaths(publicPaths) : [];

      // Encoded for the same reason as the LiteSpeed header, minus the throw:
      // Cloudflare's cache key is the URL as it appeared on the wire, which is
      // percent-encoded. Purging the decoded form quietly matches nothing, so
      // an Arabic page stayed stale at the edge after every publish and the
      // purge reported success.
      await purgeCloudflareUrls(
        settings,
        [...publicPaths, ...paginated, ...fileRoutes(language, settings)]
          .map(headerSafePath)
          .filter(Boolean)
          .map((p) => `${base}${p === "/" ? "" : p}`)
      ).catch(() => undefined);
    }
    if (settings.warm_after_publish !== "false" && html.length) {
      // LiteSpeed acts on the purge header as the response passes through it;
      // the warm-up must reach it after that, or it re-caches the old copy.
      await new Promise((r) => setTimeout(r, 1500));
      await warmPaths(html, settings, 2).catch(() => undefined);
    }
  });
}

/**
 * A comment on this post or page changed what visitors see: refresh that one
 * document, nothing else.
 *
 * Comment moderation used to call revalidatePublicSite, which also emptied the
 * whole Cloudflare zone — every page and every optimised image — for one
 * approved comment. The origin then re-served every image as visitors came
 * back, the CPU surge behind earlier outages.
 */
export async function refreshCommentTarget(
  target: { postId?: number | null; pageId?: number | null },
  headers: Headers
): Promise<void> {
  const { posts, pages } = await import("@/lib/db/schema");
  const { getSiteSettings } = await import("@/lib/settings");
  const settings = await getSiteSettings();
  if (target.postId) {
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, target.postId),
      columns: { id: true, slug: true, language: true, status: true, publishedAt: true, createdAt: true, deletedAt: true, categoryId: true },
    });
    if (post && isLiveNow(post.status, post.publishedAt, post.deletedAt)) {
      refreshPublic({ kind: "page", language: post.language, paths: [await fullPostPath(post, settings)], settings, headers });
    }
  } else if (target.pageId) {
    const page = await db.query.pages.findFirst({
      where: eq(pages.id, target.pageId),
      columns: { id: true, slug: true, language: true, status: true, publishedAt: true, deletedAt: true },
    });
    if (page && isLiveNow(page.status, page.publishedAt, page.deletedAt)) {
      refreshPublic({ kind: "page", language: page.language, paths: [pagePath(page, settings)], settings, headers });
    }
  }
}

/**
 * The documents or terms in one translation group changed partners: every
 * live member's page shows a different language switcher and hreflang now.
 *
 * Linking and unlinking refreshed nothing. LiteSpeed was emptied by the
 * middleware net, but Next kept each page for up to an hour and Cloudflare
 * for up to a day, so a new translation stayed invisible. `ids` are the
 * members to refresh — the caller collects them (before an unlink, after a
 * link) so a member leaving the group is included.
 */
export async function refreshTranslationGroup(
  kind: "post" | "page" | "category" | "tag",
  ids: number[],
  headers: Headers
): Promise<void> {
  if (ids.length === 0) return;
  const { inArray } = await import("drizzle-orm");
  const { posts, pages, tags } = await import("@/lib/db/schema");
  const { getSiteSettings } = await import("@/lib/settings");
  const { tagPath } = await import("@/lib/permalinks");
  const settings = await getSiteSettings();
  const byLanguage = new Map<string, string[]>();
  const add = (language: string, path: string) => byLanguage.set(language, [...(byLanguage.get(language) ?? []), path]);

  if (kind === "post") {
    const rows = await db.query.posts.findMany({
      where: inArray(posts.id, ids),
      columns: { id: true, slug: true, language: true, status: true, publishedAt: true, createdAt: true, deletedAt: true, categoryId: true },
    });
    for (const r of rows) if (isLiveNow(r.status, r.publishedAt, r.deletedAt)) add(r.language, await fullPostPath(r, settings));
  } else if (kind === "page") {
    const rows = await db.query.pages.findMany({
      where: inArray(pages.id, ids),
      columns: { id: true, slug: true, language: true, status: true, publishedAt: true, deletedAt: true },
    });
    for (const r of rows) if (isLiveNow(r.status, r.publishedAt, r.deletedAt)) add(r.language, pagePath(r, settings));
  } else if (kind === "category") {
    const rows = await db.query.categories.findMany({ where: inArray(categories.id, ids), columns: { slug: true, language: true } });
    for (const r of rows) add(r.language, categoryPath(r.slug, r.language, settings));
  } else {
    const rows = await db.query.tags.findMany({ where: inArray(tags.id, ids), columns: { slug: true, language: true } });
    for (const r of rows) add(r.language, tagPath(r.slug, r.language, settings));
  }
  // One document's page per language: `page`, so no listing is refreshed
  // for it — a language switcher is not on the archives.
  for (const [language, paths] of byLanguage) refreshPublic({ kind: "page", language, paths, settings, headers });
}

/** What the post routes know about a post before and after a save. */
export type PostState = (PostRow & LiveState) | null | undefined;
export type PageState = (PageRow & LiveState) | null | undefined;

/**
 * Everything a post save owes the caches, decided from the row before and
 * after. Returns the public paths it touched (empty when nothing public
 * changed), so the caller can tell the search engines about the same ones.
 */
export async function refreshPost(before: PostState, after: PostState, settings: SiteSettings, headers: Headers): Promise<string[]> {
  // Published at an address an old redirect still claims: the redirect goes.
  // Only once it is live: a scheduled post keeps the old redirect working until
  // go-live, when the publish cron releases it (api/cron/publish).
  if (after && isLiveNow(after.status, after.publishedAt, after.deletedAt)) await releaseRedirectFrom(await fullPostPath(after, settings));
  if (!publicChanged(before, after)) return [];
  const paths = new Set<string>();
  const live = (s: PostState) => !!s && isLiveNow(s.status, s.publishedAt, s.deletedAt);
  if (live(before)) for (const p of await postPublicPaths(before!, settings)) paths.add(p);
  if (live(after)) for (const p of await postPublicPaths(after!, settings)) paths.add(p);
  // A post whose address moved — renamed, re-homed, or (under a dated or
  // %category% structure) re-dated or re-filed: the old one must stop answering.
  if (before && after) {
    const was = await fullPostPath(before, settings);
    if (was !== (await fullPostPath(after, settings))) paths.add(was);
  }
  const language = (after ?? before)!.language;
  refreshPublic({ kind: "post", language, paths: [...paths], settings, headers });
  return [...paths];
}

/** The page counterpart of `refreshPost`. */
export function refreshPage(before: PageState, after: PageState, settings: SiteSettings, headers: Headers): string[] {
  // As in refreshPost. Not awaited: this function is synchronous for its callers.
  if (after && isLiveNow(after.status, after.publishedAt, after.deletedAt)) void releaseRedirectFrom(pagePath(after, settings));
  if (!publicChanged(before, after)) return [];
  const paths = new Set<string>();
  const live = (s: PageState) => !!s && isLiveNow(s.status, s.publishedAt, s.deletedAt);
  if (live(before)) for (const p of pagePublicPaths(before!, settings)) paths.add(p);
  if (live(after)) for (const p of pagePublicPaths(after!, settings)) paths.add(p);
  if (before && after && (before.slug !== after.slug || before.language !== after.language)) paths.add(pagePath(before, settings));
  const language = (after ?? before)!.language;
  refreshPublic({ kind: "page", language, paths: [...paths], settings, headers });
  return [...paths];
}
