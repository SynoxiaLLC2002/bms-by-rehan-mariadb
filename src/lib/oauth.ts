// "Connect Claude" — OAuth 2.1 for the site's MCP endpoint (api/mcp), so a
// person adds the site to Claude by pasting one address and clicking Allow,
// with nothing secret to copy.
//
//   Claude → POST /api/mcp            401, WWW-Authenticate points at …
//   Claude → /.well-known/oauth-protected-resource      → this site is the authorization server
//   Claude → /.well-known/oauth-authorization-server    → the three endpoints below
//   Claude → POST /api/oauth/register  (dynamic client registration, RFC 7591)
//   browser → /api/oauth/authorize → /admin/connect (sign in, Allow) → back to Claude with a code
//   Claude → POST /api/oauth/token     code + PKCE verifier → an ordinary API token
//
// What Claude receives is a normal `bms_` API token (lib/apiTokens.ts): it
// shows up in Admin → Users → API tokens, carries the role and extra access
// chosen on the Allow screen, and Revoke ends it. Nothing new can do more than
// a token already could.
//
// Clients are not stored. A registration is signed with AUTH_SECRET and the
// signed blob *is* the client_id, so anyone may register (the spec expects
// that) without filling a table. Codes are stored — hashed, five minutes, and
// deleted by the statement that reads them, so each works once.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { affectedRows } from "@/lib/db/write";
import { apiTokens, oauthCodes, users } from "@/lib/db/schema";
import { lowerRole, MAX_TOKENS_PER_USER, newToken, parseScopes } from "@/lib/apiTokens";

const CODE_TTL_MS = 5 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  if (s.length < 16) throw new Error("AUTH_SECRET is not set");
  return s;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(`oauth-client:${data}`).digest("base64url");
}

function sha256(v: string): string {
  return createHash("sha256").update(v, "utf8").digest("hex");
}

export class OAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

// ── Endpoints and metadata ─────────────────────────────────────────────────

export function authServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["site"],
  };
}

export function protectedResourceMetadata(base: string) {
  return {
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: ["site"],
    resource_name: "BMS site",
  };
}

// ── Clients ────────────────────────────────────────────────────────────────

export interface OAuthClient {
  name: string;
  redirectUris: string[];
}

/** A redirect address a client may use: https anywhere, http only to this computer. */
function okRedirect(uri: string): boolean {
  if (typeof uri !== "string" || uri.length > 500) return false;
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

export function registerClient(body: { client_name?: unknown; redirect_uris?: unknown }): { client_id: string; client: OAuthClient } {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!uris.length || uris.length > 5 || !uris.every(okRedirect)) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris must be 1–5 https addresses (or http://localhost).");
  }
  const name = String(body.client_name ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60) || "An app";
  const client: OAuthClient = { name, redirectUris: uris };
  const payload = Buffer.from(JSON.stringify({ n: name, r: uris }), "utf8").toString("base64url");
  return { client_id: `${payload}.${sign(payload)}`, client };
}

/** The client a client_id stands for, or null when it was not issued here. */
export function readClient(clientId: unknown): OAuthClient | null {
  if (typeof clientId !== "string" || clientId.length > 4000) return null;
  const dot = clientId.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = clientId.slice(0, dot);
  const given = Buffer.from(clientId.slice(dot + 1));
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { n?: string; r?: string[] };
    if (!Array.isArray(p.r)) return null;
    return { name: String(p.n ?? "An app"), redirectUris: p.r.map(String) };
  } catch {
    return null;
  }
}

/** Whether a redirect address is one we would trust a person to recognise. */
export function isClaudeRedirect(uri: string): boolean {
  try {
    const h = new URL(uri).hostname;
    return h === "claude.ai" || h === "claude.com" || h.endsWith(".claude.ai") || h.endsWith(".claude.com");
  } catch {
    return false;
  }
}

// ── The authorize request ──────────────────────────────────────────────────

export interface AuthorizeRequest {
  clientId: string;
  client: OAuthClient;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

/**
 * Checks an authorize request. Errors about the client or the redirect address
 * are shown on the site — sending them to an address we cannot trust would be
 * an open redirect. The rest go back to the client, as the spec says.
 */
export function checkAuthorize(q: URLSearchParams): AuthorizeRequest {
  const clientId = q.get("client_id") ?? "";
  const client = readClient(clientId);
  if (!client) throw new OAuthError("invalid_client", "This connection link is not valid. Start again from the app.");
  const redirectUri = q.get("redirect_uri") ?? client.redirectUris[0] ?? "";
  if (!client.redirectUris.includes(redirectUri)) {
    throw new OAuthError("invalid_request", "The app gave a return address it did not register. Start again from the app.");
  }
  if ((q.get("response_type") ?? "") !== "code") throw new OAuthError("unsupported_response_type", "Only response_type=code is supported.");
  const codeChallenge = q.get("code_challenge") ?? "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge) || (q.get("code_challenge_method") ?? "") !== "S256") {
    throw new OAuthError("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  return { clientId, client, redirectUri, state: (q.get("state") ?? "").slice(0, 500), codeChallenge };
}

/** Where to send the browser after Allow (code) or Cancel (error). */
export function redirectWith(redirectUri: string, params: Record<string, string>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

/** Allow: a one-time code for this person, role and extra access. */
export async function issueCode(req: AuthorizeRequest, userId: string, roleAsked: string, scopesAsked: unknown): Promise<string> {
  const owner = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { role: true } });
  if (!owner) throw new OAuthError("access_denied", "Your account no longer exists.", 401);
  const role = lowerRole(roleAsked, owner.role);
  const scopes = role === "admin" ? parseScopes(scopesAsked) : [];

  // Old, never-used codes are dead weight; this is the one place codes are made.
  await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, new Date())).catch(() => {});

  const code = randomBytes(32).toString("base64url");
  await db.insert(oauthCodes).values({
    codeHash: sha256(code),
    userId,
    clientId: req.clientId,
    redirectUri: req.redirectUri,
    codeChallenge: req.codeChallenge,
    tokenName: req.client.name,
    role,
    scopes: scopes.join(","),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

/** The token endpoint: a code and its PKCE verifier become an API token. */
export async function exchangeCode(f: { code: string; verifier: string; redirectUri: string; clientId: string }): Promise<string> {
  if (!f.code || !f.verifier) throw new OAuthError("invalid_request", "code and code_verifier are required.");

  // Read and delete in one statement: a code is spent the moment it is tried,
  // right or wrong, so a stolen one cannot be retried.
  // MariaDB has no DELETE … RETURNING in Drizzle: read, then delete — and
  // only the request whose delete removed the row may use it.
  const hash = sha256(f.code);
  const found = await db.query.oauthCodes.findFirst({ where: eq(oauthCodes.codeHash, hash) });
  const spent = found ? affectedRows(await db.delete(oauthCodes).where(eq(oauthCodes.codeHash, hash))) : 0;
  const row = spent ? found : undefined;
  if (!row || row.expiresAt.getTime() < Date.now()) throw new OAuthError("invalid_grant", "The code is unknown, used or expired.");
  if (row.clientId !== f.clientId || (f.redirectUri && row.redirectUri !== f.redirectUri)) {
    throw new OAuthError("invalid_grant", "The code was issued to a different app.");
  }
  const challenge = createHash("sha256").update(f.verifier).digest("base64url");
  if (challenge !== row.codeChallenge) throw new OAuthError("invalid_grant", "code_verifier does not match.");

  const owner = await db.query.users.findFirst({ where: eq(users.id, row.userId), columns: { role: true } });
  if (!owner) throw new OAuthError("invalid_grant", "The account no longer exists.");
  const existing = await db.query.apiTokens.findMany({ where: eq(apiTokens.userId, row.userId), columns: { id: true } });
  if (existing.length >= MAX_TOKENS_PER_USER) {
    throw new OAuthError("invalid_grant", `This account already has ${MAX_TOKENS_PER_USER} tokens. Revoke one in Admin → Users → API tokens.`);
  }

  const role = lowerRole(row.role, owner.role);
  const made = newToken();
  await db.insert(apiTokens).values({
    userId: row.userId,
    name: `${row.tokenName} (connected)`.slice(0, 80),
    tokenHash: made.hash,
    prefix: made.prefix,
    role,
    scopes: role === "admin" ? parseScopes(row.scopes).join(",") : "",
  });
  return made.token;
}

