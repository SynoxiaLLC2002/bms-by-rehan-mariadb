import { revalidatePath } from "next/cache";
import { invalidateSiteSettings } from "@/lib/settings";
import { purgeCloudflareUrls, schedulePurgeCloudflare } from "@/lib/cloudflarePurge";

/**
 * Drops Next's cached copy of every public page, in every language.
 *
 * Revalidating public URLs such as `/` or `/about` does not work here. The
 * middleware rewrites the default language to `/<lang>/…` internally, so the
 * cache entries are keyed `/ar`, `/ar/about`, and the public path matched
 * nothing. A save cleared nothing, the stale page lived until the hourly
 * refresh, and LiteSpeed (purged by the same save) re-cached that stale copy
 * for a day.
 *
 * The root layout is what every cached page is tagged with (`_N_T_/layout`).
 * `/[lang]` does not work either: the tag carries the route group, as
 * `/(site)/[lang]/layout`. This covers the document itself, the homepage,
 * listings, menus and related-post blocks that show it. Regeneration is lazy,
 * on each page's next visit.
 */
export function revalidatePublicSite(opts: { cloudflarePaths?: string[] } = {}): void {
  // Every write that re-renders the site also re-reads settings, so the pages
  // rebuilt next never use the short-lived shared copy (lib/settings.ts).
  invalidateSiteSettings();
  // Cloudflare too, or the edge keeps the old page for a day (cloudflarePurge.ts).
  // A small change names the few URLs it affects instead: emptying the zone
  // also throws out every optimised image, and the origin then re-serves all
  // of them as visitors return — the CPU surge behind earlier outages.
  if (opts.cloudflarePaths) purgeCloudflarePaths(opts.cloudflarePaths);
  else schedulePurgeCloudflare();
  revalidatePath("/", "layout");
  // Route handlers are not under the layout; the sitemap files are named.
  for (const p of ["/sitemap_index.xml", "/sitemap.xml", "/post-sitemap.xml", "/page-sitemap.xml", "/category-sitemap.xml", "/tag-sitemap.xml", "/author-sitemap.xml"]) {
    revalidatePath(p);
  }
}

/**
 * Drops these public paths (or `/_next/image?…` URLs) from Cloudflare only.
 * Fire-and-forget, and skipped when "purge on save" is off, like the rest.
 */
export function purgeCloudflarePaths(paths: string[]): void {
  if (paths.length === 0) return;
  void (async () => {
    try {
      const { getSiteSettings } = await import("@/lib/settings");
      const { siteUrl } = await import("@/lib/siteUrl");
      const settings = await getSiteSettings();
      if (settings.cf_purge_on_save === "false") return;
      const base = siteUrl(settings);
      const urls = paths.map((p) => {
        let path = p;
        try {
          // Cloudflare keys on the URL as sent: percent-encoded, never twice.
          if (!/%[0-9A-Fa-f]{2}/.test(p)) path = encodeURI(p);
        } catch {
          /* keep as given */
        }
        return `${base}${path === "/" ? "" : path}`;
      });
      await purgeCloudflareUrls(settings, urls);
    } catch {
      // Best effort, like every other Cloudflare call.
    }
  })();
}
