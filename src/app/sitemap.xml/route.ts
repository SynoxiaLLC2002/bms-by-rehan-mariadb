export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The address the sitemap lived at before it was split — now a permanent
 * redirect to /sitemap_index.xml, the one official address (robots.txt names
 * it). It used to answer with an identical copy of the index, which gave
 * Search Console two sitemaps with the same contents and built the whole
 * index on every keep-alive ping. Old submissions, tools that guess
 * `/sitemap.xml`, and the cron still get an answer: Google follows sitemap
 * redirects, and the cron's request still wakes the app.
 *
 * A relative Location, so it can never point at a host other than the one
 * that was asked (the middleware has already enforced the canonical host).
 */
export function GET() {
  return new Response(null, {
    status: 301,
    headers: {
      Location: "/sitemap_index.xml",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
