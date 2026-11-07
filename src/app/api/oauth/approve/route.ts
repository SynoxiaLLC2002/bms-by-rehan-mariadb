import { NextRequest, NextResponse } from "next/server";
import { sessionAuth } from "@/lib/auth";
import { sessionUser, UNAUTHORIZED } from "@/lib/authz";
import { checkAuthorize, issueCode, OAuthError, redirectWith } from "@/lib/oauth";
import { siteBase } from "@/lib/mcpHttp";
import { isSameOrigin } from "@/lib/sameOrigin";

// Allow / Cancel on /admin/connect. Browser session only (`sessionAuth`), and
// only from this site's own page: the Origin check is what stops another site
// from posting "allow" with the owner's cookie.
//
// `{ query, decision: "allow" | "deny", role?, scopes? }` → `{ redirect }`,
// the address in the app to send the browser to.

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || !isSameOrigin(req, origin, [(await siteBase()).base])) return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });

  const me = sessionUser(await sessionAuth());
  if (!me) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { query?: unknown; decision?: unknown; role?: unknown; scopes?: unknown };
  try {
    const ar = checkAuthorize(new URLSearchParams(String(body.query ?? "")));
    if (body.decision !== "allow") {
      return NextResponse.json({ redirect: redirectWith(ar.redirectUri, { error: "access_denied", state: ar.state }) });
    }
    const code = await issueCode(ar, me.id, String(body.role ?? ""), body.scopes);
    return NextResponse.json({ redirect: redirectWith(ar.redirectUri, { code, state: ar.state }) });
  } catch (e) {
    if (e instanceof OAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
