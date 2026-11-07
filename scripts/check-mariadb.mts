// BMS 2.0: proves the MariaDB schema keeps the rules 1.9.x relied on.
// Run against an EMPTY test database (it writes rows and removes them):
//   DATABASE_URL=mysql://… node --experimental-strip-types scripts/check-mariadb.mts
import assert from "node:assert/strict";
import { pool, closePool } from "../src/lib/db/pool.ts";

const p = pool();
const q = async (sql: string, params: unknown[] = []) => (await p.query(sql, params))[0] as Record<string, unknown>[];
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log("ok   ", name);
  } catch (err) {
    failed++;
    console.log("FAIL ", name, "—", (err as Error).message);
  }
}

await check("slugs that differ only by accents or case are different rows", async () => {
  await q("INSERT INTO categories (name, slug, language) VALUES ('a','zolw','pl'),('b','żółw','pl'),('c','Kot','pl'),('d','kot','pl')");
  const rows = await q("SELECT slug FROM categories WHERE language = 'pl' AND slug = 'zolw'");
  assert.equal(rows.length, 1);
});
await check("the same slug twice in one language is refused", async () => {
  await assert.rejects(q("INSERT INTO categories (name, slug, language) VALUES ('e','zolw','pl')"), /Duplicate entry/);
});
await check("search ignores case and Arabic harakat", async () => {
  await q("INSERT INTO posts (title, slug, status, search_text) VALUES ('تحميل مجانًا','t1','published','Crystal Launcher pobierz')");
  const a = await q("SELECT id FROM posts WHERE title = 'تحميل مجانا'");
  const b = await q("SELECT id FROM posts WHERE MATCH(title, excerpt, search_text) AGAINST ('+crystal' IN BOOLEAN MODE)");
  assert.equal(a.length, 1, "harakat");
  assert.equal(b.length, 1, "fulltext");
});
await check("a comment must belong to exactly one post or page", async () => {
  await assert.rejects(q("INSERT INTO comments (author_name, author_email, content) VALUES ('x','x@x','no target')"), /comments_one_target|CONSTRAINT/i);
});
await check("timestamps are written and read as UTC", async () => {
  const before = Date.now();
  await q("INSERT INTO site_settings (`key`, value) VALUES ('tz_probe','1')");
  const [row] = await q("SELECT updated_at FROM site_settings WHERE `key` = 'tz_probe'");
  const at = (row.updated_at as Date).getTime();
  assert.ok(Math.abs(at - before) < 5000, `stored ${new Date(at).toISOString()}, now ${new Date(before).toISOString()}`);
});
await check("a 70 KB block document fits (MariaDB TEXT would stop at 64 KB)", async () => {
  const big = JSON.stringify([{ type: "paragraph", content: "x".repeat(70_000) }]);
  await q("INSERT INTO posts (title, slug, status, content) VALUES ('big','big','draft', ?)", [big]);
  const [row] = await q("SELECT LENGTH(content) AS n FROM posts WHERE slug = 'big'");
  assert.equal(Number(row.n), big.length);
});

await q("DELETE FROM posts");
await q("DELETE FROM categories");
await q("DELETE FROM site_settings WHERE `key` = 'tz_probe'");
await closePool();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
