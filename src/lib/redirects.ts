// Through `rawQuery` rather than a `neon()` client of its own, so this works
// on whichever Postgres the deployment has. The previous direct Neon client
// failed silently on any other database, and a site with no working redirects
// looks exactly like a site with none configured.
import { rawQuery } from "@/lib/db/raw";
import { staleWhileRevalidate } from "@/lib/staleCache";

export interface RedirectRule {
  source: string;
  destination: string;
  type: number;
  // Rows arrive as plain objects, which is what `rawQuery` is typed over.
  [column: string]: unknown;
}

/**
 * Redirect lookups run in middleware, so they sit in front of every request.
 * The whole table is loaded once and cached in module scope with a TTL, which
 * turns the per-request cost into a Map lookup. A miss costs one query per
 * instance per TTL window, not one per request.
 *
 * Middleware runs in its own runtime, so `invalidateRedirects()` called from an
 * API route cannot reach this cache — the two do not share memory. The TTL is
 * therefore the real propagation delay for a new rule, and is kept short.
 * One query per instance per window is negligible; a stale minute is not.
 *
 * Sixty seconds, for the same reason as edgeLanguages.ts: a rule changes
 * rarely, and every refresh is a round trip to a database that may be in
 * another country. Stale-while-revalidate means no visitor waits for it.
 */
const TTL_MS = 60_000;

/**
 * Trailing slashes, case and percent-encoding shouldn't decide whether a
 * redirect matches.
 *
 * The encoding half was missing and it broke redirects entirely for every
 * non-Latin URL. A browser sends `/%D9%85%D8%AF%D9%88%D9%86%D8%A9`, but both
 * sources of rules store the decoded text: `recordSlugChange` builds its path
 * from the raw slug, and an administrator types `/مدونة` into the form. The
 * two forms never met, so renaming an Arabic post left the old URL a 404 and
 * a hand-written Arabic redirect simply never fired.
 *
 * Decoding here fixes both directions at once, because stored sources run
 * through this function too — so a rule saved in either form still matches.
 *
 * `decodeURI`, not `decodeURIComponent`: it is the exact inverse of the
 * `encodeURI` used elsewhere and leaves the reserved characters alone, so a
 * literal `%2F` in a path stays a `%2F` rather than turning into a separator
 * and changing the shape of the path.
 *
 * Lowercasing after decoding also stops `%D9` becoming `%d9`, which is what
 * made non-Latin paths show up as lowercase escape codes in the 404 log.
 */
export function normalisePath(path: string): string {
  const raw = (path || "/").split("?")[0].split("#")[0].trim();
  let decoded = raw;
  try {
    decoded = decodeURI(raw);
  } catch {
    // Malformed escape such as `%ZZ`: match on what was actually sent.
  }
  const clean = decoded.toLowerCase();
  if (clean.length > 1 && clean.endsWith("/")) return clean.slice(0, -1);
  return clean || "/";
}

async function load(): Promise<Map<string, RedirectRule>> {
  const rows = await rawQuery<RedirectRule>(
    "SELECT source, destination, type FROM redirects WHERE enabled = true"
  );

  const map = new Map<string, RedirectRule>();
  for (const r of rows) map.set(normalisePath(r.source), r);
  return map;
}

const redirectsCache = staleWhileRevalidate(load, new Map<string, RedirectRule>(), TTL_MS);

/**
 * A change counter on `globalThis`.
 *
 * Middleware has its own copy of this module, so invalidating from an API
 * route used to reach only the route's copy and the middleware waited out the
 * TTL. In that minute the old address was served — and re-cached by LiteSpeed
 * and Cloudflare for a day, right after the save had purged them. Middleware
 * now runs in the Node runtime, in the same process, so both copies can see
 * one counter: a copy that notices it moved reloads before answering.
 */
const shared = globalThis as unknown as { __bmsRedirectsVersion?: number };
let seenVersion = 0;

export function getRedirects(): Promise<Map<string, RedirectRule>> {
  const v = shared.__bmsRedirectsVersion ?? 0;
  if (v !== seenVersion) {
    seenVersion = v;
    redirectsCache.invalidate();
  }
  return redirectsCache.get();
}

/** Drops every copy of the cache in this process (see `shared`). */
export function invalidateRedirects() {
  shared.__bmsRedirectsVersion = (shared.__bmsRedirectsVersion ?? 0) + 1;
  redirectsCache.invalidate();
}

export async function findRedirect(path: string): Promise<RedirectRule | null> {
  const map = await getRedirects();
  if (map.size === 0) return null;
  return map.get(normalisePath(path)) ?? null;
}

/**
 * Counts a hit without making the visitor wait for it — the redirect response
 * is what matters, the statistic is not.
 */
/**
 * Why this pair of source/destination must not be saved, or null if it may be.
 *
 * Three ways a redirect can make a page unreachable, and only the first two
 * were ever checked — and only when *creating* one. `PATCH /api/redirects/[id]`
 * applied whatever it was given, so a perfectly good rule could be edited into
 * a self-redirect, or its source changed to "/", after the fact.
 *
 *   • a source of "/" sends the home page somewhere on every request;
 *   • a rule pointing at its own source is an immediate loop;
 *   • two or more rules can form a ring — `/a -> /b` and `/b -> /a` are each
 *     fine alone. Nothing looked for that, and the result is a page that
 *     answers ERR_TOO_MANY_REDIRECTS with nothing obviously wrong in the list.
 *
 * `ignoreId` is the row being edited, so a rule is not compared against its
 * own stored version.
 */
export async function redirectProblem(
  source: string,
  destination: string,
  ignoreId?: number,
  type?: number
): Promise<string | null> {
  const from = normalisePath(source);
  if (!from || from === "/") return "The home page cannot be the source of a redirect.";
  // A 410 sends nobody anywhere: it needs no destination and cannot loop.
  if (type === 410) return null;
  if (!destination.trim()) return "A redirect needs a destination.";
  if (from === normalisePath(destination)) return "A redirect cannot point at itself.";

  // An external destination leaves this site and cannot loop back through the
  // table, so there is no chain to walk.
  if (/^[a-z][a-z0-9+.-]*:/i.test(destination.trim())) return null;

  const rows = await rawQuery<{ id: number; source: string; destination: string }>(
    "SELECT id, source, destination FROM redirects WHERE enabled = true AND type <> 410"
  );
  const bySource = new Map<string, { id: number; destination: string }>();
  for (const r of rows) {
    if (ignoreId !== undefined && r.id === ignoreId) continue;
    bySource.set(normalisePath(r.source), { id: r.id, destination: r.destination });
  }

  // Walk from the proposed destination. The cap is a second guard: a ring that
  // does not include `from` still must not spin here.
  let at = normalisePath(destination);
  for (let hop = 0; hop < 10; hop++) {
    if (at === from) return "That would make a redirect loop with a rule already in the list.";
    const next = bySource.get(at);
    if (!next) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(next.destination.trim())) return null;
    at = normalisePath(next.destination);
  }
  return "That destination leads through too many redirects.";
}

/**
 * The status a rule answers with: a permanent or temporary redirect, or 410
 * Gone — "this address is removed for good", which tells search engines to
 * drop it at once instead of re-checking a 404 for weeks.
 */
export const RULE_TYPES = [301, 302, 410] as const;
export function ruleType(v: unknown): 301 | 302 | 410 {
  const n = Number(v);
  return n === 302 || n === 410 ? n : 301;
}

export function countHit(source: string): void {
  void rawQuery(
    "UPDATE redirects SET hits = hits + 1, last_hit = now() WHERE source = ?",
    [normalisePath(source)]
  ).catch(() => {});
}
