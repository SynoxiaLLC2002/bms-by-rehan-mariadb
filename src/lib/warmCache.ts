// Cache warming — visiting pages so the first real visitor finds them ready.
//
// A purge empties LiteSpeed's cache and Next's; the next person to open each
// page pays for a full render, and on a shared host that can be the one slow
// visit that shows up in Search Console. WP Rocket calls the fix "preload",
// LiteSpeed Cache calls it the "crawler": fetch the pages yourself, right
// after they were cleared, or a few at a time around the clock.
//
// Two entry points, both run from the publish cron (`/api/cron/publish`) so
// no extra cron is needed: `warmPaths` for the pages a publish just refreshed,
// and `crawlBatch` for the slow walk over the whole site. Both fetch through
// the public URL, as a visitor would, so LiteSpeed and Cloudflare see and keep
// the response; no cookie is sent, so nothing is cached as a logged-in view.

import { rawQuery } from "@/lib/db/raw";
import { SITEMAP_KINDS, buildSitemapUrls } from "@/lib/sitemap";
import type { SiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { cronSecret } from "@/lib/secretCompare";
import { intIn } from "@/lib/speed";

export const CRAWLER_CURSOR = "crawler_cursor";
export const CRAWLER_LAST_RUN = "crawler_last_run";
export const CRAWLER_LAST_PASS = "crawler_last_pass";
export const WARM_LAST = "warm_last";

const UA = "BMS-Warmer/1.0 (+cache preload)";
const PER_REQUEST_MS = 20_000;

export interface WarmResult {
  fetched: number;
  failed: string[];
  ms: number;
}

async function hit(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,*/*;q=0.8" },
      signal: AbortSignal.timeout(PER_REQUEST_MS),
      redirect: "follow",
      cache: "no-store",
    });
    // The body has to be read for the response to be complete on the server side.
    await res.arrayBuffer().catch(() => undefined);
    return res.ok;
  } catch {
    return false;
  }
}

async function remember(key: string, value: string): Promise<void> {
  await rawQuery(
    `INSERT INTO site_settings (\`key\`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [key, value]
  ).catch(() => undefined);
}

/**
 * Clears LiteSpeed's cache now, from server code, by requesting the purge
 * route through the public URL so the header passes through LiteSpeed. True
 * when the request went through; false means the caller should fall back to
 * purging on its own response.
 */
export async function purgeLiteSpeedNow(settings: SiteSettings): Promise<boolean> {
  const token = cronSecret();
  if (!token) return false;
  try {
    // In a header, not the query string: this request goes out through the
    // public URL, so a query token would land in the host's access log.
    const res = await fetch(`${siteUrl(settings)}/api/cron/purge`, {
      headers: { "user-agent": UA, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(PER_REQUEST_MS),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetches these paths, a few at a time. */
export async function warmPaths(paths: string[], settings: SiteSettings, concurrency = 3): Promise<WarmResult> {
  const base = siteUrl(settings);
  const started = Date.now();
  const failed: string[] = [];
  let fetched = 0;
  const queue = [...new Set(paths)];
  const worker = async () => {
    for (let p = queue.shift(); p !== undefined; p = queue.shift()) {
      const ok = await hit(p.startsWith("http") ? p : `${base}${p}`);
      if (ok) fetched += 1;
      else failed.push(p);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  await remember(WARM_LAST, JSON.stringify({ at: new Date().toISOString(), fetched, failed: failed.length }));
  return { fetched, failed, ms: Date.now() - started };
}

/** Every public URL, front pages first, in the order the crawler walks them. */
export async function allPublicUrls(settings: SiteSettings): Promise<string[]> {
  const base = siteUrl(settings);
  const urls: string[] = [];
  for (const kind of SITEMAP_KINDS) {
    try {
      for (const u of await buildSitemapUrls(kind, settings)) urls.push(u.loc.startsWith("http") ? u.loc : `${base}${u.loc}`);
    } catch {
      // A kind whose table is missing has nothing to crawl.
    }
  }
  // The home page is in the page sitemap on most sites; make sure it leads.
  // The bare origin: the sitemap spells the home that way, and `base + "/"`
  // made it a second, different string — fetched twice every pass.
  const unique = [...new Set([base, ...urls])];
  return unique;
}

export interface CrawlResult extends WarmResult {
  /** Position after this batch, and how many URLs the site has. */
  cursor: number;
  total: number;
  /** True when this batch reached the end and the walk starts over next time. */
  completedPass: boolean;
  skipped?: "interval" | "disabled";
}

/**
 * One batch of the site-wide walk. Keeps its place in `crawler_cursor`; when
 * a pass completes it waits `crawler_interval_hours` before the next begins,
 * so a small site is not fetched over and over.
 */
export async function crawlBatch(settings: SiteSettings, opts: { force?: boolean } = {}): Promise<CrawlResult> {
  const enabled = settings.crawler_enabled === "true";
  if (!enabled && !opts.force) return { fetched: 0, failed: [], ms: 0, cursor: 0, total: 0, completedPass: false, skipped: "disabled" };

  const batch = intIn(settings.crawler_batch, 1, 100, 10);
  const intervalMs = intIn(settings.crawler_interval_hours, 1, 720, 24) * 3600 * 1000;
  const rows = await rawQuery<{ key: string; value: string }>(
    "SELECT `key`, value FROM site_settings WHERE `key` IN (?, ?)",
    [CRAWLER_CURSOR, CRAWLER_LAST_PASS]
  ).catch(() => []);
  const state = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  let cursor = parseInt(state[CRAWLER_CURSOR] ?? "0", 10) || 0;
  const lastPass = Date.parse(state[CRAWLER_LAST_PASS] ?? "");

  const urls = await allPublicUrls(settings);
  if (cursor >= urls.length) cursor = 0;
  // At the start of a pass, honour the interval since the last one finished.
  if (cursor === 0 && !opts.force && Number.isFinite(lastPass) && Date.now() - lastPass < intervalMs) {
    return { fetched: 0, failed: [], ms: 0, cursor, total: urls.length, completedPass: false, skipped: "interval" };
  }

  const slice = urls.slice(cursor, cursor + batch);
  const result = await warmPaths(slice, settings, 2);
  const next = cursor + slice.length;
  const completedPass = next >= urls.length;
  await remember(CRAWLER_CURSOR, String(completedPass ? 0 : next));
  await remember(CRAWLER_LAST_RUN, JSON.stringify({ at: new Date().toISOString(), fetched: result.fetched, failed: result.failed.length, cursor: completedPass ? 0 : next, total: urls.length }));
  if (completedPass) await remember(CRAWLER_LAST_PASS, new Date().toISOString());
  return { ...result, cursor: completedPass ? 0 : next, total: urls.length, completedPass };
}
