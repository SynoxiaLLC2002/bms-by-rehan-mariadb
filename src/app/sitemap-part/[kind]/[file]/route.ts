import { getSiteSettings } from "@/lib/settings";
import { childSitemapResponse, SITEMAP_KINDS, type SitemapKind } from "@/lib/sitemap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Part 2 onwards of a child sitemap — `/sitemap-part/post/2.xml`. Part 1 is
 * the classic `/post-sitemap.xml`; the index lists every part (lib/sitemap.ts).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string; file: string }> }) {
  const { kind, file } = await params;
  const m = /^([2-9]|[1-9]\d+)\.xml$/.exec(file);
  if (!m || !(SITEMAP_KINDS as readonly string[]).includes(kind)) return new Response("Not found", { status: 404 });
  return childSitemapResponse(kind as SitemapKind, await getSiteSettings(), parseInt(m[1], 10));
}
