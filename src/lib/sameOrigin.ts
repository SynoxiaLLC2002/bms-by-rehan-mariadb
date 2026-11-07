import type { NextRequest } from "next/server";

/**
 * Whether a request's Origin header is this site.
 *
 * Not `req.nextUrl.origin`: behind Passenger and LiteSpeed the process sees
 * `http://localhost:3000/…`, so a real browser's `https://example.com` never
 * matched it (see publicOrigin in middleware.ts). The site's configured
 * addresses count, and so does the Host the browser itself addressed — the
 * usual cross-site check, since a page elsewhere cannot make a browser send
 * one site's Host with another site's Origin.
 */
export function isSameOrigin(req: NextRequest, origin: string, extra: string[] = []): boolean {
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  const configured = [process.env.AUTH_URL, process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_SITE_URL, req.nextUrl.origin, ...extra];
  for (const c of configured) {
    if (!c) continue;
    try {
      if (new URL(c).origin === o.origin) return true;
    } catch {
      // Not a URL; skip it.
    }
  }
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  return !!host && o.host.toLowerCase() === host;
}
