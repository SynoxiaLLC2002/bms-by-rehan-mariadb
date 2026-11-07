import { NextRequest, NextResponse } from "next/server";
import { revalidatePublicSite } from "@/lib/revalidateSite";
import { db } from "@/lib/db";
import { redirects } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { invalidateRedirects, normalisePath, redirectProblem, ruleType } from "@/lib/redirects";
import { isAdmin, FORBIDDEN } from "@/lib/authz";

export async function GET() {
  try {
    // Admin-only — every caller is an admin screen.
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rows = await db.select().from(redirects).orderBy(desc(redirects.id));
    return NextResponse.json({ redirects: rows });
  } catch {
    return NextResponse.json({ error: "Failed to fetch redirects" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Administrators only: a redirect can send any URL on this site anywhere.
    if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const body = await req.json();
    const source = normalisePath(String(body.source || ""));
    const type = ruleType(body.type);
    const destination = type === 410 ? "" : String(body.destination || "").trim();

    if (!source || (!destination && type !== 410)) {
      return NextResponse.json({ error: "Source and destination are required" }, { status: 400 });
    }
    const problem = await redirectProblem(source, destination, undefined, type);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    await db
      .insert(redirects)
      .values({ source, destination, type, enabled: body.enabled !== false })
      .onDuplicateKeyUpdate({ set: { destination, type, enabled: body.enabled !== false },
      });
    const row = await db.query.redirects.findFirst({ where: eq(redirects.source, source) });

    invalidateRedirects();
    // Site-wide: Next, LiteSpeed and Cloudflare (lib/revalidateSite.ts).
    revalidatePublicSite();
    return NextResponse.json({ redirect: row }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to save redirect" }, { status: 500 });
  }
}
