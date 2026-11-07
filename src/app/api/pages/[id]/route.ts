import { docBodyProblemFor } from "@/lib/docFields";
import { sanitizeSchemas } from "@/lib/schemaTypes";
import { NextRequest, NextResponse } from "next/server";
import { refreshPage, type PageState } from "@/lib/publishCache";
import { staleSave } from "@/lib/staleSave";
import { pingIndexNow } from "@/lib/indexnow";
import { siteUrl } from "@/lib/siteUrl";
import { db } from "@/lib/db";
import { readByIds } from "@/lib/db/write";
import { pages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { uniqueSlug } from "@/lib/uniqueSlug";
import { recordSlugChange } from "@/lib/autoRedirect";
import { refreshMenusIfLinked } from "@/lib/navLinks";
import { getSiteSettings } from "@/lib/settings";
import { rehomeLanguage } from "@/lib/rehomeLanguage";
import { pagePath, rootPath } from "@/lib/permalinks";
import { resolvePublishedAt } from "@/lib/publishDate";
import { numericId } from "@/lib/routeParams";
import { isAdmin, FORBIDDEN, isAuthor, canRunScripts, tokenPublishProblem, viaToken } from "@/lib/authz";
import { contentForRole } from "@/lib/contentPolicy";
import { deleteRevisionsFor, revisionMetaOf, snapshotRevision } from "@/lib/revisions";

/**
 * Refreshes the page and its language's home in every cache layer, only when
 * the save changed something public (lib/publishCache.ts), and tells the
 * search engines. Returns the headers the response must carry.
 */
async function revalidatePageRoute(before: PageState, after: PageState): Promise<Headers> {
  const headers = new Headers();
  const settings = await getSiteSettings();
  const touched = refreshPage(before, after, settings, headers);
  if (touched.length && after && after.status === "published" && !after.deletedAt) {
    // This language's home, and the page itself only when it may be indexed.
    const noIndex = (after as { noIndex?: boolean | null }).noIndex;
    void pingIndexNow(siteUrl(settings), [...(noIndex ? [] : [pagePath(after, settings)]), rootPath(after.language, settings)], settings);
  }
  return headers;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const page = await db.query.pages.findFirst({
      where: eq(pages.id, numId),
    });
    if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Signed-in editors and administrators only — see the posts route. The
    // public site never reads this; the page itself is the public view.
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    return NextResponse.json({ page });
  } catch {
    return NextResponse.json({ error: "Failed to fetch page" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = await req.json();
    // Types and allowed values before anything touches the database (lib/docFields).
    {
      const problem = await docBodyProblemFor(body ?? {}, { authorRole: isAuthor(session), siteUrl: siteUrl(await getSiteSettings()), kind: "page", id: numId });
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }
    // Scripts inside HTML Embed blocks are an administrator's power, like the
    // custom-code fields below — anyone else's embeds are stripped of them.
    if (body.content !== undefined) body.content = contentForRole(body.content, canRunScripts(session)).content;

    const existing = await db.query.pages.findFirst({
      where: eq(pages.id, numId),
      columns: {
        id: true, slug: true, status: true, deletedAt: true, publishedAt: true, language: true,
        title: true, content: true, updatedAt: true, featuredImage: true,
        seoTitle: true, seoDescription: true, seoKeywords: true,
        ogTitle: true, ogDescription: true, ogImage: true,
        twitterTitle: true, twitterDescription: true, twitterImage: true,
        canonicalUrl: true, noIndex: true, noFollow: true, robotsAdvanced: true,
        schemaType: true, schemas: true, direction: true,
      },
    });

    // The save replaces every field, so a save from a copy that is older
    // than the row would put back whatever that copy had — an empty SEO
    // description typed in another tab, a paragraph deleted an hour ago.
    // The editor sends the version it loaded; a mismatch is refused, and it
    // tells the person to reload rather than silently winning.
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const conflict = staleSave(body.expectedUpdatedAt, existing.updatedAt);
    if (conflict) return NextResponse.json(conflict, { status: 409 });
    // An API token may edit a published page, but not publish, unpublish or
    // re-date it (lib/authz tokenPublishProblem).
    {
      const refused = tokenPublishProblem(session, body ?? {}, existing);
      if (refused) return NextResponse.json({ error: refused }, { status: 403 });
    }

    // A page may move to another published language — see the posts route.
    const home = await rehomeLanguage(existing.language, body.language);
    // Partial bodies keep their slug and publish date — see the posts route.
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
    // Absent means "not editing this": undefined is skipped by the update, so
    // a partial body — an older client, a script, a plugin — cannot reset a
    // field it never mentioned. (`content: undefined` likewise leaves content.)
    await db.update(pages).set({
      title: body.title,
      // Free within the language the page will be in after this save.
      slug: slugSource ? await uniqueSlug("page", slugSource, numId, home ?? existing.language) : undefined,
      ...(home ? { language: home } : {}),
      content: body.content,
      featuredImage: body.featuredImage,
      // "ltr" / "rtl" override; anything else means "follow the language".
      direction: "direction" in body ? (body.direction === "ltr" || body.direction === "rtl" ? body.direction : null) : undefined,
      status: body.status,
      template: body.template,
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
      postLayout: body.postLayout,
      contentStyle: body.contentStyle,
      verticalSpacing: body.verticalSpacing,
      showFeaturedImage: body.showFeaturedImage,
      showComments: body.showComments,
      cssClasses: "cssClasses" in body ? body.cssClasses || null : undefined,
      disableHeader: body.disableHeader,
      disableFooter: body.disableFooter,
      // Preserve the original publish date; only stamp it on first publish.
      publishedAt: touchesDate ? resolvePublishedAt(body.publishedAt, body.status ?? existing.status, existing.publishedAt) : undefined,
      updatedAt: new Date(),
      ...authored,
    }).where(eq(pages.id, numId));
    const [page] = await readByIds(pages, [numId]);

    // The state *before* this save, kept only when something actually
    // changed — the editor autosaves, so snapshotting every save would
    // store dozens of near-identical rows per session.
    if (existing) {
      await snapshotRevision(
        "page",
        numId,
        { title: existing.title, content: existing.content, meta: revisionMetaOf(existing) },
        { title: body.title ?? existing.title, content: body.content ?? existing.content, meta: revisionMetaOf({ ...existing, ...body }) },
        (session.user as { id?: string })?.id,
        { autosave: body.autosave === true }
      );
    }

    const headers = await revalidatePageRoute(existing, page);
    if (existing?.slug && page && (existing.slug !== page.slug || existing.language !== page.language)) {
      // Through `pagePath`, not `/${slug}`.
      //
      // The hand-built version ignored both things that decide a page's URL:
      // the language prefix and the homepage. Renaming a French page recorded
      // `/old → /new` when the real URLs are `/fr/old → /fr/new`, so the
      // redirect could never fire — and if anything had hit `/old`, it would
      // have been sent to a 404. The post route already resolved this properly;
      // this was the sibling still building the URL by hand.
      const settings = await getSiteSettings();
      const from = pagePath({ id: numId, slug: existing.slug, language: existing.language }, settings);
      const to = pagePath(page, settings);

      // A homepage answers at its language root whatever its slug says, so
      // renaming one changes no public URL and needs no redirect — and a
      // redirect from `/` to `/` would be a loop.
      if (from !== to) {
        await recordSlugChange(from, to);
        await refreshMenusIfLinked("page", numId).catch(() => undefined);
      }
    }

    return NextResponse.json({ page }, { headers });
  } catch {
    return NextResponse.json({ error: "Failed to update page" }, { status: 500 });
  }
}

/** Trashes a page, restores it, or destroys it — see the posts route. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const existing = await db.query.pages.findFirst({ where: eq(pages.id, numId), columns: { id: true, slug: true, status: true, deletedAt: true, publishedAt: true, language: true } });

    const permanent = req.nextUrl.searchParams.get("permanent") === "1";
    const restore = req.nextUrl.searchParams.get("restore") === "1";
    // Moving to the trash can be undone; destroying cannot. A token never
    // destroys — a leaked token must not be a way to wipe content.
    if (permanent && viaToken(session)) {
      return NextResponse.json({ error: "An API token cannot delete permanently. Empty the trash from the admin." }, { status: 403 });
    }

    if (restore) {
      await db.update(pages).set({ deletedAt: null }).where(eq(pages.id, numId));
    } else if (permanent) {
      await db.delete(pages).where(eq(pages.id, numId));
      // Serial ids are reused after a delete, so leaving the history behind
      // would hand the next document someone else's revisions.
      await deleteRevisionsFor("page", [numId]);
    } else {
      await db.update(pages).set({ deletedAt: new Date() }).where(eq(pages.id, numId));
    }

    const after: PageState = !existing || permanent ? null : { ...existing, deletedAt: restore ? null : new Date() };
    const headers = await revalidatePageRoute(existing, after);
    return NextResponse.json({ success: true, trashed: !permanent && !restore, restored: restore }, { headers });
  } catch {
    return NextResponse.json({ error: "Failed to delete page" }, { status: 500 });
  }
}
