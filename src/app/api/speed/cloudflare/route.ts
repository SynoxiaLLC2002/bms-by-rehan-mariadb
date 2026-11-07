import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { getSiteSettings } from "@/lib/settings";
import {
  cloudflareDevelopmentMode,
  cloudflareEarlyHints,
  cloudflarePolish,
  cloudflareRespectHeaders,
  cloudflareSetCacheRule,
  cloudflareStatus,
  cloudflareTieredCache,
} from "@/lib/cloudflare";
import { purgeCloudflare } from "@/lib/cloudflarePurge";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await cloudflareStatus(await getSiteSettings()), NO_STORE);
}

/** Actions: respect_headers · dev_mode {on} · edge_html {on} · early_hints {on} · tiered_cache {on} · polish {mode} · purge. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; on?: boolean; mode?: string };
  const settings = await getSiteSettings();
  let result: { ok: boolean; error?: string; warning?: string };
  if (body.action === "respect_headers") result = await cloudflareRespectHeaders(settings);
  else if (body.action === "dev_mode") result = await cloudflareDevelopmentMode(settings, !!body.on);
  else if (body.action === "edge_html") result = await cloudflareSetCacheRule(settings, !!body.on);
  else if (body.action === "early_hints") result = await cloudflareEarlyHints(settings, !!body.on);
  else if (body.action === "tiered_cache") result = await cloudflareTieredCache(settings, !!body.on);
  else if (body.action === "polish") {
    // Only the three values Cloudflare accepts; anything else is a 400 from
    // them and a confusing error here.
    const mode = body.mode === "lossless" || body.mode === "lossy" ? body.mode : "off";
    result = await cloudflarePolish(settings, mode);
  }
  else if (body.action === "purge") {
    const r = await purgeCloudflare(settings);
    result = { ok: r.ok, error: r.attempted ? r.error : "Zone ID and API token are not set." };
  } else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  return NextResponse.json({ ...result, status: await cloudflareStatus(settings) }, NO_STORE);
}
