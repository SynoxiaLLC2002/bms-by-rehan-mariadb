// Whether an error came from the database rather than from rendering.
//
// A render bug may fall back to a smaller page; a database failure must not,
// or the outage is cached as a normal-looking page (INCIDENT-2026-10-21.md).
// Drizzle wraps driver errors ("Failed query: …") with the driver's error as
// `cause`. mysql2 gives server errors a `code` of ER_… with an errno and
// SQLSTATE, its sign-in failures AUTH_…, its connection failures
// PROTOCOL_… / POOL_…, and socket failures ECONNREFUSED and friends.
// scripts/check-db-errors.mts provokes each kind against a real server.

const NETWORK = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|Connection lost|Pool is closed|Queue limit reached|max_user_connections|too many connections/i;
const DRIVER_CODE = /^(ER_|AUTH_|PROTOCOL_|POOL_|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)/;

export function isDbError(err: unknown): boolean {
  let e = err as { name?: string; message?: string; code?: unknown; errno?: unknown; sqlState?: unknown; cause?: unknown } | undefined;
  for (let depth = 0; e && depth < 5; depth++, e = e.cause as typeof e) {
    if (e.name === "DrizzleQueryError" || e.sqlState !== undefined) return true;
    if (typeof e.code === "string" && DRIVER_CODE.test(e.code)) return true;
    const message = String(e.message ?? "");
    if (message.startsWith("Failed query:") || NETWORK.test(message) || message.includes("DATABASE_URL")) return true;
  }
  return false;
}
