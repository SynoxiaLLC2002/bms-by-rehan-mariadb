import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { LS_CACHE } from "@/lib/lscache";
import { DEFAULT_ROBOTS_TXT, servedRobotsTxt } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const settings = await getSiteSettings();
  const base = siteUrl(settings);

  // robots.txt is edited under SEO now; the old Settings key is honoured as a fallback.
  let body = (settings.seo_robots_txt || settings.robots_txt || "").trim() || DEFAULT_ROBOTS_TXT;

  // Search is noindex and rendered on every request, so every site gets the
  // search rules, inside the `*` group; the old prefix rules become exact
  // ones (see servedRobotsTxt).
  body = servedRobotsTxt(body);

  // Always advertise the sitemap (unless the author already added one).
  // The origin always resolves now, so this is no longer conditional on a
  // setting nobody knew they had to fill in.
  if (!/sitemap:/i.test(body)) {
    body += `\n\nSitemap: ${base}/sitemap_index.xml`;
  }

  return new Response(body + "\n", {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
      [LS_CACHE]: "public, max-age=3600",
    },
  });
}
