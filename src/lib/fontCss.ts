// Inlines the Google Fonts stylesheet.
//
// A `<link>` to fonts.googleapis.com is render-blocking: the browser cannot
// paint until it has opened a connection to a third party, fetched a small
// CSS file, and only then learned which font files to fetch from a *second*
// host. Inlining that CSS removes the first round trip entirely — the page
// arrives already knowing the font URLs — which is what `next/font` does for
// fonts chosen at build time. The Customizer chooses fonts at run time, so it
// is done here, once per process per font set, and kept for a day.
//
// Google serves different CSS to different browsers (woff2 to modern ones,
// older formats to old ones), so the request identifies itself as a modern
// browser; every browser that matters reads woff2. On any failure the caller
// falls back to the plain link, so a fonts outage costs a round trip, never a
// missing font.

const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { css: string; at: number }>();
const inFlight = new Map<string, Promise<string | null>>();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * How long a failure is remembered.
 *
 * Only successes were cached. On a host that cannot reach Google — a firewall,
 * an outage, no DNS — every single page render tried again and waited the full
 * timeout first. With several font files that is seconds added to every
 * request, and it looks like the site being slow rather than a font that
 * cannot be fetched.
 *
 * Shorter than the success TTL: a transient outage should heal on its own
 * within a couple of minutes, but not at the cost of one stall per render.
 */
const FAIL_TTL_MS = 2 * 60 * 1000;
const failures = new Map<string, number>();

function remember(url: string, css: null): null {
  failures.set(url, Date.now());
  return css;
}

export async function inlineFontCss(url: string): Promise<string | null> {
  if (!url) return null;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.css;

  // A recent failure short-circuits, so a host that cannot reach the font
  // service pays the timeout once every FAIL_TTL_MS rather than once a render.
  const failedAt = failures.get(url);
  if (failedAt !== undefined) {
    if (Date.now() - failedAt < FAIL_TTL_MS) return null;
    failures.delete(url);
  }

  const pending = inFlight.get(url);
  if (pending) return pending;

  const p = (async () => {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "text/css,*/*;q=0.1" },
        signal: AbortSignal.timeout(4000),
        // No cache option on purpose: an explicit one can change how Next
        // treats the page that called this. The map above owns the lifetime.
      });
      if (!res.ok) return remember(url, null);
      const css = (await res.text()).trim();
      // Sanity: it must look like font-face CSS and must not have come back as
      // an HTML error page or something else entirely.
      if (!css.startsWith("/*") && !css.startsWith("@font-face")) return remember(url, null);
      if (!css.includes("@font-face") || css.includes("<")) return remember(url, null);
      cache.set(url, { css, at: Date.now() });
      return css;
    } catch {
      return remember(url, null);
    } finally {
      inFlight.delete(url);
    }
  })();
  inFlight.set(url, p);
  return p;
}
