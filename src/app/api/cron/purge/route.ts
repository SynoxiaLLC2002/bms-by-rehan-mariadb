import { NextRequest, NextResponse } from "next/server";
import { cronSecret, presentedToken, secretMatches } from "@/lib/secretCompare";
import { LS_PURGE } from "@/lib/lscache";

/**
 * Purges LiteSpeed's cache on request — the `X-LiteSpeed-Purge` header only
 * works on a response that passes through LiteSpeed, so a server-side job
 * that wants the cache cleared *before* it does something (warm the pages it
 * just refreshed, see lib/warmCache.ts) has to make one request whose answer
 * carries it. That request is this. Same token as the publish cron.
 */
export async function GET(req: NextRequest) {
  const expected = cronSecret();
  const given = presentedToken(req);
  if (!secretMatches(expected, given)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, purged: true }, { headers: { "Cache-Control": "no-store", [LS_PURGE]: "*" } });
}
