import { NextRequest } from "next/server";
import { exchangeCode, OAuthError } from "@/lib/oauth";
import { oauthJson, oauthPreflight } from "@/lib/oauthHttp";
import { clientIp, rateLimited } from "@/lib/rateLimit";

// The token endpoint: a one-time code plus its PKCE verifier become an API
// token (lib/oauth.ts). No expires_in: the token lasts until it is revoked in
// Admin → Users → API tokens, like any other.

export async function POST(req: NextRequest) {
  if (rateLimited("oauth-token", clientIp(req), { max: 30, windowMs: 60_000 })) {
    return oauthJson({ error: "slow_down", error_description: "Too many attempts." }, 429);
  }
  const type = req.headers.get("content-type") ?? "";
  let f: Record<string, string> = {};
  if (type.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    f = Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v ?? "")]));
  } else {
    const form = await req.formData().catch(() => null);
    if (form) f = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  }

  if (f.grant_type !== "authorization_code") {
    return oauthJson({ error: "unsupported_grant_type", error_description: "Only authorization_code is supported." }, 400);
  }
  try {
    const token = await exchangeCode({ code: f.code ?? "", verifier: f.code_verifier ?? "", redirectUri: f.redirect_uri ?? "", clientId: f.client_id ?? "" });
    return oauthJson({ access_token: token, token_type: "Bearer", scope: "site" });
  } catch (e) {
    if (e instanceof OAuthError) return oauthJson({ error: e.code, error_description: e.message }, 400);
    throw e;
  }
}

export function OPTIONS() {
  return oauthPreflight();
}
