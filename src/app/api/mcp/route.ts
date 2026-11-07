import { NextRequest } from "next/server";
import { bearerTokenOf, sessionForToken } from "@/lib/apiTokens";
import { mcpDelete, mcpMethodNotAllowed, mcpUnauthorized, serveMcp } from "@/lib/mcpHttp";

// The site's own MCP endpoint (lib/mcpServer.ts, lib/mcpHttp.ts).
//
// API tokens only, in the Authorization header. A browser session is refused:
// a page on another site could otherwise post here with the owner's cookie,
// and the admin needs none of it. Without a token the 401 points the client
// at "Connect" (lib/oauth.ts), which ends with Claude holding a token.

export async function POST(req: NextRequest) {
  const token = bearerTokenOf(req.headers.get("authorization"));
  const session = token ? await sessionForToken(token) : null;
  if (!token || !session?.user?.id) return mcpUnauthorized();
  return serveMcp(req, session, token);
}

export async function GET() {
  return mcpMethodNotAllowed();
}

export async function DELETE() {
  return mcpDelete();
}
