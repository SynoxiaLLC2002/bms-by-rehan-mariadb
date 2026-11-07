import { protectedResourceMetadata } from "@/lib/oauth";
import { siteBase } from "@/lib/mcpHttp";
import { oauthJson, oauthPreflight } from "@/lib/oauthHttp";

// Protected-resource metadata (RFC 9728): /api/mcp's 401 points here, and
// this names the site itself as the place to sign in (lib/oauth.ts).

export async function GET() {
  return oauthJson(protectedResourceMetadata((await siteBase()).base));
}

export function OPTIONS() {
  return oauthPreflight();
}
