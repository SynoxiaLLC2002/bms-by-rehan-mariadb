// The one MariaDB connection pool for this process.
//
// One pool, shared by the app (lib/db/index.ts) and the middleware's cached
// lookups (lib/db/raw.ts). The Postgres version had a pool each; here every
// connection counts against the hosting account's `max_user_connections`,
// which on the shared host it was measured on is 20 for ALL sites together,
// WordPress included
// (measured 2026-10-21, AUDIT-2026-10-21.md). So:
//
//   • 2 connections per process by default (DB_POOL_MAX to change);
//   • an idle connection is closed after 10 s, so a quiet site holds none;
//   • a full account ("too many connections") is waited out once, then fails
//     as a database error — which the site turns into an uncached 500, never
//     a 404 or an empty page (lib/db/errors.ts, server.js).
//
// No TLS: the database is on the same machine (localhost / socket). A remote
// MySQL would need `?ssl={"rejectUnauthorized":true}` in DATABASE_URL.
//
// Only mysql2 is imported here, so the middleware can use this without pulling
// in Drizzle and the schema.

import { createPool, type Pool, type PoolOptions } from "mysql2/promise";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const g = globalThis as unknown as { __bmsPool?: Pool };

/**
 * DATABASE_URL, or the address first-run setup saved to .bms/site.json
 * (lib/autoDatabase). Read again while there is none: LiteSpeed runs several
 * copies of the app, and another copy may have just created the database.
 */
export function databaseUrl(): string | undefined {
  if (!process.env.DATABASE_URL) {
    try {
      const saved = JSON.parse(readFileSync(join(process.env.BMS_APP_ROOT || process.cwd(), ".bms", "site.json"), "utf8")).DATABASE_URL;
      if (saved) process.env.DATABASE_URL = saved;
    } catch {
      // No file yet: a site that has not been set up.
    }
  }
  return process.env.DATABASE_URL;
}

/** "Too many connections" for the server (1040) or this account (1203). */
const FULL = new Set([1040, 1203]);
const RETRY_MS = 200;

function isFull(err: unknown): boolean {
  return FULL.has(Number((err as { errno?: unknown })?.errno));
}

export function pool(): Pool {
  if (g.__bmsPool) return g.__bmsPool;
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");

  const limit = Math.max(1, Number(process.env.DB_POOL_MAX ?? 2) || 2);
  const options: PoolOptions = {
    uri: url,
    connectionLimit: limit,
    maxIdle: 0,
    idleTimeout: 10_000,
    connectTimeout: 10_000,
    waitForConnections: true,
    // A burst beyond this fails fast instead of piling up behind a dead database.
    queueLimit: 100,
    charset: "utf8mb4",
    // Dates go in and come out as UTC; the session zone below makes
    // CURRENT_TIMESTAMP agree with them.
    timezone: "Z",
    supportBigNumbers: true,
    enableKeepAlive: true,
  };
  const created = createPool(options);
  created.pool.on("connection", (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });

  // One retry when the account is out of connections: another site's burst
  // usually clears within a moment. Patched on the pool itself so Drizzle's
  // queries get it too.
  for (const method of ["query", "execute"] as const) {
    const original = created[method].bind(created) as (...args: unknown[]) => Promise<unknown>;
    (created as unknown as Record<string, unknown>)[method] = async (...args: unknown[]) => {
      try {
        return await original(...args);
      } catch (err) {
        if (!isFull(err)) throw err;
        await new Promise((r) => setTimeout(r, RETRY_MS));
        return original(...args);
      }
    };
  }

  g.__bmsPool = created;
  return created;
}

/** Closes the pool — for scripts and for a process that is about to exit. */
export async function closePool(): Promise<void> {
  const p = g.__bmsPool;
  g.__bmsPool = undefined;
  await p?.end();
}
