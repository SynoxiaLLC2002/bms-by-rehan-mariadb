// IndexNow: telling search engines about a page the moment it changes.
//
// Bing, Yandex, Seznam, Naver and others share one endpoint; a single POST
// lists the URLs that changed and every participating engine hears about it.
// (Google does not take part — it discovers changes from the sitemap, which
// already carries `lastmod`.) Without this, a new post waits for the next
// crawl, which on a small site can be days.
//
// The engines verify the site owns the key by fetching a file that contains
// it. The key is generated once and kept in settings; the file is served at
// the site root, /<key>.txt (a rewrite in next.config.mjs onto the
// /indexnow/<key>.txt route), so there is nothing to upload. It has to be the
// root: a key file only authorises URLs inside its own folder.
//
// Everything here is fire-and-forget. A failed ping is logged and forgotten:
// it is an optimisation, and the sitemap is the fallback either way.

import { randomBytes } from "node:crypto";
import { rawQuery } from "@/lib/db/raw";
import { absoluteUrlFor, categoryPath, postPath, rootPath, type PostLike } from "@/lib/permalinks";
import type { SiteSettings } from "@/lib/settings";

const ENDPOINT = "https://api.indexnow.org/indexnow";
const KEY_SETTING = "indexnow_key";

let cachedKey: string | null = null;

/** The site's IndexNow key, created on first use. */
export async function indexNowKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  const rows = await rawQuery<{ value: string }>("SELECT value FROM site_settings WHERE `key` = ? LIMIT 1", [KEY_SETTING]);
  let key = rows[0]?.value?.trim() ?? "";
  if (!/^[a-f0-9]{32}$/.test(key)) {
    key = randomBytes(16).toString("hex");
    await rawQuery(
      `INSERT INTO site_settings (\`key\`, value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [KEY_SETTING, key]
    );
  }
  cachedKey = key;
  return key;
}

export function indexNowEnabled(settings: Record<string, string>): boolean {
  return (settings.seo_indexnow_enabled ?? "true") !== "false";
}

/**
 * The paths a post's publish or edit changes: the post, its category archive,
 * the home page. The category was missing — a new post appeared in the
 * archive that lists it, and the engines were told about the post and the
 * home page only, so the archive kept its stale copy until the next crawl.
 */
export async function postPingPaths(
  post: PostLike & { categoryId?: number | null; noIndex?: boolean | null },
  settings: SiteSettings
): Promise<string[]> {
  // The post's own language's home, not always `/`; and a post marked
  // noindex is not handed to the engines to crawl.
  const paths = [...(post.noIndex ? [] : [postPath(post, settings)]), rootPath(post.language, settings)];
  if (post.categoryId) {
    try {
      const rows = await rawQuery<{ slug: string; language: string; no_index: boolean | null }>(
        "SELECT slug, language, no_index FROM categories WHERE id = ? LIMIT 1",
        [post.categoryId]
      );
      const c = rows[0];
      if (c?.slug && !c.no_index) paths.push(categoryPath(c.slug, c.language || post.language, settings));
    } catch {
      // The post and home page still go out.
    }
  }
  return paths;
}

/**
 * Submits absolute URLs. Relative paths are resolved against `siteUrl`.
 * Skipped entirely for localhost — the engines would reject it, and a
 * developer's machine should not be pinging anyone.
 */
export async function pingIndexNow(siteUrl: string, urls: string[], settings: Record<string, string>): Promise<void> {
  try {
    if (!indexNowEnabled(settings)) return;
    const base = new URL(siteUrl);
    if (/^(localhost|127\.0\.0\.1)$/.test(base.hostname)) return;

    const list = Array.from(new Set(urls.map((u) => (u.startsWith("http") ? u : absoluteUrlFor(base.origin, u.startsWith("/") ? u : `/${u}`))))).slice(0, 10000);
    if (list.length === 0) return;

    const key = await indexNowKey();
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: base.host, key, keyLocation: `${base.origin}/${key}.txt`, urlList: list }),
      signal: AbortSignal.timeout(8000),
    });
    // 200 and 202 are accepted; anything else is worth a line in the log so a
    // misconfigured key is noticed, but never worth failing a save over.
    if (res.status !== 200 && res.status !== 202) {
      console.warn(`[indexnow] ${res.status} for ${list.length} url(s)`);
    }
  } catch (err) {
    console.warn("[indexnow] ping failed:", err instanceof Error ? err.message : err);
  }
}
