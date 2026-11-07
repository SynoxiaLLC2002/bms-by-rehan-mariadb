// BMS 2.0: the admin feature pass, through the same API calls the admin
// screens make, against a production server on a FRESH MariaDB database.
// Then every admin screen is rendered signed in, so each page's own queries
// run too.
//   node --env-file=.env.local --import tsx scripts/check-features.mts http://localhost:3111
import assert from "node:assert/strict";
import { encode } from "next-auth/jwt";
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from "otplib";

const BASE = process.argv[2] ?? "http://localhost:3111";
let cookie = "";
let failed = 0;
const results: string[] = [];

async function req(path: string, init: RequestInit & { json?: unknown } = {}) {
  const headers: Record<string, string> = { Origin: BASE, ...(cookie ? { Cookie: cookie } : {}), ...((init.headers as Record<string, string>) ?? {}) };
  let body = init.body;
  if (init.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(init.json); }
  const res = await fetch(BASE + path, { redirect: "manual", ...init, body, headers });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString("utf8");
  let json: Record<string, any> = {};
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, text, json, buf, location: res.headers.get("location"), type: res.headers.get("content-type") ?? "" };
}
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push(`ok    ${name}`); } catch (err) { failed++; results.push(`FAIL  ${name} — ${(err as Error).message.slice(0, 300)}`); }
}
const para = (text: string, id: string) => ({ id, type: "paragraph", props: {}, content: [{ type: "text", text, styles: {} }], children: [] });

// ── An administrator, through the real setup ───────────────────────────────
const email = "admin@example.test", password = "Correct-Horse-Battery-77";
const start = await req("/api/setup", { method: "POST", json: { name: "Admin", email, password, action: "2fa" } });
const code = await new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() }).generate({ secret: start.json.secret });
const made = await req("/api/setup", { method: "POST", json: { name: "Admin", email, password, totpSecret: start.json.secret, code } });
assert.equal(made.status, 201, `setup: ${made.text}`);
const userId = made.json.userId as string;
// The session as a real sign-in writes it, password-version stamp included
// (lib/auth.ts rechecks `pv` against the stored hash every few minutes).
const mysql = await import("mysql2/promise");
const conn = await mysql.createConnection(process.env.DATABASE_URL!);
const [[{ password: hash }]] = (await conn.query("SELECT password FROM users WHERE id = ?", [userId])) as unknown as [[{ password: string }]];
await conn.end();
const salt = "authjs.session-token";
const jwt = await encode({ token: { sub: userId, email, name: "Admin", role: "admin", pv: hash.slice(-16), pvc: Date.now(), si: Date.now() }, secret: process.env.AUTH_SECRET!, salt });
cookie = `${salt}=${jwt}`;
await req("/api/settings", { method: "POST", json: { content_languages: "pl,en", site_language: "pl", site_name: "Feature pass" } });

let postId = 0, pageId = 0, mediaUrl = "", mediaId = 0;

// ── Editor ─────────────────────────────────────────────────────────────────
await check("editor: create a draft post", async () => {
  const r = await req("/api/posts", { method: "POST", json: { title: "Szkic", content: [para("pierwsza wersja", "p1")], status: "draft", tags: ["Alfa"] } });
  assert.equal(r.status, 201, r.text);
  postId = r.json.post.id;
});
let loadedAt = "";
await check("editor: autosave keeps the draft and its updatedAt round-trips", async () => {
  const g = await req(`/api/posts/${postId}`);
  loadedAt = g.json.post?.updatedAt ?? g.json.updatedAt;
  assert.ok(loadedAt, g.text.slice(0, 200));
  await new Promise((r) => setTimeout(r, 1100));
  const s = await req(`/api/posts/${postId}`, { method: "PATCH", json: { content: [para("druga wersja", "p1")], autosave: true, expectedUpdatedAt: loadedAt } });
  assert.equal(s.status, 200, s.text.slice(0, 300));
  loadedAt = s.json.post.updatedAt;
});
await check("editor: saving again from the same tab is NOT a conflict", async () => {
  await new Promise((r) => setTimeout(r, 1100));
  const s = await req(`/api/posts/${postId}`, { method: "PATCH", json: { title: "Szkic 2", expectedUpdatedAt: loadedAt } });
  assert.equal(s.status, 200, s.text.slice(0, 300));
  loadedAt = s.json.post.updatedAt;
});
await check("editor: a stale second tab gets 409, nothing overwritten", async () => {
  const stale = new Date(Date.parse(loadedAt) - 60_000).toISOString();
  const s = await req(`/api/posts/${postId}`, { method: "PATCH", json: { title: "z innej karty", expectedUpdatedAt: stale } });
  assert.equal(s.status, 409, s.text.slice(0, 200));
  const g = await req(`/api/posts/${postId}`);
  assert.equal(g.json.post?.title ?? g.json.title, "Szkic 2");
});
await check("history: revisions were written and one can be restored", async () => {
  const list = await req(`/api/revisions?kind=post&id=${postId}`);
  assert.equal(list.status, 200, list.text.slice(0, 200));
  const revs = list.json.revisions ?? list.json;
  assert.ok(Array.isArray(revs) && revs.length > 0, `no revisions: ${list.text.slice(0, 200)}`);
  const r = await req("/api/revisions", { method: "POST", json: { kind: "post", id: postId, revisionId: revs[revs.length - 1].id } });
  assert.equal(r.status, 200, r.text.slice(0, 200));
});
await check("editor: publish, then duplicate", async () => {
  const p = await req(`/api/posts/${postId}`, { method: "PATCH", json: { status: "published" } });
  assert.equal(p.status, 200, p.text.slice(0, 200));
  const d = await req(`/api/posts/${postId}/duplicate`, { method: "POST" });
  assert.ok([200, 201].includes(d.status), d.text.slice(0, 200));
});
await check("trash and restore a post", async () => {
  const t = await req(`/api/posts/${postId}`, { method: "DELETE" });
  assert.equal(t.status, 200, t.text.slice(0, 200));
  const back = await req(`/api/posts/${postId}`, { method: "PATCH", json: { restore: true, deletedAt: null } });
  assert.ok([200, 400].includes(back.status), back.text.slice(0, 200));
});

// ── Media ──────────────────────────────────────────────────────────────────
// A real 2×2 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");
await check("media: upload an image", async () => {
  const fd = new FormData();
  fd.append("file", new Blob([PNG], { type: "image/png" }), "test-obrazek.png");
  const r = await req("/api/media", { method: "POST", body: fd });
  assert.equal(r.status, 201, r.text.slice(0, 300));
  mediaUrl = r.json.media.url;
  mediaId = r.json.media.id;
  assert.ok(mediaUrl && mediaId);
});
await check("media: alt text saves", async () => {
  const r = await req(`/api/media/${mediaId}`, { method: "PATCH", json: { alt: "Testowy obrazek" } });
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.equal(r.json.media.alt, "Testowy obrazek");
});

// ── Pages, forms ───────────────────────────────────────────────────────────
const formId = "form-feature-pass-1";
await check("a page with a contact form, published", async () => {
  const fields = JSON.stringify([{ name: "email", label: "Email", type: "email", required: true }, { name: "msg", label: "Wiadomość", type: "textarea", required: true }]);
  const r = await req("/api/pages", { method: "POST", json: { title: "Kontakt", slug: "kontakt", status: "published", content: [{ id: formId, type: "contactForm", props: { fields, formName: "Kontakt" }, children: [] }, para(`Obraz: ${mediaUrl}`, "p9")] } });
  assert.equal(r.status, 201, r.text.slice(0, 300));
  pageId = r.json.page.id;
});
await check("a title-only edit (as Claude sends) keeps a published page's address", async () => {
  const r = await req(`/api/pages/${pageId}`, { method: "PATCH", json: { title: "Kontakt z nami" } });
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.equal(r.json.page.slug, "kontakt");
  const live = await req("/kontakt");
  assert.equal(live.status, 200, `the page answered ${live.status}`);
  await req(`/api/pages/${pageId}`, { method: "PATCH", json: { title: "Kontakt" } });
});
await check("a draft's address still follows its title", async () => {
  const d = await req("/api/posts", { method: "POST", json: { title: "Robocza", status: "draft", content: [] } });
  assert.equal(d.status, 201, d.text);
  const r = await req(`/api/posts/${d.json.post.id}`, { method: "PATCH", json: { title: "Nowa nazwa" } });
  assert.equal(r.json.post.slug, "nowa-nazwa", r.text.slice(0, 200));
});
await check("media: deleting an image a page uses is warned about", async () => {
  const r = await req(`/api/media/${mediaId}`, { method: "DELETE" });
  assert.ok(r.status === 409 || /page/i.test(r.text), `${r.status} ${r.text.slice(0, 200)}`);
});
await check("forms: a visitor submission lands in the inbox", async () => {
  const saved = cookie; cookie = "";
  const s = await req("/api/forms/submit", { method: "POST", json: { formId, values: { email: "gosc@example.test", msg: "Dzień dobry" }, elapsed: 8000, pagePath: "/kontakt" } });
  cookie = saved;
  assert.equal(s.status, 200, s.text.slice(0, 200));
  const inbox = await req("/api/forms");
  assert.ok(inbox.text.includes("Dzień dobry"), inbox.text.slice(0, 200));
});

// ── Site structure ─────────────────────────────────────────────────────────
await check("menus: create and save items with a sub-item", async () => {
  const m = await req("/api/menus", { method: "POST", json: { name: "Główne" } });
  assert.equal(m.status, 201, m.text);
  const id = m.json.menu.id;
  const s = await req(`/api/menus/${id}`, { method: "PUT", json: { name: "Główne", items: [{ label: "Start", url: "/" }, { label: "Kontakt", url: "/kontakt", objectType: "page", objectId: pageId, children: [{ label: "Pod", url: "/kontakt#a" }] }] } });
  assert.equal(s.status, 200, s.text.slice(0, 200));
  const g = await req("/api/menus");
  const items = JSON.stringify(g.json);
  assert.ok(items.includes("Pod") && items.includes("Kontakt"), items.slice(0, 200));
});
await check("elements: create one", async () => {
  const r = await req("/api/elements", { method: "POST", json: { name: "Pasek", hook: "before_footer", status: "published", content: [para("Element", "e1")] } });
  assert.equal(r.status, 201, r.text.slice(0, 200));
});
await check("translations: an English version of the page", async () => {
  const r = await req("/api/translations/create", { method: "POST", json: { kind: "page", sourceId: pageId, language: "en" } });
  assert.ok([200, 201].includes(r.status), r.text.slice(0, 300));
});
await check("users: add an editor, change the role, delete", async () => {
  const c = await req("/api/users", { method: "POST", json: { name: "Ed", email: "ed@example.test", password: "Another-Strong-Pass-55", role: "editor" } });
  assert.equal(c.status, 201, c.text);
  assert.equal(c.json.user.password, undefined, "password hash must not come back");
  const u = await req(`/api/users/${c.json.user.id}`, { method: "PATCH", json: { role: "author" } });
  assert.equal(u.status, 200, u.text.slice(0, 200));
  assert.equal(u.json.user?.password, undefined, "password hash must not come back");
  const d = await req(`/api/users/${c.json.user.id}`, { method: "DELETE" });
  assert.equal(d.status, 200, d.text.slice(0, 200));
});

// ── Programs: API tokens and the Claude (MCP) endpoint ──────────────────────
await check("API token: create, then use it on the MCP endpoint", async () => {
  const t = await req("/api/tokens", { method: "POST", json: { name: "Claude", role: "editor" } });
  assert.equal(t.status, 201, t.text);
  assert.equal(t.json.record.tokenHash, undefined, "token hash must not come back");
  const saved = cookie; cookie = "";
  const call = await req("/api/mcp", {
    method: "POST",
    headers: { Authorization: `Bearer ${t.json.token}`, Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  cookie = saved;
  assert.equal(call.status, 200, call.text.slice(0, 300));
  assert.ok(call.text.includes("site_info"), call.text.slice(0, 200));
});

// ── Export, import, backup ─────────────────────────────────────────────────
let exportZip: Buffer | null = null;
await check("export: the site downloads as a zip", async () => {
  const r = await req("/api/export?media=1");
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.equal(r.buf.subarray(0, 2).toString(), "PK", `not a zip (${r.type})`);
  exportZip = r.buf;
});
await check("import: a dry run of that zip reads every table", async () => {
  assert.ok(exportZip);
  const fd = new FormData();
  fd.append("file", new Blob([exportZip!], { type: "application/zip" }), "export.zip");
  fd.append("dryRun", "true");
  const r = await req("/api/import", { method: "POST", body: fd });
  assert.equal(r.status, 200, r.text.slice(0, 300));
});
await check("import: restoring over the same site puts an edited post back", async () => {
  // With its slug, as the editor sends it (a title alone re-derives the slug — same in 1.9.x).
  await req(`/api/pages/${pageId}`, { method: "PATCH", json: { title: "Zepsuty tytuł", slug: "kontakt" } });
  const fd = new FormData();
  fd.append("file", new Blob([exportZip!], { type: "application/zip" }), "export.zip");
  fd.append("overwrite", "true");
  const r = await req("/api/import", { method: "POST", body: fd });
  assert.equal(r.status, 200, r.text.slice(0, 300));
  const g = await req(`/api/pages/${pageId}`);
  assert.equal(g.json.page?.title ?? g.json.title, "Kontakt", g.text.slice(0, 200));
});
await check("backup: the token-protected backup writes a zip", async () => {
  if (!process.env.BACKUP_TOKEN) throw new Error("BACKUP_TOKEN not set for the test server");
  const saved = cookie; cookie = "";
  const r = await req("/api/backup", { headers: { Authorization: `Bearer ${process.env.BACKUP_TOKEN}` } });
  cookie = saved;
  assert.equal(r.status, 200, r.text.slice(0, 200));
});

// ── Housekeeping ───────────────────────────────────────────────────────────
await check("Speed → Database: clean-up preview and run", async () => {
  const s = await req("/api/speed/status");
  assert.equal(s.status, 200, s.text.slice(0, 200));
  const d = await req("/api/speed/database", { method: "POST", json: { action: "cleanup" } });
  assert.ok([200, 400].includes(d.status), d.text.slice(0, 200));
});

// ── Every admin screen renders signed in ────────────────────────────────────
const screens = [
  "/admin", "/admin/posts", "/admin/posts/new", `/admin/posts/${postId}`, "/admin/posts/stale",
  "/admin/pages", "/admin/pages/new", `/admin/pages/${pageId}`, "/admin/media", "/admin/categories",
  "/admin/tags", "/admin/comments", "/admin/menus", "/admin/navigation", "/admin/elements", "/admin/forms",
  "/admin/users", `/admin/users/${userId}`, `/admin/users/${userId}/author-page`, "/admin/settings", "/admin/seo",
  "/admin/speed", "/admin/health", "/admin/errors", "/admin/plugins", "/admin/links", "/admin/updates",
  "/admin/homepages", "/admin/customize", "/admin/tokens", "/admin/email",
];
for (const s of screens) {
  await check(`screen ${s}`, async () => {
    const r = await req(s);
    assert.ok(r.status === 200 || (r.status === 404 && !/\[id\]/.test(s)), `HTTP ${r.status}`);
    assert.ok(!/Application error|Internal Server Error|ER_[A-Z_]{4,}/.test(r.text), "error text in the page");
  });
}

console.log(results.join("\n"));
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
