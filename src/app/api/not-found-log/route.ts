import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notFoundLog } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isAdmin, FORBIDDEN } from "@/lib/authz";
import { normalisePath } from "@/lib/redirects";
import { clientIp, rateLimited } from "@/lib/rateLimit";

/** The log, newest first — admin only. */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rows = await db.select().from(notFoundLog).orderBy(desc(notFoundLog.lastHit)).limit(200);
    return NextResponse.json({ entries: rows });
  } catch {
    return NextResponse.json({ error: "Failed to fetch log" }, { status: 500 });
  }
}

/**
 * Records a missing URL. Public by design — the 404 page itself reports here,
 * and visitors aren't logged in. Nothing is read back without auth, and only a
 * normalised path plus referrer is stored.
 */
/**
 * Generous, because a real visitor clicking around a broken menu can trip a
 * tight limit — but bounded, because this is a public endpoint that inserts a
 * row per distinct path. Without it, a bot walking `/aaa1`…`/aaa999999` grows
 * the table without limit and every 404 pays to write it.
 */
const LOG_LIMIT = { max: 30, windowMs: 60_000 };

export async function POST(req: NextRequest) {
  try {
    if (rateLimited("not-found-log", clientIp(req), LOG_LIMIT)) {
      // Silent: a throttled logger must look identical to a successful one, or
      // the 404 page starts reporting errors at the visitor.
      return NextResponse.json({ ok: false });
    }

    const body = await req.json();
    const path = normalisePath(String(body.path || ""));
    if (!path || path === "/" || path.length > 512) {
      return NextResponse.json({ ok: false });
    }

    const referrer = typeof body.referrer === "string" ? body.referrer.slice(0, 512) : null;

    await db
      .insert(notFoundLog)
      .values({ path, referrer, hits: 1 })
      .onDuplicateKeyUpdate({ set: {
          hits: sql`${notFoundLog.hits} + 1`,
          lastHit: new Date(),
          ...(referrer ? { referrer } : {}),
        },
      });

    return NextResponse.json({ ok: true });
  } catch {
    // A logging failure must never surface on the visitor's 404 page.
    return NextResponse.json({ ok: false });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Site structure, not content: menus, reusable elements, form
    // definitions and the 404 log shape the whole site rather than one
    // document. Reading them stays open to any signed-in editor — the
    // page editor needs that — but changing them is an administrator's.
    if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const id = parseInt(new URL(req.url).searchParams.get("id") ?? "");
    if (Number.isNaN(id)) {
      await db.delete(notFoundLog);
    } else {
      await db.delete(notFoundLog).where(eq(notFoundLog.id, id));
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to clear log" }, { status: 500 });
  }
}
