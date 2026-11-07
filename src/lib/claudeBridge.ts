// The Claude bridge: a tiny Cloudflare Worker on the site's own domain.
//
// Shared hosts put a firewall in front of the app that refuses requests by
// User-Agent — LiteSpeed on the first host this ran on answers 403 to Claude's, before the request
// reaches Node, so "Connect Claude" (lib/oauth.ts) failed on a site whose
// endpoint and token were both fine. Nothing in the app can fix that: the
// request never arrives.
//
// A Worker routed on the Claude addresses only (the MCP endpoint and the
// sign-in addresses) forwards each request to the origin with a User-Agent of
// its own. The address Claude is given stays https://site/api/mcp, sign-in and
// Allow are unchanged, and what Claude holds is still an ordinary `bms_` token
// — the Worker stores nothing and has no key. One Worker per site, in the
// owner's own Cloudflare account, so removing it or revoking a token touches
// that site alone.
//
// It uses the Zone ID and API token already saved on Speed → Cloudflare; the
// token needs two permissions more than that screen asked for
// (BRIDGE_PERMISSIONS).

import { siteUrl } from "@/lib/siteUrl";
import type { SiteSettings } from "@/lib/settings";

const API = "https://api.cloudflare.com/client/v4";

/** What the saved token must carry, as Cloudflare's token screen words it. */
export const BRIDGE_PERMISSIONS = ["Account · Workers Scripts · Edit", "Zone · Workers Routes · Edit"];

/**
 * The Worker itself. A fetch from a Worker to its own zone goes to the origin,
 * not back through the Worker. `redirect: "manual"` hands the sign-in
 * redirects to Claude as they are instead of following them here.
 * `x-bms-bridge` on the answer is how to tell, from outside, that a request
 * went through it.
 */
const WORKER_SOURCE = `export default {
  async fetch(request) {
    const headers = new Headers(request.headers);
    headers.set("user-agent", "BMS-Claude-Bridge/1.0");
    const res = await fetch(new Request(request, { headers, redirect: "manual" }));
    const out = new Response(res.body, res);
    out.headers.set("x-bms-bridge", "1");
    return out;
  },
};
`;

export interface BridgeStatus {
  /** Zone ID and API token are saved on Speed → Cloudflare. */
  configured: boolean;
  /** on = every route is ours · partial = some are · off = none. */
  state: "on" | "partial" | "off" | "unreadable";
  host?: string;
  error?: string;
}

interface CfEnvelope<T> {
  success?: boolean;
  result?: T;
  errors?: { message?: string }[];
}

type CfResult<T> = { ok: true; result: T } | { ok: false; error: string; status?: number };

interface CfRoute {
  id: string;
  pattern: string;
  script?: string;
}

async function cf<T>(token: string, path: string, init: RequestInit = {}): Promise<CfResult<T>> {
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      // No Content-Type of our own on a FormData body: fetch has to write the
      // multipart boundary itself.
      headers: {
        Authorization: `Bearer ${token}`,
        ...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as CfEnvelope<T> | null;
    if (res.ok && data?.success) return { ok: true, result: data.result as T };
    return { ok: false, error: data?.errors?.[0]?.message || `Cloudflare responded with ${res.status}.`, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach Cloudflare." };
  }
}

/** Cloudflare's own wording for a missing permission is "Authentication error". */
function explain(r: { error: string; status?: number }, permission: string): string {
  if (r.status === 401 || r.status === 403) {
    return `Cloudflare refused: the API token on Speed → Cloudflare is missing "${permission}". In Cloudflare open Profile → API Tokens, press Edit on that token, add the permission with "+ Add more" and press Update token — the token itself stays the same, so nothing needs pasting again. Then press this button once more.`;
  }
  return r.error;
}

function credentials(settings: SiteSettings): { zoneId: string; token: string } | null {
  const zoneId = settings.cf_zone_id?.trim();
  const token = settings.cf_api_token?.trim();
  return zoneId && token ? { zoneId, token } : null;
}

function siteHost(settings: SiteSettings): string {
  try {
    return new URL(siteUrl(settings)).host.toLowerCase();
  } catch {
    return "";
  }
}

/** Worker names are lowercase letters, digits and dashes, 63 at most. */
function scriptName(host: string): string {
  return `bms-claude-${host.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`.slice(0, 63).replace(/-+$/, "");
}

/**
 * Only what Claude's servers call. A route pattern may end in `*` and nowhere
 * else in the path. `/api/oauth/authorize` and `/approve` are the owner's own
 * browser and would pass the firewall anyway; they ride along unharmed.
 */
function routePatterns(host: string): string[] {
  return [`${host}/api/mcp*`, `${host}/api/oauth/*`, `${host}/.well-known/oauth-*`];
}

export async function bridgeStatus(settings: SiteSettings): Promise<BridgeStatus> {
  const c = credentials(settings);
  if (!c) return { configured: false, state: "off" };
  const host = siteHost(settings);
  if (!host) return { configured: true, state: "unreadable", error: "The site address is not set." };
  const routes = await cf<CfRoute[]>(c.token, `/zones/${c.zoneId}/workers/routes`);
  if (!routes.ok) {
    // A token made for the Speed screen alone cannot list routes. That is the
    // ordinary state before the bridge was ever set up — "off", and the
    // install says which permission is missing when it is pressed.
    if (routes.status === 401 || routes.status === 403) return { configured: true, state: "off", host };
    return { configured: true, state: "unreadable", host, error: routes.error };
  }
  const name = scriptName(host);
  const ours = routePatterns(host).filter((p) => routes.result.some((r) => r.pattern === p && r.script === name));
  return { configured: true, host, state: ours.length === 3 ? "on" : ours.length ? "partial" : "off" };
}

export async function installBridge(settings: SiteSettings): Promise<{ ok: boolean; error?: string }> {
  const c = credentials(settings);
  if (!c) return { ok: false, error: "Save the Zone ID and API token on Speed → Cloudflare first." };
  const host = siteHost(settings);
  if (!host) return { ok: false, error: "The site address is not set." };

  const zone = await cf<{ name: string; account?: { id?: string } }>(c.token, `/zones/${c.zoneId}`);
  if (!zone.ok) return { ok: false, error: zone.error };
  const accountId = zone.result.account?.id;
  if (!accountId) return { ok: false, error: "Cloudflare did not say which account this zone belongs to." };
  if (host !== zone.result.name && !host.endsWith(`.${zone.result.name}`)) {
    return { ok: false, error: `This site is ${host}, but the Zone ID on Speed → Cloudflare is for ${zone.result.name}.` };
  }

  // Routes are read before anything is written: a route somebody else's Worker
  // already answers is theirs, and is never taken over.
  const routes = await cf<CfRoute[]>(c.token, `/zones/${c.zoneId}/workers/routes`);
  if (!routes.ok) return { ok: false, error: explain(routes, BRIDGE_PERMISSIONS[1]) };
  const name = scriptName(host);
  const wanted = routePatterns(host);
  const taken = routes.result.find((r) => wanted.includes(r.pattern) && r.script && r.script !== name);
  if (taken) {
    return { ok: false, error: `The address ${taken.pattern} is already handled by another Worker in this Cloudflare account ("${taken.script}"). Remove that route in Cloudflare first.` };
  }

  const form = new FormData();
  form.set("metadata", new Blob([JSON.stringify({ main_module: "worker.js", compatibility_date: "2025-01-01" })], { type: "application/json" }));
  form.set("worker.js", new Blob([WORKER_SOURCE], { type: "application/javascript+module" }), "worker.js");
  const upload = await cf(c.token, `/accounts/${accountId}/workers/scripts/${name}`, { method: "PUT", body: form });
  if (!upload.ok) return { ok: false, error: explain(upload, BRIDGE_PERMISSIONS[0]) };

  for (const pattern of wanted) {
    const existing = routes.result.find((r) => r.pattern === pattern);
    if (existing?.script === name) continue;
    // A route with no script on it is a "do not run a Worker here" rule; it is
    // given ours rather than left to fail the create as a duplicate.
    const r = existing
      ? await cf(c.token, `/zones/${c.zoneId}/workers/routes/${existing.id}`, { method: "PUT", body: JSON.stringify({ pattern, script: name }) })
      : await cf(c.token, `/zones/${c.zoneId}/workers/routes`, { method: "POST", body: JSON.stringify({ pattern, script: name }) });
    if (!r.ok) return { ok: false, error: explain(r, BRIDGE_PERMISSIONS[1]) };
  }
  return { ok: true };
}

/** Takes away our routes, then the Worker. Nothing else in the account is touched. */
export async function removeBridge(settings: SiteSettings): Promise<{ ok: boolean; error?: string }> {
  const c = credentials(settings);
  if (!c) return { ok: false, error: "Save the Zone ID and API token on Speed → Cloudflare first." };
  const host = siteHost(settings);
  if (!host) return { ok: false, error: "The site address is not set." };
  const name = scriptName(host);

  const routes = await cf<CfRoute[]>(c.token, `/zones/${c.zoneId}/workers/routes`);
  if (!routes.ok) return { ok: false, error: explain(routes, BRIDGE_PERMISSIONS[1]) };
  for (const r of routes.result.filter((x) => x.script === name)) {
    const d = await cf(c.token, `/zones/${c.zoneId}/workers/routes/${r.id}`, { method: "DELETE" });
    if (!d.ok) return { ok: false, error: explain(d, BRIDGE_PERMISSIONS[1]) };
  }

  const zone = await cf<{ account?: { id?: string } }>(c.token, `/zones/${c.zoneId}`);
  const accountId = zone.ok ? zone.result.account?.id : undefined;
  if (!accountId) return { ok: false, error: zone.ok ? "Cloudflare did not say which account this zone belongs to." : zone.error };
  const del = await cf(c.token, `/accounts/${accountId}/workers/scripts/${name}`, { method: "DELETE" });
  // Already gone is the result that was asked for.
  if (!del.ok && del.status !== 404) return { ok: false, error: explain(del, BRIDGE_PERMISSIONS[0]) };
  return { ok: true };
}
