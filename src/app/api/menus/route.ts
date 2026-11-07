import { NextRequest, NextResponse } from "next/server";
import { revalidatePublicSite } from "@/lib/revalidateSite";
import { db } from "@/lib/db";
import { insertReturning } from "@/lib/db/write";
import { menus, navItems } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isAdmin, FORBIDDEN } from "@/lib/authz";

/** All menus with their items, ordered. */
export async function GET() {
  try {
    // Admin-only — every caller is an admin screen.
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [allMenus, allItems] = await Promise.all([
      db.select().from(menus).orderBy(asc(menus.id)),
      db.select().from(navItems).orderBy(asc(navItems.order)),
    ]);

    return NextResponse.json({
      menus: allMenus.map((m) => ({
        ...m,
        items: allItems.filter((i) => i.menuId === m.id),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch menus" }, { status: 500 });
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

    const { name } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const [menu] = await insertReturning(menus, { name: name.trim() });
    // Site-wide: Next, LiteSpeed and Cloudflare (lib/revalidateSite.ts).
    revalidatePublicSite();
    return NextResponse.json({ menu }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create menu" }, { status: 500 });
  }
}
