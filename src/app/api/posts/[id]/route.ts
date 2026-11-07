import { docBodyProblemFor } from "@/lib/docFields";
import { sanitizeSchemas } from "@/lib/schemaTypes";
import { NextRequest, NextResponse } from "next/server";
import { fullPostPath, refreshPost, type PostState } from "@/lib/publishCache";
import { staleSave } from "@/lib/staleSave";
import { defaultCategoryId } from "@/lib/defaultCategory";
import { defaultContentLanguage } from "@/lib/locale";
import { pingIndexNow, postPingPaths } from "@/lib/indexnow";
import { siteUrl } from "@/lib/siteUrl";
import { db } from "@/lib/db";
import { readByIds } from "@/lib/db/write";
import { posts, categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { syncPostTags } from "@/lib/postTags";
import { blocksToPlainText } from "@/lib/blocksToText";
import { recordSlugChange } from "@/lib/autoRedirect";
import { refreshMenusIfLinked } from "@/lib/navLinks";
import { getSiteSettings } from "@/lib/settings";
import { rehomeLanguage } from "@/lib/rehomeLanguage";
import { uniqueSlug } from "@/lib/uniqueSlug";
import { resolvePublishedAt } from "@/lib/publishDate";
import { numericId } from "@/lib/routeParams";
import { isAdmin, canEditDocument, FORBIDDEN, isAuthor, canRunScripts, tokenPublishProblem, viaToken } from "@/lib/authz";
import { contentForRole } from "@/lib/contentPolicy";
import { deleteRevisionsFor, revisionMetaOf, snapshotRevision } from "@/lib/revisions";

/**
 * Refreshes the caches a post appears in — the post, the home page, its
 * archives, the sitemaps — in Next, LiteSpeed and Cloudflare, and only when
 * the save changed something a visitor can see (lib/publishCache.ts). A draft
 * autosave touches nothing. Returns the response headers to answer with,
 * since the LiteSpeed purge travels on them.
 *
 * The post's own path is whatever the permalink structure says it is, so it is
 * resolved rather than assumed — revalidating `/blog/<slug>` while the post is
 * served from `/<slug>` left the stale page in place, which looked exactly like
 * "saving does nothing".
 */
async function revalidatePost(before: PostState, after: PostState): Promise<Headers> {
  const headers = new Headers();
  const settings = await getSiteSettings();
  const touched = await refreshPost(before, after, settings, headers);
  // Tell the search engines, if the post is public now. Not awaited: a save
  // must not wait on a third party.
  if (touched.length && after && after.status === "published" && !after.deletedAt) {
    void postPingPaths(after, settings).then((paths) => pingIndexNow(siteUrl(settings), paths, settings));
  }
  return headers;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, numId),
      with: { category: true },
    });
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const session = await auth();
    // Signed in, always. Gating only non-"published" rows left two kinds of
    // hidden content readable by anyone walking the (sequential) ids: a
    // scheduled post is "published" with a future date, and a trashed one
    // keeps its status — and the response carries the author id, the search
    // text and any custom code. Nothing public reads this route; the post's
    // own page is its public view.
    if (!session?.user?.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // An author may open only their own posts in the editor.
    if (!canEditDocument(session, post.authorId)) {
      return NextResponse.json(FORBIDDEN, { status: 403 });
    }

    return NextResponse.json({ post });
  } catch {
    return NextResponse.json({ error: "Failed to fetch post" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = await req.json();
    // Types and allowed values before anything touches the database (lib/docFields).
    {
      const problem = await docBodyProblemFor(body ?? {}, { authorRole: isAuthor(session), siteUrl: siteUrl(await getSiteSettings()), kind: "post", id: numId });
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }
    // Scripts inside HTML Embed blocks are an administrator's power, like the
    // custom-code fields below — anyone else's embeds are stripped of them.
    if (body.content !== undefined) body.content = contentForRole(body.content, canRunScripts(session)).content;

    // Capture old slug (for revalidation) + original publish date (to preserve it).
    const existing = await db.query.posts.findFirst({
      where: eq(posts.id, numId),
      // `createdAt` and the id are here for `fullPostPath`: a dated or numeric
      // structure needs them to say where this post used to live.
      columns: {
        id: true, slug: true, status: true, deletedAt: true, publishedAt: true, createdAt: true,
        categoryId: true, language: true, title: true, content: true, excerpt: true, authorId: true, updatedAt: true,
        featuredImage: true, seoTitle: true, seoDescription: true, seoKeywords: true,
        ogTitle: true, ogDescription: true, ogImage: true,
        twitterTitle: true, twitterDescription: true, twitterImage: true,
        canonicalUrl: true, noIndex: true, noFollow: true, robotsAdvanced: true,
        schemaType: true, schemas: true, direction: true,
      },
    });

    // See the pages route: a save from a stale copy is refused, not merged.
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canEditDocument(session, existing.authorId)) return NextResponse.json(FORBIDDEN, { status: 403 });
    const conflict = staleSave(body.expectedUpdatedAt, existing.updatedAt);
    if (conflict) return NextResponse.json(conflict, { status: 409 });
    // An API token may edit a published page, but not publish, unpublish or
    // re-date it (lib/authz tokenPublishProblem).
    {
      const refused = tokenPublishProblem(session, body ?? {}, existing);
      if (refused) return NextResponse.json({ error: refused }, { status: 403 });
    }

    // A post may move to another published language (see rehomeLanguage).
    // Everything keyed by language follows: the slug is re-checked in the new
    // one below, the old address is redirected after the write, tags are
    // re-synced there, and a category — which belongs to one language — is
    // dropped rather than left pointing across the partition.
    const home = await rehomeLanguage(existing.language, body.language);
    // Absent means "not editing this", as for every other field — a body with
    // no `categoryId` keeps the post's category (re-checked if it moved).
    let categoryId: number | null = "categoryId" in body ? (body.categoryId ?? null) : existing.categoryId;
    if (home && categoryId !== null) {
      const cat = await db.query.categories.findFirst({ where: eq(categories.id, categoryId), columns: { language: true } });
      if (cat && cat.language !== home) categoryId = null;
    }
    // No category chosen (or the old one dropped above): Uncategorized.
    if (categoryId === null) categoryId = await defaultCategoryId(home ?? existing.language ?? defaultContentLanguage(await getSiteSettings()));
    // Partial bodies again: with neither slug nor title the slug stays (only
    // re-checked when the language moves), and with neither status nor date
    // the publish date stays — `resolvePublishedAt(undefined, undefined, …)`
    // answers null, which took a live post off the site.
    // A title alone moves the address only while the document has never been
    // public (WordPress's rule): a published page's URL is what search engines
    // and links know, and a title-only edit — Claude over MCP, a script —
    // re-slugged live pages behind a 301. A slug that is sent always wins.
    const wasPublic = existing.status === "published" || !!existing.publishedAt;
    const slugSource = body.slug || (wasPublic ? undefined : body.title) || (home ? existing.slug : undefined);
    const touchesDate = "status" in body || "publishedAt" in body;
    // Only an administrator may attach raw markup or CSS to a document. An
    // editor can write posts; injecting a script into a page visitors load is a
    // different power, and it is the one the site-wide script settings are
    // already gated on. Absent from the body means "not editing them", which is
    // what lets an editor save a post normally.
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
    await db.update(posts).set({
      title: body.title,
      // Free within the language the post will be in after this save.
      slug: slugSource ? await uniqueSlug("post", slugSource, numId, home ?? existing.language) : undefined,
      ...(home ? { language: home } : {}),
      excerpt: body.excerpt,
      content: body.content,
      searchText: body.content !== undefined ? blocksToPlainText(body.content) : undefined,
      featuredImage: body.featuredImage,
      // "ltr" / "rtl" override; anything else means "follow the language".
      direction: "direction" in body ? (body.direction === "ltr" || body.direction === "rtl" ? body.direction : null) : undefined,
      status: body.status,
      categoryId,
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
      noIndex: body.noIndex,
      noFollow: body.noFollow,
      robotsAdvanced: "robotsAdvanced" in body ? (typeof body.robotsAdvanced === "string" && body.robotsAdvanced ? body.robotsAdvanced.slice(0, 500) : null) : undefined,
      schemaType: body.schemaType,
      schemas: "schemas" in body ? sanitizeSchemas(body.schemas) : undefined,
      transparentHeader: body.transparentHeader,
      showTitle: body.showTitle,
      showComments: body.showComments,
      postLayout: body.postLayout,
      contentStyle: body.contentStyle,
      verticalSpacing: body.verticalSpacing,
      showFeaturedImage: body.showFeaturedImage,
      cssClasses: "cssClasses" in body ? body.cssClasses || null : undefined,
      disableHeader: body.disableHeader,
      disableFooter: body.disableFooter,
      // Preserve the original publish date; only stamp it on first publish.
      publishedAt: touchesDate ? resolvePublishedAt(body.publishedAt, body.status ?? existing.status, existing.publishedAt) : undefined,
      updatedAt: new Date(),
      ...authored,
    }).where(eq(posts.id, numId));
    const [post] = await readByIds(posts, [numId]);

    // The state *before* this save, kept only when something actually
    // changed — the editor autosaves, so snapshotting every save would
    // store dozens of near-identical rows per session.
    if (existing) {
      await snapshotRevision(
        "post",
        numId,
        { title: existing.title, content: existing.content, excerpt: existing.excerpt ?? null, meta: revisionMetaOf(existing) },
        { title: body.title ?? existing.title, content: body.content ?? existing.content, excerpt: body.excerpt ?? existing.excerpt, meta: revisionMetaOf({ ...existing, ...body }) },
        (session.user as { id?: string })?.id,
        { autosave: body.autosave === true }
      );
    }

    if (post?.id) await syncPostTags(post.id, body.tags, post.language);

    const headers = await revalidatePost(existing, post);
    // Only a post that had a public address needs one kept: a draft's first
    // publish moves it off its created-at date, which is no one's old link.
    if (existing?.slug && existing.status === "published" && post) {
      const settings = await getSiteSettings();
      // Keep the old URL working now that it has moved. Compared as whole
      // paths, not slugs: under a dated or %category% structure a new publish
      // date or category moves the post too, and only checking the slug and
      // language left those old addresses as 404s. (Its cache entry was
      // dropped by revalidatePost.)
      const was = await fullPostPath(existing, settings);
      const now = await fullPostPath(post, settings);
      if (was !== now) {
        await recordSlugChange(was, now);
        await refreshMenusIfLinked("post", numId).catch(() => undefined);
      }
    }

    return NextResponse.json({ post }, { headers });
  } catch {
    return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
  }
}

/**
 * Trashes a post, or destroys it.
 *
 * The default is the trash: `?permanent=1` is the only way to actually delete,
 * and the admin only sends it from inside the Trash view. Deleting used to be
 * immediate and took the revision history with it, so a misclick on the wrong
 * row was unrecoverable — the one mistake in this CMS that could not be undone.
 *
 * `?restore=1` is the way back out.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const existing = await db.query.posts.findFirst({
      where: eq(posts.id, numId),
      columns: { id: true, slug: true, status: true, deletedAt: true, categoryId: true, publishedAt: true, createdAt: true, language: true, authorId: true },
    });
    if (existing && !canEditDocument(session, existing.authorId)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const permanent = req.nextUrl.searchParams.get("permanent") === "1";
    const restore = req.nextUrl.searchParams.get("restore") === "1";
    // Moving to the trash can be undone; destroying cannot. A token never
    // destroys — a leaked token must not be a way to wipe content.
    if (permanent && viaToken(session)) {
      return NextResponse.json({ error: "An API token cannot delete permanently. Empty the trash from the admin." }, { status: 403 });
    }

    if (restore) {
      await db.update(posts).set({ deletedAt: null }).where(eq(posts.id, numId));
    } else if (permanent) {
      await db.delete(posts).where(eq(posts.id, numId));
      // Serial ids are reused after a delete, so leaving the history behind
      // would hand the next document someone else's revisions.
      await deleteRevisionsFor("post", [numId]);
    } else {
      // The status is left exactly as it was — it records whether this was a
      // draft or published, which is the state a restore has to return to.
      await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, numId));
    }

    // The row after: gone, back from the trash, or in it.
    const after: PostState = !existing || permanent ? null : { ...existing, deletedAt: restore ? null : new Date() };
    const headers = await revalidatePost(existing, after);
    return NextResponse.json({ success: true, trashed: !permanent && !restore, restored: restore }, { headers });
  } catch {
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }
}
