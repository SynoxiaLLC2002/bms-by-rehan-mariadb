import { getSiteSettings } from "@/lib/settings";
import { renderIndex, sitemapHeaders } from "@/lib/sitemap";

// Built on the host, not on the PC. A prerendered file would bake
// `http://localhost:3000` from this machine's NEXTAUTH_URL into every upload.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** The sitemap index — see lib/sitemap.ts. */
export async function GET() {
  return new Response(await renderIndex(await getSiteSettings()), { headers: await sitemapHeaders() });
}
