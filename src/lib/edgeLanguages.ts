// The configured content languages, readable from middleware.
//
// Middleware has to decide whether the first path segment is a language before
// any route runs — `/fr/about` is French, `/about` is the default language, and
// `/frames` is a page slug that merely starts with the same letters. That
// decision needs the configured list, and middleware cannot import
// `getSiteSettings` (it pulls in Drizzle and the whole schema).
//
// Same shape as `redirects.ts`: one lazy client, the answer cached in module
// scope behind a short TTL, so the per-request cost is an array lookup rather
// than a query.

// See `redirects.ts` for why this goes through `rawQuery` rather than its own
// Neon client: a direct client only works on Neon, and its failure mode was a
// site that silently served every language as the default.
import { rawQuery } from "@/lib/db/raw";
import { staleWhileRevalidate } from "@/lib/staleCache";

/** Same tag shape `locale.ts` validates with, kept in sync deliberately. */
const LANG_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export interface LanguageSet {
  /** Every configured code, in order; the first is the default. */
  all: string[];
  /** The default language, which is served unprefixed. */
  default: string;
}

const FALLBACK: LanguageSet = { all: ["en"], default: "en" };

/**
 * The window before a newly added language starts resolving — middleware
 * cannot be invalidated from an API route, so the TTL is the propagation
 * delay. Sixty seconds, not ten: a language is added a handful of times in a
 * site's life, and on a shared host with the database in another country
 * every refresh is a full round trip that some visitor pays for.
 */
const TTL_MS = 60_000;

function parse(rows: { key: string; value: string | null }[]): LanguageSet {
  const byKey = new Map(rows.map((r) => [r.key, r.value ?? ""]));
  const raw = (byKey.get("content_languages") ?? "").trim();
  const codes = raw
    .split(",")
    .map((c) => c.trim())
    .filter((c) => LANG_TAG.test(c));

  const unique = Array.from(new Set(codes));
  if (unique.length === 0) {
    // Falls back the way `contentLanguages()` does: the site language alone.
    const site = (byKey.get("site_language") ?? "").trim();
    const one = LANG_TAG.test(site) ? site : "en";
    return { all: [one], default: one };
  }
  return { all: unique, default: unique[0] };
}

async function load(): Promise<LanguageSet> {
  const rows = await rawQuery<{ key: string; value: string | null }>(
    "select `key`, value from site_settings where `key` in ('content_languages', 'site_language')"
  );
  return parse(rows);
}

const languagesCache = staleWhileRevalidate(load, FALLBACK, TTL_MS);

/**
 * The configured languages, cached.
 *
 * Never throws: an unreachable database must not take every request down with
 * it, so a failed load answers with the default-only set. The worst case is
 * that a prefixed URL is treated as an ordinary path for one TTL window.
 *
 * Stale-while-revalidate, the same shape as `redirects.ts`: a warm cache
 * answers immediately and the reload happens behind the response. Awaiting it
 * here meant one visitor per TTL window sat through a database round trip
 * before any HTML started — in front of every page on the site.
 */
export function languageSet(): Promise<LanguageSet> {
  return languagesCache.get();
}

/**
 * The configured public address, as the middleware sees it (≤60s stale).
 *
 * `canonicalRedirect` read `NEXT_PUBLIC_SITE_URL`/`NEXTAUTH_URL` only, so
 * moving a site to a new domain was half-applied: pages, canonicals and the
 * sitemap followed Settings → Site URL immediately, while the www/https
 * redirect kept sending visitors to the OLD host until someone also changed
 * an environment variable and restarted the app. On a host where those
 * variables are edited in a control panel, that is a step nobody knows to
 * take, and the symptom is a redirect loop between the two domains.
 *
 * Settings wins, with the environment as the fallback — the same order
 * `siteUrl()` uses for everything else, so the two can no longer disagree.
 *
 * Same shape as `cacheSettings`: a process-wide, stale-while-revalidate cache
 * so nothing in front of a page ever waits on the database.
 */
async function loadSiteUrl(): Promise<string> {
  try {
    const rows = await rawQuery<{ value: string | null }>(
      `SELECT value FROM site_settings WHERE \`key\` = 'site_url' LIMIT 1`
    );
    return (rows[0]?.value ?? "").trim();
  } catch {
    return "";
  }
}

const siteUrlCache = staleWhileRevalidate(loadSiteUrl, "", 60_000);

export function configuredSiteUrl(): Promise<string> {
  return siteUrlCache.get();
}

/**
 * Maintenance mode, for the middleware (≤60s stale).
 *
 * The screen itself is rendered by `SiteLayout`, but a React server component
 * cannot set an HTTP status, so the page went out as **200** — and a 200 tells
 * Google the maintenance notice IS the page, which it will happily index and
 * serve as the site's homepage.
 *
 * The middleware can set a status, and it runs in the Node runtime with
 * database access (an earlier note in reasons.txt claimed otherwise and used
 * that to dismiss this; see 10.6). Anonymous visitors and crawlers get a real
 * 503 with `Retry-After`; anyone carrying a session falls through to
 * `SiteLayout`, which does the proper administrator check and shows the site
 * or the screen as before. That split keeps the role logic in one place and
 * still fixes the half that matters — nothing is indexed.
 */
export interface MaintenanceState {
  on: boolean;
  title: string;
  message: string;
  bg: string;
}

async function loadMaintenance(): Promise<MaintenanceState> {
  try {
    const rows = await rawQuery<{ key: string; value: string | null }>(
      `SELECT \`key\`, value FROM site_settings WHERE \`key\` IN (?)`,
      [["maintenance_mode", "maintenance_title", "maintenance_message", "maintenance_bg_color"]]
    );
    const m: Record<string, string> = {};
    for (const r of rows) m[r.key] = r.value ?? "";
    return {
      on: m.maintenance_mode === "true",
      title: m.maintenance_title || "We're under maintenance",
      message: m.maintenance_message || "We'll be back soon. Thanks for your patience.",
      bg: /^#[0-9a-f]{3,8}$/i.test(m.maintenance_bg_color || "") ? m.maintenance_bg_color : "#0f172a",
    };
  } catch {
    // Never take the site down because the setting could not be read.
    return { on: false, title: "", message: "", bg: "#0f172a" };
  }
}

const maintenanceCache = staleWhileRevalidate(loadMaintenance, { on: false, title: "", message: "", bg: "#0f172a" }, 60_000);

export function maintenanceState(): Promise<MaintenanceState> {
  return maintenanceCache.get();
}
