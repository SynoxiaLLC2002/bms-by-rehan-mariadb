import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readByIds } from "@/lib/db/write";
import { comments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sessionAuth as auth } from "@/lib/auth"; // never an API token (visitors' names and emails)
import { isAuthor, FORBIDDEN } from "@/lib/authz";
import { numericId } from "@/lib/routeParams";
import { refreshCommentTarget } from "@/lib/publishCache";

const STATUSES = new Set(["pending", "approved", "spam", "trash"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = await req.json();
    if (!STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    }

    const before = await db.query.comments.findFirst({ where: eq(comments.id, numId), columns: { status: true } });
    await db.update(comments)
      .set({ status: body.status })
      .where(eq(comments.id, numId))
      ;
    const [comment] = await readByIds(comments, [numId]);

    // Only an approved comment is on the page, so only a move into or out of
    // "approved" changes anything a visitor sees — pending to spam needs no
    // refresh at all — and then only that one page's.
    const headers = new Headers();
    if (comment && (before?.status === "approved" || comment.status === "approved")) {
      await refreshCommentTarget(comment, headers).catch(() => undefined);
    }
    return NextResponse.json({ comment }, { headers });
  } catch {
    return NextResponse.json({ error: "Failed to update comment" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Replies point at this row; clear them first so the delete is not blocked.
    const doomed = await db.query.comments.findFirst({
      where: eq(comments.id, numId),
      columns: { status: true, postId: true, pageId: true },
    });
    await db.update(comments).set({ parentId: null }).where(eq(comments.parentId, numId));
    await db.delete(comments).where(eq(comments.id, numId));
    // As above: only a deleted *approved* comment was on a page.
    const headers = new Headers();
    if (doomed?.status === "approved") await refreshCommentTarget(doomed, headers).catch(() => undefined);
    return NextResponse.json({ success: true }, { headers });
  } catch {
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
