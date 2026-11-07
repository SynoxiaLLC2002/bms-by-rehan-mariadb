import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { renderIcon } from "@/lib/siteIcon";

/**
 * `/favicon.ico`: the one icon URL every browser and crawler asks for
 * unprompted. It was a 404 on every site — see `siteIcon.ts` for what that
 * cost in search results. A day rather than a year, because this URL cannot
 * carry the source's fingerprint; the `/icons/<hash>/…` ones do.
 */

/**
 * This route reads the site icon out of the database, so it must run on the
 * host — not at build time.
 *
 * Without this, Next saw a GET handler with no dynamic input and prerendered
 * it: the build wrote `.next/server/app/favicon.ico.body` and the host served
 * that file forever. The bytes came from whatever database the *build* talked
 * to, and a build made on a PC talks to the dev one, where `site_favicon` is
 * empty — so `iconSource` fell back to `/default-icon.svg` and every site
 * shipped the blue placeholder icon. Setting a Site Icon in the admin then
 * did nothing visible: the `/icons/<hash>/…` PNGs updated, because those are
 * dynamic, while `/favicon.ico` — the one a browser tab and Google's search
 * result actually use — stayed the placeholder.
 *
 * `robots.txt` and `llms.txt` were fixed for the same reason; this route was
 * missed in that pass. The response still carries `max-age=86400`, so the
 * work is done once a day at the edge, not once per visitor.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSiteSettings();
  const icon = await renderIcon(settings, siteUrl(settings), 48, "ico");
  if (!icon) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new NextResponse(new Uint8Array(icon.body), {
    headers: {
      "Content-Type": icon.type,
      "Content-Length": String(icon.body.length),
      "Cache-Control": "public, max-age=86400",
    },
  });
}
