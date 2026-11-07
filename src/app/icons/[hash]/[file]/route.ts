import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { ICON_SIZES, iconHash, renderIcon } from "@/lib/siteIcon";

/**
 * `/icons/<hash>/<size>.png`: the site icon at the sizes the page links to.
 * The hash is a fingerprint of the source, so the current one is immutable
 * for a year and a stale one (a page cached before the icon changed) still
 * gets today's icon, just uncached.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ hash: string; file: string }> }) {
  const { hash, file } = await params;
  const size = parseInt(file.replace(/\.png$/i, ""), 10);
  if (!(ICON_SIZES as readonly number[]).includes(size)) return new NextResponse(null, { status: 404 });

  const settings = await getSiteSettings();
  const icon = await renderIcon(settings, siteUrl(settings), size, "png");
  if (!icon) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });

  const current = hash === iconHash(settings);
  return new NextResponse(new Uint8Array(icon.body), {
    headers: {
      "Content-Type": icon.type,
      "Content-Length": String(icon.body.length),
      "Cache-Control": current ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
    },
  });
}
