import { NextRequest, NextResponse } from "next/server";
import { sessionAuth as auth } from "@/lib/auth"; // never an API token (lib/apiTokens.ts)
import { isAdmin, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import { uninstallPlugin, updatePlugin } from "@/lib/plugins";

type Ctx = { params: Promise<{ slug: string }> };

/** Enable/disable, or save settings. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  if (!(await updatePlugin(slug, body))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Removes the plugin and its files. Content keeps its shortcodes as text. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });
  const { slug } = await params;
  await uninstallPlugin(slug);
  return NextResponse.json({ ok: true });
}
