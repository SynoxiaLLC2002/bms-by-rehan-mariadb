import { NextRequest, NextResponse } from "next/server";
import { sessionAuth as auth } from "@/lib/auth"; // never an API token (lib/apiTokens.ts)
import { isAdmin, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import { installPluginZip, listPlugins, MAX_ZIP_BYTES } from "@/lib/plugins";

/** Installed plugins — any signed-in user, so the editor's Plugin block can list them. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  return NextResponse.json({ plugins: await listPlugins() }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Installs a plugin from an uploaded zip (multipart field `file`).
 * Administrators only: a plugin is code that runs on every visitor's page.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a .zip file." }, { status: 400 });
    if (file.size > MAX_ZIP_BYTES) return NextResponse.json({ error: `The zip is larger than ${MAX_ZIP_BYTES / 1024 / 1024} MB.` }, { status: 400 });
    if (!/\.zip$/i.test(file.name) && file.type !== "application/zip" && file.type !== "application/x-zip-compressed") {
      return NextResponse.json({ error: "A plugin is a .zip file." }, { status: 400 });
    }
    const manifest = await installPluginZip(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ ok: true, manifest }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not install the plugin." }, { status: 400 });
  }
}
