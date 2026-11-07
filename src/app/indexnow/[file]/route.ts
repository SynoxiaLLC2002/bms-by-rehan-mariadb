import { NextResponse } from "next/server";
import { indexNowKey } from "@/lib/indexnow";
import { LS_CACHE, NO_CACHE } from "@/lib/lscache";

/**
 * The IndexNow key file, at /indexnow/<key>.txt — how the search engines
 * confirm the pings really come from this site. Only the real key is served;
 * any other name is a 404, so the route reveals nothing.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const key = await indexNowKey();
  if (file !== `${key}.txt`) return NextResponse.json({ error: "Not found" }, { status: 404, headers: { [LS_CACHE]: NO_CACHE } });
  return new NextResponse(key, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400", [LS_CACHE]: "public, max-age=86400" },
  });
}
