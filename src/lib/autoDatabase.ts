// Creates this site's MariaDB database on a cPanel account, so a new site needs
// no "Database Wizard" visit and no DATABASE_URL typed by hand (2026-10-22).
//
// cPanel's command-line API (`uapi`) runs as the account the app runs as, so it
// needs no API token and no password. Checked on the production host
// a cPanel host: `uapi Mysql list_databases` answers from the account's
// Terminal, which is the same CageFS the Node app runs in.
//
// The address is saved to .bms/site.json next to the app; server.js loads it at
// every start. A DATABASE_URL set in cPanel's Node.js App screen still wins.

import * as childProcess from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { basename, join } from "node:path";
import { createConnection } from "mysql2/promise";

/** Runs `uapi --output=json <args…>` and returns its stdout. Replaceable for tests. */
export type Run = (args: string[]) => Promise<string>;

// /usr/bin/uapi first: inside CloudLinux CageFS (where the Node app runs) the
// cpanel/bin one cannot start cPanel ("Failed to execute /usr/local/cpanel/cpanel",
// seen 2026-10-22); the /usr/bin one is the wrapper Terminal uses, and it works.
const UAPI_PATHS = ["/usr/bin/uapi", "/usr/local/cpanel/bin/uapi"];

export function uapiPath(): string | null {
  return process.env.UAPI_BIN || UAPI_PATHS.find((p) => existsSync(p)) || null;
}

const runUapi: Run = (args) =>
  new Promise((resolve, reject) => {
    const bin = uapiPath();
    if (!bin) return reject(new Error("cPanel's uapi command was not found on this server."));
    childProcess.execFile(bin, ["--output=json", ...args], { timeout: 60_000, maxBuffer: 8 << 20 }, (err, out, errOut) =>
      err ? reject(new Error(String(errOut || err.message).trim())) : resolve(out),
    );
  });

async function call(run: Run, fn: string, params: Record<string, string> = {}): Promise<unknown> {
  // uapi wants URI-encoded values ("ALL PRIVILEGES" → ALL%20PRIVILEGES).
  const out = await run(["Mysql", fn, ...Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`)]);
  let result: { status?: number; errors?: string[] | null; data?: unknown } | undefined;
  try {
    result = JSON.parse(out).result;
  } catch {
    throw new Error(`cPanel answered something unexpected: ${out.slice(0, 200)}`);
  }
  if (!result || result.status !== 1) throw new Error((result?.errors ?? []).join(" ") || `cPanel refused Mysql::${fn}`);
  return result.data;
}

const ALNUM = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// Letters and digits only: nothing that needs escaping in a mysql:// address.
export const newPassword = (n = 28) => Array.from({ length: n }, () => ALNUM[randomInt(ALNUM.length)]).join("");

/** The app folder's name ("mysite", "shop") as a database name, else "bms". */
export function baseName(appRoot: string): string {
  return basename(appRoot).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16) || "bms";
}

/** First free `<prefix><base>`, `<prefix><base>2`, … that fits cPanel's length limits. */
export function pickName(prefix: string, base: string, max: number, taken: Set<string>): string {
  for (let n = 1; n < 100; n++) {
    const suffix = n === 1 ? "" : String(n);
    const name = prefix + base.slice(0, Math.max(1, max - prefix.length - suffix.length)) + suffix;
    if (!taken.has(name)) return name;
  }
  throw new Error("No free database name left.");
}

/** Connects once, so a broken address is reported now and not on the first page view. */
async function reachable(url: string): Promise<boolean> {
  try {
    const conn = await createConnection({ uri: url, connectTimeout: 10_000 });
    await conn.query("SELECT 1");
    await conn.end();
    return true;
  } catch {
    return false;
  }
}

export async function createSiteDatabase(appRoot: string, run: Run = runUapi, check = reachable): Promise<string> {
  const limits = (await call(run, "get_restrictions")) as { prefix?: string; max_database_name_length?: number; max_username_length?: number };
  const prefix = limits.prefix ?? "";
  const max = Math.min(Number(limits.max_database_name_length) || 64, Number(limits.max_username_length) || 47);

  const dbs = ((await call(run, "list_databases")) as { database: string }[] | null) ?? [];
  const users = ((await call(run, "list_users")) as { user: string }[] | null) ?? [];
  const name = pickName(prefix, baseName(appRoot), max, new Set([...dbs.map((d) => d.database), ...users.map((u) => u.user)]));
  const password = newPassword();

  await call(run, "create_database", { name });
  try {
    await call(run, "create_user", { name, password });
    await call(run, "set_privileges_on_database", { user: name, database: name, privileges: "ALL PRIVILEGES" });
  } catch (err) {
    // Leave the account as it was: no half-made database to trip over on the next try.
    await call(run, "delete_user", { name }).catch(() => {});
    await call(run, "delete_database", { name }).catch(() => {});
    throw err;
  }

  // "localhost" is what cPanel grants; some servers only answer it on 127.0.0.1.
  for (const host of ["localhost", "127.0.0.1"]) {
    const url = `mysql://${name}:${password}@${host}:${process.env.MYSQL_PORT || "3306"}/${name}`;
    if (await check(url)) return url;
  }
  throw new Error(`The database ${name} was created, but this app cannot connect to it.`);
}

/** Merges values into .bms/site.json (readable by this account only). */
export function saveSiteFile(appRoot: string, values: Record<string, string>): void {
  const dir = join(appRoot, ".bms");
  const file = join(dir, "site.json");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const current = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  writeFileSync(file, JSON.stringify({ ...current, ...values }, null, 2), { mode: 0o600 });
}
