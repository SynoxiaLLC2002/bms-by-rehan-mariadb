import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiTokens, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sessionAuth } from "@/lib/auth";
import { canManageUser, sessionUser, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import { numericId } from "@/lib/routeParams";
import { parseScopes } from "@/lib/apiTokens";

/** Revokes a token: its owner, or an administrator. Takes effect on the next request. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionAuth();
  if (!sessionUser(session)) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const id = numericId((await params).id);
  if (id === null) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = await db.query.apiTokens.findFirst({ where: eq(apiTokens.id, id), columns: { id: true, userId: true } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManageUser(session, row.userId)) return NextResponse.json(FORBIDDEN, { status: 403 });

  await db.delete(apiTokens).where(eq(apiTokens.id, id));
  return NextResponse.json({ success: true });
}

/**
 * `{ scopes: ["backups", "plugins"] }` — switches a token's extra powers on or
 * off. Only the token's own owner, and only while both the owner and the token
 * are administrators: an administrator cannot hand backup or plugin access to
 * a token someone else holds.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionAuth();
  const me = sessionUser(session);
  if (!me) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const id = numericId((await params).id);
  if (id === null) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = await db.query.apiTokens.findFirst({ where: eq(apiTokens.id, id), columns: { id: true, userId: true, role: true } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.userId !== me.id) return NextResponse.json(FORBIDDEN, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { scopes?: unknown };
  const scopes = parseScopes(body.scopes);
  if (scopes.length) {
    // The database's role, not the session's (see api/tokens POST).
    const owner = await db.query.users.findFirst({ where: eq(users.id, me.id), columns: { role: true } });
    if (owner?.role !== "admin" || row.role !== "admin") {
      return NextResponse.json({ error: "Backup and plugin access needs an admin token on an administrator's account." }, { status: 400 });
    }
  }

  await db.update(apiTokens).set({ scopes: scopes.join(",") }).where(eq(apiTokens.id, id));
  return NextResponse.json({ success: true, scopes });
}
