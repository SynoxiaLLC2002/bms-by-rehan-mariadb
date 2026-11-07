// BMS 2.0: rehearses a site launch on a FRESH MariaDB — first-run setup, then
// the site export imported WITH settings, exactly as the owner does it in the
// admin. Then the per-site settings an import deliberately leaves alone.
//   node --env-file=.env.local --import tsx scripts/rehearse-import.mts <base> <export.zip> <site_url>
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { encode } from "next-auth/jwt";
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from "otplib";
import mysql from "mysql2/promise";

const [BASE, ZIP, SITE_URL] = process.argv.slice(2);
const email = "owner@example.test", password = "Correct-Horse-Battery-77";
const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify(body) });

const start = await (await fetch(`${BASE}/api/setup`, json({ name: "Owner", email, password, action: "2fa" }))).json();
const code = await new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() }).generate({ secret: start.secret });
const made = await fetch(`${BASE}/api/setup`, json({ name: "Owner", email, password, totpSecret: start.secret, code }));
const madeBody = await made.text();
assert.equal(made.status, 201, madeBody);
const { userId } = JSON.parse(madeBody);

const conn = await mysql.createConnection(process.env.DATABASE_URL!);
const [[{ password: hash }]] = (await conn.query("SELECT password FROM users WHERE id = ?", [userId])) as unknown as [[{ password: string }]];
const salt = "authjs.session-token";
const cookie = `${salt}=${await encode({ token: { sub: userId, email, name: "Owner", role: "admin", pv: hash.slice(-16), pvc: Date.now(), si: Date.now() }, secret: process.env.AUTH_SECRET!, salt })}`;

const fd = new FormData();
fd.append("file", new Blob([readFileSync(ZIP)], { type: "application/zip" }), "export.zip");
fd.append("settings", "true");
const imp = await fetch(`${BASE}/api/import`, { method: "POST", headers: { Cookie: cookie, Origin: BASE }, body: fd });
const report = await imp.json();
assert.equal(imp.status, 200, JSON.stringify(report).slice(0, 400));
console.log("import:", JSON.stringify(report.report ?? report).slice(0, 900));

const set = await fetch(`${BASE}/api/settings`, { ...json({ site_url: SITE_URL }), headers: { "Content-Type": "application/json", Origin: BASE, Cookie: cookie } });
assert.equal(set.status, 200, await set.text());
const [[counts]] = (await conn.query("SELECT (SELECT COUNT(*) FROM posts) posts, (SELECT COUNT(*) FROM posts WHERE status='published') live, (SELECT COUNT(*) FROM pages) pages, (SELECT COUNT(*) FROM media) media, (SELECT COUNT(*) FROM redirects) redirects")) as unknown as [[Record<string, number>]];
console.log("now in MariaDB:", JSON.stringify(counts));
await conn.end();
