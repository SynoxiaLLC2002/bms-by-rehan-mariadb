import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { UNAUTHORIZED, FORBIDDEN, canEditDocument } from "@/lib/authz";
import { numericId } from "@/lib/routeParams";
import { duplicateDocument } from "@/lib/duplicate";
import { db } from "@/lib/db";
import { posts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Makes a draft copy of this post and returns the new id.
 *
 * Editors and administrators may copy any post; an author only their own — a
 * copy is a full read of the source, drafts included, so it follows the same
 * rule as opening one in the editor. The copy is a draft owned by whoever
 * made it, and cannot reach the public site until it is published like
 * anything else.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const id = numericId((await params).id);
  if (id === null) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const source = await db.query.posts.findFirst({ where: eq(posts.id, id), columns: { authorId: true } });
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditDocument(session, source.authorId)) return NextResponse.json(FORBIDDEN, { status: 403 });

  try {
    const newId = await duplicateDocument("post", id, session.user.id);
    return NextResponse.json({ id: newId }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not duplicate the post." }, { status: 500 });
  }
}
