import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, pages, posts } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { isAuthor, canEditDocument, FORBIDDEN, canRunScripts } from "@/lib/authz";
import { contentForRole } from "@/lib/contentPolicy";
import {
  getRevision,
  listRevisions,
  revisionMetaOf,
  snapshotRevision,
  type RevisionKind,
  type RevisionMeta,
} from "@/lib/revisions";
import { numericId } from "@/lib/routeParams";
import { uniqueSlug } from "@/lib/uniqueSlug";
import { refreshPage, refreshPost } from "@/lib/publishCache";
import { getSiteSettings } from "@/lib/settings";

const kindOf = (raw: unknown): RevisionKind | null =>
  raw === "post" || raw === "page" ? raw : null;

/** The history of one document. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const kind = kindOf(searchParams.get("kind"));
  const documentId = numericId(searchParams.get("id") ?? undefined);
  if (!kind || !documentId) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // A revision is a full copy of the document, drafts included, so reading
  // one follows the editor's own rule: authors see only their own posts'
  // history, and no page's. Without this an author could read any post or
  // page — unpublished ones too — through its history.
  if (kind === "page" && isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });
  if (kind === "post" && isAuthor(session)) {
    const doc = await db.query.posts.findFirst({ where: eq(posts.id, documentId), columns: { authorId: true } });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canEditDocument(session, doc.authorId)) return NextResponse.json(FORBIDDEN, { status: 403 });
  }

  // One revision's full content, for previewing before restoring.
  const one = numericId(searchParams.get("revision") ?? undefined);
  if (one) {
    const revision = await getRevision(one);
    if (!revision || revision.documentId !== documentId || revision.documentKind !== kind) {
      // Checked against the document as well as the id, so a revision cannot be
      // read by guessing numbers from another document.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ revision });
  }

  return NextResponse.json({ revisions: await listRevisions(kind, documentId) });
}

/**
 * Restores a revision.
 *
 * The current state is snapshotted first, so restoring is itself undoable —
 * without that, clicking Restore on the wrong row destroys the very version you
 * were trying to keep, which is the one thing a history must never do.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const kind = kindOf(body.kind);
    const documentId = numericId(String(body.id ?? ""));
    const revisionId = numericId(String(body.revisionId ?? ""));
    if (!kind || !documentId || !revisionId) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const revision = await getRevision(revisionId);
    if (!revision || revision.documentId !== documentId || revision.documentKind !== kind) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Branched rather than indexed by name: Drizzle types each table's query
    // object separately, so `db.query[name]` is a union whose call signatures
    // do not agree. The full row is cheap — restore is rare — and it is what
    // the snapshot and the cache refresh both need.
    const current =
      kind === "post"
        ? await db.query.posts.findFirst({ where: eq(posts.id, documentId) })
        : await db.query.pages.findFirst({ where: eq(pages.id, documentId) });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Restoring rewrites the document, so it follows the document's own rule:
    // authors restore only their own posts, and never pages.
    if ((kind === "page" && isAuthor(session)) || !canEditDocument(session, current.authorId)) {
      return NextResponse.json(FORBIDDEN, { status: 403 });
    }

    const beforeMeta = revisionMetaOf(current);
    const afterMeta = (revision.meta ?? null) as RevisionMeta | null;

    await snapshotRevision(
      kind,
      documentId,
      {
        title: current.title,
        content: current.content,
        excerpt: "excerpt" in current ? (current.excerpt ?? null) : null,
        meta: beforeMeta,
      },
      { title: revision.title, content: revision.content, excerpt: revision.excerpt, meta: afterMeta },
      (session.user as { id?: string }).id
    );

    const meta = afterMeta ?? {};
    const values: Record<string, unknown> = {
      title: revision.title ?? current.title,
      // Through the same filter a save goes through. A revision is old content,
      // and some of it predates the embed sanitiser: restoring it wrote the
      // unsafe HTML straight back, undoing the fix for that document.
      content: contentForRole(revision.content ?? [], canRunScripts(session)).content,
      updatedAt: new Date(),
    };
    if (kind === "post") values.excerpt = revision.excerpt ?? null;

    for (const key of ["featuredImage", "seoTitle", "seoDescription", "seoKeywords", "ogTitle", "ogDescription", "ogImage", "twitterTitle", "twitterDescription", "twitterImage", "canonicalUrl", "noIndex", "noFollow", "robotsAdvanced", "schemaType", "schemas", "direction"] as const) {
      if (key in meta) values[key] = meta[key];
    }

    if (typeof meta.slug === "string" && meta.slug && meta.slug !== current.slug) {
      values.slug = await uniqueSlug(kind, meta.slug, documentId, current.language);
    }

    if (kind === "post" && "categoryId" in meta) {
      if (typeof meta.categoryId === "number") {
        const cat = await db.query.categories.findFirst({ where: eq(categories.id, meta.categoryId), columns: { id: true } });
        values.categoryId = cat ? meta.categoryId : null;
      } else {
        values.categoryId = null;
      }
    }

    if (kind === "post") {
      await db.update(posts).set(values).where(eq(posts.id, documentId));
    } else {
      await db.update(pages).set(values).where(eq(pages.id, documentId));
    }

    // The restored fields are live now, so the caches that show them have to
    // move — same targeted refresh a save would do.
    const settings = await getSiteSettings();
    const headers = new Headers();
    if (kind === "post") {
      const after = await db.query.posts.findFirst({ where: eq(posts.id, documentId) });
      await refreshPost(current, after, settings, headers);
    } else {
      const after = await db.query.pages.findFirst({ where: eq(pages.id, documentId) });
      refreshPage(current, after, settings, headers);
    }

    return NextResponse.json({ ok: true, restored: revisionId }, { headers });
  } catch {
    return NextResponse.json({ error: "Failed to restore" }, { status: 500 });
  }
}
