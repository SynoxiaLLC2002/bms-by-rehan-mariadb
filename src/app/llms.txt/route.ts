import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { pages, posts } from "@/lib/db/schema";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { LS_CACHE } from "@/lib/lscache";
import { isLive } from "@/lib/publishState";
import { absoluteUrlFor, pagePath, postUrl } from "@/lib/permalinks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * `/llms.txt` — a Markdown summary of the site for language-model agents
 * (llmstxt.org): an H1 with the site name, the description as a quote, then
 * the pages and the latest posts as links.
 *
 * Without it the URL was a 404, and a 404 on this CMS is a full server render
 * of the error page. Lighthouse's Agentic Browsing check fetches it on every
 * run; on a busy shared host that render timed out and the check failed on a
 * missing file *and* a slow one. Pages and posts marked noindex are left out,
 * the same rule the sitemap follows.
 */
export async function GET() {
  const settings = await getSiteSettings();
  const base = siteUrl(settings);
  const name = (settings.site_name || "").trim() || new URL(base).hostname;
  const description = (settings.site_description || "").replace(/\s+/g, " ").trim();

  const clean = (s: string | null | undefined) => (s ?? "").replace(/[\[\]\n\r]+/g, " ").trim();
  const lines: string[] = [`# ${clean(name)}`, ""];
  if (description) lines.push(`> ${description}`, "");

  // No catch: a list with no pages during an outage would be cached for an hour.
  const livePages = await db.query.pages.findMany({
    where: isLive(pages),
    columns: { id: true, slug: true, title: true, language: true, noIndex: true, seoDescription: true },
    orderBy: [desc(pages.updatedAt)],
    limit: 100,
  });
  const shown = livePages.filter((p) => !p.noIndex && clean(p.title));
  if (shown.length) {
    lines.push("## Pages", "");
    for (const p of shown) {
      const note = clean(p.seoDescription);
      lines.push(`- [${clean(p.title)}](${absoluteUrlFor(base, pagePath(p, settings))})${note ? `: ${note}` : ""}`);
    }
    lines.push("");
  }

  const livePosts = await db.query.posts.findMany({
    where: isLive(posts),
    columns: { id: true, slug: true, title: true, language: true, noIndex: true, seoDescription: true, excerpt: true, publishedAt: true, createdAt: true },
    orderBy: [desc(posts.publishedAt), desc(posts.id)],
    limit: 100,
  });
  const shownPosts = livePosts.filter((p) => !p.noIndex && clean(p.title));
  if (shownPosts.length) {
    lines.push("## Posts", "");
    for (const p of shownPosts) {
      const note = clean(p.seoDescription || p.excerpt);
      lines.push(`- [${clean(p.title)}](${postUrl(p, settings, base)})${note ? `: ${note}` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Optional", "", `- [Sitemap](${base}/sitemap_index.xml)`, "");

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
      [LS_CACHE]: "public, max-age=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}
