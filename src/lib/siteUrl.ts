// The site's own absolute origin.
//
// Three files had grown the same expression —
// `(settings.site_url || process.env.NEXT_PUBLIC_SITE_URL || "")` — and all
// three quietly produced `""` on a deployment where neither is set. That empty
// string is not a harmless default:
//
//   • the sitemap emitted `<loc>/rehan1</loc>`, and `<loc>` must be absolute,
//     so search engines reject the whole file;
//   • the feed emitted `<link>/rehan1</link>` and a relative `<guid>`, which no
//     reader can resolve;
//   • robots.txt silently dropped its `Sitemap:` line, so nothing pointed at
//     the sitemap either.
//
// The next failure mode was worse: an empty setting plus a host that only
// has AUTH_URL / NEXTAUTH_URL (the login address, always set in production)
// fell through to `http://localhost:3000`. Sitemap, robots, feed and llms.txt
// are built at request time, so they published localhost while prerendered
// pages (canonical, og:url) still looked fine. Skip loopback whenever a
// public address exists.

import type { SiteSettings } from "./settings";

/** Adds a scheme to a bare host and drops any trailing slash. */
function normalise(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  // Vercel's env vars are bare hostnames, and those deployments are https.
  return `https://${value}`;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLoopback(url: string): boolean {
  const host = hostnameOf(url);
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Just the origin of a URL, or "" if it cannot be parsed.
 *
 * `AUTH_URL` / `NEXTAUTH_URL` are *login* addresses, not site addresses, and
 * they legitimately carry a path: `https://example.com/api/auth` is the
 * NextAuth v4 convention and v5 allows one under a `basePath`. Taken whole,
 * that path would be glued onto every canonical, `og:url`, hreflang and
 * sitemap `<loc>` on the site — the same invisible-SEO failure this
 * resolution order exists to prevent, moved to the next domain instead of
 * this one. A live site happens to set a bare origin, so it never showed
 * there; the first site that does not would have shipped `/api/auth` in
 * every URL it publishes.
 *
 * Only the auth variables go through this. Settings → Site URL and
 * `NEXT_PUBLIC_SITE_URL` are site addresses the owner set deliberately, so a
 * path in those is kept.
 */
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/**
 * Where this site lives, as an absolute origin with no trailing slash.
 *
 * Public addresses win: Settings → Site URL, then the build-time site URL,
 * then the NextAuth address the host already has for login. Loopback is
 * never chosen when any of those is a real host — that is what shipped
 * localhost in the sitemap on a live site. Localhost remains the last
 * resort for `next dev` only.
 */
export function siteUrl(settings: SiteSettings): string {
  const candidates = [
    normalise(settings.site_url ?? ""),
    normalise(process.env.NEXT_PUBLIC_SITE_URL ?? ""),
    // Login addresses — origin only, never their path. See `originOf`.
    originOf(normalise(process.env.AUTH_URL ?? "")),
    originOf(normalise(process.env.NEXTAUTH_URL ?? "")),
    normalise(process.env.VERCEL_PROJECT_PRODUCTION_URL ?? ""),
    normalise(process.env.VERCEL_URL ?? ""),
  ].filter(Boolean);

  const publicUrl = candidates.find((url) => !isLoopback(url));
  if (publicUrl) return publicUrl;

  return candidates[0] || `http://localhost:${process.env.PORT || 3000}`;
}
