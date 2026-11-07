import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ilike } from "@/lib/db/sql";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pages } from "@/lib/db/schema";
import { likePattern, searchPosts } from "@/lib/search";
import { getSiteSettings } from "@/lib/settings";
import { pagePath, postPath } from "@/lib/permalinks";

/**
 * Internal link suggestions for the editor: the published posts and pages
 * that match a phrase (the focus keyword, or words from the title), with the
 * URL each one is served at. Signed-in users only — it lists content by
 * relevance the public search does not expose in this shape.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  const lang = (req.nextUrl.searchParams.get("lang") ?? "en").slice(0, 10);
  const excludePost = parseInt(req.nextUrl.searchParams.get("excludePost") ?? "", 10);
  const excludePage = parseInt(req.nextUrl.searchParams.get("excludePage") ?? "", 10);
  if (q.length < 2) return NextResponse.json({ items: [] });

  const settings = await getSiteSettings();
  const found = await searchPosts(q, lang);
  const items = found
    .filter((p) => p.id !== excludePost)
    .slice(0, 8)
    .map((p) => ({ kind: "post", id: p.id, title: p.title, url: postPath(p, settings), excerpt: p.excerpt ?? "" }));

  try {
    const pg = await db.query.pages.findMany({
      where: and(eq(pages.status, "published"), isNull(pages.deletedAt), eq(pages.language, lang), ilike(pages.title, likePattern(q))),
      columns: { id: true, title: true, slug: true, language: true, seoDescription: true },
      orderBy: [desc(pages.updatedAt)],
      limit: 4,
    });
    for (const p of pg) {
      if (p.id === excludePage) continue;
      items.push({ kind: "page", id: p.id, title: p.title, url: pagePath(p, settings), excerpt: p.seoDescription ?? "" });
    }
  } catch {
    // Pages are a bonus; posts are the point.
  }

  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
