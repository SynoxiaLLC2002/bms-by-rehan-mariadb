#!/usr/bin/env node
// Builds the public release zip the same clean way every time:
//
//   node scripts/build-release.mjs            → upload.zip, ready for publish-release.mjs
//
// 1. .env* and public/uploads are moved aside, so the build sees no database,
//    no secrets and no site's images (a build's file traces list every file in
//    public/uploads by name — they leaked into the first test release);
// 2. `next build` with DATABASE_URL/AUTH_SECRET unset (nothing is prerendered:
//    lib/prerender BUILD_WITHOUT_DATABASE);
// 3. `npm run pack -- --release` (no source code);
// 4. the zip is scanned for the words in release/private-words.txt (one per
//    line, never shipped, never committed) and for secrets; any hit fails;
// 5. everything moved aside is put back, also when a step fails.

import { existsSync, readdirSync, renameSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import JSZip from "jszip";

const root = process.cwd();
const aside = join(root, ".release-aside");
const moved = [];
function moveAside(rel) {
  const from = join(root, rel);
  if (!existsSync(from)) return;
  const to = join(aside, rel.replace(/[\\/]/g, "__"));
  mkdirSync(aside, { recursive: true });
  renameSync(from, to);
  moved.push([to, from]);
}

let failed = false;
try {
  for (const f of readdirSync(root)) if (/^\.env/.test(f)) moveAside(f);
  moveAside(join("public", "uploads"));

  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.AUTH_SECRET;
  delete env.NEXTAUTH_SECRET;
  delete env._; // bash sets it to the building PC's node.exe path; Vite copies it into astro/dist
  execSync("npm run build", { stdio: "inherit", env });
  execSync("npm run pack -- --release", { stdio: "inherit", env });

  const zip = await JSZip.loadAsync(readFileSync(join(root, "upload.zip")));
  const wordsFile = join(root, "release", "private-words.txt");
  const words = existsSync(wordsFile)
    ? readFileSync(wordsFile, "utf8").split(/\r?\n/).map((w) => w.trim().toLowerCase()).filter((w) => w && !w.startsWith("#"))
    : [];
  const patterns = [/-----begin [a-z ]*private key-----/, /mysql:\/\/(?!user:password@)[a-z0-9_]+:[a-z0-9]{6,}@/i, /public\/uploads\/[^"'\s]+\.\w{2,5}/];
  const hits = [];
  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const text = (await file.async("string")).toLowerCase();
    for (const w of words) if (text.includes(w)) hits.push(`${name}: "${w}"`);
    for (const p of patterns) if (p.test(text)) hits.push(`${name}: ${p}`);
  }
  if (hits.length) {
    console.error(`\nbuild-release: the zip contains private data — not publishable:\n  ${hits.slice(0, 30).join("\n  ")}`);
    failed = true;
  } else {
    console.log(`\nbuild-release: upload.zip is clean (${words.length} private words checked). Next: scripts/publish-release.mjs`);
  }
} catch (e) {
  console.error("build-release:", e.message);
  failed = true;
} finally {
  for (const [to, from] of moved.reverse()) renameSync(to, from);
  rmSync(aside, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
