import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { formSubmissions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sessionAuth as auth } from "@/lib/auth"; // never an API token (visitors' names and emails)
import { isAdmin, isAuthor, FORBIDDEN } from "@/lib/authz";
import { numericId } from "@/lib/routeParams";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Editors read the inbox, and opening a message marks it read. Refusing
    // that put the unread dot back on every message at the next load. Only
    // the read flag changes here; deleting stays an administrator's.
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const sid = numId;
    if (Number.isNaN(sid)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const body = await req.json();
    await db
      .update(formSubmissions)
      .set({ isRead: !!body.isRead })
      .where(eq(formSubmissions.id, sid));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update submission" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Site structure, not content: menus, reusable elements, form
    // definitions and the 404 log shape the whole site rather than one
    // document. Reading them stays open to any signed-in editor — the
    // page editor needs that — but changing them is an administrator's.
    if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const sid = numId;
    if (Number.isNaN(sid)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    await db.delete(formSubmissions).where(eq(formSubmissions.id, sid));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete submission" }, { status: 500 });
  }
}
