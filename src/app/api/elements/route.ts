import { NextRequest, NextResponse } from "next/server";
import { revalidatePublicSite } from "@/lib/revalidateSite";
import { db } from "@/lib/db";
import { insertReturning } from "@/lib/db/write";
import { elements } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isAdmin, FORBIDDEN, canRunScripts } from "@/lib/authz";
import { contentForRole } from "@/lib/contentPolicy";
import { ELEMENT_HOOK_IDS } from "@/lib/elements";

/** Falls back to the default hook rather than rejecting an unknown one. */
const safeHook = (v: unknown) =>
  ELEMENT_HOOK_IDS.includes(String(v)) ? String(v) : "before_footer";

const safeStatus = (v: unknown) => (String(v) === "published" ? "published" : "draft");

const safeConditions = (v: unknown) => {
  const c = (v ?? {}) as { include?: unknown; exclude?: unknown; languages?: unknown };
  const list = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);
  return { include: list(c.include), exclude: list(c.exclude), languages: list(c.languages) };
};

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rows = await db
      .select()
      .from(elements)
      .orderBy(asc(elements.priority), asc(elements.id));
    return NextResponse.json({ elements: rows });
  } catch {
    return NextResponse.json({ error: "Failed to fetch elements" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Site structure, not content: menus, reusable elements, form
    // definitions and the 404 log shape the whole site rather than one
    // document. Reading them stays open to any signed-in editor — the
    // page editor needs that — but changing them is an administrator's.
    if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const [row] = await insertReturning(elements, {
        name,
        // An Element shows on every page, so a token may not put script in it.
        content: canRunScripts(session) ? (body.content ?? []) : contentForRole(body.content ?? [], false).content,
        hook: safeHook(body.hook),
        status: safeStatus(body.status),
        priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 10,
        conditions: safeConditions(body.conditions),
      })
      ;

    // Site-wide: Next, LiteSpeed and Cloudflare (lib/revalidateSite.ts).
    revalidatePublicSite();
    return NextResponse.json({ element: row }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create element" }, { status: 500 });
  }
}
