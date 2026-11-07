import { authServerMetadata } from "@/lib/oauth";
import { siteBase } from "@/lib/mcpHttp";
import { oauthJson, oauthPreflight } from "@/lib/oauthHttp";

// OAuth authorization-server metadata (RFC 8414) for "Connect Claude"
// (lib/oauth.ts). The optional catch-all also answers the path-suffixed form
// (/.well-known/oauth-authorization-server/api/mcp) some clients try first.

export async function GET() {
  return oauthJson(authServerMetadata((await siteBase()).base));
}

export function OPTIONS() {
  return oauthPreflight();
}
