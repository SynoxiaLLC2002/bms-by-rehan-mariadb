import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { getSiteSettings } from "@/lib/settings";
import { crawlBatch, warmPaths } from "@/lib/warmCache";

/**
 * "Warm now": `batch` runs one crawler batch from wherever it stopped (and
 * ignores the pass interval); `home` fetches just the front page.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { mode?: string };
  const settings = await getSiteSettings();
  try {
    if (body.mode === "home") {
      const r = await warmPaths(["/"], settings);
      return NextResponse.json({ fetched: r.fetched, failed: r.failed, ms: r.ms }, { headers: { "Cache-Control": "no-store" } });
    }
    const r = await crawlBatch(settings, { force: true });
    return NextResponse.json(
      { fetched: r.fetched, failed: r.failed, ms: r.ms, cursor: r.cursor, total: r.total, completedPass: r.completedPass },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Warm-up failed." }, { status: 500 });
  }
}
