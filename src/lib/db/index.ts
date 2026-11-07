// The database connection: Drizzle over mysql2, against the hosting account's
// own MariaDB (BMS 2.0).
//
// The Postgres version (1.9.x) chose between Neon over HTTP and node-postgres
// at runtime. Neither applies here: the database sits on the same machine as
// the app, so a small TCP pool is right everywhere (lib/db/pool.ts), and the
// Next fetch-cache trap the Neon driver needed a workaround for (reasons.txt)
// cannot happen — mysql2 never goes through `fetch`.
//
// `mode: "planetscale"` although this is MariaDB, not PlanetScale: it is the
// one thing that mode changes in Drizzle 0.45 that matters here. In "default"
// mode the relational `query` API (`findMany({ with: … })`, used everywhere)
// builds related rows with LEFT JOIN LATERAL, which MySQL 8.0.14+ has and
// MariaDB does not — the homepage failed with ER_PARSE_ERROR on the first
// run. The PlanetScale path (`buildRelationalQueryWithoutLateralSubqueries`)
// uses correlated subqueries with json_arrayagg instead, which MariaDB 10.5+
// runs — once lib/db/mariadbRelations.ts has removed the one place that path
// still needs a derived table. Re-check both when upgrading drizzle-orm.

import "./mariadbRelations";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema";
import * as relations from "./relations";
import { pool } from "./pool";

const allSchema = { ...schema, ...relations };

function connect() {
  return drizzle(pool(), { schema: allSchema, mode: "planetscale" });
}

type DbInstance = ReturnType<typeof connect>;

let _instance: DbInstance | undefined;

function getInstance(): DbInstance {
  return (_instance ??= connect());
}

// Proxied so the connection is opened on first use rather than on import.
// Importing this module must stay free: it is pulled in by files that only
// need a type, and by routes that may never touch the database on a request.
export const db = new Proxy({} as DbInstance, {
  get(_, prop) {
    return getInstance()[prop as keyof DbInstance];
  },
});
