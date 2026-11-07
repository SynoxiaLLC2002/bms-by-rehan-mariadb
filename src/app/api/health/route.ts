import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import { checkLiveSite } from "@/lib/siteHealth";
import { clientIp, rateLimited } from "@/lib/rateLimit";
import type { NextRequest } from "next/server";

/**
 * The on-demand half of Site Health: fetch the public site from this server
 * and report what a visitor gets. Administrators only — it reveals hosting
 * details — and rate limited, because each call is several outbound requests
 * with 15-second timeouts.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });
  if (rateLimited("health-live", clientIp(req), { max: 6, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Give it a minute between live checks." }, { status: 429 });
  }
  return NextResponse.json({ checks: await checkLiveSite() }, { headers: { "Cache-Control": "no-store" } });
}
