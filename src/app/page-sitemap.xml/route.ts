import { getSiteSettings } from "@/lib/settings";
import { childSitemapResponse } from "@/lib/sitemap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** See lib/sitemap.ts — one child of /sitemap_index.xml. */
export async function GET() {
  return childSitemapResponse("page", await getSiteSettings());
}
