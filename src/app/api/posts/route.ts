import { docBodyProblemFor } from "@/lib/docFields";
import { sanitizeSchemas } from "@/lib/schemaTypes";
import { isTrashed, notTrashed } from "@/lib/publishState";
import { NextRequest, NextResponse } from "next/server";
import { refreshPost } from "@/lib/publishCache";
import { defaultCategoryId } from "@/lib/defaultCategory";
import { pingIndexNow, postPingPaths } from "@/lib/indexnow";
import { siteUrl } from "@/lib/siteUrl";
import { db } from "@/lib/db";
import { insertReturning } from "@/lib/db/write";
import { posts } from "@/lib/db/schema";
import { desc, eq, and, or, count } from "drizzle-orm";
import { ilike } from "@/lib/db/sql";
import { likePattern } from "@/lib/search";
import { auth } from "@/lib/auth";
import { uniqueSlug } from "@/lib/uniqueSlug";
import { resolveContentLanguage } from "@/lib/locale";
import { getSiteSettings } from "@/lib/settings";
import { syncPostTags } from "@/lib/postTags";
import { blocksToPlainText } from "@/lib/blocksToText";
import { resolvePublishedAt } from "@/lib/publishDate";
import { isAuthor, isAdmin, FORBIDDEN, canRunScripts, tokenPublishProblem } from "@/lib/authz";
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
    const categoryId = searchParams.get("categoryId");
    // `parseInt("abc")` is NaN, and NaN reached the offset calculation and
    // came back as a 500 from the driver. An unbounded `limit` was worse: one
    // request could ask for every post on the site. Both are clamped, and a
    // value that makes no sense falls back to the default rather than
    // failing — this is a listing, not a form.
    const clamp = (raw: string | null, fallback: number, max: number) => {
      const n = parseInt(raw ?? "", 10);
      return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : fallback;
    };
    const page = clamp(searchParams.get("page"), 1, 100_000);
    const limit = clamp(searchParams.get("limit"), 20, 100);
    const offset = (page - 1) * limit;

    // The trash is a separate view, not part of any listing.
    //
    // `?trash=1` is the only way to see trashed documents, so every existing
    // caller keeps showing exactly what it showed before without being changed.
    const trash = searchParams.get("trash") === "1";

    const conditions = [trash ? isTrashed(posts) : notTrashed(posts)];
    if (status) conditions.push(eq(posts.status, status));
    // Authors list only their own work.
    if (isAuthor(session)) conditions.push(eq(posts.authorId, session.user!.id as string));
    // A non-numeric id was NaN in the query and a 500 from the driver.
    const catId = categoryId ? parseInt(categoryId, 10) : NaN;
    if (categoryId && !Number.isFinite(catId)) return NextResponse.json({ posts: [] });
    if (Number.isFinite(catId)) conditions.push(eq(posts.categoryId, catId));
    // Case-insensitive, and `%` / `_` typed by a person mean themselves, not
    // "anything" — the same escaping site search uses.
    if (search) {
      const pattern = likePattern(search.trim().slice(0, 200));
      conditions.push(or(ilike(posts.title, pattern), ilike(posts.slug, pattern)));
    }

    const result = await db.query.posts.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(posts.createdAt)],
      limit,
      offset,
      with: { category: true },
      // This is a *list* endpoint and its only caller builds menu links out of
      // id/title/slug. Returning the block JSON as well sent the entire site's
      // content to the browser to populate a dropdown.
      columns: {
        id: true, title: true, slug: true, excerpt: true,
        status: true, createdAt: true, publishedAt: true,
      },
    });

    // How many match in all, so a caller paging through (the connector's
    // list_documents) knows when it has seen everything: a silent stop at 20 made
    // it miss published posts.
    const [{ total }] = await db.select({ total: count() }).from(posts).where(and(...conditions));
    const all = Number(total);
    return NextResponse.json({ posts: result, page, limit, total: all, hasMore: offset + result.length < all });
  } catch {
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    // An API token creates drafts only (lib/authz tokenPublishProblem).
    {
      const refused = tokenPublishProblem(session, body ?? {}, null);
      if (refused) return NextResponse.json({ error: refused }, { status: 403 });
    }
    // Types and allowed values before anything touches the database (lib/docFields).
    {
      const problem = await docBodyProblemFor(body ?? {}, { authorRole: isAuthor(session), siteUrl: siteUrl(await getSiteSettings()), kind: "post" });
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }
    // Scripts inside HTML Embed blocks are an administrator's power, like the
    // custom-code fields below — anyone else's embeds are stripped of them.
    if (body.content !== undefined) body.content = contentForRole(body.content, canRunScripts(session)).content;
    const language = resolveContentLanguage(body.language, await getSiteSettings());
    // The slug namespace is the language, so resolve that first.
    const slug = await uniqueSlug("post", body.slug || body.title, undefined, language);

    // Resolved against the configured languages rather than trusted: a client
    // could otherwise create content in a language the site does not publish,
    // which would be invisible in every listing.

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

    const [post] = await insertReturning(posts, {
      title: body.title,
      slug,
      excerpt: body.excerpt,
      content: body.content,
      searchText: blocksToPlainText(body.content),
      featuredImage: body.featuredImage,
      // "ltr" / "rtl" override; anything else means "follow the language".
      direction: body.direction === "ltr" || body.direction === "rtl" ? body.direction : null,
      status: body.status ?? "draft",
      language,
      categoryId: body.categoryId ?? (await defaultCategoryId(language)),
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
      showComments: body.showComments ?? "default",
      schemaType: body.schemaType ?? "Article",
      schemas: sanitizeSchemas(body.schemas),
      publishedAt: resolvePublishedAt(body.publishedAt, body.status, null),
      ...authored,
    });

    await syncPostTags(post.id, body.tags, post.language);

    // A new draft touches nothing public; a post published straight away
    // refreshes the pages it appears on — see lib/publishCache.ts.
    const headers = new Headers();
    const settings = await getSiteSettings();
    const touched = await refreshPost(null, post, settings, headers);
    if (touched.length) void postPingPaths(post, settings).then((paths) => pingIndexNow(siteUrl(settings), paths, settings));

    return NextResponse.json({ post }, { status: 201, headers });
  } catch {
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}
