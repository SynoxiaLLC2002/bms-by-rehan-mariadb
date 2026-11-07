import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { insertReturning } from "@/lib/db/write";
import { apiTokens, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { sessionAuth } from "@/lib/auth";
import { canManageUser, isValidRole, sessionUser, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import { lowerRole, MAX_TOKENS_PER_USER, newToken, parseScopes } from "@/lib/apiTokens";

// API tokens for one account (lib/apiTokens.ts).
//
// Browser sessions only — `sessionAuth`, not `auth` — and refused to tokens
// in middleware as well: a token that could mint tokens could outlive its own
// revocation.


const PUBLIC_COLUMNS = {
  id: true, name: true, prefix: true, role: true, scopes: true,
  expiresAt: true, lastUsedAt: true, createdAt: true,
} as const;

/** `?userId=` — yourself by default; anyone else's needs an administrator. */
export async function GET(req: NextRequest) {
  const session = await sessionAuth();
  const me = sessionUser(session);
  if (!me) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  const userId = req.nextUrl.searchParams.get("userId") || me.id;
  if (!canManageUser(session, userId)) return NextResponse.json(FORBIDDEN, { status: 403 });

  const tokens = await db.query.apiTokens.findMany({
    where: eq(apiTokens.userId, userId),
    orderBy: [desc(apiTokens.createdAt)],
    columns: PUBLIC_COLUMNS,
  });
  return NextResponse.json({ tokens });
}

/**
 * `{ name, role?, expiresInDays?, scopes? }` — a token for yourself. Never for someone
 * else, administrators included: a token acts as its owner, and making one in
 * another person's name is signing in as them.
 */
export async function POST(req: NextRequest) {
  const session = await sessionAuth();
  const me = sessionUser(session);
  if (!me) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { name?: unknown; role?: unknown; expiresInDays?: unknown; scopes?: unknown };
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "Give the token a name, so you know later what uses it." }, { status: 400 });

  // The database's role, not the session's: a session can be up to five
  // minutes behind a demotion (lib/auth.ts).
  const owner = await db.query.users.findFirst({ where: eq(users.id, me.id), columns: { role: true } });
  if (!owner) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  const asked = isValidRole(body.role) ? body.role : owner.role;
  // Never more than the owner holds.
  const role = lowerRole(asked, owner.role);
  // Backups and plugins are administrators' tools; a lesser token cannot hold them.
  const scopes = parseScopes(body.scopes);
  if (scopes.length && role !== "admin") {
    return NextResponse.json({ error: "Backup and plugin access needs an admin token." }, { status: 400 });
  }

  let expiresAt: Date | null = null;
  if (body.expiresInDays !== undefined && body.expiresInDays !== null && body.expiresInDays !== "") {
    const days = Number(body.expiresInDays);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      return NextResponse.json({ error: "Expiry must be between 1 and 3650 days, or empty for never." }, { status: 400 });
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  const existing = await db.query.apiTokens.findMany({ where: eq(apiTokens.userId, me.id), columns: { id: true } });
  if (existing.length >= MAX_TOKENS_PER_USER) {
    return NextResponse.json({ error: `You already have ${MAX_TOKENS_PER_USER} tokens. Revoke one you no longer use first.` }, { status: 400 });
  }

  const made = newToken();
  const [stored] = await insertReturning(apiTokens, { userId: me.id, name, tokenHash: made.hash, prefix: made.prefix, role, scopes: scopes.join(","), expiresAt });
  // Never the hash: only what the old RETURNING projection sent back.
  const row = { id: stored.id, name: stored.name, prefix: stored.prefix, role: stored.role, scopes: stored.scopes, expiresAt: stored.expiresAt, lastUsedAt: stored.lastUsedAt, createdAt: stored.createdAt };

  // The only time the token itself leaves the server.
  return NextResponse.json({ token: made.token, record: row }, { status: 201 });
}
