#!/usr/bin/env node
// Compares what search engines see on two copies of one site — the 1.9.x
// (Postgres) site and the same data on 2.0 (MariaDB) — before a switch-over.
//
//   node scripts/compare-seo.mjs http://old-site http://new-site [max-urls]
//
// Takes every URL from the OLD site's sitemaps, fetches each from both, and
// compares status, <title>, meta description, canonical, robots, hreflang,
// og:/twitter: tags, JSON-LD and the <h1>. The two origins are written as
// ORIGIN before comparing, so copies on different addresses compare equal.
// Exit code 0 only when every page matches.

const [, , OLD, NEW, MAX = "400"] = process.argv;
if (!OLD || !NEW) {
  console.error("usage: node scripts/compare-seo.mjs <old origin> <new origin> [max urls]");
  process.exit(1);
}
const UA = "Mozilla/5.0 (compatible; BMS-Compare/1.0)";

async function get(base, path) {
  const res = await fetch(base + path, { redirect: "manual", headers: { "user-agent": UA } });
  return { status: res.status, location: res.headers.get("location"), text: await res.text() };
}

const all = (re, s) => [...s.matchAll(re)].map((m) => m[1]);
const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) || [])[1] ?? "";

/** The SEO-relevant parts of a page, with its own origin replaced. */
function seo(html, origin) {
  const norm = (s) => s.split(origin).join("ORIGIN").replace(/&amp;/g, "&").trim();
  const head = html.slice(0, html.indexOf("</head>") > 0 ? html.indexOf("</head>") : 200000);
  const metas = all(/(<meta\b[^>]*>)/g, head)
    .filter((m) => /(name|property)="(description|robots|og:[^"]+|twitter:[^"]+|article:[^"]+)"/.test(m))
    .map((m) => `${attr(m, "name") || attr(m, "property")}=${norm(attr(m, "content"))}`)
    .sort();
  const links = all(/(<link\b[^>]*>)/g, head)
    .filter((l) => /rel="(canonical|alternate|prev|next)"/.test(l))
    .map((l) => `${attr(l, "rel")} ${attr(l, "hreflang")} ${norm(attr(l, "href"))}`)
    .sort();
  const jsonld = all(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g, html).map((j) => {
    try { return norm(JSON.stringify(JSON.parse(j))); } catch { return norm(j); }
  }).sort();
  return {
    title: norm((head.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] ?? ""),
    metas, links, jsonld,
    h1: all(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g, html).map((h) => norm(h.replace(/<[^>]+>/g, ""))),
  };
}

async function sitemapUrls(base) {
  const index = await get(base, "/sitemap_index.xml");
  const children = all(/<loc>([^<]+)<\/loc>/g, index.text);
  const urls = new Set(["/"]);
  for (const child of children) {
    const c = await get(base, new URL(child).pathname);
    for (const u of all(/<loc>([^<]+)<\/loc>/g, c.text)) urls.add(new URL(u).pathname);
  }
  return [...urls];
}

const paths = (await sitemapUrls(OLD)).slice(0, Number(MAX));
paths.push("/no-such-page-compare-404");
let differ = 0;
for (const p of paths) {
  const [a, b] = await Promise.all([get(OLD, p), get(NEW, p)]);
  const problems = [];
  if (a.status !== b.status) problems.push(`status ${a.status} vs ${b.status}`);
  if (a.status === 200 && b.status === 200) {
    const x = seo(a.text, OLD), y = seo(b.text, NEW);
    for (const k of Object.keys(x)) {
      const l = JSON.stringify(x[k]), r = JSON.stringify(y[k]);
      if (l !== r) problems.push(`${k}:\n        old ${l.slice(0, 300)}\n        new ${r.slice(0, 300)}`);
    }
  }
  if (problems.length) {
    differ++;
    console.log(`DIFF ${p}\n     ${problems.join("\n     ")}`);
  }
}
console.log(`\n${paths.length} pages compared, ${differ} differ`);
process.exit(differ ? 1 : 0);
