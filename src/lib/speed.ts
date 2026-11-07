// Speed settings — one place for every performance option the admin's Speed
// screen edits, with the defaults the site runs on when a key was never saved.
//
// Modelled on what WP Rocket and the LiteSpeed Cache plugin expose, kept to
// the options that change something on a Next.js site behind LiteSpeed.
// Minify, combine, defer-own-JS and HTML minify are missing on purpose: Next
// already does them at build time, and a switch that does nothing is worse
// than no switch. Everything here is read from `site_settings` and is a
// string, like every other setting; the helpers below parse them once.

import type { SiteSettings } from "@/lib/settings";

export const speedDefaults = {
  // ── Cache (LiteSpeed page cache, driven by response headers) ──────────
  cache_litespeed: "true",
  /** Seconds a post or page stays cached. */
  cache_ttl: "86400",
  /** Front page; blank = same as cache_ttl. */
  cache_ttl_home: "",
  /** Category, tag, author and paginated archives; blank = same as cache_ttl. */
  cache_ttl_archive: "",
  /** Feeds and sitemaps. */
  cache_ttl_feed: "3600",
  /** Paths never cached — one per line, `*` matches anything. */
  cache_exclude_paths: "",
  /** Cookie names that make a request personal, one per line. */
  cache_exclude_cookies: "",
  /** Query parameters that do not change the page, one per line. */
  cache_ignore_params: "utm_source\nutm_medium\nutm_campaign\nutm_term\nutm_content\nfbclid\ngclid\ngclsrc\ndclid\nmsclkid\nmc_cid\nmc_eid\nref\n_ga\nyclid\nttclid\ntwclid\nigshid",
  /** Clear the LiteSpeed cache automatically on every save from the admin. */
  cache_purge_on_save: "true",

  // ── Browser cache (Cache-Control for files) ───────────────────────────
  browser_ttl_uploads: "31536000",
  browser_ttl_fonts: "31536000",

  // ── Page optimisation ────────────────────────────────────────────────
  /** Inline the site stylesheet instead of linking it: one render-blocking request fewer. */
  css_inline_site: "false",
  /**
   * Let the browser skip laying out and painting the part of the page
   * nobody has scrolled to yet (`content-visibility: auto`).
   *
   * A long article is well over a thousand elements, and the browser
   * measures and paints every one of them before it can show the first
   * screen. PageSpeed calls what that costs "element render delay", and on
   * a throttled phone it was the largest single part of this site's
   * Largest Contentful Paint. With this on, the browser is told it may
   * leave the blocks below the fold until they are scrolled near.
   *
   * OFF by default — measured, see reasons.txt §10.11. On this site the
   * exact rule made Speed Index worse (2.4 s → 3.8 s, 19 Sep 2026) and moved
   * LCP by nothing: `content-visibility:auto` holds back `loading=lazy`
   * images inside the blocks it skips, and a jump to a heading (#anchor,
   * Table of Contents) lands wrong while blocks above it are still 600px
   * placeholders. 1.9.53 turned the default on without a new measurement;
   * that was reverted. Turn it on only after measuring a long page with it.
   *
   * Custom CSS is applied after this and can exempt a block with
   * `content-visibility: visible`.
   */
  render_offscreen: "false",
  /** How many top-level blocks are always rendered, counted from the top. */
  render_offscreen_after: "3",
  /** Whitespace-only paragraphs: "drop" leaves them out of the page, "keep" publishes them as blank lines. */
  render_empty_paragraphs: "drop",
  scripts_delay: "false",
  /** Substrings of a script's src or text that must not be delayed, one per line. */
  scripts_delay_exclude: "",
  /**
   * Pages where nothing is delayed, one path pattern per line — a contact
   * page whose form script must be ready before the first click.
   */
  scripts_delay_exclude_paths: "",
  /** Run delayed scripts anyway after this many seconds. */
  scripts_delay_timeout: "6",
  /** Add `defer` to external head scripts that have neither async nor defer. */
  scripts_defer_head: "false",
  perf_preconnect: "true",
  /** Extra origins to preconnect, one per line. */
  perf_preconnect_hosts: "",
  /** Origins to dns-prefetch, one per line. */
  perf_dns_prefetch: "",
  fonts_local: "true",
  /** Preload the body font's regular weight, so text does not wait for the CSS to name it. */
  fonts_preload: "true",
  /** Extra font files to preload, one URL per line. */
  fonts_preload_urls: "",
  /** font-display for Google fonts: swap | optional | fallback | block. */
  font_display: "swap",
  /**
   * Which weights of the chosen families to request, as a comma list.
   *
   * Google returns one @font-face per weight per character set, so five
   * weights of one family on a site with a Latin and a Devanagari subset
   * is fifteen blocks of CSS. `unicode-range` keeps the browser from
   * downloading the ones it cannot use, so the cost is the stylesheet
   * rather than the files — but that stylesheet is inlined into every
   * page. A theme that only ever draws regular, semibold and bold is
   * paying for 500 and 800 on every request.
   *
   * 400 is always requested whatever this says: it is the body text.
   */
  font_weights: "400,500,600,700,800",
  /** Link prefetch: hover | viewport | prerender | off. Replaces perf_hover_prefetch. */
  prefetch_mode: "hover",
  /** Path patterns never prefetched, one per line. */
  prefetch_exclude: "",

  // ── Media ────────────────────────────────────────────────────────────
  media_lazy: "true",
  /** How many of the first top-level blocks may hold the eagerly loaded hero image (0 disables). */
  media_eager_count: "3",
  media_lazy_iframes: "true",
  perf_video_facade: "true",
  /** JPEG/WebP/AVIF quality for optimised content images, 50–90. */
  image_quality: "75",
  media_blur_placeholder: "true",
  /**
   * Longer side, in pixels, an uploaded photo is shrunk to. Blank = the
   * MEDIA_MAX_PX environment variable, else 2000.
   */
  media_max_px: "",

  // ── Preload / crawler ────────────────────────────────────────────────
  /** After the publish cron refreshes pages, fetch them so the first visitor gets a cached copy. */
  warm_after_publish: "true",
  /**
   * Walk the site in the background so pages that fell out of the cache are
   * warm before anyone asks for them.
   *
   * On by default since 1.9.53. `warm_after_publish` only covers what you
   * just published; everything else goes cold when its cache expires, and
   * then some reader pays for the render. The cost is `crawler_batch` URLs
   * per cron run — ten, by default, against your own cache — which is far
   * less work than the page renders it prevents.
   */
  crawler_enabled: "true",
  /** URLs fetched per cron run. */
  crawler_batch: "10",
  /** Hours between full passes over the site. */
  crawler_interval_hours: "24",

  // ── Cloudflare ───────────────────────────────────────────────────────
  cf_zone_id: "",
  cf_api_token: "",
  cf_purge_on_save: "true",

  // ── Database ─────────────────────────────────────────────────────────
  revisions_keep: "30",
  cleanup_trash_days: "30",
  cleanup_auto: "true",

  // ── Tools ────────────────────────────────────────────────────────────
  /** Add an X-BMS-Cache header saying why a response was or was not cacheable. */
  speed_debug_headers: "false",
} as const;

export type SpeedKey = keyof typeof speedDefaults;
export type SpeedSettings = Record<SpeedKey, string>;
export const SPEED_KEYS = Object.keys(speedDefaults) as SpeedKey[];

/** The saved values over the defaults. Also honours the old prefetch key. */
export function speedSettings(settings: Partial<SiteSettings> | Record<string, string | null | undefined>): SpeedSettings {
  const out = { ...speedDefaults } as Record<SpeedKey, string>;
  for (const key of SPEED_KEYS) {
    const v = settings[key];
    // A saved empty string is a choice (no excluded paths, no extra hosts);
    // only a key that was never saved falls back to the default.
    if (typeof v === "string") out[key] = v;
  }
  // Before the Speed screen, hover prefetch was a single on/off key.
  if (settings.prefetch_mode == null && settings.perf_hover_prefetch === "false") out.prefetch_mode = "off";
  return out;
}

export const on = (v: string | undefined) => v !== "false";

/** One entry per line, trimmed, blanks and `#` comments dropped. */
export function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
}

/** A whole number within bounds, else the fallback. */
export function intIn(raw: string | undefined, min: number, max: number, fallback: number): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/** Regex-escapes a literal, so a pattern's dots and brackets match themselves. */
export function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");
}

/**
 * Whether a path matches one of the patterns: a plain prefix (`/shop`), or a
 * glob where `*` stands for any run of characters (`/downloads/*`, `*.pdf`).
 */
export function matchesPath(pathname: string, patterns: string[]): boolean {
  for (const raw of patterns) {
    const p = raw.startsWith("/") || raw.startsWith("*") ? raw : `/${raw}`;
    if (p.includes("*")) {
      const body = p.split("*").map(escapeRegExp).join(".*");
      if (new RegExp("^" + body + "$", "i").test(pathname)) return true;
    } else if (pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`)) {
      return true;
    }
  }
  return false;
}

/** What sort of public page a path is, for the per-type cache lifetime. */
export type PageKind = "home" | "archive" | "page";

export function pageKind(pathname: string, languages: string[]): PageKind {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0 || (parts.length === 1 && languages.includes(parts[0]))) return "home";
  if (/\/(category|tag|author|search)(\/|$)/.test(pathname) || /\/page\/\d+\/?$/.test(pathname)) return "archive";
  return "page";
}

/** The `Cache-Control` for an immutable file, from a TTL setting. */
export function fileCacheControl(ttl: string | undefined): string {
  const seconds = intIn(ttl, 0, 31536000, 31536000);
  if (seconds === 0) return "public, max-age=0, must-revalidate";
  return seconds >= 2592000 ? `public, max-age=${seconds}, immutable` : `public, max-age=${seconds}`;
}
