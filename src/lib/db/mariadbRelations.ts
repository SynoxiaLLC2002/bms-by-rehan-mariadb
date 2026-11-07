// Makes Drizzle's relational queries (`findMany({ with: … })`) valid on MariaDB.
//
// Drizzle 0.45 has two ways to build them for MySQL, and MariaDB accepts
// neither as it stands:
//
//   • "default" mode: LEFT JOIN LATERAL — MariaDB has no LATERAL.
//   • "planetscale" mode (lib/db/index.ts uses it): a correlated subquery, but
//     whenever the relation has a limit, offset or order it wraps the related
//     rows in a derived table that refers to the outer row —
//     `(select json_array(…) from (select * from categories c
//        where c.id = posts.category_id limit 1) c)` — and MariaDB does not let
//     a derived table see the outer query.
//
// Drizzle gives every one-to-one relation that `limit 1` itself. In BMS every
// `one()` follows a foreign key on the row being read to a primary key
// (post → category, post → author, token → user; see relations.ts), so it
// matches at most one row and the limit changes nothing. Dropping it leaves a
// plain correlated scalar subquery, which MariaDB runs.
//
// A `many()` relation with orderBy/limit/offset would still need the derived
// table; nothing in BMS asks for one, and this refuses it with a clear message
// rather than letting MariaDB answer with a syntax error.
//
// Imported for its side effect by lib/db/index.ts. Re-check on a drizzle-orm
// upgrade: scripts/check-relations.mts runs every shape BMS uses.

import { is, Many, One } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";

type Args = {
  nestedQueryRelation?: unknown;
  queryConfig?: { limit?: unknown; offset?: unknown; orderBy?: unknown } & Record<string, unknown>;
} & Record<string, unknown>;

const proto = MySqlDialect.prototype as unknown as {
  buildRelationalQueryWithoutLateralSubqueries: (this: unknown, args: Args) => unknown;
  __bmsMariaDb?: true;
};

if (!proto.__bmsMariaDb) {
  const original = proto.buildRelationalQueryWithoutLateralSubqueries;
  proto.buildRelationalQueryWithoutLateralSubqueries = function (args: Args) {
    const relation = args.nestedQueryRelation;
    const config = args.queryConfig;
    if (relation && config) {
      if (is(relation, One) && config.limit === 1 && config.offset === undefined && !config.orderBy) {
        const rest = { ...config };
        delete rest.limit;
        return original.call(this, { ...args, queryConfig: rest });
      }
      if (is(relation, Many) && (config.limit !== undefined || config.offset !== undefined || config.orderBy)) {
        throw new Error(
          "MariaDB cannot run a `with:` many-relation that has orderBy/limit/offset (it needs a derived table that sees the outer row). Query the related rows separately."
        );
      }
    }
    return original.call(this, args);
  };
  proto.__bmsMariaDb = true;
}
