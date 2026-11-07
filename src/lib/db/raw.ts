// Raw SQL against the same pool the app uses, for code that must not import
// Drizzle and the schema — the middleware's cached lookups above all
// (redirects, languages, cache settings), which run in front of every request.

import { pool } from "./pool";

type Row = Record<string, unknown>;

/**
 * Runs `text` with `?` bound to `params`, in order, and returns the rows.
 *
 * Throws on failure — the callers decide what a failure means for them.
 * Postgres-style `$1` placeholders are refused rather than guessed at: every
 * query moved over from 1.9.x has to be rewritten for MariaDB (casts,
 * ON CONFLICT, ANY), and a leftover one should fail loudly, not run wrong.
 */
export async function rawQuery<T extends Row = Row>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  if (/\$\d/.test(text)) throw new Error(`rawQuery: Postgres placeholder left in: ${text.slice(0, 80)}`);
  const [rows] = await pool().query(text, params);
  return (Array.isArray(rows) ? rows : []) as T[];
}

/**
 * Runs a write and returns how many rows it changed — what Postgres's
 * `RETURNING` was used for here ("did this insert win", "how many went").
 *
 * For `INSERT … ON DUPLICATE KEY UPDATE`, MariaDB counts 1 for a new row, 2
 * for an updated one and 0 for a duplicate left as it was.
 */
export async function rawExec(text: string, params: unknown[] = []): Promise<number> {
  if (/\$\d/.test(text)) throw new Error(`rawExec: Postgres placeholder left in: ${text.slice(0, 80)}`);
  const [result] = await pool().query(text, params);
  return Number((result as { affectedRows?: unknown }).affectedRows ?? 0);
}
