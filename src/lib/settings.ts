import { cache } from "react";
import { db } from "@/lib/db";

// One read of the settings table per request, shared by everything that asks.
//
// Nine files had grown their own copy of this query, and a single page render
// runs several of them: the root layout's metadata, the page's own metadata,
// then the page body — each paying a full round trip to Postgres for the same
// rows. Rendering one blog post hit the table four times.
//
// `cache()` is React's per-request memo: the first caller in a render pass does
// the query, the rest get the same promise, and nothing is held between
// requests. That last part is the point — an edit to Appearance shows up on the
// very next request, exactly as before, so this is a pure win with no staleness
// to reason about. Cross-request caching would need invalidation wired into
// every settings write, and is a separate decision.

export type SiteSettings = Record<string, string>;

/**
 * Settings shared across requests for a few seconds.
 *
 * Every uncached render began with this query — a Neon round trip, before
 * anything else could start. Held for SETTINGS_TTL_MS and dropped the moment
 * the Settings screen, the Customizer, an import or a font change writes (see
 * `invalidateSiteSettings`), so an owner's edit is on the next request as
 * before. Any other write — a timestamp the cron stamps, a Speed toggle — is
 * visible within the TTL at worst.
 *
 * On `globalThis`, not in a module variable: Next bundles server code into
 * more than one layer, and a route handler clearing its own copy would leave
 * the pages' copy stale.
 */
const SETTINGS_TTL_MS = 15_000;
type SettingsMemo = { at: number; value: Promise<SiteSettings> };
const memo = globalThis as unknown as { __bmsSettings?: SettingsMemo | null; __bmsSettingsGood?: SiteSettings };

/** Drops the shared copy; the next read goes to the database. */
export function invalidateSiteSettings(): void {
  memo.__bmsSettings = null;
}

/**
 * Encrypted credentials that never join the settings map or leave through
 * /api/settings: each is read only by the library that owns it.
 */
export function isPrivateSetting(key: string): boolean {
  return key === "mail_password" || key.startsWith("ranklocal_secret_");
}

async function readSettings(): Promise<SiteSettings> {
  try {
    const rows = await db.query.siteSettings.findMany();
    const map: SiteSettings = {};
    // `mail_password` (encrypted SMTP password) is read only by lib/mail —
    // this map is handed to client components and the Customizer.
    // `ranklocal_secret_*`: sign-in tokens left behind by the removed RankLocal feature.
    for (const row of rows) if (!isPrivateSetting(row.key)) map[row.key] = row.value ?? "";
    memo.__bmsSettingsGood = map;
    return map;
  } catch (err) {
    // A failed read is not "no settings". Answering `{}` here made every
    // page treat the site's own language as unknown and 404 — and LiteSpeed
    // kept that 404 after the database recovered (INCIDENT-2026-10-21.md).
    // The last good map keeps the site as it was; with none in this process
    // the request fails as a 500, which nothing caches. The build keeps the
    // old defaults so `next build` without a database still finishes.
    if (memo.__bmsSettingsGood) return memo.__bmsSettingsGood;
    if (process.env.NEXT_PHASE === "phase-production-build") return {};
    throw err;
  }
}

export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  const hit = memo.__bmsSettings;
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return { ...(await hit.value) };
  const value = readSettings();
  memo.__bmsSettings = { at: Date.now(), value };
  const map = await value.catch((err) => {
    if (memo.__bmsSettings?.value === value) memo.__bmsSettings = null;
    throw err;
  });
  // An empty map is usually a failed read: do not hold on to it.
  if (Object.keys(map).length === 0 && memo.__bmsSettings?.value === value) memo.__bmsSettings = null;
  // A copy, so a caller that mutates its map cannot change another request's.
  return { ...map };
});

/**
 * Keys only an administrator may read: the Cloudflare API token, anything
 * else named like a credential, and the head/footer scripts.
 */
export const ADMIN_ONLY_SETTING = /(?:token|secret|password|api_key)$|^script_/i;

/**
 * The map without those keys — for handing settings to a client component,
 * which serialises every value into the page, or to a non-administrator.
 * The post and page editors took the whole map, so an author opening "New
 * post" received the Cloudflare token in the page payload.
 */
export function withoutSecrets(settings: SiteSettings): SiteSettings {
  const out: SiteSettings = {};
  for (const [k, v] of Object.entries(settings)) if (!ADMIN_ONLY_SETTING.test(k)) out[k] = v;
  return out;
}

// A note on what is *not* here, because it was investigated and the obvious
// conclusion was wrong.
//
// In `next dev`, every value in this map appears in the HTML of every page: a
// canary setting showed up on `/`, `/blog`, a post and an author page. That
// looks exactly like a settings leak across a client boundary — `HeaderZone`
// receives this map and is rendered as children of `OffCanvas`, which is a
// client component.
//
// It is not. The value appears in React's *owner/debug* slot, which development
// builds attach to server-component elements. A production build was checked
// with the same canaries and emits neither: 0 occurrences on all four pages.
// No filtering is applied here, because a filter that silently dropped keys
// would be a real failure mode traded for an imaginary one.
//
// The standing rule is unchanged and does not depend on any of that:
// credentials belong in environment variables, never in this table.
