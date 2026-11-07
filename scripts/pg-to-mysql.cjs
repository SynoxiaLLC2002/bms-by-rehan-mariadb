#!/usr/bin/env node
// Copies one BMS site's database from Postgres (Neon, BMS 1.9.x) into an empty
// MariaDB database (BMS 2.0). Run it on the host, in cPanel → Terminal, from
// the 2.0 site folder:
//
//   SOURCE_URL='postgres://…neon.tech/…' node scripts/pg-to-mysql.cjs            # check only
//   SOURCE_URL='postgres://…neon.tech/…' node scripts/pg-to-mysql.cjs --write    # copy
//
// The target is DATABASE_URL from .env.local (or the environment), with the
// 2.0 baseline already applied (it is, once the 2.0 app has started once, or
// after `npm run db:migrate`).
//
// What it promises:
//   • Neon is only read. Nothing is written there, ever.
//   • The target must be empty (no posts, pages or users). A half-filled
//     target is refused rather than merged into.
//   • Every id is kept, so links between posts, categories, menus, comments
//     and media stay as they were.
//   • Values too long for their new column are listed BEFORE anything is
//     written (MariaDB would refuse them half-way through).
//   • Afterwards it compares row counts table by table and checks that every
//     reference points at a row that exists. Exit code 0 only when all agree.
//
// Neon over HTTPS, because shared hosts block Postgres's TCP port (5432).

const path = require("node:path");
const ROOT = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env.local"), quiet: true });

const WRITE = process.argv.includes("--write");
const SOURCE = process.env.SOURCE_URL;
const TARGET = process.env.DATABASE_URL;

// Parents before children. oauth_codes (five-minute sign-in codes) and
// sessions (never written: sign-in is a JWT) are not worth moving.
const TABLES = [
  "users", "api_tokens", "categories", "tags", "posts", "pages", "post_tags",
  "comments", "media", "site_settings", "menus", "nav_items", "revisions",
  "redirects", "not_found_log", "plugins", "error_log", "elements", "form_submissions",
];
// Settings that belong to the database they were made on, not to the site.
const SKIP_SETTINGS = new Set(["cron_last_publish_check", "maintenance_last_cleanup"]);
const BATCH = { posts: 50, pages: 50, revisions: 50, elements: 50, users: 50 };
const DEFAULT_BATCH = 500;

// References to verify after the copy: [table, column, parent table].
const REFERENCES = [
  ["api_tokens", "user_id", "users"], ["posts", "category_id", "categories"], ["posts", "author_id", "users"],
  ["pages", "author_id", "users"], ["post_tags", "post_id", "posts"], ["post_tags", "tag_id", "tags"],
  ["comments", "post_id", "posts"], ["comments", "page_id", "pages"], ["media", "uploaded_by_id", "users"],
  ["nav_items", "menu_id", "menus"], ["revisions", "author_id", "users"],
];

function fail(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

/** A Postgres value as MariaDB should receive it. */
function toMysql(value, type) {
  if (value === null || value === undefined) return null;
  if (type === "json" || type === "longtext") {
    if (typeof value === "object" && !(value instanceof Date)) return JSON.stringify(value);
    return value;
  }
  if (type === "datetime") {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) throw new Error(`not a date: ${value}`);
    return d;
  }
  if (type === "tinyint") return value === true || value === "t" || value === 1 ? 1 : 0;
  return value;
}

(async () => {
  if (!SOURCE) fail("SOURCE_URL is not set — the Neon connection string of the 1.9.x site.");
  if (!TARGET || !/^mysql:\/\//.test(TARGET)) fail("DATABASE_URL must be the site's mysql:// address (see release/env.example).");

  const { neon } = require("@neondatabase/serverless");
  const pg = neon(SOURCE);
  const mysql = require("mysql2/promise");
  const my = await mysql.createConnection({ uri: TARGET, timezone: "Z", charset: "utf8mb4", supportBigNumbers: true });
  await my.query("SET time_zone = '+00:00'");

  // Columns on both sides; Postgres-only ones (search_tsv) are left behind.
  const [targetCols] = await my.query(
    "SELECT table_name AS t, column_name AS c, data_type AS type, character_maximum_length AS max FROM information_schema.columns WHERE table_schema = DATABASE()"
  );
  const target = new Map();
  for (const r of targetCols) {
    const t = r.t ?? r.TABLE_NAME, c = r.c ?? r.COLUMN_NAME;
    if (!target.has(t)) target.set(t, new Map());
    target.get(t).set(c, { type: String(r.type ?? r.DATA_TYPE).toLowerCase(), max: r.max ?? r.CHARACTER_MAXIMUM_LENGTH });
  }
  if (!target.has("posts")) fail("The target has no BMS tables. Start the 2.0 app once, or run `npm run db:migrate`, then try again.");

  const [[filled]] = await my.query("SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM posts) + (SELECT COUNT(*) FROM pages) AS n");
  if (Number(filled.n) > 0) fail("The target database already has users, posts or pages. This copies into an EMPTY database only.");

  const sourceCols = await pg("SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'public'");
  const source = new Map();
  for (const r of sourceCols) {
    if (!source.has(r.t)) source.set(r.t, new Set());
    source.get(r.t).add(r.c);
  }

  // ── 1. Read everything and check it fits ─────────────────────────────────
  const plan = [];
  const tooLong = [];
  for (const table of TABLES) {
    if (!source.has(table)) { plan.push({ table, rows: [], cols: [], note: "not in the source" }); continue; }
    const tcols = target.get(table);
    const cols = [...source.get(table)].filter((c) => tcols.has(c));
    const left = [...source.get(table)].filter((c) => !tcols.has(c));
    const key = table === "post_tags" ? "post_id, tag_id" : "id";
    const size = BATCH[table] ?? DEFAULT_BATCH;
    const rows = [];
    for (let offset = 0; ; offset += size) {
      const page = await pg(`SELECT ${cols.map((c) => `"${c}"`).join(", ")} FROM "${table}" ORDER BY ${key} LIMIT ${size} OFFSET ${offset}`);
      rows.push(...page);
      if (page.length < size) break;
    }
    const kept = table === "site_settings" ? rows.filter((r) => !SKIP_SETTINGS.has(r.key)) : rows;
    for (const row of kept) {
      for (const c of cols) {
        const { type, max } = tcols.get(c);
        if (type === "varchar" && typeof row[c] === "string" && [...row[c]].length > Number(max)) {
          tooLong.push(`${table}.${c} (id ${row.id ?? "?"}): ${[...row[c]].length} characters, the column holds ${max}`);
        }
      }
    }
    plan.push({ table, rows: kept, cols, left });
    console.log(`  read ${String(kept.length).padStart(6)}  ${table}${left.length ? `  (not copied: ${left.join(", ")})` : ""}`);
  }
  if (tooLong.length) {
    console.log("\n  These values are too long for MariaDB's columns. Shorten them in the 1.9.x admin, then run this again:");
    for (const t of tooLong) console.log("   •", t);
    await my.end();
    process.exit(1);
  }
  if (!WRITE) {
    console.log("\n  Everything fits. Nothing was written — run again with --write to copy.\n");
    await my.end();
    return;
  }

  // ── 2. Write, one transaction ────────────────────────────────────────────
  // References are checked after the copy (below) rather than row by row,
  // because comments and nav items point at rows of their own table.
  await my.query("SET FOREIGN_KEY_CHECKS = 0");
  await my.beginTransaction();
  try {
    // The 2.0 app may have written its own first settings rows; the site's win.
    await my.query("DELETE FROM site_settings");
    for (const { table, rows, cols } of plan) {
      if (!rows.length) continue;
      const tcols = target.get(table);
      for (let i = 0; i < rows.length; i += 200) {
        const values = rows.slice(i, i + 200).map((row) => cols.map((c) => toMysql(row[c], tcols.get(c).type)));
        await my.query(`INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(", ")}) VALUES ?`, [values]);
      }
    }
    await my.commit();
  } catch (err) {
    await my.rollback();
    await my.query("SET FOREIGN_KEY_CHECKS = 1");
    await my.end();
    fail(`Copy failed and was rolled back — the target is as it was: ${err.message}`);
  }
  await my.query("SET FOREIGN_KEY_CHECKS = 1");

  // ── 3. Verify ────────────────────────────────────────────────────────────
  let problems = 0;
  console.log("");
  for (const { table, rows } of plan) {
    const [[{ n }]] = await my.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
    const ok = Number(n) === rows.length;
    if (!ok) problems++;
    console.log(`  ${ok ? "ok  " : "DIFF"} ${String(n).padStart(6)} / ${String(rows.length).padEnd(6)} ${table}`);
  }
  for (const [table, col, parent] of REFERENCES) {
    const [[{ n }]] = await my.query(
      `SELECT COUNT(*) AS n FROM \`${table}\` c LEFT JOIN \`${parent}\` p ON p.id = c.\`${col}\` WHERE c.\`${col}\` IS NOT NULL AND p.id IS NULL`
    );
    if (Number(n) > 0) {
      problems++;
      console.log(`  BROKEN ${n} × ${table}.${col} → ${parent}`);
    }
  }
  await my.end();
  console.log(problems ? `\n  ${problems} problem(s) — do not switch the site over.\n` : "\n  Copied and verified. Every count matches and every reference resolves.\n");
  process.exit(problems ? 1 : 0);
})().catch((err) => fail(err.stack || String(err)));
