import { getSiteSettings } from "@/lib/settings";
import { childSitemapResponse } from "@/lib/sitemap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * See lib/sitemap.ts — one child of /sitemap_index.xml.
 *
 * `SITEMAP_KINDS` has listed "tag" since the split, and the index advertised
 * this file as soon as a site had one tag — to a route that did not exist, so
 * the index pointed at a 404.
 */
export async function GET() {
  return childSitemapResponse("tag", await getSiteSettings());
}
