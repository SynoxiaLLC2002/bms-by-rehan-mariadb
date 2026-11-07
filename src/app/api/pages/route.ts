import { docBodyProblemFor } from "@/lib/docFields";
import { sanitizeSchemas } from "@/lib/schemaTypes";
import { isTrashed, notTrashed } from "@/lib/publishState";
import { NextRequest, NextResponse } from "next/server";
import { refreshPage } from "@/lib/publishCache";
import { pingIndexNow } from "@/lib/indexnow";
import { siteUrl } from "@/lib/siteUrl";
import { pagePath, rootPath } from "@/lib/permalinks";
import { db } from "@/lib/db";
import { insertReturning } from "@/lib/db/write";
import { pages } from "@/lib/db/schema";
import { desc, eq, and, or } from "drizzle-orm";
import { ilike } from "@/lib/db/sql";
import { likePattern } from "@/lib/search";
import { auth } from "@/lib/auth";
import { uniqueSlug } from "@/lib/uniqueSlug";
import { getSiteSettings } from "@/lib/settings";
import { resolveContentLanguage } from "@/lib/locale";
import { resolvePublishedAt } from "@/lib/publishDate";
import { isAdmin, FORBIDDEN, isAuthor, canRunScripts, tokenPublishProblem } from "@/lib/authz";
import { contentForRole } from "@/lib/contentPolicy";

export async function GET(req: NextRequest) {
  try {
    // Admin-only: this lists drafts and unpublished content, and every caller
    // is an admin screen. Ungated, it let anyone enumerate unpublished titles,
    // slugs and excerpts.
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    // The trash is a separate view, not part of any listing.
    //
    // `?trash=1` is the only way to see trashed documents, so every existing
    // caller keeps showing exactly what it showed before without being changed.
    const trash = searchParams.get("trash") === "1";

    const conditions = [trash ? isTrashed(pages) : notTrashed(pages)];
    if (status) conditions.push(eq(pages.status, status));
    // Case-insensitive, with `%` and `_` meaning themselves (see lib/search).
    if (search) {
      const pattern = likePattern(search.trim().slice(0, 200));
      conditions.push(or(ilike(pages.title, pattern), ilike(pages.slug, pattern)));
    }

    const result = await db.query.pages.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(pages.createdAt)],
      // Same as the posts list: the callers (menu builder, customizer homepage
      // picker) need id/title/slug, not every page's body.
      columns: { id: true, title: true, slug: true, status: true, createdAt: true },
    });

    return NextResponse.json({ pages: result });
  } catch {
    return NextResponse.json({ error: "Failed to fetch pages" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const body = await req.json();
    // An API token creates drafts only (lib/authz tokenPublishProblem).
    {
      const refused = tokenPublishProblem(session, body ?? {}, null);
      if (refused) return NextResponse.json({ error: refused }, { status: 403 });
    }
    // Types and allowed values before anything touches the database (lib/docFields).
    {
      const problem = await docBodyProblemFor(body ?? {}, { authorRole: isAuthor(session), siteUrl: siteUrl(await getSiteSettings()), kind: "page" });
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }
    // Scripts inside HTML Embed blocks are an administrator's power, like the
    // custom-code fields below — anyone else's embeds are stripped of them.
    if (body.content !== undefined) body.content = contentForRole(body.content, canRunScripts(session)).content;
    const language = resolveContentLanguage(body.language, await getSiteSettings());
    // The slug namespace is the language, so resolve that first.
    const slug = await uniqueSlug("page", body.slug || body.title, undefined, language);

    // Same rule as the update path: raw markup on a page visitors load is an
    // administrator's power. Without this the create route silently dropped
    // them — the editor sent CSS and scripts, the insert ignored them, and the
    // author's work vanished on the first save with no error.
    const authored: Record<string, string | null> = {};
    if (
      body.scriptHead !== undefined ||
      body.scriptBodyEnd !== undefined ||
      body.customCss !== undefined
    ) {
      if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });
      // Head and footer code runs on the page: a browser's power, never a
      // token's (canRunScripts). Custom CSS stays open to an admin token.
      if (!canRunScripts(session) && (body.scriptHead !== undefined || body.scriptBodyEnd !== undefined)) {
        return NextResponse.json({ error: "Head and footer scripts can only be changed from the admin, not with an API token." }, { status: 403 });
      }
      // Each only when sent: saving one of the three used to blank the
      // other two whenever a caller sent just the one it was changing.
      if (body.scriptHead !== undefined) authored.scriptHead = body.scriptHead || null;
      if (body.scriptBodyEnd !== undefined) authored.scriptBodyEnd = body.scriptBodyEnd || null;
      if (body.customCss !== undefined) authored.customCss = body.customCss || null;
    }

    const [page] = await insertReturning(pages, {
      title: body.title,
      slug,
      content: body.content,
      featuredImage: body.featuredImage,
      // "ltr" / "rtl" override; anything else means "follow the language".
      direction: body.direction === "ltr" || body.direction === "rtl" ? body.direction : null,
      status: body.status ?? "draft",
      language,
      template: body.template ?? "default",
      authorId: session.user?.id,
      seoTitle: body.seoTitle,
      seoDescription: body.seoDescription,
      seoKeywords: body.seoKeywords,
      ogTitle: body.ogTitle,
      ogDescription: body.ogDescription,
      ogImage: body.ogImage,
      twitterTitle: body.twitterTitle,
      twitterDescription: body.twitterDescription,
      twitterImage: body.twitterImage,
      canonicalUrl: body.canonicalUrl,
      noIndex: body.noIndex ?? false,
      noFollow: body.noFollow ?? false,
      robotsAdvanced: typeof body.robotsAdvanced === "string" && body.robotsAdvanced ? body.robotsAdvanced.slice(0, 500) : null,
      schemaType: body.schemaType ?? "WebPage",
      schemas: sanitizeSchemas(body.schemas),
      publishedAt: resolvePublishedAt(body.publishedAt, body.status, null),
      ...authored,
    });

    // A new draft touches nothing public — see lib/publishCache.ts.
    const headers = new Headers();
    const settings = await getSiteSettings();
    const touched = page ? refreshPage(null, page, settings, headers) : [];
    if (touched.length) void pingIndexNow(siteUrl(settings), [...(page.noIndex ? [] : [pagePath(page, settings)]), rootPath(page.language, settings)], settings);

    return NextResponse.json({ page }, { status: 201, headers });
  } catch {
    return NextResponse.json({ error: "Failed to create page" }, { status: 500 });
  }
}
