import { NextRequest, NextResponse } from "next/server";
import { safeHttpUrl } from "@/lib/utils";
import { db } from "@/lib/db";
import { insertReturning } from "@/lib/db/write";
import { comments, pages, posts, siteSettings } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { sessionAuth as auth } from "@/lib/auth"; // never an API token (visitors' names and emails)
import { isAuthor, FORBIDDEN } from "@/lib/authz";
import { clientIp, rateLimited } from "@/lib/rateLimit";
import { toRowId } from "@/lib/utils";
import { getSiteSettings } from "@/lib/settings";
import { pagePath, postPath } from "@/lib/permalinks";
import { isLiveNow } from "@/lib/publishState";
import { verifyTurnstile } from "@/lib/turnstile";
import { revalidatePath } from "next/cache";
import { internalPath, pagePublicPaths, postPublicPaths, type PageRow, type PostRow } from "@/lib/publishCache";

/** Admin listing. Public reads happen on the page itself, server-side. */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const status = req.nextUrl.searchParams.get("status");
    const rows = await db.query.comments.findMany({
      where: status && status !== "all" ? eq(comments.status, status) : undefined,
      orderBy: [desc(comments.createdAt)],
      limit: 200,
      // The date columns and `language` are what a permalink is built from —
      // the admin screen cannot build one itself, so it is resolved here.
      with: {
        post: {
          columns: {
            id: true, title: true, slug: true, language: true,
            publishedAt: true, createdAt: true,
          },
        },
        // A comment on a page would otherwise arrive with a null `post` and
        // nothing else, so the moderation screen could not say what it was
        // replying to — the one thing a moderator needs before approving it.
        page: { columns: { id: true, title: true, slug: true, language: true } },
      },
    });

    // `/blog/<slug>` was hard-coded in the screen, which is wrong under any
    // permalink structure but the default and wrong for every non-default
    // language. Resolved once here instead.
    const settings = await getSiteSettings();
    const withPaths = rows.map((row) => ({
      ...row,
      post: row.post ? { ...row.post, path: postPath(row.post, settings) } : row.post,
      page: row.page ? { ...row.page, path: pagePath(row.page, settings) } : row.page,
    }));

    return NextResponse.json({ comments: withPaths });
  } catch {
    // The table may not exist yet on a database that has not run the migration.
    return NextResponse.json({ comments: [] });
  }
}

/**
 * Public submission.
 *
 * Everything arrives untrusted: the fields are length-capped, the honeypot is
 * checked, and the comment lands as `pending` unless the site has turned
 * moderation off. Nothing here renders HTML — the display side prints text.
 */
/** Returns the URL only when it is a plain http(s) link, else "". */

/**
 * Anonymous writes with no limit are an invitation: the honeypot stops a naive
 * bot, not a determined one.
 */
const COMMENT_LIMIT = { max: 5, windowMs: 60_000 };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // A bot filling every field trips this; a person never sees it.
    if (typeof body.website === "string" && body.website.trim()) {
      return NextResponse.json({ ok: true });
    }

    // Bounded to a real row id: a long string of digits parses to a finite
    // number that Postgres cannot store, which turned a bad request into a
    // 500 on a public endpoint.
    const postId = toRowId(body.postId);
    const pageId = toRowId(body.pageId);
    const authorName = String(body.authorName ?? "").trim().slice(0, 80);
    const authorEmail = String(body.authorEmail ?? "").trim().slice(0, 160);
    const content = String(body.content ?? "").trim().slice(0, 5000);
    // Rendered into an <a href>, so the scheme is the whole security story:
    // `javascript:...` here would be stored XSS on every view of the thread.
    // The form's type="url" is a client-side hint and no defence at all.
    const authorUrl = safeHttpUrl(String(body.authorUrl ?? "").trim().slice(0, 200));
    const parentId = body.parentId ? toRowId(body.parentId) : null;

    // Split from the field check so the reader is told what is actually
    // wrong: a malformed postId is not the visitor forgetting their name.
    //
    // Exactly one target, checked here as well as by the table's
    // `comments_one_target` constraint — the constraint is the guarantee, this
    // is the readable error the visitor gets instead of a 500.
    if ((postId === null) === (pageId === null)) {
      return NextResponse.json({ error: "That page could not be identified." }, { status: 400 });
    }
    if (!authorName || !content) {
      return NextResponse.json({ error: "Name and comment are required." }, { status: 400 });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(authorEmail)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }

    const ip = clientIp(req);
    // The Turnstile token is a hidden input the widget adds to the form, so it
    // arrives with the other fields under Cloudflare's own name.
    if (!(await verifyTurnstile(body["cf-turnstile-response"], ip))) {
      return NextResponse.json({ error: "Please complete the verification and try again." }, { status: 400 });
    }
    if (rateLimited("comments", ip, COMMENT_LIMIT)) {
      return NextResponse.json({ error: "You are commenting too quickly — try again in a minute." }, { status: 429 });
    }

    // Without this the insert fails on the foreign key and the visitor is told
    // the server broke, when in fact they asked about a document that isn't
    // there. A page is checked the same way a post is: it has to exist and be
    // live before it can be commented on.
    const target =
      postId !== null
        ? await db.query.posts.findFirst({
            where: eq(posts.id, postId),
            // slug/language/categoryId are here for the cache clear after an
            // auto-approved comment — `postPublicPaths` needs them.
            columns: { id: true, status: true, publishedAt: true, deletedAt: true, showComments: true, slug: true, language: true, categoryId: true, createdAt: true },
          })
        : await db.query.pages.findFirst({
            where: eq(pages.id, pageId!),
            columns: { id: true, status: true, publishedAt: true, deletedAt: true, showComments: true, slug: true, language: true },
          });
    if (!target || !isLiveNow(target.status, target.publishedAt, target.deletedAt)) {
      return NextResponse.json({ error: "That page is not accepting comments." }, { status: 404 });
    }

    // The same rule the page uses to decide whether to *show* the form. The
    // form being hidden is no defence: a bot posts to the API directly, and
    // every post with comments switched off was still collecting them into
    // the moderation queue.
    const settings = await getSiteSettings();
    const siteDefault = postId !== null ? settings.post_comments_show !== "false" : settings.page_comments_show === "true";
    const open = target.showComments === "enable" || (target.showComments !== "disable" && siteDefault);
    if (!open) {
      return NextResponse.json({ error: "Comments are closed here." }, { status: 403 });
    }

    // A reply must be to a comment on this same document; otherwise a thread
    // can be stitched across posts by guessing ids.
    if (parentId !== null) {
      const parent = await db.query.comments.findFirst({
        where: eq(comments.id, parentId),
        columns: { postId: true, pageId: true },
      });
      if (!parent || parent.postId !== postId || parent.pageId !== pageId) {
        return NextResponse.json({ error: "That comment cannot be replied to." }, { status: 400 });
      }
    }

    const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, "comments_auto_approve"));
    const autoApprove = rows[0]?.value === "true";

    const [saved] = await insertReturning(comments, {
      postId,
      pageId,
      parentId,
      authorName,
      authorEmail,
      authorUrl: authorUrl || null,
      content,
      status: autoApprove ? "approved" : "pending",
      ip: ip === "unknown" ? null : ip,
      userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    });

    // An approved comment is a change to a public page, so the page has to be
    // rebuilt. Without this it sat in the database while every cache in front
    // of the site kept serving the version without it: up to an hour from
    // Next, a day from LiteSpeed, and until its TTL from Cloudflare. The
    // commenter saw their own comment vanish on reload and posted it again.
    //
    // Only for approved ones — a pending comment is not public yet, and
    // rebuilding on every unmoderated submission would hand anyone a way to
    // make the site re-render on demand.
    if (saved.status === "approved") {
      try {
        // `target` is a post row or a page row depending on `postId`, but the
        // two were fetched in one expression so TypeScript sees only the
        // union and cannot narrow it on `postId`. The branch below picks the
        // matching shape; the columns each helper needs were selected above.
        const paths =
          postId !== null
            ? await postPublicPaths(target as unknown as PostRow, settings)
            : pagePublicPaths(target as unknown as PageRow, settings);
        for (const path of paths) revalidatePath(internalPath(path, settings));
      } catch {
        // The comment is saved; a failed cache clear must not lose it.
      }
    }

    return NextResponse.json({ comment: saved, pending: saved.status === "pending" }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not post your comment." }, { status: 500 });
  }
}
