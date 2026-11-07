// BMS 2.0: drives a running dev server (on a FRESH MariaDB database) through
// the paths that touch the converted SQL — setup, writes, public pages, search,
// sitemap, redirects, comments, settings, Site Health, the cron.
//   node --env-file=.env.local --import tsx scripts/check-e2e.mts http://localhost:3005
import assert from "node:assert/strict";
import { encode } from "next-auth/jwt";
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from "otplib";

const BASE = process.argv[2] ?? "http://localhost:3005";
const ORIGIN = { Origin: BASE, "Content-Type": "application/json" };
let cookie = "";
let failed = 0;

async function req(path: string, init: RequestInit = {}) {
  const res = await fetch(BASE + path, { redirect: "manual", ...init, headers: { ...ORIGIN, ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) } });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, text, json: json as Record<string, any>, location: res.headers.get("location") };
}
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log("ok   ", name); } catch (err) { failed++; console.log("FAIL ", name, "—", (err as Error).message.slice(0, 400)); }
}

const email = "owner@example.test";
const password = "Correct-Horse-Battery-77";
let userId = "";

await check("first-run setup with two-factor creates the admin", async () => {
  const start = await req("/api/setup", { method: "POST", body: JSON.stringify({ name: "Owner", email, password, action: "2fa" }) });
  assert.equal(start.status, 200, start.text);
  const totp = new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });
  const code = await totp.generate({ secret: start.json.secret });
  const done = await req("/api/setup", { method: "POST", body: JSON.stringify({ name: "Owner", email, password, totpSecret: start.json.secret, code }) });
  assert.equal(done.status, 201, done.text);
  userId = done.json.userId;
  assert.ok(userId);
});
await check("a second setup is refused", async () => {
  const again = await req("/api/setup", { method: "POST", body: JSON.stringify({ name: "X", email: "x@example.test", password, action: "2fa" }) });
  assert.equal(again.status, 400);
});

// Sign in as that admin (lib/auth.ts session shape; pvc = checked just now).
const secret = process.env.AUTH_SECRET!;
const salt = "authjs.session-token";
const jwt = await encode({ token: { sub: userId, email, name: "Owner", role: "admin", pvc: Date.now(), si: Date.now() }, secret, salt });
cookie = `${salt}=${jwt}`;

let catId = 0, postId = 0;
const word = "kryształowy";
await check("create a category", async () => {
  const r = await req("/api/categories", { method: "POST", body: JSON.stringify({ name: "Poradniki", slug: "poradniki" }) });
  assert.equal(r.status, 201, r.text);
  catId = r.json.category?.id;
  assert.ok(catId, r.text);
});
await check("create and publish a post with tags", async () => {
  const content = [{ id: "b1", type: "paragraph", props: {}, content: [{ type: "text", text: `Launcher ${word} działa świetnie na Windows i Linux.`, styles: {} }], children: [] }];
  const r = await req("/api/posts", { method: "POST", body: JSON.stringify({ title: "Pierwszy wpis", slug: "pierwszy-wpis", content, status: "published", categoryId: catId, tags: ["Mody", "Pobierz"] }) });
  assert.equal(r.status, 201, r.text);
  postId = r.json.post?.id;
  assert.ok(postId, r.text);
  assert.equal(r.json.post.status, "published");
});
await check("the post page is live", async () => {
  const r = await req("/pierwszy-wpis");
  assert.equal(r.status, 200, String(r.status));
  assert.ok(r.text.includes("Pierwszy wpis"));
});
await check("search finds it by a body word with Polish letters", async () => {
  const r = await req(`/search?q=${encodeURIComponent(word)}`);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("Pierwszy wpis"), "not in results");
});
await check("the post sitemap lists it", async () => {
  const r = await req("/post-sitemap.xml");
  assert.ok(r.text.includes("pierwszy-wpis"), r.text.slice(0, 200));
});
await check("renaming the slug keeps the old address answering (301)", async () => {
  const r = await req(`/api/posts/${postId}`, { method: "PATCH", body: JSON.stringify({ slug: "pierwszy-wpis-nowy" }) });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.post?.slug, "pierwszy-wpis-nowy", r.text.slice(0, 200));
  const old = await req("/pierwszy-wpis");
  assert.equal(old.status, 301, `old address answered ${old.status}`);
  assert.ok(old.location?.endsWith("/pierwszy-wpis-nowy"), String(old.location));
});
await check("a visitor comment arrives pending, then is approved", async () => {
  cookie = "";
  const c = await req("/api/comments", { method: "POST", body: JSON.stringify({ postId, authorName: "Gość", authorEmail: "gosc@example.test", content: "Dzięki za poradnik!" }) });
  cookie = `${salt}=${jwt}`;
  assert.ok([200, 201].includes(c.status), c.text);
  const id = c.json.comment?.id ?? c.json.id;
  assert.ok(id, c.text);
  const ok = await req(`/api/comments/${id}`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.comment?.status, "approved", ok.text.slice(0, 200));
});
await check("settings save (bulk upsert) and read back", async () => {
  const r = await req("/api/settings", { method: "POST", body: JSON.stringify({ site_name: "Test 2.0", site_description: "MariaDB" }) });
  assert.equal(r.status, 200, r.text);
  const g = await req("/api/settings");
  const s = g.json.settings ?? g.json;
  assert.equal(s.site_name, "Test 2.0", g.text.slice(0, 200));
});
await check("a manual redirect (upsert by source) works", async () => {
  const r = await req("/api/redirects", { method: "POST", body: JSON.stringify({ source: "/stary-adres", destination: "/pierwszy-wpis-nowy", type: 301 }) });
  assert.equal(r.status, 201, r.text);
  assert.ok(r.json.redirect?.id, r.text);
  await new Promise((res) => setTimeout(res, 300));
  const hit = await req("/stary-adres");
  assert.equal(hit.status, 301, String(hit.status));
});
await check("Site Health renders (the raw-SQL counters)", async () => {
  const r = await req("/admin/health");
  assert.equal(r.status, 200, String(r.status));
});
await check("the publish cron runs", async () => {
  const r = await req("/api/cron/publish", { headers: { Authorization: `Bearer ${process.env.CRON_TOKEN}` } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.ok, true, r.text);
});
await check("a missing page is a real 404", async () => {
  const r = await req("/nie-ma-takiej-strony");
  assert.equal(r.status, 404);
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
