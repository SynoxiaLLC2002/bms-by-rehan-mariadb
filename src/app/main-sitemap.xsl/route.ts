import { getSiteSettings } from "@/lib/settings";
import { renderStylesheet } from "@/lib/sitemap";
import { LS_CACHE } from "@/lib/lscache";

// Dynamic, not `revalidate`: it reads the site name from the database, and
// a revalidated route is prerendered at build time — with the build
// machine's database, which is how the favicon shipped the dev site's icon.
// The response still carries a day's cache header.
export const dynamic = "force-dynamic";

/** The stylesheet every sitemap file references — see lib/sitemap.ts. */
export async function GET() {
  const settings = await getSiteSettings();
  return new Response(renderStylesheet(settings.site_name || ""), {
    headers: {
      "Content-Type": "text/xsl; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      [LS_CACHE]: "public, max-age=86400",
    },
  });
}
