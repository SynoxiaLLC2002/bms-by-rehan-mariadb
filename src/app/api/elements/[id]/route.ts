import { NextRequest, NextResponse } from "next/server";
import { revalidatePublicSite } from "@/lib/revalidateSite";
import { db } from "@/lib/db";
import { elements } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isAdmin, FORBIDDEN, canRunScripts } from "@/lib/authz";
import { contentForRole } from "@/lib/contentPolicy";
import { staleSave } from "@/lib/staleSave";
import { ELEMENT_HOOK_IDS } from "@/lib/elements";
import { numericId } from "@/lib/routeParams";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const eid = numId;
    if (Number.isNaN(eid)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const [row] = await db.select().from(elements).where(eq(elements.id, eid));
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ element: row });
  } catch {
    return NextResponse.json({ error: "Failed to fetch element" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
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
    const eid = numId;
    if (Number.isNaN(eid)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const body = await req.json();
    const list = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);

    // Same guard as pages and posts: an element is on every page, so a stale
    // copy overwriting a newer one is the worst kind of silent revert.
    const existing = await db.query.elements.findFirst({ where: eq(elements.id, eid), columns: { updatedAt: true } });
    const conflict = staleSave(body.expectedUpdatedAt, existing?.updatedAt);
    if (conflict) return NextResponse.json(conflict, { status: 409 });

    const now = new Date();
    await db
      .update(elements)
      .set({
        ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
        // An Element shows on every page, so a token may not put script in it.
        ...(body.content !== undefined ? { content: canRunScripts(session) ? body.content : contentForRole(body.content ?? [], false).content } : {}),
        ...(body.hook !== undefined && ELEMENT_HOOK_IDS.includes(String(body.hook))
          ? { hook: String(body.hook) }
          : {}),
        ...(body.status !== undefined
          ? { status: String(body.status) === "published" ? "published" : "draft" }
          : {}),
        ...(body.priority !== undefined && Number.isFinite(Number(body.priority))
          ? { priority: Number(body.priority) }
          : {}),
        ...(body.conditions !== undefined
          ? {
              conditions: {
                include: list((body.conditions as { include?: unknown })?.include),
                exclude: list((body.conditions as { exclude?: unknown })?.exclude),
                languages: list((body.conditions as { languages?: unknown })?.languages),
              },
            }
          : {}),
        updatedAt: now,
      })
      .where(eq(elements.id, eid));

    // Elements appear on every page, so a change invalidates the whole site.
    revalidatePublicSite();
    return NextResponse.json({ success: true, updatedAt: now.toISOString() });
  } catch {
    return NextResponse.json({ error: "Failed to update element" }, { status: 500 });
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
    const eid = numId;
    if (Number.isNaN(eid)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    await db.delete(elements).where(eq(elements.id, eid));
    revalidatePublicSite();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete element" }, { status: 500 });
  }
}
