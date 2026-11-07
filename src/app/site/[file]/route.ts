import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/settings";
import { cachedSiteCss, siteCssHash } from "@/lib/siteCss";
import { LS_CACHE, NO_CACHE } from "@/lib/lscache";
import { readStoredCss } from "@/lib/cssStore";

/**
 * The site's stylesheet, at `/site/<hash>.css`.
 *
 * Built from the same settings and the same builder the pages use, so the
 * link a page emits and the file this serves always agree. When the hash in
 * the URL is the current one the response is immutable for a year — browsers
 * and any CDN keep it. When it is not (a page cached before a settings change
 * asking for the old name) the current CSS is served uncached: a slightly
 * newer stylesheet than the page expected is the harmless direction of skew.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const requestedName = file.replace(/\.css$/i, "");

  // A per-page or font sheet (`s-…`, `f-…`), stored by the page that links it
  // — see lib/cssStore.ts. Content-addressed, so a year is safe. server.js
  // normally inlines these; this serves client-side navigations and the
  // INLINE_CSS=off case.
  if (/^[sf]-/.test(requestedName)) {
    const stored = readStoredCss(requestedName);
    if (stored !== null) {
      return new NextResponse(stored, {
        headers: {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": "public, max-age=31536000, immutable",
          [LS_CACHE]: "public, max-age=31536000",
        },
      });
    }
    // Gone (a new build, a cleaned folder). Font faces cannot be rebuilt from
    // a hash; the text falls back to the next font until the page is rendered
    // again. A site sheet falls through to today's full stylesheet: a superset
    // of what the page asked for, so it still looks right.
    if (requestedName.startsWith("f-")) {
      return new NextResponse("", { status: 404, headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-store", [LS_CACHE]: NO_CACHE } });
    }
  }

  const settings = await getSiteSettings();
  const css = cachedSiteCss(settings);
  const current = siteCssHash(settings);
  const isCurrent = requestedName === current;
  return new NextResponse(css, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": isCurrent ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
      // Same rule LiteSpeed's page cache uses everywhere else in this app:
      // the current hash is immutable and worth serving straight from
      // LiteSpeed's cache; a stale hash must hit Node so it gets today's CSS.
      [LS_CACHE]: isCurrent ? "public, max-age=31536000" : NO_CACHE,
    },
  });
}
