// LiteSpeed page cache, driven by response headers.
//
// On cPanel hosting the app sits behind LiteSpeed Web Server, and LiteSpeed
// has a page cache built in. It does not need a plugin — it needs two headers:
//
//   X-LiteSpeed-Cache-Control: public, max-age=N   "keep this response"
//   X-LiteSpeed-Purge: *                           "throw the cache away"
//
// With the first on every public page and a targeted purge on a public save
// (lib/publishCache.ts — drafts touch nothing), the server hands finished
// HTML to visitors without waking Node; only the first visitor after a
// change pays for a render. That is the same result as the LiteSpeed Cache
// plugin gives WordPress, and it needs nothing configured on the host. Any
// other server (nginx, Vercel, plain Node) ignores both headers, so this is
// safe to leave on everywhere.
//
// What is never cached: anything under the admin, API or preview paths, any
// request that carries a session cookie (an editor sees drafts and a
// logged-in-only block; a cached copy of their page would reach everyone),
// and non-GET requests.
//
// See `redirects.ts` for why settings are read through `rawQuery` and cached
// with stale-while-revalidate: this runs in middleware, in front of every
// page, and must never add a database round trip to a warm request.

import { rawQuery } from "@/lib/db/raw";
import { staleWhileRevalidate } from "@/lib/staleCache";
import { SPEED_KEYS, escapeRegExp, fileCacheControl, intIn, matchesPath, on, pageKind, parseList, speedSettings, type SpeedSettings } from "@/lib/speed";

export const LS_CACHE = "X-LiteSpeed-Cache-Control";
export const LS_PURGE = "X-LiteSpeed-Purge";
/**
 * Labels a cached page (`home`, `archive`, `page`) so a later
 * `X-LiteSpeed-Purge: tag=archive` drops every listing without naming them.
 */
export const LS_TAG = "X-LiteSpeed-Tag";
/** Debug header saying why a response was or was not cacheable (Speed → Tools). */
export const DEBUG_HEADER = "X-BMS-Cache";

const TTL_MS = 60_000;
const MIN_MAX_AGE = 60;
const MAX_MAX_AGE = 31_536_000;

/**
 * The Speed settings, read raw for the middleware. `getSiteSettings()` is a
 * per-request memo over the whole table; this is a 60-second process-wide
 * cache over just the keys the cache decision needs, refreshed behind the
 * response — see redirects.ts for why nothing in front of a page may wait on
 * the database.
 */
async function load(): Promise<SpeedSettings> {
  const rows = await rawQuery<{ key: string; value: string | null }>(
    `SELECT \`key\`, value FROM site_settings WHERE \`key\` IN (?)`,
    [[...SPEED_KEYS, "perf_hover_prefetch"]]
  );
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value ?? "";
  return speedSettings(map);
}

const settingsCache = staleWhileRevalidate(load, speedSettings({}), TTL_MS);

/** The Speed settings as the middleware and file routes see them (≤60s stale). */
export function cacheSettings(): Promise<SpeedSettings> {
  return settingsCache.get();
}

/** Forgets the cached copy in this process — a save picks up within the TTL anyway. */
export function forgetCacheSettings(): void {
  settingsCache.invalidate();
}

/**
 * Whether the request carries a NextAuth session cookie (any variant).
 *
 * `(?:\\.\\d+)?` is not decoration: NextAuth splits a session token that
 * grows past ~4KB into `authjs.session-token.0`, `.1`, … and a rule that
 * insists on `=` straight after `session-token` stops recognising the login.
 * Two things then go wrong at once for that person, and only for them:
 * their page — drafts, logged-in-only blocks and all — becomes cacheable and
 * is served to the public, and their saves stop purging LiteSpeed, so the
 * site keeps serving yesterday’s HTML while the editor swears they published.
 *
 * The v4 `next-auth.` prefix is accepted too, so a site carried over from an
 * older deployment is not silently uncached.
 */
export function hasSessionCookie(cookieHeader: string | null): boolean {
  return (
    !!cookieHeader &&
    /(?:^|;\s*)(?:__Secure-)?(?:authjs|next-auth)\.session-token(?:\.\d+)?=/.test(cookieHeader)
  );
}

function hasCookieNamed(cookieHeader: string | null, names: string[]): string | null {
  if (!cookieHeader || names.length === 0) return null;
  for (const name of names) {
    if (new RegExp("(?:^|;\\s*)" + escapeRegExp(name) + "=").test(cookieHeader)) return name;
  }
  return null;
}

export interface CacheRequest {
  method: string;
  pathname: string;
  /** Query parameter names present on the request. */
  params?: string[];
  cookie: string | null;
  flight?: boolean;
  /** Configured content languages, to tell the front page from a post. */
  languages?: string[];
}

export interface CacheDecision {
  /** The header value, or null when this response must not be cached. */
  header: string | null;
  /** One short reason for the debug header and the Speed screen's tester. */
  reason: string;
  /** Seconds, when cacheable — copied onto `Cache-Control: s-maxage` so Cloudflare's "respect origin" has a number to keep. */
  ttl?: number;
}

/**
 * Whether a public page response may be cached, and for how long. Every
 * refusal names its reason, so "why is this page not cached?" is one header
 * away when Speed → Tools → debug headers is on.
 */
export async function pageCacheDecision(req: CacheRequest): Promise<CacheDecision> {
  if (req.method !== "GET" && req.method !== "HEAD") return { header: null, reason: "method" };
  if (hasSessionCookie(req.cookie)) return { header: null, reason: "logged-in" };
  // A client-side navigation asks for the same URL as a React payload rather
  // than HTML. Stored under the page's URL, that payload could be handed to
  // the next visitor as if it were the page — so it is never cached.
  if (req.flight) return { header: null, reason: "rsc" };

  const s = await cacheSettings();
  if (!on(s.cache_litespeed)) return { header: null, reason: "disabled" };

  // Query strings are search terms and previews: many URLs, each visited
  // once. A tracking tag is the exception — `?utm_source=x` is the same page.
  const ignored = new Set(parseList(s.cache_ignore_params).map((p) => p.toLowerCase()));
  const meaningful = (req.params ?? []).filter((p) => !ignored.has(p.toLowerCase()));
  if (meaningful.length > 0) return { header: null, reason: `query:${meaningful[0]}` };

  if (matchesPath(req.pathname, parseList(s.cache_exclude_paths))) return { header: null, reason: "excluded-path" };
  const personal = hasCookieNamed(req.cookie, parseList(s.cache_exclude_cookies));
  if (personal) return { header: null, reason: `cookie:${personal}` };

  const base = intIn(s.cache_ttl, MIN_MAX_AGE, MAX_MAX_AGE, 86_400);
  const kind = pageKind(req.pathname, req.languages ?? []);
  const maxAge =
    kind === "home" ? intIn(s.cache_ttl_home, MIN_MAX_AGE, MAX_MAX_AGE, base)
    : kind === "archive" ? intIn(s.cache_ttl_archive, MIN_MAX_AGE, MAX_MAX_AGE, base)
    : base;
  return { header: `public, max-age=${maxAge}`, reason: `${kind}:${maxAge}`, ttl: maxAge };
}

/** LiteSpeed header for a feed or sitemap, from the Speed → Cache lifetime. */
export async function feedCacheHeader(): Promise<string> {
  const s = await cacheSettings();
  if (!on(s.cache_litespeed)) return NO_CACHE;
  return `public, max-age=${intIn(s.cache_ttl_feed, MIN_MAX_AGE, MAX_MAX_AGE, 3600)}`;
}

/**
 * Headers for a file that never changes under its name — an upload, a font.
 * Browser lifetime from Speed → Browser cache; LiteSpeed keeps it a year
 * regardless, since a purge clears it and a new file gets a new name.
 */
export async function fileCacheHeaders(kind: "uploads" | "fonts"): Promise<Record<string, string>> {
  const s = await cacheSettings();
  return {
    "Cache-Control": fileCacheControl(kind === "uploads" ? s.browser_ttl_uploads : s.browser_ttl_fonts),
    [LS_CACHE]: "public, max-age=31536000",
  };
}

/** Marks a response as one LiteSpeed must not keep. */
export const NO_CACHE = "no-cache";

/**
 * Adds the purge header to a response so LiteSpeed drops every cached page of
 * this site. Called from the API routes that change what visitors see; the
 * middleware also adds it to every authenticated mutation as a safety net.
 */
export function purgeAll(headers: Headers): void {
  headers.set(LS_PURGE, "*");
}
