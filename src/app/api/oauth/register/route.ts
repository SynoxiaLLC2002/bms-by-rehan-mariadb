import { NextRequest } from "next/server";
import { OAuthError, registerClient } from "@/lib/oauth";
import { oauthJson, oauthPreflight } from "@/lib/oauthHttp";
import { clientIp, rateLimited } from "@/lib/rateLimit";

// Dynamic client registration (RFC 7591). Open to anyone, as MCP clients
// expect — registering grants nothing; only the owner's Allow does. Nothing
// is stored: the client_id is the signed registration (lib/oauth.ts).

export async function POST(req: NextRequest) {
  if (rateLimited("oauth-register", clientIp(req), { max: 30, windowMs: 60_000 })) {
    return oauthJson({ error: "slow_down", error_description: "Too many registrations." }, 429);
  }
  const body = (await req.json().catch(() => ({}))) as { client_name?: unknown; redirect_uris?: unknown };
  try {
    const { client_id, client } = registerClient(body);
    return oauthJson(
      {
        client_id,
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        client_id_issued_at: Math.floor(Date.now() / 1000),
      },
      201
    );
  } catch (e) {
    if (e instanceof OAuthError) return oauthJson({ error: e.code, error_description: e.message }, 400);
    throw e;
  }
}

export function OPTIONS() {
  return oauthPreflight();
}
