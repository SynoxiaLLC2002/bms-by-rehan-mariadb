import type { Metadata } from "next";
import SiteLayout from "@/components/frontend/SiteLayout";
import SearchResults from "@/components/frontend/SearchResults";
import { searchPostsPage, SEARCH_RATE } from "@/lib/search";
import { headers } from "next/headers";
import { clientIp, rateLimited } from "@/lib/rateLimit";
import { getSiteSettings } from "@/lib/settings";
import { readSeo, renderTemplate } from "@/lib/seo";
import { searchPath } from "@/lib/permalinks";
import { robotsDirectives } from "@/lib/seoMeta";

export const dynamic = "force-dynamic";

/** `?q=a&q=b` arrives as an array; `.trim()` on that was a 500 anyone could ask for. */
function oneParam(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/**
 * `seo_search_noindex` defaults to "true" and the old hardcoded `false` matched
 * it — so the toggle looked right and did nothing. Turning it off now actually
 * lets search pages be indexed.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}): Promise<Metadata> {
  const settings = await getSiteSettings();
  const seo = readSeo(settings);
  const q = oneParam((await searchParams).q);

  // `seo_search_title` has been a configurable template all along and the page
  // hard-coded "Search" regardless — the fifth setting found collected and
  // never applied. `%search%` is the term, so the tab and the SERP line say
  // what was actually searched for.
  const title =
    renderTemplate(
      seo.seo_search_title,
      {
        search: q,
        sitename: settings.site_name || "",
        sitedesc: settings.site_description || "",
      },
      seo.seo_separator
    ) || "Search";

  return {
    // See the note on absolute titles: the template already ends in the site
    // name, and the layout would append it a second time.
    title: { absolute: title },
    robots: robotsDirectives(seo.seo_search_noindex !== "true", true),
  };
}

/**
 * Search, scoped to one language.
 *
 * The language is a route segment like everywhere else — `/search` for the
 * default language, `/fr/search` for French. It briefly travelled as a query
 * parameter through a middleware rewrite, because a prefixed path had no route
 * of its own; putting the language into the routing removed the need for that.
 *
 * The layout above validates the code against the configured languages, so an
 * unconfigured one never reaches this component.
 */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const [{ lang }, sp] = await Promise.all([params, searchParams]);
  const q = oneParam(sp.q);
  const page = Math.max(1, parseInt(oneParam(sp.page), 10) || 1);
  const settings = await getSiteSettings();
  // Search cannot be cached (every query differs) and each one is database
  // work, so a bot looping random queries was a free way to burn CPU and
  // Neon compute hours. Past the limit the page still renders, with no
  // results and no query run. robots.txt only asks politely.
  const limited = !!q.trim() && rateLimited("search", clientIp({ headers: await headers() }), SEARCH_RATE);
  const results = limited
    ? { posts: [], total: 0, capped: false, totalPages: 0 }
    : await searchPostsPage(q, lang, page);

  return (
    <SiteLayout pageType="search" currentPath={searchPath(lang, settings)} language={lang}>
      <SearchResults
        query={q}
        posts={results.posts}
        total={results.total}
        capped={results.capped}
        page={Math.min(page, Math.max(1, results.totalPages))}
        totalPages={results.totalPages}
        settings={settings}
        language={lang}
      />
    </SiteLayout>
  );
}
