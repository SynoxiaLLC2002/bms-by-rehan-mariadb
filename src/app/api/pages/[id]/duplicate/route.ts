import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { UNAUTHORIZED, isAuthor, FORBIDDEN } from "@/lib/authz";
import { numericId } from "@/lib/routeParams";
import { duplicateDocument } from "@/lib/duplicate";

/**
 * Makes a draft copy of this page and returns the new id.
 *
 * Any signed-in user may do this, the same as creating a page: the copy is a
 * draft owned by whoever made it, and cannot reach the public site until it
 * is published like anything else.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

  const id = numericId((await params).id);
  if (id === null) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const newId = await duplicateDocument("page", id, session.user.id);
    return NextResponse.json({ id: newId }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not duplicate the page." }, { status: 500 });
  }
}
