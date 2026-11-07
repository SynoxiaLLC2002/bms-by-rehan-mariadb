import { NextResponse } from "next/server";

// CORS for the OAuth endpoints Claude and other MCP clients call: metadata,
// registration and the token exchange carry no cookies, so any origin may read
// them — browser-based MCP clients need that. The Allow step is not here; it
// runs on the site itself with the owner's session.

export const OAUTH_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
};

export function oauthJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { ...OAUTH_CORS, "Cache-Control": "no-store" } });
}

export function oauthPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS });
}
