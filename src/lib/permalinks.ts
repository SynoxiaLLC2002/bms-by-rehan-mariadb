// Where a post lives.
//
// The Permalink Settings screen has offered five structures since it was built,
// and nothing read the setting: every post URL in the app was a hardcoded
// `/blog/${slug}` in twenty-odd places. Picking "Post name" changed nothing,
// which is the worst kind of control — one that looks like it worked.
//
// One builder now answers "what is this post's URL", and one parser answers
// "what post is this URL", so the two can never disagree. Everything that
// links to a post — the archive, the sitemap, the feed, related posts, the
// editor's View button — goes through `postPath`.

import type { SiteSettings } from "./settings";
import { defaultContentLanguage, isContentLanguage } from "./locale";

export interface PermalinkStructure {
  id: string;
  label: string;
  /** Shown in the settings picker; `null` when the author writes their own. */
  example: string | null;
  description: string;
}

/**
 * The structures on offer, shared with the settings screen so the list it
 * renders and the list the site honours cannot drift apart.
 */
export const PERMALINK_STRUCTURES: PermalinkStructure[] = [
  {
    id: "post-name",
    label: "Post name",
    example: "/sample-post/",
    description: "Simple and clean. Recommended for most sites.",
  },
  {
    id: "date-name",
    label: "Day and name",
    example: "/2025/06/15/sample-post/",
    description: "Includes the full date in the URL.",
  },
  {
    id: "month-name",
    label: "Month and name",
    example: "/2025/06/sample-post/",
    description: "Includes year and month in the URL.",
  },
  {
    id: "numeric",
    label: "Numeric",
    example: "/archives/123/",
    description: "Uses the post ID number.",
  },
  {
    id: "custom",
    label: "Custom Structure",
    example: null,
    description: "Use tags: %year%, %monthnum%, %day%, %postname%, %post_id%, %category%",
  },
];

/**
 * The fields a permalink can be built from.
 *
 * The two dates are required rather than optional on purpose. A dated structure
 * that silently fell back to "now" because a query forgot to select
 * `publishedAt` would mint a wrong URL for every post — and it would look right
 * on the day it was built. Requiring them makes the compiler find the queries
 * instead.
 */
export interface PostLike {
  id: number;
  slug: string;
  /**
   * Which language set this post belongs to; decides the URL prefix.
   *
   * Required, for the same reason the date columns are. Optional, it defaulted
   * to "no prefix" whenever a query forgot to select it -- so a French post in
   * search results, the sidebar or a post grid linked to `/le-titre` instead of
   * `/fr/le-titre`, which is a different language's namespace and a 404. The
   * compiler finds those queries; a silent empty string does not.
   */
  language: string;
  publishedAt: Date | string | null;
  createdAt: Date | string | null;
  category?: { slug?: string | null; name?: string | null } | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The date parts a dated permalink is built from, in UTC.
 *
 * UTC rather than local time because the URL has to be the same string
 * everywhere: `getFullYear()` on a machine an hour west of the timestamp
 * returns the previous day, so a post published at midnight would build as
 * `/2024/03/09/x` on the server and `/2024/03/08/x` on a build machine in
 * another zone — two URLs for one post, and a redirect loop between them.
 */
function dateParts(post: PostLike): { y: string; m: string; d: string } {
  const at = postDate(post);
  return {
    y: String(at.getUTCFullYear()),
    m: pad(at.getUTCMonth() + 1),
    d: pad(at.getUTCDate()),
  };
}

/**
 * The date a dated permalink uses.
 *
 * Published date first, falling back to created: a post published later than it
 * was written belongs at its publication date, and a draft being previewed has
 * no publication date at all yet.
 */
function postDate(post: PostLike): Date {
  const raw = post.publishedAt ?? post.createdAt ?? null;
  if (!raw) return new Date();
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Trims a path to exactly one leading slash and no trailing one. */
function normalisePath(raw: string): string {
  const parts = raw.split("/").filter(Boolean);
  return "/" + parts.join("/");
}

/**
 * A URL path segment, as the characters it stands for.
 *
 * Next hands route params through percent-encoded, exactly as they sit in the
 * address bar. For an ASCII slug the encoded and decoded forms are the same
 * string, so this never mattered — but an Arabic slug arrives as
 * `%D8%AD%D9%84-...`, no row has that for a slug, and every non-Latin
 * permalink, category and tag answered 404 while the site's own links and its
 * search results pointed straight at them.
 *
 * `decodeURIComponent` throws on a stray `%`, which a hand-typed slug can
 * contain, so a segment that will not decode is returned as it arrived.
 */
export function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** `decodeSegment` over a catch-all route's segments. */
export function decodeSegments(path: string[] | undefined): string[] {
  return (path ?? []).map(decodeSegment);
}

/**
 * A URL segment from author-supplied text.
 *
 * A category named "How To / Guides" would otherwise inject a slash and change
 * the shape of the path, which the parser then could not read back.
 */
function segment(raw: string): string {
  return raw
    .toLowerCase()
    // `\w` is Latin letters, digits and underscore only, so this used to
    // delete an Arabic or Cyrillic slug outright — `حل-المشكلات` came out as
    // `--`, and `postPath` fell back to the numeric id. Every URL the site
    // built for a non-Latin document was therefore wrong: the canonical tag,
    // the sitemap, the feed and every internal link. `\p{L}` is a letter in
    // any script, which is what a slug is allowed to contain.
    //
    // `\p{M}` too, as `toSlug` keeps it: Hindi matras and Arabic harakat are
    // Marks, not Letters. Without it `हिंदी-समाचार` was stored as the slug but
    // linked as `हद-समचर` — a URL no row answers — and the real address
    // redirected to that one, so every such document was a 404.
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** The structure in force, defaulting to the one the settings screen defaults to. */
export function permalinkStructure(settings: SiteSettings): string {
  const id = settings.permalink_structure || "post-name";
  return PERMALINK_STRUCTURES.some((s) => s.id === id) ? id : "post-name";
}

/**
 * Renders a custom structure.
 *
 * Returns "" when the result could not identify a post — a template with no
 * `%postname%` and no `%post_id%` would give every post the same URL, so it is
 * refused rather than silently collapsing the whole blog onto one path.
 */
function renderCustom(template: string, post: PostLike): string {
  if (!/%postname%|%post_id%/.test(template)) return "";
  const d = postDate(post);
  const out = template
    .replace(/%year%/g, String(d.getUTCFullYear()))
    .replace(/%monthnum%/g, pad(d.getUTCMonth() + 1))
    .replace(/%day%/g, pad(d.getUTCDate()))
    .replace(/%hour%/g, pad(d.getUTCHours()))
    .replace(/%minute%/g, pad(d.getUTCMinutes()))
    .replace(/%post_id%/g, String(post.id))
    .replace(/%postname%/g, segment(post.slug))
    .replace(/%category%/g, segment(post.category?.slug || post.category?.name || "uncategorised"));
  const path = normalisePath(out);
  return path === "/" ? "" : path;
}

/**
 * The language segment a path carries, or "" for the default language.
 *
 * Only non-default languages are prefixed. The default keeps clean URLs — `/`
 * and `/about`, never `/en/about` — so adding a second language moves none of
 * the existing content and creates no redirects.
 */
/**
 * A language's root URL: `/` for the default language, `/fr` otherwise.
 * Two routes carried their own copy of this three-line rule.
 */
export function rootPath(language: string, settings: SiteSettings): string {
  return languagePrefix(language, settings) || "/";
}

export function languagePrefix(language: string | undefined, settings: SiteSettings): string {
  const code = (language ?? "").trim();
  if (!code || code === defaultContentLanguage(settings)) return "";
  return isContentLanguage(code, settings) ? `/${code}` : "";
}

/**
 * Where a page lives.
 *
 * The homepage is the exception to everything: whichever page is set as a
 * language's homepage answers at that language's root — `/` for the default,
 * `/fr` for French — and its slug stops deciding anything. Two URLs for one
 * document would otherwise be inevitable, since the root has to render
 * *something*.
 */
export function pagePath(
  // `language` is required for the same reason it is on PostLike: optional, a
  // query that forgot to select it silently produced an unprefixed URL, which
  // belongs to a different language. `id` stays optional -- a caller that does
  // not have it just cannot ask the homepage question.
  page: { slug: string; language: string; id?: number },
  settings: SiteSettings
): string {
  const prefix = languagePrefix(page.language, settings);
  if (page.id != null && isHomepage(page.id, page.language, settings)) {
    return prefix || "/";
  }
  return `${prefix}/${segment(page.slug)}`;
}

/**
 * The page id set as a language's homepage.
 *
 * `homepage_id` is the default language's; other languages use a suffixed key,
 * so each language chooses its own rather than inheriting a translation that
 * may not exist.
 */
export function homepageSettingKey(language: string, settings: SiteSettings): string {
  return language === defaultContentLanguage(settings)
    ? "homepage_id"
    : `homepage_id_${language}`;
}

export function homepageId(language: string, settings: SiteSettings): number | null {
  const raw = (settings[homepageSettingKey(language, settings)] ?? "").trim();
  const id = parseInt(raw, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Whether this page is the homepage for its language. */
export function isHomepage(id: number, language: string | undefined, settings: SiteSettings): boolean {
  const code = (language ?? "").trim() || defaultContentLanguage(settings);
  return homepageId(code, settings) === id;
}

/**
 * The canonical path for a post — always leading slash, never trailing.
 *
 * Every internal link goes through here. A post whose URL is reached any other
 * way (an old `/blog/` link, or a link made under a previous structure) is
 * redirected to this path by the route, so there is exactly one URL per post.
 */
export function postPath(post: PostLike, settings: SiteSettings): string {
  const slug = segment(post.slug) || String(post.id);
  const { y, m, d: day } = dateParts(post);
  // Non-default languages sit under their own segment, so a French post reads
  // as French from the URL alone and Google can target it.
  const p = languagePrefix(post.language, settings);

  switch (permalinkStructure(settings)) {
    case "date-name":
      return `${p}/${y}/${m}/${day}/${slug}`;
    case "month-name":
      return `${p}/${y}/${m}/${slug}`;
    case "numeric":
      return `${p}/archives/${post.id}`;
    case "custom": {
      const custom = renderCustom(settings.permalink_custom || "", post);
      // A template that cannot identify a post falls back rather than 404s.
      return `${p}${custom || `/${slug}`}`;
    }
    default:
      return `${p}/${slug}`;
  }
}

/**
 * `base` + `path` as one absolute URL — and the bare origin for the root.
 *
 * `https://x.net` and `https://x.net/` are one address, but the site used to
 * spell it both ways: Next writes the canonical, `og:url` and `hreflang` as
 * the origin (its metadata resolver hard-codes that for a "/" pathname and
 * cannot be told otherwise), while the sitemap, the feed, llms.txt, IndexNow
 * and the breadcrumb's Home item said `…/`. Audits compare strings, and so
 * do some crawlers. Every absolute URL the CMS writes now goes through here,
 * so the root is one string everywhere.
 */
export function absoluteUrlFor(base: string, path: string): string {
  const origin = base.replace(/\/+$/, "");
  // No base: a relative path for Next to resolve, where "/" must stay "/".
  if (!origin) return path || "/";
  return path === "/" || path === "" ? origin : `${origin}${path}`;
}

/** The absolute URL, for the sitemap, the feed and canonical tags. */
export function postUrl(post: PostLike, settings: SiteSettings, base: string): string {
  return absoluteUrlFor(base, postPath(post, settings));
}

export type PostLookup = { by: "id"; id: number } | { by: "slug"; slug: string };

/**
 * What post a set of URL segments is asking for.
 *
 * Deliberately lenient about the shape: it reads the *last* segment rather than
 * matching the configured structure. That is what lets every URL a post has
 * ever had keep working — the route resolves the post, compares the result with
 * `postPath` and redirects to the canonical one. Changing the structure in
 * settings therefore cannot orphan a single existing link.
 */
export function parsePostSegments(segments: string[]): PostLookup | null {
  const parts = segments.filter(Boolean);
  if (parts.length === 0) return null;

  // `/archives/123` — the numeric structure, whose last segment is an id.
  //
  // Range-checked, because `id` is a Postgres `integer`: handing it anything
  // larger makes the driver raise "value out of range for type integer", which
  // surfaces as a 500 on a public URL that anyone can guess. Out-of-range digits
  // fall through and are looked up as a slug instead, which 404s properly.
  if (parts.length === 2 && parts[0] === "archives" && /^\d+$/.test(parts[1])) {
    const id = Number(parts[1]);
    if (Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647) {
      return { by: "id", id };
    }
  }

  const last = parts[parts.length - 1];
  // A bare number anywhere else is still a slug: post slugs may be numeric.
  return { by: "slug", slug: last };
}

/**
 * The blog archive root for a language — `/blog`, or `/fr/blog`.
 *
 * The archives are the one public surface that was still language-blind: they
 * listed every language's posts in one list. These helpers exist so the archive
 * URL is built in exactly one place, the way post and page URLs already are.
 */
/**
 * The page chosen as the Posts page for a language — the WordPress
 * "Settings → Reading → Posts page". Nothing is chosen on a fresh site, so no
 * listing URL exists until an owner creates a page and picks it here; then the
 * listing lives at that page's own URL, under whatever name they gave it.
 */
export function postsPageSettingKey(language: string, settings: SiteSettings): string {
  return language === defaultContentLanguage(settings) ? "posts_page_id" : `posts_page_id_${language}`;
}

export function postsPageId(language: string, settings: SiteSettings): number | null {
  const raw = (settings[postsPageSettingKey(language, settings)] ?? "").trim();
  const id = parseInt(raw, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Whether this page is the Posts page for its language. */
export function isPostsPage(id: number, language: string | undefined, settings: SiteSettings): boolean {
  const code = (language ?? "").trim() || defaultContentLanguage(settings);
  return postsPageId(code, settings) === id;
}

/** A category archive within a language. */
/**
 * Whether category archives answer at `/<slug>` rather than `/category/<slug>`
 * — Rank Math's "Remove category base". Off by default, as it is there.
 */
export function categoryBaseRemoved(settings: SiteSettings): boolean {
  return settings.seo_category_base_removed === "true";
}

export function categoryPath(slug: string, language: string, settings: SiteSettings): string {
  const base = categoryBaseRemoved(settings) ? "" : "/category";
  return `${languagePrefix(language, settings)}${base}/${segment(slug)}`;
}

/** A tag archive within a language. */
export function tagPath(slug: string, language: string, settings: SiteSettings): string {
  return `${languagePrefix(language, settings)}/tag/${segment(slug)}`;
}

/**
 * An author archive within a language: `/author/name`, `/fr/author/name`.
 *
 * At the language root rather than under the blog base, where the category and
 * tag archives live. An author is not a property of the blog the way a term is
 * — they are a person, and their page is about them rather than about a slice
 * of the archive. It is also the URL every reader already recognises.
 */
export function authorPath(slug: string, language: string, settings: SiteSettings): string {
  return `${languagePrefix(language, settings)}/author/${segment(slug)}`;
}

/** The search page for a language. */
export function searchPath(language: string, settings: SiteSettings): string {
  return `${languagePrefix(language, settings)}/search`;
}

/**
 * The RSS feed for a language — `/feed.xml`, or `/fr/feed.xml`.
 *
 * The default language keeps the unprefixed path, so an existing subscription
 * keeps working. Other languages get their own, because a feed is a listing and
 * listings are scoped.
 */
export function feedPath(language: string, settings: SiteSettings): string {
  return `${languagePrefix(language, settings)}/feed.xml`;
}
