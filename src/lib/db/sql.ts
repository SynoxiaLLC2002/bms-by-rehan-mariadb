// SQL fragments whose meaning differs between Postgres (1.9.x) and MariaDB.

import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * Case-insensitive LIKE, whatever the column's collation.
 *
 * Postgres had ILIKE. MariaDB's LIKE follows the column: slugs, page titles
 * and other exact-compare text are utf8mb4_bin here (see drizzle-mysql/0000),
 * so a plain LIKE would make admin search case-sensitive on them. Lowering
 * both sides keeps "Kot" finding "kot" on every column. Drizzle's own
 * `ilike()` emits ILIKE, which MariaDB does not have.
 */
export function ilike(column: SQLWrapper, pattern: string): SQL {
  return sql`LOWER(${column}) LIKE LOWER(${pattern})`;
}
