// Writes that hand back the rows they wrote.
//
// Postgres (1.9.x) did this with RETURNING. Drizzle's MySQL dialect has no
// `.returning()`, so on MariaDB an insert reports only the new ids and an
// update only how many rows it changed. These helpers put the row back in
// the caller's hand the way `.returning()` did, so the routes keep their
// shape.
//
// Read-back is by primary key, never by the update's own `where`: an update
// that changes a column its `where` tests (a slug rename, an attempt counter)
// would otherwise read back nothing, or the wrong row.

import { asc, inArray, type InferSelectModel } from "drizzle-orm";
import type { MySqlColumn, MySqlInsertValue, MySqlTable } from "drizzle-orm/mysql-core";
import { db } from "./index";

type IdTable = MySqlTable & { id: MySqlColumn };

// Drizzle's builders are generic over the concrete table; these helpers take
// any table with an `id`, so the builder is reached through one narrow cast.
type Loose = {
  insert: (t: unknown) => { values: (v: unknown) => { $returningId: () => Promise<{ id: number | string }[]> } };
  select: () => { from: (t: unknown) => { where: (w: unknown) => { orderBy: (o: unknown) => Promise<unknown[]> } } };
};
const loose = () => db as unknown as Loose;

/**
 * INSERT one or many rows and return them as stored (defaults included), in
 * insertion order — what `insert(…).values(…).returning()` returned.
 *
 * One INSERT per row. For a multi-row INSERT, `$returningId()` assumes the
 * ids are consecutive, which `innodb_autoinc_lock_mode = 2` does not promise
 * under concurrent writes; the only many-row caller (a menu save) has a few
 * dozen rows, so exact ids are worth the extra round trips.
 */
export async function insertReturning<T extends IdTable>(
  table: T,
  values: MySqlInsertValue<T> | MySqlInsertValue<T>[]
): Promise<InferSelectModel<T>[]> {
  const list = Array.isArray(values) ? values : [values];
  const ids: (number | string)[] = [];
  for (const row of list) {
    const [made] = await loose().insert(table).values(row).$returningId();
    // A caller-written primary key (users.id) is not echoed back; take it from the row.
    ids.push(made?.id ?? (row as { id?: number | string }).id!);
  }
  return readByIds(table, ids);
}

/** The rows with these ids, oldest id first. */
export async function readByIds<T extends IdTable>(table: T, ids: (number | string)[]): Promise<InferSelectModel<T>[]> {
  if (ids.length === 0) return [];
  return (await loose().select().from(table).where(inArray(table.id, ids)).orderBy(asc(table.id))) as InferSelectModel<T>[];
}

/** Rows changed by an UPDATE or DELETE — the first element of mysql2's result. */
export function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { affectedRows?: unknown })?.affectedRows ?? 0);
}
