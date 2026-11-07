// Applies the .sql files in drizzle-mysql/ that the database has not seen yet.
//
// One implementation for two callers: `npm run db:migrate` (a person, on the
// PC or in a terminal on the host) and server.js after it starts listening
// (the host, every restart). The second is why this exists — an upload that
// adds a column used to need someone to open a terminal on the host and run
// the script, and a site restarted without that step answered 500 on every
// page that touched the new column. Now the upload carries the migration and
// the restart applies it.
//
// BMS 2.0 runs on MariaDB, and MariaDB differs from Postgres in the one way
// that matters here: every CREATE/ALTER commits on its own, so a migration
// file cannot be rolled back half-way. Two consequences:
//
//   • Only one process migrates at a time — GET_LOCK, a server-wide named
//     lock, held for the whole run. Passenger can start two app processes
//     together, and the Postgres version had to fight that with a claim row.
//   • A file is recorded in `cms_migrations` only after all of it ran. If it
//     fails part-way, the error says which statement, and the statements
//     before it stay applied: fix the cause, then either finish that file by
//     hand or (for the baseline, on an empty database) drop the tables and
//     restart. Write new files so they can be re-run where possible
//     (IF NOT EXISTS / IF EXISTS — MariaDB supports both on ADD/DROP COLUMN).

const { readdir, readFile } = require("node:fs/promises");
const { join } = require("node:path");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS cms_migrations (
    name        varchar(255) NOT NULL PRIMARY KEY,
    applied_at  datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`;

const LOCK = "bms_migrations";
const LOCK_WAIT_S = 60;

/**
 * One statement per entry: Drizzle's separator first, then a semicolon at
 * the end of a line (hand-written files). mysql2 runs one statement per query
 * unless multipleStatements is on, which it is not — on purpose.
 */
function statementsOf(sql) {
  return sql
    .split("--> statement-breakpoint")
    .flatMap((chunk) => chunk.split(/;[ \t]*(?:\r?\n|$)/))
    .map((s) => s.replace(/^(\s*--[^\n]*\n)+/, "").trim())
    .filter((s) => s && !/^(--[^\n]*\n?)+$/.test(s));
}

/**
 * @param {{ root: string, url: string, log?: (msg: string) => void }} opts
 * @returns {Promise<{ applied: string[], skipped: number, files: number, driver: string }>}
 */
async function applyMigrations({ root, url, log = () => {} }) {
  const dir = join(root, "drizzle-mysql");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const driver = "mysql2";
  if (files.length === 0) return { applied: [], skipped: 0, files: 0, driver };

  const mysql = require("mysql2/promise");
  const conn = await mysql.createConnection({ uri: url, connectTimeout: 15_000, timezone: "Z", charset: "utf8mb4" });
  const applied = [];
  let skipped = 0;
  try {
    await conn.query("SET time_zone = '+00:00'");
    const [[lock]] = await conn.query("SELECT GET_LOCK(?, ?) AS ok", [LOCK, LOCK_WAIT_S]);
    if (Number(lock.ok) !== 1) throw new Error(`another process held the migration lock for ${LOCK_WAIT_S}s`);
    await conn.query(CREATE_TABLE);
    const [rows] = await conn.query("SELECT name FROM cms_migrations");
    const done = new Set(rows.map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) {
        skipped++;
        continue;
      }
      const statements = statementsOf(await readFile(join(dir, file), "utf8"));
      for (let i = 0; i < statements.length; i++) {
        try {
          await conn.query(statements[i]);
        } catch (err) {
          const e = new Error(
            `${file} stopped at statement ${i + 1} of ${statements.length} (${i} before it are applied and stay applied): ${err.message}`
          );
          e.file = file;
          throw e;
        }
      }
      await conn.query("INSERT INTO cms_migrations (name) VALUES (?)", [file]);
      applied.push(file);
      log(`applied ${file} (${statements.length} statements)`);
    }
  } finally {
    await conn.query("SELECT RELEASE_LOCK(?)", [LOCK]).catch(() => {});
    await conn.end().catch(() => {});
  }
  return { applied, skipped, files: files.length, driver };
}

module.exports = { applyMigrations, statementsOf };
