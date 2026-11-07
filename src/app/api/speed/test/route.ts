import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";

const SHOW = ["x-litespeed-cache", "cf-cache-status", "x-nextjs-cache", "x-bms-cache", "cache-control", "age", "content-encoding", "server", "x-litespeed-cache-control", "content-type"];

/**
 * Fetches one public URL twice from the server and reports the cache headers
 * of each response — the "is it actually cached?" test, without needing curl.
 * The second request should show a hit at whichever layer is nearest.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { path?: string };
  const path = (body.path || "/").trim();
  if (!path.startsWith("/") || path.startsWith("//")) return NextResponse.json({ error: "Give a path on this site, like /about." }, { status: 400 });

  const url = `${siteUrl(await getSiteSettings())}${path}`;
  const runs: { status: number; ms: number; headers: Record<string, string> }[] = [];
  for (let i = 0; i < 2; i++) {
    const started = Date.now();
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "BMS-CacheTest/1.0", accept: "text/html,*/*;q=0.8" },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
        redirect: "manual",
      });
      await res.arrayBuffer().catch(() => undefined);
      const headers: Record<string, string> = {};
      for (const h of SHOW) {
        const v = res.headers.get(h);
        if (v) headers[h] = v;
      }
      runs.push({ status: res.status, ms: Date.now() - started, headers });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Could not fetch.", url }, { status: 502 });
    }
  }
  return NextResponse.json({ url, runs }, { headers: { "Cache-Control": "no-store" } });
}
