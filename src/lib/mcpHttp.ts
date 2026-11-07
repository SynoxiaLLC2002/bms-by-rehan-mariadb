// The HTTP side of the site's MCP server (lib/mcpServer.ts), shared by its two
// addresses:
//
//   /api/mcp            token in the Authorization header — what Claude sends
//                       after "Connect" (lib/oauth.ts) or `claude mcp add`
//   /api/mcp/k/<token>  the secret link: the token is in the address, for
//                       apps whose connector screen takes nothing but a URL
//
// Streamable HTTP, stateless: every POST carries one JSON-RPC message or a
// batch and gets the answer as JSON. No server-sent stream is offered, so GET
// is 405.

import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { rateLimited } from "@/lib/rateLimit";
import { handleRpc, type McpContext } from "@/lib/mcpServer";
import { isSameOrigin } from "@/lib/sameOrigin";

export const NO_STORE = { "Cache-Control": "no-store" };

export async function siteBase(): Promise<{ base: string; siteName: string }> {
  const settings = await getSiteSettings();
  return { base: siteUrl(settings).replace(/\/+$/, ""), siteName: String(settings.site_name ?? "") };
}

/**
 * 401 that tells an MCP client where to sign in: the protected-resource
 * metadata (RFC 9728) names this site as the authorization server, and the
 * client starts the "Connect" flow from there.
 */
export async function mcpUnauthorized(): Promise<NextResponse> {
  const { base } = await siteBase();
  return NextResponse.json(
    { error: "Unauthorized. Connect from Claude (Settings → Connectors), or send an API token: Authorization: Bearer bms_…" },
    {
      status: 401,
      headers: {
        ...NO_STORE,
        "WWW-Authenticate": `Bearer realm="bms-cms", resource_metadata="${base}/.well-known/oauth-protected-resource"`,
      },
    }
  );
}

export async function serveMcp(req: NextRequest, session: Session, token: string): Promise<NextResponse> {
  // Browsers send Origin; MCP clients do not. A page on another site must not drive this.
  const origin = req.headers.get("origin");
  if (origin && !isSameOrigin(req, origin, [(await siteBase()).base])) return NextResponse.json({ error: "Forbidden origin" }, { status: 403, headers: NO_STORE });

  // Generous — a page build is a few dozen calls — but a runaway loop stops.
  const tokenId = String((session.user as { tokenId?: number }).tokenId ?? session.user?.id);
  if (rateLimited("mcp", tokenId, { max: 300, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests. Wait a minute." }, { status: 429, headers: { ...NO_STORE, "Retry-After": "60" } });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: NO_STORE });
  }

  const { base, siteName } = await siteBase();
  const ctx: McpContext = { session, authorization: `Bearer ${token}`, base, siteName };

  if (Array.isArray(body)) {
    if (body.length > 20) return NextResponse.json({ error: "At most 20 messages in a batch." }, { status: 400, headers: NO_STORE });
    const out = (await Promise.all(body.map((m) => handleRpc(m, ctx)))).filter(Boolean);
    return out.length ? NextResponse.json(out, { headers: NO_STORE }) : new NextResponse(null, { status: 202 });
  }
  const out = await handleRpc(body as object, ctx);
  return out ? NextResponse.json(out, { headers: NO_STORE }) : new NextResponse(null, { status: 202 });
}

export function mcpMethodNotAllowed(): NextResponse {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST, DELETE" } });
}

/** Session end. There is no session state to drop. */
export function mcpDelete(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
