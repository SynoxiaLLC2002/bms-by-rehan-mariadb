import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import { rawQuery } from "@/lib/db/raw";
import { recordError } from "@/lib/errorLog";
import { clientIp, rateLimited } from "@/lib/rateLimit";

/**
 * Client-side reports. The error boundary posts here when a page fails in
 * the browser — the server saw a digest, the browser saw the message; joined
 * by digest they are one entry with both halves.
 *
 * Public, because the reporter is a visitor who just saw an error page, and
 * therefore small, bounded and rate limited: an anonymous write endpoint is
 * an invitation. Nothing in the body is trusted beyond being text.
 */
export async function POST(req: NextRequest) {
  if (rateLimited("error-report", clientIp(req), { max: 10, windowMs: 60_000 })) {
    return NextResponse.json({ ok: true });
  }
  try {
    const body = await req.json();
    const message = String(body?.message ?? "").slice(0, 1000).trim();
    if (!message) return NextResponse.json({ ok: true });
    await recordError({
      source: "client",
      path: String(body?.path ?? "").slice(0, 2000) || null,
      message,
      stack: typeof body?.stack === "string" ? body.stack.slice(0, 6000) : null,
      digest: typeof body?.digest === "string" ? body.digest.slice(0, 64) : null,
      userAgent: req.headers.get("user-agent"),
    });
  } catch {
    // A malformed report is not worth an error of its own.
  }
  return NextResponse.json({ ok: true });
}

/** Clears the log. Administrators only. */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });
  try {
    await rawQuery("DELETE FROM error_log");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not clear the log." }, { status: 500 });
  }
}
