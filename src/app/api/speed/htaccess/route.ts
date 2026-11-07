import { NextRequest, NextResponse } from "next/server";
import { sessionAuth as auth } from "@/lib/auth"; // never an API token (lib/apiTokens.ts)
import { isAdmin } from "@/lib/authz";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { applyHtaccess, htaccessStatus } from "@/lib/htaccessFile";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await htaccessStatus(siteUrl(await getSiteSettings())), NO_STORE);
}

/** Actions: apply · remove. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "apply" && body.action !== "remove") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  const url = siteUrl(await getSiteSettings());
  return NextResponse.json(await applyHtaccess(url, body.action === "apply"), NO_STORE);
}
