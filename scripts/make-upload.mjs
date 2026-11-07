#!/usr/bin/env node
//
// Builds `upload.zip` — the files a shared host needs, and nothing else.
//
// Why not just zip the folder: a zip made on Windows carries no Unix
// permissions, and cPanel's extractor then creates directories their own
// owner cannot read. The result is a site that 503s with
// `EACCES: permission denied, scandir .next/static/…` on a build that was
// perfectly good. This writes explicit permissions into every entry
// (directories 755, files 644), so the extracted tree is correct on any host.
//
//   npm run pack          → ./upload.zip
//
// Run it after `npm run build`. It refuses to run without a build, and it
// never includes .env.local, node_modules, or the build cache.

import { createWriteStream, existsSync } from "node:fs";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "upload.zip");

if (!existsSync(join(root, "astro", "dist", "server", "entry.mjs"))) {
  console.error("\n  No Astro build (astro/dist). Run `npm run build` (Node 22.23.4 or newer) first.\n");
  process.exit(1);
}
if (!existsSync(join(root, ".next", "BUILD_ID"))) {
  console.error("\n  No production build found. Run `npm run build` first.\n");
  process.exit(1);
}

// What ships. Directories are walked; files are taken as they are.
const INCLUDE = [
  ".next",
  // The public pages' renderer (src/app/bms-render). Without it pages render with Next, as before.
  "astro/dist",
  "astro/src",
  "astro/shims",
  "astro/adapter",
  "astro/astro.config.mjs",
  "public",
  "src",
  "drizzle-mysql",
  "scripts",
  "server.js",
  "package.json",
  "package-lock.json",
  "next.config.mjs",
  "auth.config.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "tailwind.config.ts",
  "tailwind.site.config.ts",
];

// What never ships, wherever it appears. Only names that cannot also be the
// name of a route: "plugins" used to be here, and it silently dropped the
// compiled Plugins page and /api/plugins from every upload — the admin's
// Plugins screen was a bare 500 on the host while it worked on the PC.
// --release: the zip for scripts/publish-release.mjs, which is public. A site
// runs from .next alone (checked 2026-10-22: pages, admin, API, sitemap with
// no src/), so the source and its configs stay out of it.
const RELEASE = process.argv.includes("--release");
const SOURCE_ONLY = new Set(["src", "astro/src", "astro/shims", "astro/adapter", "astro/astro.config.mjs", "auth.config.ts", "tsconfig.json", "tailwind.config.ts", "tailwind.site.config.ts"]);

const EXCLUDE = new Set([".env.local", ".env", "node_modules", ".git", ".DS_Store", "startup.log", ".bms"]); // .bms = the site's own database address + login secret (lib/autoDatabase)
// Exact paths from the project root. The build cache is most of `.next` by
// size and is not read at runtime; the rest are site data written by the
// running site, which an upload must never overwrite.
// .next/types: build-time type files, which carry the building PC's paths; never read at run time.
const EXCLUDE_PATHS = new Set([join(".next", "cache"), join(".next", "types"), "backups", "plugins", "fonts", join("public", "uploads")]);

// The Next.js version this build was made with. A build only runs on the
// same version: `npm install` on the host picking a newer patch release made
// individual pages crash with a bare 500. server.js and Site Health compare
// against this file and say so.
{
  const { readFileSync, writeFileSync } = await import("node:fs");
  const version = JSON.parse(readFileSync(join(root, "node_modules", "next", "package.json"), "utf8")).version;
  writeFileSync(join(root, ".next", "BMS_NEXT_VERSION"), version);
}

// The app's own version is baked into the build: `src/lib/version.ts` imports
// package.json, so Site Health reports whatever the file said when `next
// build` ran. Bump the version after building and the host runs the new code
// under the old number — which is exactly what happened once, and cost a
// re-upload. Refuse to pack a build older than the package.json it would ship.
{
  const { statSync } = await import("node:fs");
  const built = statSync(join(root, ".next", "BUILD_ID")).mtimeMs;
  const bumped = statSync(join(root, "package.json")).mtimeMs;
  if (bumped > built) {
    console.error(
      "\n  package.json changed after the last build, so the build carries the old version.\n" +
        "  Run `npm run build` again, then pack.\n"
    );
    process.exit(1);
  }
}

// Routes that read the site's settings out of the database must render on the
// host, never at build time.
//
// `/favicon.ico` had no `export const dynamic`, so Next prerendered it and
// wrote `.next/server/app/favicon.ico.body`. The host then served that file
// forever — and its bytes came from whatever database the *build machine*
// talked to, which on a developer PC is the dev database, where no site icon
// is set. Every site shipped the blue placeholder icon, setting a Site Icon in
// the admin changed nothing, and because `/icons/<hash>/…` are dynamic and did
// update, it looked like the icon system half-worked.
//
// The build output says which routes are static (○) and which are dynamic (ƒ),
// but nobody reads it on a good build. A prerendered `.body` next to one of
// these names is the proof, so refuse to package it.
{
  const { existsSync: exists } = await import("node:fs");
  const appDir = join(root, ".next", "server", "app");
  const mustBeDynamic = ["favicon.ico", "robots.txt", "llms.txt", "sitemap.xml", "sitemap_index.xml", "main-sitemap.xsl"];
  const frozen = mustBeDynamic.filter((name) => exists(join(appDir, `${name}.body`)));
  if (frozen.length) {
    console.error(
      `\n  These routes read site settings but were prerendered at build time:\n` +
        frozen.map((f) => `    ${f}`).join("\n") +
        `\n\n  They would ship a snapshot of THIS machine's database and never update\n` +
        `  on the host. Add \`export const dynamic = "force-dynamic";\` to each\n` +
        `  route, rebuild, then pack.\n`
    );
    process.exit(1);
  }
}

const zip = new JSZip();
let files = 0;
let bytes = 0;

async function add(absolute) {
  const rel = relative(root, absolute).split(sep).join("/");
  const name = rel.split("/").pop();
  if (EXCLUDE.has(name)) return;
  if (EXCLUDE_PATHS.has(relative(root, absolute))) return;

  const info = await stat(absolute);
  if (info.isDirectory()) {
    // `zip.folder()` takes no options; adding the directory as an explicit
    // entry is the only way to give it permissions of its own.
    zip.file(`${rel}/`, "", { dir: true, unixPermissions: "755", date: info.mtime });
    for (const entry of await readdir(absolute)) await add(join(absolute, entry));
  } else if (info.isFile()) {
    zip.file(rel, await readFile(absolute), { unixPermissions: "644", date: info.mtime });
    files++;
    bytes += info.size;
  }
}

for (const item of INCLUDE.filter((i) => !(RELEASE && SOURCE_ONLY.has(i)))) {
  const absolute = join(root, item);
  if (!existsSync(absolute)) {
    console.error(`  missing: ${item} — is this the project root?`);
    process.exit(1);
  }
  await add(absolute);
}

await rm(out, { force: true });
await new Promise((resolve, reject) => {
  zip
    .generateNodeStream({
      type: "nodebuffer",
      streamFiles: true,
      platform: "UNIX",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    })
    .pipe(createWriteStream(out))
    .on("finish", resolve)
    .on("error", reject);
});

const size = (await stat(out)).size;
console.log(
  `\n  upload.zip — ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB packed to ${(size / 1024 / 1024).toFixed(1)} MB\n` +
    `  ${out}\n\n` +
    `  Upload it to the app folder on the host, extract it there, then Restart the app.\n`
);
