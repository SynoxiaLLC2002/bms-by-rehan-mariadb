import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { findRedirect, countHit } from "@/lib/redirects";
import { configuredSiteUrl, languageSet, maintenanceState, type MaintenanceState } from "@/lib/edgeLanguages";
import { DEBUG_HEADER, LS_CACHE, LS_TAG, NO_CACHE, cacheSettings, hasSessionCookie, pageCacheDecision, purgeAll } from "@/lib/lscache";
import { on, pageKind } from "@/lib/speed";
import { databaseUrl } from "@/lib/db/pool";

/** Paths that belong to the admin's root layout, not the site's. */
// `/.well-known` holds the OAuth metadata for "Connect Claude" (lib/oauth.ts);
// rewritten to `/en/.well-known/…` it was a 404.
const NON_SITE = ["/admin", "/preview", "/api", "/og", "/site", "/indexnow", "/.well-known"];

/**
 * Where the site is reached from outside — for anything sent back to a
 * browser as a `Location` header.
 *
 * Behind nginx or Passenger the request this process sees is
 * `http://localhost:3000/…`, and a redirect built from that would send the
 * visitor to localhost. The public address is configuration, not something
 * the request can tell us, so it comes from the same variable NextAuth uses.
 */
function publicOrigin(req: NextRequest): string {
  const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the request.
    }
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}

/**
 * Not wrapped in NextAuth's `auth()` middleware helper, deliberately.
 *
 * That helper hands the handler a *copy* of the request whose origin has been
 * replaced with NEXTAUTH_URL. The copy is fine for reading a path, and it is
 * what made `Response.redirect(new URL("/admin/login", req.url))` land on the
 * public domain. But a rewrite built from it carried the public origin too, and
 * Next treats a rewrite to any origin other than the one it received the
 * request on as a proxy to that origin. On Vercel the two agree. Under
 * `next start` on a VPS or shared host they never do — the internal origin is
 * `http://localhost:<port>` — so every page was fetched from the site's own
 * public domain over the network, or 500ed on a host that cannot loop back.
 *
 * Reading the session cookie directly with `getToken` leaves the request
 * untouched: rewrites use the internal origin Next expects, and redirects use
 * `publicOrigin()` above.
 */
/**
 * One address for the site.
 *
 * Verified on the first deployment: `www.example.com` and `http://example.com`
 * both served the site with a 200. The canonical tag keeps that from being
 * a duplicate-content penalty, but every such URL still splits links and
 * crawl budget, and `http://` leaves the visitor unencrypted until HSTS has
 * been seen once. A 301 to the configured address closes both.
 *
 * Deliberately narrow, so a proxy that rewrites the Host header cannot send
 * the site into a redirect loop: only two specific mismatches are corrected —
 * the `www.` twin of the configured host, and plain http on that same host.
 * Any other hostname is left alone. Nothing happens until a public URL is
 * configured, and never for localhost.
 */
async function canonicalRedirect(req: NextRequest): Promise<NextResponse | null> {
  if (process.env.NODE_ENV !== "production") return null;
  // Settings -> Site URL first, environment second. Reading only the
  // environment meant a domain change was half-applied: canonicals and the
  // sitemap moved immediately while this redirect kept pointing at the old
  // host, which reads to a visitor as a redirect loop between two domains.
  const configured = (await configuredSiteUrl()) || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL;
  if (!configured) return null;

  let canonical: URL;
  try {
    canonical = new URL(configured);
  } catch {
    return null;
  }
  if (/^(localhost|127\.0\.0\.1)$/.test(canonical.hostname)) return null;

  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  const proto = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")).split(",")[0].trim().toLowerCase();

  const isWwwTwin = host === `www.${canonical.host}` || `www.${host}` === canonical.host;
  const isPlainHttp = host === canonical.host && canonical.protocol === "https:" && proto === "http";
  if (!isWwwTwin && !isPlainHttp) return null;

  // Without the trailing slash, so `www.` + `/page/` is one hop, not two.
  const path = req.nextUrl.pathname.length > 1 ? req.nextUrl.pathname.replace(/\/+$/, "") || "/" : req.nextUrl.pathname;
  const target = new URL(path + req.nextUrl.search, canonical.origin);
  return NextResponse.redirect(target, 301);
}

/**
 * Public routes whose path ends in a file extension.
 *
 * The matcher below skips extensions, which is right for the language and
 * cache work but wrong for `canonicalRedirect`: these are real routes, so the
 * `www.` twin answered every one of them with a 200, and a crawler that found
 * `www.` could take the whole sitemap set from a hostname that is not the
 * canonical one. They are matched explicitly now, and leave again immediately
 * — none of them wants a language rewrite or a page-cache decision.
 */
const FILE_ROUTES =
  /^\/(?:robots\.txt|llms\.txt|favicon\.ico|main-sitemap\.xsl|(?:sitemap|sitemap_index|post-sitemap|page-sitemap|category-sitemap|tag-sitemap|author-sitemap)\.xml|sitemap-part\/[a-z]+\/\d+\.xml|(?:[\w-]+\/)?feed\.xml)$/;

/**
 * Old addresses that end in a file extension — what a site moved from
 * WordPress or plain HTML leaves behind: `/about.html`, `/index.php?p=12`,
 * `/brochure.pdf`. The matcher skips extensions, so redirect rules for these
 * saved without complaint and never ran. They are matched explicitly now, get
 * the redirect lookup, and otherwise pass straight through untouched.
 */
// .xml/.rss/.atom: an old /rss.xml or /feed.rss. BMS's own sitemaps and feed match FILE_ROUTES first and
// leave before the redirect lookup, so a rule can never take them over.
const LEGACY_FILE = /\.(?:html?|php|aspx?|jsp|cfm|shtml|pdf|xml|rss|atom)$/i;

/**
 * Administrator screens. The sidebar hides them from editors; this stops the
 * screen itself loading from a typed address, where every save then failed
 * with "forbidden" and looked like a broken site.
 */
const ADMIN_ONLY_PREFIXES = [
  "/admin/seo", "/admin/speed", "/admin/settings", "/admin/navigation", "/admin/elements",
  "/admin/links", "/admin/plugins", "/admin/users", "/admin/health", "/admin/errors",
  "/admin/updates", "/admin/customize", "/admin/homepages", "/admin/email",
];

/** Write routes that say their own, targeted `X-LiteSpeed-Purge` (lib/publishCache.ts). */
/**
 * Routes an API token may never call: accounts and tokens (a token minting
 * tokens or resetting a password is a takeover), first-run setup, whole-site
 * backup / import / export, self-update, plugins, mail credentials and the
 * server's .htaccess. Everything a site is *built* with stays open.
 */
// Also forms (submissions) and comments: they hold visitors' names and
// emails, which building pages never needs. `forms/submit` stays open —
// it is the public form endpoint and takes no token anyway.
const TOKEN_REFUSED = /^\/api\/(?:users|tokens|auth|setup|backup|import|export|updates|plugins|mail-settings|premium|speed\/htaccess|comments|forms(?!\/submit(?:\/|$)))(?:\/|$)/;

// `mcp` too: every MCP call is a POST, reads included, and the writes it makes
// are its own requests to the routes below, which purge for themselves — the
// net here would empty the whole cache on every tools/list. `oauth`
// ("Connect Claude") changes no page at all, and neither does `claude-bridge`
// (lib/claudeBridge.ts), which only talks to Cloudflare, nor does `premium`,
// which only stores an unlock key.
const TARGETED_PURGE = /^\/api\/(?:(?:posts|pages|revisions|mcp|oauth|claude-bridge|premium)(?:\/|$)|comments\/[^/]+$)/;

/** Never gated by maintenance mode, or the owner cannot switch it off again. */
const MAINTENANCE_EXEMPT = /^\/(?:admin|api|_next|preview|site|fonts|uploads|og|\.well-known)(?:\/|$)|^\/favicon\.ico$/;

/** The maintenance screen, as a real 503 with Retry-After. */
function maintenanceResponse(m: MaintenanceState): NextResponse {
  const esc = (v: string) =>
    v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="robots" content="noindex">` +
    `<title>${esc(m.title)}</title>` +
    `<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;` +
    `background:${esc(m.bg)};color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center}` +
    `main{max-width:32rem;padding:0 1.5rem}h1{font-size:1.875rem;margin:0 0 .75rem}p{opacity:.6;margin:0}</style>` +
    `</head><body><main><h1>${esc(m.title)}</h1><p>${esc(m.message)}</p></main></body></html>`;
  return new NextResponse(html, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Tells a crawler this is temporary and to come back, rather than
      // recording the notice as the page.
      "retry-after": "3600",
      "cache-control": "no-store",
      // LiteSpeed must not cache the maintenance screen either: NO_CACHE is
      // the VALUE for the LS_CACHE header, not a header name of its own.
      [LS_CACHE]: NO_CACHE,
    },
  });
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // A brand-new site with no database yet: every address leads to the setup
  // screen (which creates it), and nothing is cached on the way.
  if (!databaseUrl()) {
    if (pathname === "/admin/setup" || pathname.startsWith("/api/setup")) return uncached();
    const res = NextResponse.redirect(new URL("/admin/setup", publicOrigin(req)), 307);
    res.headers.set("Cache-Control", "no-store");
    res.headers.set(LS_CACHE, NO_CACHE);
    return res;
  }

  const canonical = await canonicalRedirect(req);
  if (canonical) return canonical;

  // Astro's render route is reached only through the rewrite at the end.
  if (pathname === ASTRO_ROUTE || pathname.startsWith(`${ASTRO_ROUTE}/`)) {
    return new NextResponse(null, { status: 404, headers: { [LS_CACHE]: NO_CACHE } });
  }

  // Trailing slash (next.config.mjs skipTrailingSlashRedirect). An address
  // with a redirect or 410 rule falls through to the rule below, which matches
  // it slash and all (normalisePath), so `/old-post/` reaches its destination
  // in one hop. Anything else gets the 308 Next used to send: one address per
  // page, the one without the slash.
  if (pathname.length > 1 && pathname.endsWith("/") && !(await findRedirect(pathname))) {
    // A plain URL, not `req.nextUrl.clone()`: NextURL keeps the trailing slash
    // it was parsed with, and the redirect pointed back at itself.
    const url = new URL((pathname.replace(/\/+$/, "") || "/") + req.nextUrl.search, publicOrigin(req));
    return NextResponse.redirect(url, 308);
  }

  // Maintenance mode, with a status code.
  //
  // `SiteLayout` renders the screen, but a server component cannot set one, so
  // the notice went out as 200 and Google could index it as the homepage. The
  // middleware can, and it runs in the Node runtime with database access.
  //
  // Only for visitors with no session: anyone signed in falls through to
  // SiteLayout, which does the administrator check and either shows the site
  // or the screen exactly as before. The admin area and the API are never
  // gated here, or an administrator could not turn maintenance back off.
  if (!MAINTENANCE_EXEMPT.test(pathname)) {
    const m = await maintenanceState();
    if (m.on) {
      if (!hasSessionCookie(req.headers.get("cookie"))) return maintenanceResponse(m);
      // A session cookie is only a name; the role check that used to run
      // inside SiteLayout (and read cookies inside cached pages) runs here
      // instead, and only while maintenance is on — the same signed-token
      // read the admin gate below uses.
      const token = await getToken({
        req,
        secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
        secureCookie: /^https:/i.test(process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? ""),
      }).catch(() => null);
      if (token?.role !== "admin") return maintenanceResponse(m);
    }
  }

  // Matched only so the redirect above can see them.
  if (FILE_ROUTES.test(pathname)) return undefined;

  const cookie = req.headers.get("cookie");

  // LiteSpeed page cache (lib/lscache.ts). Anything that is not a public page
  // is marked uncacheable, and every authenticated write purges the lot — the
  // API routes purge too, this is the net under them.
  if (pathname.startsWith("/api")) {
    // An API token (lib/apiTokens.ts) is refused here for anything that would
    // turn a leaked token into a lost site. Checked on the header's shape
    // only — the routes verify the token itself.
    const bearer = /^Bearer\s+bms_/i.test(req.headers.get("authorization") ?? "");
    if (bearer && TOKEN_REFUSED.test(pathname)) {
      return NextResponse.json({ error: "API tokens cannot use this endpoint. Sign in to the admin instead." }, { status: 403, headers: { [LS_CACHE]: NO_CACHE } });
    }
    const res = NextResponse.next();
    res.headers.set(LS_CACHE, NO_CACHE);
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS" && (hasSessionCookie(cookie) || bearer) && !TARGETED_PURGE.test(pathname)) {
      // Speed → Cache → "Clear on every save", on by default (lib/speed.ts).
      //
      // Settings, menus, categories, widgets, users: a change to any of them
      // shows on every page, so the whole LiteSpeed cache goes. LiteSpeed will
      // not ask Node again until its own entry expires — a day, by default —
      // so with this switched off such an edit is invisible on the site until
      // then, or until someone presses Purge.
      //
      // Post and page saves are *not* in this net (TARGETED_PURGE). Until
      // 1.9.47 they were, and every 20-second draft autosave emptied the
      // whole site for a document nobody could see. Those routes now purge
      // exactly the URLs they changed, by header, and nothing for a draft —
      // see lib/publishCache.ts.
      if (on((await cacheSettings()).cache_purge_on_save)) purgeAll(res.headers);
    }
    return res;
  }

  // Admin gate first — a redirect rule should never shadow the login flow.
  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login" || pathname === "/admin/setup" || pathname === "/admin/forgot" || pathname === "/admin/reset") return uncached();

    // The cookie is `__Secure-`-prefixed exactly when NextAuth thinks the site
    // is served over https, which it decides from the same URL variable.
    const secureCookie = /^https:/i.test(process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "");
    const token = await getToken({
      req,
      secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
      secureCookie,
    });
    if (!token) {
      const login = new URL("/admin/login", publicOrigin(req));
      // The "Connect Claude" screen comes back here after signing in, or
      // the connection the app started is lost (lib/oauth.ts).
      if (pathname === "/admin/connect") login.searchParams.set("next", pathname + req.nextUrl.search);
      return NextResponse.redirect(login);
    }

    // An author's admin is Posts, Media and their own profile. Every other
    // screen sends them to the dashboard — the API refuses the writes anyway,
    // this just keeps the screens honest. One gate here rather than a check
    // in each of twenty page files.
    if (token.role === "author") {
      const mine = typeof token.sub === "string" ? `/admin/users/${token.sub}` : "";
      const allowed =
        pathname === "/admin" ||
        pathname === "/admin/connect" ||
        pathname.startsWith("/admin/posts") ||
        pathname.startsWith("/admin/media") ||
        (mine && pathname === mine);
      if (!allowed) return NextResponse.redirect(new URL("/admin", publicOrigin(req)));
    } else if (token.role !== "admin") {
      // Editors: everything but the administrator screens — and their own
      // profile, which lives under /admin/users.
      const mine = typeof token.sub === "string" ? `/admin/users/${token.sub}` : "";
      const adminOnly = ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
      if (adminOnly && !(mine && (pathname === mine || pathname.startsWith(`${mine}/`)))) {
        return NextResponse.redirect(new URL("/admin", publicOrigin(req)));
      }
    }
    return uncached();
  }

  // Managed redirects. The table is cached in module scope, so this is a Map
  // lookup on all but the first request in each TTL window.
  const rule = await findRedirect(pathname);
  if (rule) {
    countHit(pathname);
    // 410 Gone: removed for good. Search engines drop it at the next visit.
    if (rule.type === 410) {
      return new NextResponse(
        '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>410</title></head>' +
          '<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;text-align:center"><div><h1 style="font-size:3rem;margin:0">410</h1><p><a href="/">← /</a></p></div></body></html>',
        { status: 410, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "public, max-age=3600" } }
      );
    }
    // The query string comes along unless the rule sets its own. Dropping it
    // silently threw away every `?utm_source=…`, `?gclid=…` and `?ref=…` on a
    // redirected URL, so a campaign that pointed at an old address arrived
    // with no attribution at all and the traffic looked like it came from
    // nowhere. A destination that specifies its own query wins, since that
    // was a deliberate choice by whoever wrote the rule.
    const url = rule.destination.startsWith("http")
      ? new URL(rule.destination)
      : new URL(rule.destination, publicOrigin(req));
    if (!url.search && req.nextUrl.search) url.search = req.nextUrl.search;
    return NextResponse.redirect(url.toString(), rule.type === 302 ? 302 : 301);
  }

  // A legacy file address with no rule: leave it to whatever serves it (a
  // real file in public/, or the 404) — no language rewrite, no page cache.
  if (LEGACY_FILE.test(pathname)) return undefined;

  if (NON_SITE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    // Previews are for editors and must never be cached; the rest (/og,
    // /site, /indexnow) is immutable or trivial and needs no page-cache
    // decision.
    return pathname.startsWith("/preview") ? uncached() : undefined;
  }

  const { all, default: defaultLang } = await languageSet();

  // A public page: cacheable unless someone is signed in, the Speed settings
  // exclude it, or the query string means something (lib/lscache.ts).
  const decision = await pageCacheDecision({
    method: req.method,
    pathname,
    params: [...req.nextUrl.searchParams.keys()],
    cookie,
    flight: req.headers.has("rsc") || req.headers.has("next-router-prefetch") || req.nextUrl.searchParams.has("_rsc"),
    languages: all,
  });
  const cacheValue = decision.header ?? NO_CACHE;
  const debug = (await cacheSettings()).speed_debug_headers === "true";

  // Put the language into the path so the site's root layout can read it.
  //
  // Public URLs do not change: the default language stays unprefixed, so
  // `/about` is rewritten to `/en/about` internally while the address bar still
  // says `/about`. A URL that already names a configured non-default language
  // is left alone — it matches the `[lang]` segment as it stands.
  //
  // This is a rewrite rather than a redirect precisely so the visible URL is
  // untouched, and it is what lets `<html lang>` be correct without making
  // every page dynamic: the language arrives as a route param, which prerenders,
  // instead of as a request header, which does not.
  // Lowercased: language codes are case-insensitive in practice, and a link
  // typed or pasted as `/FR/about` used to fall through as an unknown segment
  // and 404. Only the comparison is lowercased — `pathname` itself is left
  // alone so nothing else shifts.
  const rawFirst = pathname.split("/")[1] ?? "";
  const first = rawFirst.toLowerCase();

  // `/FR/about`: the prefix matched above, but the route receives "FR" and
  // compares it with "fr", so the page 404ed. One address per page — send
  // it to the lowercase one, permanently, query string included.
  if (rawFirst !== first && all.includes(first)) {
    const lowered = `/${first}${pathname.slice(rawFirst.length + 1)}`;
    return NextResponse.redirect(new URL(lowered + req.nextUrl.search, publicOrigin(req)), 301);
  }

  // The default language written with its prefix — `/ar`, `/ar/about` on a
  // site whose default is Arabic. The rewrite below would have made that
  // `/ar/ar/about`, a 404 that LiteSpeed then cached for a day. The address
  // is a reasonable guess for anyone who has seen `/fr/about` work, and
  // Polylang and WPML both answer it with a redirect to the unprefixed
  // canonical; so does this. Permanent, and the query string travels along.
  if (first === defaultLang && (pathname === `/${defaultLang}` || pathname.startsWith(`/${defaultLang}/`))) {
    const stripped = pathname.slice(defaultLang.length + 1) || "/";
    return NextResponse.redirect(new URL(stripped + req.nextUrl.search, publicOrigin(req)), 301);
  }

  // A cached page carries its kind as a LiteSpeed tag — `home`, `archive` or
  // `page` — so a publish can purge every listing page in one word
  // (`X-LiteSpeed-Purge: tag=archive`) instead of naming `/page/2`, `/page/3`
  // … or, as before, dropping the whole site.
  const tag = decision.header ? pageKind(pathname, all) : null;
  // Browsers revalidate (`max-age=0`); Cloudflare and any other shared cache
  // keep the page for the same lifetime LiteSpeed does. Without `s-maxage`
  // the edge rule's "respect origin" had nothing to respect, and HTML was
  // DYNAMIC even after Vary was fixed (lib/htaccess.ts).
  const edge = decision.ttl ? `public, max-age=0, s-maxage=${decision.ttl}` : null;

  const astro = astroTarget(req, pathname, all, cookie);

  if (first !== defaultLang && all.includes(first)) {
    const res = astro ? toAstro(req, astro, pathname) : NextResponse.next();
    res.headers.set(LS_CACHE, cacheValue);
    if (edge) res.headers.set("Cache-Control", edge);
    if (tag) res.headers.set(LS_TAG, tag);
    if (debug) res.headers.set(DEBUG_HEADER, decision.reason);
    return res;
  }

  // `req.nextUrl` is the request as Next built it, so its origin is the one
  // Next compares against — the rewrite stays internal. See the note above.
  const url = req.nextUrl.clone();
  url.pathname = `/${defaultLang}${pathname === "/" ? "" : pathname}`;
  const res = astro ? toAstro(req, astro, pathname) : NextResponse.rewrite(url);
  res.headers.set(LS_CACHE, cacheValue);
  if (edge) res.headers.set("Cache-Control", edge);
  if (tag) res.headers.set(LS_TAG, tag);
  if (debug) res.headers.set(DEBUG_HEADER, decision.reason);
  return res;
}

/**
 * Public pages are rendered by Astro (app/bms-render, astro/): this page's
 * rewrite target there, or null for Next to render it as before. Next keeps
 * signed-in visitors (admin bar, previews), React navigations, query strings
 * and the listing pages; a page Astro does not know comes back to Next anyway
 * (server.js). BMS_ASTRO=off in the host's environment switches it off.
 */
const NEXT_ONLY = /^(?:search|feed|author|category|tag|page)$/i;
function astroTarget(req: NextRequest, pathname: string, langs: string[], cookie: string | null): URL | null {
  if (process.env.BMS_ASTRO === "off") return null;
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  if (req.nextUrl.search || hasSessionCookie(cookie) || req.headers.get("x-bms-no-astro") === "1") return null;
  if (req.headers.has("rsc") || req.headers.has("next-router-prefetch")) return null;
  const segs = pathname.split("/").filter(Boolean);
  const first = segs.length && langs.includes(segs[0].toLowerCase()) ? segs[1] : segs[0];
  if (first && NEXT_ONLY.test(first)) return null;
  const url = req.nextUrl.clone();
  url.pathname = `${ASTRO_ROUTE}${pathname === "/" ? "" : pathname}`;
  return url;
}
const ASTRO_ROUTE = "/bms-render";

/** The rewrite to Astro, carrying the visitor's own path. */
function toAstro(req: NextRequest, url: URL, pathname: string): NextResponse {
  const headers = new Headers(req.headers);
  headers.set("x-bms-path", pathname);
  return NextResponse.rewrite(url, { request: { headers } });
}

/** Pass the request through, telling LiteSpeed not to keep the answer. */
function uncached(): NextResponse {
  const res = NextResponse.next();
  res.headers.set(LS_CACHE, NO_CACHE);
  return res;
}

export const config = {
  // Everything except Next internals and anything with a file extension —
  // those can never be a redirect source and shouldn't pay for it. The API is
  // included only for the LiteSpeed cache headers, and leaves before any lookup.
  matcher: [
    "/((?!_next/|.*\\.[\\w]+$).*)",
    // The few real routes that do end in an extension, so the canonical-host
    // redirect reaches them too — see FILE_ROUTES.
    "/robots.txt",
    "/llms.txt",
    "/favicon.ico",
    "/main-sitemap.xsl",
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/post-sitemap.xml",
    "/page-sitemap.xml",
    "/category-sitemap.xml",
    "/tag-sitemap.xml",
    "/author-sitemap.xml",
    "/sitemap-part/:kind/:file",
    "/feed.xml",
    "/:lang/feed.xml",
    // Legacy file addresses, for redirect rules — see LEGACY_FILE. Uploads and
    // Next's own files are excluded: they are never a redirect source.
    "/((?!_next/|uploads/|fonts/).*\\.(?:html?|php|aspx?|jsp|cfm|shtml|pdf|xml|rss|atom))",
  ],
  // Node, not Edge. The redirect and language lookups above need a database,
  // and on a VPS or shared host that database is reached over TCP, which the
  // Edge sandbox cannot open. Node middleware runs everywhere this CMS is
  // meant to run; Edge middleware runs only where the database is Neon.
  runtime: "nodejs",
};
