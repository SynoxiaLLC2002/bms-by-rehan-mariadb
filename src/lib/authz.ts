// Who is allowed to do what.
//
// Every API route checked `session?.user?.id` — "are you logged in" — and
// nothing checked *which* user you are or what role you hold. With one
// administrator that reads as adequate. It is not: the Users screen creates
// editors, so the moment a second account exists an editor can
//
//   • PATCH `/api/users/<admin id>` and set the administrator's password,
//     because changing a password required no current password and no role;
//   • PATCH their own record with `{ role: "admin" }`, because `role` was
//     taken straight from the request body.
//
// Both are full takeovers, and neither needs anything but a valid session.

import type { Session } from "next-auth";

export interface SessionUser {
  id: string;
  role: string;
}

/** The signed-in user, or null. Never trusts a body field for identity. */
export function sessionUser(session: Session | null): SessionUser | null {
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) return null;
  // An absent role is treated as the least privilege, not the most: a token
  // issued before roles existed must not be an administrator by omission.
  return { id: user.id, role: user.role ?? "editor" };
}

export function isAdmin(session: Session | null): boolean {
  return sessionUser(session)?.role === "admin";
}

/** Whether this session may act on `targetUserId` — themselves, or an admin. */
export function canManageUser(session: Session | null, targetUserId: string): boolean {
  const me = sessionUser(session);
  if (!me) return false;
  return me.id === targetUserId || me.role === "admin";
}

/**
 * The standard refusals, so every route says the same thing.
 *
 * 401 means "you are not signed in", 403 means "you are, and it is not yours".
 * Collapsing both into 401 tells an attacker a valid session was rejected,
 * which is the one thing worth distinguishing.
 */
export const UNAUTHORIZED = { error: "Unauthorized" } as const;
export const FORBIDDEN = { error: "You do not have permission to do that" } as const;

/**
 * Roles, from most to least privilege:
 *
 *   admin   everything
 *   editor  all content, but not users, settings or site structure
 *   author  their own posts only — no pages, no moderation, nothing of anyone
 *           else's; media and taxonomy for their own use
 *
 * "author" exists for a team of writers: a student can publish without being
 * able to touch anyone else's work.
 */
export const ROLES = ["admin", "editor", "author"] as const;
export type Role = (typeof ROLES)[number];

export function isValidRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

export function isAuthor(session: Session | null): boolean {
  return sessionUser(session)?.role === "author";
}

/** Whether this session may edit a document with the given author. */
export function canEditDocument(session: Session | null, authorId: string | null | undefined): boolean {
  const me = sessionUser(session);
  if (!me) return false;
  if (me.role === "admin" || me.role === "editor") return true;
  return !!authorId && authorId === me.id;
}

/** Whether this session came from an API token (lib/apiTokens.ts), not a browser. */
export function viaToken(session: Session | null): boolean {
  return (session?.user as { via?: string } | undefined)?.via === "token";
}

/**
 * Whether what this session saves may run script in visitors' browsers —
 * HTML Embed `<script>`, a document's head/footer code, an Element's markup.
 *
 * An administrator in a browser, and nobody else. An API token is refused
 * even at admin level: it sits in another program's config, and a leaked one
 * should be able to vandalise content, not run code on every page.
 */
export function canRunScripts(session: Session | null): boolean {
  return isAdmin(session) && !viaToken(session);
}

/**
 * What an API token may do to a document's publication — the owner's rule:
 * a token (the MCP hub, a script) builds NEW pages as drafts and may edit
 * pages that are already published, but going live, going offline and the
 * publish date stay a person's decision in the admin.
 *
 *   • create: only as a draft, and no publish date;
 *   • edit:   any field, but the status may not change (no publishing a
 *             draft, no unpublishing a live page) and the date may not move.
 *
 * Enforced here rather than only in the hub, so it holds for any program
 * with a token and whatever the hub's own switches say. Returns the refusal
 * message, or null when the request is allowed. Browser sessions: always null.
 *
 * The owner can lift it for one token: the "Publishing" extra access
 * (scope "publish", admin tokens only — the same test as tokenHasScope in
 * lib/apiTokens.ts, which imports this file and so cannot be imported here).
 */
export function tokenPublishProblem(
  session: Session | null,
  body: Record<string, unknown>,
  existing: { status: string } | null
): string | null {
  if (!viaToken(session)) return null;
  const u = session?.user as { role?: string; scopes?: string[] } | undefined;
  if (u?.role === "admin" && Array.isArray(u.scopes) && u.scopes.includes("publish")) return null;
  if ("publishedAt" in body && body.publishedAt !== undefined) {
    return "An API token cannot set a publish date. Publishing and scheduling are done in the admin.";
  }
  if (!existing) {
    if (body.status !== undefined && body.status !== "draft") {
      return "An API token creates pages and posts as drafts only. Publish it from the admin.";
    }
    return null;
  }
  if (body.status !== undefined && body.status !== existing.status) {
    return existing.status === "published"
      ? "An API token cannot unpublish a live page. Change its status in the admin."
      : "An API token cannot publish. Publish it from the admin.";
  }
  return null;
}
