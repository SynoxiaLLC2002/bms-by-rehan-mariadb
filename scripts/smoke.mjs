#!/usr/bin/env node
//
// Boots the production build and checks that the site actually works.
//
//   npm run build && npm run check
//
// It starts `server.js` on a spare port, requests the routes a visitor, a
// crawler and an administrator would hit, and checks not just the status
// codes but the things that fail silently: the canonical tag, the security
// headers, the stylesheet's cache header, the sitemap being a sitemap. Then
// it stops the server. Any failure exits non-zero, so this can sit in front
// of `npm run pack` and refuse to package a broken build.
//
// It uses the same .env.local the server would, so it also proves the
// database is reachable from here.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env.local"), quiet: true });
config({ path: join(root, ".env"), quiet: true });

const distDir = process.env.BUILD_DIR || ".next";
if (!existsSync(join(root, distDir, "BUILD_ID"))) {
  console.error(`\n  No production build in ${distDir}/. Run \`npm run build\` first.\n`);
  process.exit(1);
}

const PORT = Number(process.env.SMOKE_PORT || 3999);
const BASE = `http://localhost:${PORT}`;
const UA = "Mozilla/5.0 (compatible; BMS-Smoke/1.0)";

const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), NEXTAUTH_URL: process.env.NEXTAUTH_URL || BASE },
  stdio: ["ignore", "ignore", "pipe"],
});
let stderr = "";
server.stderr.on("data", (d) => (stderr += d.toString()));

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    if (server.exitCode !== null) throw new Error(`server exited early:\n${stderr}`);
    try {
      const res = await fetch(`${BASE}/robots.txt`, { headers: { "user-agent": UA } });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not start within 60s:\n${stderr}`);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
}

async function get(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", headers: { "user-agent": UA, ...(opts.headers || {}) } });
  const text = opts.text === false ? "" : await res.text();
  return { status: res.status, headers: res.headers, text };
}

try {
  await waitForServer();

  // ── Public pages ─────────────────────────────────────────────────────────
  const home = await get("/");
  check("home page responds", home.status === 200, `status ${home.status}`);
  check("home has <html lang>", /<html[^>]+lang="/.test(home.text));
  check("home has a canonical tag", /<link rel="canonical"/.test(home.text));
  // The site CSS arrives one of two ways, and both are correct.
  //
  // With `experimental.inlineCss` on — the default since 1.9.13 — Next inlines
  // the stylesheet into `<style>` and there is no `<link rel="stylesheet">` at
  // all. This check only looked for the link, so it failed on every build for
  // which inlining was working as intended, which is worse than not checking:
  // a gate that always fails is a gate everyone learns to skip past.
  //
  // What actually matters is that the page carries the site's CSS somehow, so
  // accept either the link or a `/site/*.css` reference, and require some real
  // inline CSS when it is inlined rather than an empty `<style>`.
  const cssHref = home.text.match(/<link rel="stylesheet" href="(\/site\/[^"]+)"/)?.[1];
  const cssRef = home.text.match(/\/site\/[a-z0-9-]+\.css/i)?.[0];
  const inlineCss = (home.text.match(/<style[^>]*>([\s\S]{200,}?)<\/style>/) ?? [])[1];
  check(
    "home carries the site stylesheet",
    !!(cssHref || cssRef || inlineCss),
    cssHref ?? cssRef ?? (inlineCss ? `inlined (${inlineCss.length} chars)` : "no linked or inlined site CSS")
  );
  check("home has one <h1>", (home.text.match(/<h1[\s>]/g) || []).length === 1);
  check("home has JSON-LD", /application\/ld\+json/.test(home.text));
  for (const h of ["x-content-type-options", "referrer-policy", "x-frame-options", "content-security-policy"]) {
    check(`header ${h}`, home.headers.has(h), home.headers.get(h) ?? "missing");
  }
  check("no X-Powered-By", !home.headers.has("x-powered-by"));

  if (cssHref) {
    const css = await get(cssHref);
    check("site stylesheet serves", css.status === 200 && (css.headers.get("content-type") || "").includes("text/css"));
    check("site stylesheet is immutable", /immutable/.test(css.headers.get("cache-control") || ""), css.headers.get("cache-control") ?? "");
  }

  // There is no fixed listing URL any more (1.9.9: WordPress-default URLs, and
  // /blog is a category slug on some sites). The default category exists on
  // every site, so its archive is the one archive that can be asked for; it
  // may be empty (404) on a fresh install, it must never error.
  const archive = await get("/category/uncategorized");
  // A site moved from WordPress may answer this old address with its own
  // 301 or 410 rule (Admin → SEO → Redirects); that is an answer, not an error.
  check("category archive does not error", [200, 301, 404, 410].includes(archive.status), `status ${archive.status}`);

  const missing = await get("/this-page-does-not-exist-" + Date.now());
  check("unknown page is a 404", missing.status === 404, `status ${missing.status}`);

  // ── Crawlers ─────────────────────────────────────────────────────────────
  const robots = await get("/robots.txt");
  check("robots.txt lists the sitemap", robots.status === 200 && /Sitemap:/i.test(robots.text));
  // /sitemap_index.xml is the RankMath-style index (1.9.8); the children are
  // urlsets. /sitemap.xml is a permanent redirect to it (1.9.60).
  const legacy = await get("/sitemap.xml");
  check("sitemap.xml redirects to the index", legacy.status === 301 && /\/sitemap_index\.xml$/.test(legacy.headers.get("location") || ""), `status ${legacy.status}`);
  const sitemap = await get("/sitemap_index.xml");
  check("sitemap is a sitemap index", sitemap.status === 200 && /<sitemapindex/.test(sitemap.text));
  check("sitemap URLs are absolute", !/<loc>\//.test(sitemap.text));
  const pageMap = await get("/page-sitemap.xml");
  check("page sitemap is a urlset", pageMap.status === 200 && /<urlset/.test(pageMap.text), `status ${pageMap.status}`);
  const feed = await get("/feed.xml");
  check("feed responds", feed.status === 200 && /<rss|<feed/.test(feed.text));

  // ── Admin and API gates ───────────────────────────────────────────────────
  const login = await get("/admin/login");
  check("login page responds", login.status === 200, `status ${login.status}`);
  const admin = await get("/admin");
  check("admin redirects when signed out", admin.status >= 300 && admin.status < 400, `status ${admin.status}`);
  const api = await get("/api/settings");
  check("settings API refuses when signed out", api.status === 401, `status ${api.status}`);
  // 200 on a fresh install; a redirect to login once an administrator exists.
  const setup = await get("/admin/setup");
  check("setup page responds or is closed", setup.status === 200 || (setup.status >= 300 && setup.status < 400), `status ${setup.status}`);
} catch (err) {
  check("server", false, err instanceof Error ? err.message : String(err));
} finally {
  server.kill();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`  ${r.ok ? "ok  " : "FAIL"}  ${r.name}${r.detail && !r.ok ? `  — ${r.detail}` : ""}`);
}
console.log(`\n  ${results.length - failed.length}/${results.length} checks passed${failed.length ? ` — ${failed.length} FAILED` : ""}\n`);
process.exit(failed.length ? 1 : 0);
