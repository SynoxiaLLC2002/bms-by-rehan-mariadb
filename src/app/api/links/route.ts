import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import { lastLinkReport, runLinkCheck } from "@/lib/linkCheck";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { clientIp, rateLimited } from "@/lib/rateLimit";

/** The last report, if this process has one. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });
  return NextResponse.json({ report: lastLinkReport() }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Runs a check. Administrators only, and no more than a couple per ten
 * minutes: each run is hundreds of outbound requests from the host.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });
  if (rateLimited("link-check", clientIp(req), { max: 3, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: "A check ran recently. Give it a few minutes." }, { status: 429 });
  }
  try {
    const settings = await getSiteSettings();
    const report = await runLinkCheck(settings, siteUrl(settings));
    return NextResponse.json({ report }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Check failed." }, { status: 500 });
  }
}
