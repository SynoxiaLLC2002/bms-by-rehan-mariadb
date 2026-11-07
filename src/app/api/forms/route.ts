import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { formSubmissions } from "@/lib/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { sessionAuth as auth } from "@/lib/auth"; // never an API token (visitors' names and emails)
import { isAdmin, isAuthor, FORBIDDEN } from "@/lib/authz";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Visitors' names, emails and messages. An author's admin has no Forms
    // screen (middleware), and the API is held to the same line as comments.
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const unreadOnly = req.nextUrl.searchParams.get("unread") === "1";
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "100") || 100, 500);

    const [rows, [unread]] = await Promise.all([
      unreadOnly
        ? db.select().from(formSubmissions).where(eq(formSubmissions.isRead, false)).orderBy(desc(formSubmissions.id)).limit(limit)
        : db.select().from(formSubmissions).orderBy(desc(formSubmissions.id)).limit(limit),
      db.select({ n: count() }).from(formSubmissions).where(eq(formSubmissions.isRead, false)),
    ]);

    return NextResponse.json({ submissions: rows, unread: unread?.n ?? 0 });
  } catch {
    return NextResponse.json({ error: "Failed to fetch submissions" }, { status: 500 });
  }
}

/** Bulk actions from the inbox toolbar: mark everything read, or empty it. */
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Marking read is open to anyone who can read the inbox (editors);
    // deleting submissions is an administrator's.
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { action } = await req.json();
    if (action !== "read_all" && !isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });
    if (action === "read_all") {
      await db.update(formSubmissions).set({ isRead: true }).where(eq(formSubmissions.isRead, false));
      return NextResponse.json({ success: true });
    }
    if (action === "delete_read") {
      await db.delete(formSubmissions).where(eq(formSubmissions.isRead, true));
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
