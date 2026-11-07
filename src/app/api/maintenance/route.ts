import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { previewCleanup, runCleanup } from "@/lib/maintenance";

/** Database clean-up: GET previews, POST runs. Administrators only. */
export async function GET() {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await previewCleanup(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await runCleanup();
    return NextResponse.json({ ...result, preview: await previewCleanup() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Clean-up failed." }, { status: 500 });
  }
}
