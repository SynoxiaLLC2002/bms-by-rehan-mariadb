import { NextRequest, NextResponse } from "next/server";
import { sessionAuth as auth } from "@/lib/auth"; // never an API token: this installs code in the owner's Cloudflare account
import { isAdmin } from "@/lib/authz";
import { getSiteSettings } from "@/lib/settings";
import { BRIDGE_PERMISSIONS, bridgeStatus, installBridge, removeBridge } from "@/lib/claudeBridge";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ ...(await bridgeStatus(await getSiteSettings())), permissions: BRIDGE_PERMISSIONS }, NO_STORE);
}

/** Actions: install · remove. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const settings = await getSiteSettings();
  let result: { ok: boolean; error?: string };
  if (body.action === "install") result = await installBridge(settings);
  else if (body.action === "remove") result = await removeBridge(settings);
  else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  return NextResponse.json({ ...result, status: { ...(await bridgeStatus(settings)), permissions: BRIDGE_PERMISSIONS } }, NO_STORE);
}
