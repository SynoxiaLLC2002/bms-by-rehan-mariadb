// BMS 2.0: asks MariaDB to PREPARE every hand-written SQL statement in src/.
//
// PREPARE parses the statement and resolves every table and column, without
// running it — so a Postgres leftover, a typo or a renamed column fails here
// instead of in a catch block that quietly answers 0. Several callers
// (cleanup counts, Site Health) swallow errors by design, which is exactly
// why this check exists.
//
//   DATABASE_URL=mysql://…/empty_test_db node scripts/check-sql.cjs
//
// The database must have the baseline applied (npm run db:migrate).

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const ROOT = path.join(__dirname, "..");
const STATEMENT = /^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Every string/template literal in a file, with its line. */
function literals(src) {
  const found = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i < 0) break; continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2) + 1; continue; }
    if (c !== '"' && c !== "'" && c !== "`") continue;
    let k = i + 1;
    for (; k < src.length; k++) {
      if (src[k] === "\\") { k++; continue; }
      if (c === "`" && src[k] === "$" && src[k + 1] === "{") {
        let d = 0;
        for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) break; }
        continue;
      }
      if (src[k] === c) break;
      if (c !== "`" && src[k] === "\n") break;
    }
    found.push({ quote: c, body: src.slice(i + 1, k), line: src.slice(0, i).split("\n").length });
    i = k;
  }
  return found;
}

/** A stand-in for each ${…} so the statement can be parsed. */
function fill(expr) {
  if (/\bmap\(/.test(expr)) return "(?, ?, NOW(3))";
  if (/\bsql\b/.test(expr)) return "SELECT 1";
  if (/excerpt/.test(expr)) return "d.excerpt";
  if (/\btable\b/.test(expr)) return "posts";
  if (/\bdoc\b/.test(expr)) return "page";
  if (/\bkind\b/.test(expr)) return "post";
  return "1";
}

function toText(lit) {
  let body = lit.body;
  if (lit.quote === "`") body = body.replace(/\$\{([\s\S]*?)\}/g, (_, e) => fill(e));
  // Undo the JS escaping the way the runtime would.
  return body.replace(/\\(.)/g, (_, ch) => ({ n: "\n", t: "\t", "`": "`", "'": "'", '"': '"', "\\": "\\" })[ch] ?? "\\" + ch);
}

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const conn = await mysql.createConnection({ uri: url });
  let checked = 0;
  const failures = [];
  for (const file of walk(path.join(ROOT, "src"))) {
    const src = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    for (const lit of literals(src)) {
      const text = toText(lit);
      if (!STATEMENT.test(text) || !/\b(FROM|INTO|SET|VALUES)\b/i.test(text)) continue;
      // Drizzle sql`` fragments and UI strings are not whole statements.
      if (/\b(posts|pages|users|site_settings|revisions|redirects|media|comments|categories|tags|error_log|not_found_log|form_submissions|elements|nav_items|plugins|cms_migrations|post_tags)\b/.test(text) === false) continue;
      checked++;
      try {
        await conn.query("PREPARE bms_check FROM ?", [text]);
      } catch (err) {
        failures.push(`${path.relative(ROOT, file)}:${lit.line}  ${err.message}\n      ${text.replace(/\s+/g, " ").slice(0, 160)}`);
      }
    }
  }
  await conn.end();
  console.log(`prepared ${checked} statements, ${failures.length} failed`);
  for (const f of failures) console.log("FAIL", f);
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
