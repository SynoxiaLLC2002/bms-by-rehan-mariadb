import { NextRequest, NextResponse } from "next/server";
import { sessionForToken, TOKEN_PREFIX } from "@/lib/apiTokens";
import { mcpDelete, mcpMethodNotAllowed, NO_STORE, serveMcp } from "@/lib/mcpHttp";

// The secret link: /api/mcp/k/<token>. For connector screens that take only
// an address. The address IS the password — whoever has it can do what the
// token allows until it is revoked — and the API tokens screen says so where
// the link is shown.
//
// A wrong link is a plain 401 with no sign-in pointer: it was meant to work
// without one, and starting "Connect" from a broken link would only confuse.

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const token = decodeURIComponent((await params).token ?? "");
  const session = token.startsWith(TOKEN_PREFIX) ? await sessionForToken(token) : null;
  if (!session?.user?.id) {
    return NextResponse.json({ error: "This link does not work (revoked, expired or mistyped). Make a new one in Admin → Users → API tokens." }, { status: 401, headers: NO_STORE });
  }
  return serveMcp(req, session, token);
}

export async function GET() {
  return mcpMethodNotAllowed();
}

export async function DELETE() {
  return mcpDelete();
}
