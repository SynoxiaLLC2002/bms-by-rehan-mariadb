// BMS 2.0: real mysql2 failures must count as database errors (lib/db/errors.ts),
// so an outage becomes an uncached 500, never a cached normal-looking page.
//   DATABASE_URL=mysql://… node --experimental-strip-types scripts/check-db-errors.mts
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { isDbError } from "../src/lib/db/errors.ts";

const url = new URL(process.env.DATABASE_URL!);
const tries: [string, () => Promise<unknown>][] = [
  ["nothing listening on the port", () => mysql.createConnection({ host: "127.0.0.1", port: 1, user: "x", connectTimeout: 3000 })],
  ["wrong password", () => mysql.createConnection({ host: url.hostname, port: Number(url.port), user: "root", password: "wrong" })],
  ["unknown database", () => mysql.createConnection({ host: url.hostname, port: Number(url.port), user: url.username, password: decodeURIComponent(url.password), database: "bms_no_such_db" })],
  ["bad SQL", async () => {
    const c = await mysql.createConnection(process.env.DATABASE_URL!);
    try { await c.query("SELECT * FROM no_such_table"); } finally { await c.end(); }
  }],
];
for (const [name, run] of tries) {
  const err = await run().then(() => null, (e) => e);
  assert.ok(err, `${name}: expected an error`);
  assert.equal(isDbError(err), true, `${name}: ${err.code} ${err.message}`);
  console.log("ok   ", name, "—", err.code);
}
for (const e of [new TypeError("Cannot read properties of undefined (reading 'map')"), Object.assign(new Error("fs"), { code: "ENOENT" }), null]) {
  assert.equal(isDbError(e), false, String(e));
}
console.log("ok    render errors are not database errors\nall passed");
