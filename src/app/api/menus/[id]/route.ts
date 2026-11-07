import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { insertReturning } from "@/lib/db/write";
import { menus, navItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isAdmin, FORBIDDEN } from "@/lib/authz";
import { numericId } from "@/lib/routeParams";
import { revalidatePublicSite } from "@/lib/revalidateSite";

type Ctx = { params: Promise<{ id: string }> };

/** Rename a menu, toggle auto-add-pages, and replace its items in one call. */
export async function PUT(req: NextRequest, { params }: Ctx) {
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
    const menuId = numId;
    if (Number.isNaN(menuId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const body = await req.json();

    if (body.name !== undefined || body.autoAddPages !== undefined) {
      await db.update(menus).set({
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.autoAddPages !== undefined ? { autoAddPages: !!body.autoAddPages } : {}),
      }).where(eq(menus.id, menuId));
    }

    if (Array.isArray(body.items)) {
      // Replace wholesale. Rows are inserted parents-first so a child can point
      // at the freshly created parent's id.
      // Kept so a failed insert can put the menu back: this is a delete then
      // an insert with no transaction (the HTTP driver has none), and a bad
      // row used to leave the live site with an empty menu.
      const previous = await db.select().from(navItems).where(eq(navItems.menuId, menuId));
      await db.delete(navItems).where(eq(navItems.menuId, menuId));
      // `label` and `url` are NOT NULL; an item saved without one failed the
      // whole insert after the delete had already run.
      const text = (v: unknown) => (v == null ? "" : String(v));

      // Two inserts, not one per row. This used to write the tree with an
      // `await` per item *and* per child: a ten-item menu with three children
      // each was 41 sequential round trips, and on Neon's HTTP driver every
      // round trip is its own HTTPS request — seconds of latency to save a
      // menu. Parents still go first, because a child needs its parent's id.
      //
      // The `order` counter is computed exactly as before (a single running
      // number, parent then its children, then the next parent) so the saved
      // ordering is unchanged; it doubles as the key that matches each
      // returned parent row back to its children, which avoids relying on the
      // order rows come back in.
      let order = 0;
      const parentValues: (typeof navItems.$inferInsert)[] = [];
      const childrenByParentOrder = new Map<number, (typeof navItems.$inferInsert)[]>();

      for (const top of body.items) {
        const parentOrder = order++;
        parentValues.push({
          menuId,
          label: text(top.label),
          url: text(top.url),
          target: top.target || "_self",
          objectType: top.objectType || "custom",
          objectId: top.objectId ?? null,
          icon: top.icon || null,
          description: top.description || null,
          badge: top.badge || null,
          highlight: top.highlight || null,
          megaMenu: !!top.megaMenu,
          megaColumns: top.megaColumns ?? 2,
          order: parentOrder,
          parentId: null,
        });
        const kids = (top.children ?? []).map((child: Record<string, unknown>) => ({
          menuId,
          label: text(child.label),
          url: text(child.url),
          target: (child.target as string) || "_self",
          objectType: (child.objectType as string) || "custom",
          objectId: (child.objectId as number) ?? null,
          icon: (child.icon as string) || null,
          description: (child.description as string) || null,
          badge: (child.badge as string) || null,
          highlight: (child.highlight as string) || null,
          order: order++,
          parentId: null as number | null,
        }));
        if (kids.length) childrenByParentOrder.set(parentOrder, kids);
      }

      try {
        if (parentValues.length) {
          const inserted = await insertReturning(navItems, parentValues);
          const idByOrder = new Map(inserted.map((r) => [r.order, r.id]));
          const childValues = [...childrenByParentOrder.entries()].flatMap(([parentOrder, kids]) =>
            kids.map((k) => ({ ...k, parentId: idByOrder.get(parentOrder) ?? null }))
          );
          if (childValues.length) await db.insert(navItems).values(childValues);
        }
      } catch (err) {
        // Put the menu back exactly as it was (ids included, so children still
        // point at their parents), then report the failure.
        await db.delete(navItems).where(eq(navItems.menuId, menuId)).catch(() => undefined);
        const parents = previous.filter((r) => r.parentId == null);
        const kids = previous.filter((r) => r.parentId != null);
        if (parents.length) await db.insert(navItems).values(parents).catch(() => undefined);
        if (kids.length) await db.insert(navItems).values(kids).catch(() => undefined);
        throw err;
      }
    }

    // Every page renders the menus, and pages are cached for an hour —
    // see lib/revalidateSite.ts for why nothing else clears them.
    revalidatePublicSite();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save menu" }, { status: 500 });
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
    const menuId = numId;
    if (Number.isNaN(menuId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    await db.delete(menus).where(eq(menus.id, menuId)); // items cascade
    revalidatePublicSite();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete menu" }, { status: 500 });
  }
}
