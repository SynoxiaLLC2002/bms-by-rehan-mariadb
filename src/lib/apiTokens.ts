// API tokens — how a program signs in without a browser.
//
// The MCP hub (mcp.synoxia.org) builds pages through the same routes the
// editor uses. Those routes all ask `auth()` who is calling; a token is just
// another answer to that question, so no route needed to change.
//
// The rules:
//
//   • Only the SHA-256 of a token is stored. A token is 32 random bytes, so a
//     plain hash is enough — bcrypt exists to slow down guessing a password a
//     person chose, and nobody chose this.
//   • A token acts as its owner, at the *lower* of the token's role and the
//     owner's current role. Demoting or deleting a user does the same to every
//     token they made.
//   • A token cannot do what would turn a leaked token into a lost site:
//     account, token, setup, backup, import, update, plugin and server-file
//     routes refuse it (middleware.ts, TOKEN_REFUSED), and it never reads or
//     writes credential settings (api/settings).
//   • Two of those refusals can be lifted per token, by its owner, when both
//     are administrators: "backups" and "plugins" (TOKEN_SCOPES). They open
//     the matching MCP tools (lib/mcpServer.ts) — never the HTTP routes, which
//     stay refused, so a scope is only usable through the one door that
//     checks it.
//   • "publish" lifts the drafts-only rule (lib/authz.ts tokenPublishProblem):
//     the token may publish, unpublish and schedule pages and posts, through
//     the page/post routes and the MCP publish_document tool. Permanent delete
//     stays refused.

import { createHash, randomBytes } from "node:crypto";
import type { Session } from "next-auth";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { isValidRole, type Role } from "@/lib/authz";

/** A user may hold this many tokens; enough for every program, not a leak. */
export const MAX_TOKENS_PER_USER = 20;

/** Every token starts with this, so a header can be recognised without a lookup. */
export const TOKEN_PREFIX = "bms_";

/** Extra powers a token can be given beyond its role. */
export const TOKEN_SCOPES = ["backups", "plugins", "publish"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

/** The known scopes in a stored or submitted value; anything else is dropped. */
export function parseScopes(v: unknown): TokenScope[] {
  const list = Array.isArray(v) ? v : String(v ?? "").split(",");
  const out = new Set<TokenScope>();
  for (const x of list) {
    const s = String(x).trim();
    if ((TOKEN_SCOPES as readonly string[]).includes(s)) out.add(s as TokenScope);
  }
  return TOKEN_SCOPES.filter((s) => out.has(s));
}

/** Whether a token session holds a scope. A browser session never does — it needs none. */
export function tokenHasScope(session: Session | null, scope: TokenScope): boolean {
  const u = session?.user as { via?: string; role?: string; scopes?: string[] } | undefined;
  return u?.via === "token" && u.role === "admin" && Array.isArray(u.scopes) && u.scopes.includes(scope);
}

const RANK: Record<Role, number> = { author: 1, editor: 2, admin: 3 };

/** The lower of two roles. */
export function lowerRole(a: string, b: string): Role {
  const ra = isValidRole(a) ? RANK[a] : 0;
  const rb = isValidRole(b) ? RANK[b] : 0;
  const r = Math.min(ra, rb);
  // Neither recognised: the least privilege, never the most.
  return (Object.keys(RANK) as Role[]).find((k) => RANK[k] === r) ?? "author";
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A new token. Returned once to its creator and never again. */
export function newToken(): { token: string; hash: string; prefix: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), prefix: token.slice(0, 12) };
}

/** Whether a header value looks like one of ours — no lookup. */
export function bearerTokenOf(authorization: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  return m && m[1].startsWith(TOKEN_PREFIX) ? m[1] : null;
}

/** `lastUsedAt` is written at most this often per token. */
const TOUCH_MS = 5 * 60 * 1000;

/**
 * The session a token stands for, or null when it is unknown, expired, or
 * its owner is gone. Shaped like a NextAuth session so every `auth()` caller
 * reads it the same way; `via: "token"` lets the few places that care tell.
 */
export async function sessionForToken(token: string): Promise<Session | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
  const row = await db.query.apiTokens.findFirst({
    where: eq(apiTokens.tokenHash, hashToken(token)),
    with: { user: { columns: { id: true, email: true, name: true, role: true } } },
  });
  return sessionOfRow(row);
}

/**
 * The session of a token found by its id — for a signed upload address
 * (lib/uploadUrl.ts), which names the token without carrying it. Same checks:
 * a revoked or expired token, or a deleted owner, is null.
 */
export async function sessionForTokenId(id: number): Promise<Session | null> {
  if (!Number.isInteger(id) || id < 1) return null;
  const row = await db.query.apiTokens.findFirst({
    where: eq(apiTokens.id, id),
    with: { user: { columns: { id: true, email: true, name: true, role: true } } },
  });
  return sessionOfRow(row);
}

type TokenRow = (typeof apiTokens.$inferSelect) & { user: { id: string; email: string; name: string | null; role: string } | null };

function sessionOfRow(row: TokenRow | undefined): Session | null {
  if (!row || !row.user) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > TOUCH_MS) {
    // Bookkeeping only: a failed write must not fail the request.
    db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id)).catch(() => {});
  }

  const role = lowerRole(row.role, row.user.role);
  return {
    user: {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      role,
      via: "token",
      tokenId: row.id,
      // Scopes only count while the token still acts as an administrator: a
      // demoted owner loses them with the role.
      scopes: role === "admin" ? parseScopes(row.scopes) : [],
    },
    expires: new Date(Date.now() + 60_000).toISOString(),
  } as unknown as Session;
}

export { viaToken } from "@/lib/authz";
