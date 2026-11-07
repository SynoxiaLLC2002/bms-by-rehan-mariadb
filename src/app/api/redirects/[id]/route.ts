import { NextRequest, NextResponse } from "next/server";
import { revalidatePublicSite } from "@/lib/revalidateSite";
import { db } from "@/lib/db";
import { redirects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isAdmin, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import { invalidateRedirects, normalisePath, redirectProblem, ruleType } from "@/lib/redirects";
import { numericId } from "@/lib/routeParams";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
    // Creating a redirect is administrator-only; editing and deleting one were
    // not, which is the wrong way round. A redirect decides where a URL sends
    // its visitors, so changing an existing one is the more dangerous half:
    // repointing a ranking page at an outside domain hands away that traffic.
    if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const rid = numId;
    if (Number.isNaN(rid)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const body = await req.json();

    // The same rules a new redirect passes. Editing skipped them entirely, so
    // a valid rule could be turned into a self-redirect, or have its source
    // changed to "/", and the list would still look perfectly ordinary.
    // Checked against the *resulting* pair, so a patch that touches only one
    // field is judged together with the field it is not touching.
    if (body.source !== undefined || body.destination !== undefined || body.type !== undefined) {
      const current = await db.query.redirects.findFirst({
        where: eq(redirects.id, rid),
        columns: { source: true, destination: true, type: true },
      });
      if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const nextSource = body.source !== undefined ? String(body.source) : current.source;
      const nextDest = body.destination !== undefined ? String(body.destination).trim() : current.destination;
      const problem = await redirectProblem(nextSource, nextDest, rid, body.type !== undefined ? ruleType(body.type) : current.type);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }

    await db.update(redirects).set({
      ...(body.source !== undefined ? { source: normalisePath(String(body.source)) } : {}),
      ...(body.destination !== undefined ? { destination: String(body.destination).trim() } : {}),
      ...(body.type !== undefined ? { type: ruleType(body.type) } : {}),
      ...(body.enabled !== undefined ? { enabled: !!body.enabled } : {}),
    }).where(eq(redirects.id, rid));

    invalidateRedirects();
    // An edge-cached copy of the old address never reached the redirect (lib/revalidateSite.ts).
    revalidatePublicSite();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update redirect" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
    // Creating a redirect is administrator-only; editing and deleting one were
    // not, which is the wrong way round. A redirect decides where a URL sends
    // its visitors, so changing an existing one is the more dangerous half:
    // repointing a ranking page at an outside domain hands away that traffic.
    if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const rid = numId;
    if (Number.isNaN(rid)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    await db.delete(redirects).where(eq(redirects.id, rid));
    invalidateRedirects();
    // An edge-cached copy of the old address never reached the redirect (lib/revalidateSite.ts).
    revalidatePublicSite();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete redirect" }, { status: 500 });
  }
}
