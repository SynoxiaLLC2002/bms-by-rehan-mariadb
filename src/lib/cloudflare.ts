// Cloudflare zone settings the Speed screen reads and flips.
//
// Two settings matter for a site cached at the origin: "Browser Cache TTL",
// which Cloudflare uses to *overwrite* the Cache-Control the app sends unless
// it is set to "Respect Existing Headers" (value 0) — on a live site this
// clamped a one-year immutable font to four hours — and "Development Mode",
// which bypasses the edge cache for three hours while something is being
// fixed. Both need an API token with Zone → Zone Settings → Edit; the purge
// needs Zone → Cache Purge → Purge. One token can carry all three.

export interface CloudflareStatus {
  configured: boolean;
  ok: boolean;
  error?: string;
  zoneName?: string;
  /** Seconds, 0 = respect existing headers. */
  browserTtl?: number;
  developmentMode?: boolean;
  /** Seconds left of development mode, when on. */
  developmentModeRemaining?: number;
  /** Whether the edge is caching HTML — see cacheRuleState. */
  edgeHtml?: "on" | "off" | "stale" | "unreadable";
  /** Why the rule could not be read, when it could not. */
  edgeHtmlError?: string;
  /** 103 Early Hints. undefined = the zone would not say. */
  earlyHints?: boolean;
  /** Smart Tiered Cache. */
  tieredCache?: boolean;
  /** Polish: "off" | "lossless" | "lossy", or undefined when unavailable. */
  polish?: string;
  /**
   * Why Polish cannot be set here, when it cannot.
   *
   * Polish needs a Pro plan or above. On a Free zone the API answers with a
   * plan error, and a switch that always fails is worse than no switch — so
   * the screen shows the reason instead of a control that cannot work.
   */
  polishUnavailable?: string;
}

const API = "https://api.cloudflare.com/client/v4";

/**
 * Smart Tiered Cache lives under /cache/, not /settings/, unlike every other
 * toggle here. Named once so the read and the write cannot drift apart.
 */
const TIERED_CACHE = "/cache/tiered_cache_smart_topology_enable";

interface CfEnvelope<T> {
  success?: boolean;
  result?: T;
  errors?: { message?: string }[];
}

type CfResult<T> = { ok: true; result: T } | { ok: false; error: string; status?: number };

async function call<T>(settings: Record<string, string>, path: string, init: RequestInit = {}): Promise<CfResult<T>> {
  const zoneId = settings.cf_zone_id?.trim();
  const token = settings.cf_api_token?.trim();
  if (!zoneId || !token) return { ok: false, error: "Zone ID and API token are not set." };
  try {
    const res = await fetch(`${API}/zones/${zoneId}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as CfEnvelope<T> | null;
    if (res.ok && data?.success && data.result !== undefined) return { ok: true, result: data.result };
    return { ok: false, error: data?.errors?.[0]?.message || `Cloudflare responded with ${res.status}.`, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach Cloudflare." };
  }
}

export async function cloudflareStatus(settings: Record<string, string>): Promise<CloudflareStatus> {
  if (!settings.cf_zone_id?.trim() || !settings.cf_api_token?.trim()) return { configured: false, ok: false };
  const [zone, ttl, dev, edge, hints, tiered, polish] = await Promise.all([
    call<{ name: string }>(settings, ""),
    call<{ value: number }>(settings, "/settings/browser_cache_ttl"),
    call<{ value: "on" | "off"; time_remaining?: number }>(settings, "/settings/development_mode"),
    cacheRuleState(settings),
    call<{ value: "on" | "off" }>(settings, "/settings/early_hints"),
    call<{ value: "on" | "off" }>(settings, TIERED_CACHE),
    call<{ value: string }>(settings, "/settings/polish"),
  ]);
  if (!zone.ok) return { configured: true, ok: false, error: zone.error };
  return {
    configured: true,
    ok: true,
    zoneName: zone.result.name,
    browserTtl: ttl.ok ? ttl.result.value : undefined,
    developmentMode: dev.ok ? dev.result.value === "on" : undefined,
    developmentModeRemaining: dev.ok ? dev.result.time_remaining : undefined,
    edgeHtml: edge.state,
    edgeHtmlError: edge.error,
    earlyHints: hints.ok ? hints.result.value === "on" : undefined,
    tieredCache: tiered.ok ? tiered.result.value === "on" : undefined,
    polish: polish.ok ? polish.result.value : undefined,
    polishUnavailable: polish.ok ? undefined : polish.error,
    error: !ttl.ok ? ttl.error : !dev.ok ? dev.error : undefined,
  };
}

/**
 * 103 Early Hints.
 *
 * Cloudflare replays the `Link` headers of a cached response as a 103 while
 * the origin is still working, so the browser starts fetching the stylesheet
 * and fonts before the HTML arrives. It costs nothing and needs no plan.
 */
export async function cloudflareEarlyHints(settings: Record<string, string>, on: boolean): Promise<{ ok: boolean; error?: string }> {
  const r = await call(settings, "/settings/early_hints", { method: "PATCH", body: JSON.stringify({ value: on ? "on" : "off" }) });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/**
 * Smart Tiered Cache.
 *
 * Without it every Cloudflare datacentre that has not seen a page fetches it
 * from the origin itself, so a popular page can be fetched a hundred times
 * over. With it they ask a nearby upper-tier datacentre first, and the origin
 * usually answers once. Free on every plan; the path is under /cache/, not
 * /settings/, which is why it does not look like its neighbours.
 */
export async function cloudflareTieredCache(settings: Record<string, string>, on: boolean): Promise<{ ok: boolean; error?: string }> {
  const r = await call(settings, TIERED_CACHE, { method: "PATCH", body: JSON.stringify({ value: on ? "on" : "off" }) });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/**
 * Polish: recompress images at the edge.
 *
 * "lossless" strips metadata, "lossy" recompresses. Needs a Pro plan or
 * above — `cloudflareStatus` reports `polishUnavailable` on a Free zone so
 * the screen can say so rather than offer a switch that fails.
 */
export async function cloudflarePolish(settings: Record<string, string>, mode: "off" | "lossless" | "lossy"): Promise<{ ok: boolean; error?: string }> {
  const r = await call(settings, "/settings/polish", { method: "PATCH", body: JSON.stringify({ value: mode }) });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/** Browser Cache TTL → "Respect Existing Headers". */
export async function cloudflareRespectHeaders(settings: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  const r = await call(settings, "/settings/browser_cache_ttl", { method: "PATCH", body: JSON.stringify({ value: 0 }) });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export async function cloudflareDevelopmentMode(settings: Record<string, string>, on: boolean): Promise<{ ok: boolean; error?: string }> {
  const r = await call(settings, "/settings/development_mode", { method: "PATCH", body: JSON.stringify({ value: on ? "on" : "off" }) });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}


// ── Caching the HTML itself at the edge ───────────────────────────────────
//
// LiteSpeed's page cache means a visitor's HTML is rendered once and then
// served from memory — but it is served from memory *in the datacentre the
// host is in*. Everyone else still pays the round trip: a live site answers
// in ~380 ms from Europe with `x-litespeed-cache: hit` and
// `cf-cache-status: DYNAMIC`, because Cloudflare does not cache HTML unless a
// rule says to. With one, the same page comes out of the visitor's nearest
// Cloudflare city in ~40 ms, and the origin renders it once an hour instead
// of once a visitor.
//
// The danger of caching HTML is serving one person's page to another, so the
// rule below is written as a list of everything that must miss: the admin,
// the API, previews, anything carrying a sign-in cookie, and anything with a
// query string at all — which covers search, Next's `?_rsc=` navigation
// payloads, and every form. The paths and cookies the Speed screen already
// excludes from the LiteSpeed cache are folded in too, so the edge and the
// origin never disagree about what is personal.

/** The description Cloudflare stores, and how this rule is found again. */
const CACHE_RULE_DESCRIPTION = "BMS by Rehan — cache HTML at the edge";

interface CfRule {
  id?: string;
  description?: string;
  expression?: string;
  action?: string;
  action_parameters?: Record<string, unknown>;
  enabled?: boolean;
}

/** A Cloudflare string literal: it has no escapes, so quotes are removed. */
function cfString(value: string): string {
  return `"${value.replace(/["\\]/g, "")}"`;
}

/**
 * The bypass list, built from the same settings the origin obeys.
 * `__Secure-authjs.session-token` contains `authjs.session-token`, so one
 * `contains` catches the cookie under either name.
 */
export function cacheRuleExpression(settings: Record<string, string>): string {
  const parts = [
    'http.request.method eq "GET"',
    'http.request.uri.query eq ""',
    // A client-side navigation asks for a page's URL with `RSC: 1` and wants
    // the React payload, not HTML. Next puts `?_rsc=` on those, which the
    // query clause already refuses; this is the belt to that brace, because
    // the origin's .htaccess now sends `Vary: Accept-Encoding` on pages
    // (lib/htaccess.ts) — the one thing that let Cloudflare cache HTML at
    // all — and Vary is no longer there to keep the two apart at the edge.
    'not any(http.request.headers["rsc"][*] eq "1")',
    'not any(http.request.headers["next-router-prefetch"][*] eq "1")',
    // The route itself and what is below it — not every path that merely
    // starts with the letters. `starts_with("/admin")` also kept
    // `/administration-guide` and `/api-tutorial` off the edge, the same
    // mistake robots.txt once made.
    ...["/admin", "/api", "/preview", "/indexnow"].map(
      (p) => `not (http.request.uri.path eq ${cfString(p)} or starts_with(http.request.uri.path, ${cfString(`${p}/`)}))`
    ),
    `not http.cookie contains ${cfString("authjs.session-token")}`,
  ];
  for (const raw of (settings.cache_exclude_cookies || "").split("\n")) {
    const name = raw.trim();
    if (name) parts.push(`not http.cookie contains ${cfString(name)}`);
  }
  for (const raw of (settings.cache_exclude_paths || "").split("\n")) {
    // `/shop`, `/shop/*` and `shop` all mean "this path and below"; a pattern
    // with a `*` in the middle is more than an edge expression can say, and
    // is left to the origin, which excludes it anyway.
    const path = raw.trim().replace(/\*+$/, "");
    if (!path || path.includes("*")) continue;
    parts.push(`not starts_with(http.request.uri.path, ${cfString(path.startsWith("/") ? path : `/${path}`)})`);
  }
  const pagesClause = parts.join(" and ");

  // Optimised images too. They always carry a query (`?url=…&w=…&q=…`), so
  // the page clause above never matched them, and Cloudflare does not cache
  // an extension-less path by default: every image on every visit went to
  // the Node process. The query is part of the cache key, so each size is
  // its own entry, and the origin already sends a year-long lifetime.
  // Only safe with one image format — see `formats` in next.config.mjs;
  // with AVIF switched on the edge could hand AVIF to a browser without it.
  if (process.env.IMAGE_FORMATS === "avif") return pagesClause;
  return `(${pagesClause}) or (http.request.method eq "GET" and starts_with(http.request.uri.path, "/_next/image"))`;
}

function cacheRule(settings: Record<string, string>): CfRule {
  return {
    action: "set_cache_settings",
    description: CACHE_RULE_DESCRIPTION,
    enabled: true,
    expression: cacheRuleExpression(settings),
    action_parameters: {
      cache: true,
      // The app already says how long: `s-maxage=3600` on a page, and the
      // Speed screen's cache lifetimes decide that number. Respecting it
      // means one place to change it, and a purge on save still clears the
      // edge immediately.
      edge_ttl: { mode: "respect_origin" },
      browser_ttl: { mode: "respect_origin" },
    },
  };
}

/**
 * "This zone has no cache ruleset yet", as opposed to a real failure.
 *
 * A zone that has never had a cache rule has no entrypoint ruleset, and
 * Cloudflare answers 404 with "could not find entrypoint ruleset in the
 * http_request_cache_settings phase". That is the ordinary state of an
 * untouched zone and means "off", not "broken" — but this used to be decided
 * by matching the wording, against a list that did not include the phrase
 * Cloudflare actually sends, so a working token was reported as one missing a
 * permission. The status code is the fact; the wording is a fallback for
 * anything that returns a message without one.
 */
function isMissingRuleset(r: { error: string; status?: number }): boolean {
  if (r.status === 404) return true;
  return /could not find|not found|does not exist|no such/i.test(r.error);
}

const CACHE_PHASE = "/rulesets/phases/http_request_cache_settings/entrypoint";

/** Whether our rule is currently in the zone's cache ruleset. */
export async function cacheRuleState(
  settings: Record<string, string>
): Promise<{ state: "on" | "off" | "stale" | "unreadable"; error?: string }> {
  const r = await call<{ rules?: CfRule[] }>(settings, CACHE_PHASE);
  if (!r.ok) {
    // A zone that has never had a cache rule has no entrypoint ruleset yet,
    // which is "off", not a problem to report.
    if (isMissingRuleset(r)) return { state: "off" };
    return { state: "unreadable", error: r.error };
  }
  const ours = (r.result.rules ?? []).find((rule) => rule.description === CACHE_RULE_DESCRIPTION);
  if (!ours) return { state: "off" };
  // A rule written by an older version (or before an excluded path was
  // added) still says "on" but is not the rule this version would write —
  // the first one, for instance, left every optimised image uncached.
  // "stale" lets the Speed screen offer to rewrite it.
  // Compared without whitespace, in case the API ever reformats what it stores.
  const same = (a?: string) => (a ?? "").replace(/\s+/g, "");
  return { state: same(ours.expression) === same(cacheRuleExpression(settings)) ? "on" : "stale" };
}

/**
 * Adds or removes the rule, leaving every other rule in the zone alone.
 *
 * The API replaces the whole ruleset on a write, so this reads first and
 * refuses to write if that read failed for any reason other than the ruleset
 * not existing yet — overwriting somebody's cache rules with one of ours
 * because a token lacked a permission is not a recoverable mistake.
 */
export async function cloudflareSetCacheRule(
  settings: Record<string, string>,
  enable: boolean
): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const existing = await call<{ rules?: CfRule[] }>(settings, CACHE_PHASE);
  let rules: CfRule[] = [];
  if (existing.ok) rules = existing.result.rules ?? [];
  else if (!isMissingRuleset(existing)) {
    return { ok: false, error: existing.error };
  }

  const others = rules.filter((rule) => rule.description !== CACHE_RULE_DESCRIPTION);
  // Ours goes last: an earlier rule that already decided how to treat a
  // request keeps its say.
  const next = enable ? [...others, cacheRule(settings)] : others;
  if (!enable && next.length === rules.length) return { ok: true };

  const r = await call(settings, CACHE_PHASE, {
    method: "PUT",
    body: JSON.stringify({ rules: next.map(({ id: _id, ...rule }) => rule) }),
  });
  if (!r.ok) return { ok: false, error: r.error };
  // The companion rule. Its failure never undoes the cache rule — that one is
  // written and working — it is only reported.
  const t = await cloudflareSetTrackingRewrite(settings, enable);
  return t.ok ? { ok: true } : { ok: true, warning: `Edge caching is ${enable ? "on" : "off"}, but the tracking-parameter rule could not be ${enable ? "added" : "removed"}: ${t.error} (the API token needs "Transform Rules: Edit").` };
}

// ── Tracking parameters ────────────────────────────────────────────────────
//
// The cache rule only caches a page whose address has no query at all, and
// Facebook adds `?fbclid=…` to every outbound link, campaigns `?utm_…` — so
// every visitor from a share or an ad reached the Node server. LiteSpeed
// already ignores these (CacheKeyModify in lib/htaccess.ts). A cache rule can
// only leave parameters out of its key on Enterprise, so this uses a URL
// rewrite (Transform Rule, every plan): when the query holds nothing *but*
// tracking parameters, the request continues without it, and the cache rule
// then sees a plain page. The visitor's address bar keeps the parameters, so
// analytics that read them in the browser still do. A query with anything
// else in it is left exactly as it was.

const TRACKING_RULE_DESCRIPTION = "BMS by Rehan — ignore tracking parameters";
const TRANSFORM_PHASE = "/rulesets/phases/http_request_transform/entrypoint";

/** The same list the .htaccess drops from LiteSpeed's cache key. */
export const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "msclkid", "mc_cid", "mc_eid", "igshid", "ttclid", "twclid", "yclid",
];

export function trackingRewriteExpression(): string {
  return `http.request.uri.query ne "" and all(http.request.uri.args.names[*] in {${TRACKING_PARAMS.map(cfString).join(" ")}})`;
}

async function cloudflareSetTrackingRewrite(
  settings: Record<string, string>,
  enable: boolean
): Promise<{ ok: boolean; error?: string }> {
  const existing = await call<{ rules?: CfRule[] }>(settings, TRANSFORM_PHASE);
  let rules: CfRule[] = [];
  if (existing.ok) rules = existing.result.rules ?? [];
  else if (!isMissingRuleset(existing)) return { ok: false, error: existing.error };

  const others = rules.filter((rule) => rule.description !== TRACKING_RULE_DESCRIPTION);
  const ours: CfRule = {
    action: "rewrite",
    description: TRACKING_RULE_DESCRIPTION,
    enabled: true,
    expression: trackingRewriteExpression(),
    action_parameters: { uri: { query: { value: "" } } },
  };
  const next = enable ? [...others, ours] : others;
  if (!enable && next.length === rules.length) return { ok: true };
  const r = await call(settings, TRANSFORM_PHASE, {
    method: "PUT",
    body: JSON.stringify({ rules: next.map(({ id: _id, ...rule }) => rule) }),
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
