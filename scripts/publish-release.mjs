#!/usr/bin/env node
// Publishes a BMS release for one-click updates (scripts/self-update.cjs).
//
//   node scripts/publish-release.mjs --zip upload.zip --notes notes.txt [--min 2.0.0] [--critical] [--dry]
//
// Needs BMS_RELEASE_KEY (path to the private Ed25519 key) and BMS_RELEASE_REPO
// (owner/name on GitHub), and the GitHub CLI logged in (`gh auth login`).
// The zip must be packed with `npm run pack -- --release` (no source code: the
// release is public) and built WITHOUT a database (no DATABASE_URL at build time):
// a build bakes the build database's pages into .next, and a release is
// installed on every site.
//
// Writes release/out/<version>/{bms-<version>.zip, manifest.json, manifest.sig},
// then creates the GitHub release v<version> with those three files. --dry
// stops before uploading.

import { createHash, createPrivateKey, sign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name) => args.includes(`--${name}`);
const die = (msg) => {
  console.error(`publish-release: ${msg}`);
  process.exit(1);
};

const zipPath = resolve(opt("zip") ?? "upload.zip");
const notesPath = opt("notes");
const keyPath = process.env.BMS_RELEASE_KEY;
const repo = process.env.BMS_RELEASE_REPO;
if (!keyPath) die("set BMS_RELEASE_KEY to the private key file");
if (!repo && !flag("dry")) die("set BMS_RELEASE_REPO to owner/name");
if (!notesPath) die("--notes <file> is required: one line per change");

const zipBuf = readFileSync(zipPath);
const zip = await JSZip.loadAsync(zipBuf);
const pkg = JSON.parse(await zip.file("package.json")?.async("string") ?? "{}");
const lock = await zip.file("package-lock.json")?.async("nodebuffer");
if (!pkg.version) die("the zip has no package.json version");
if (!lock) die("the zip has no package-lock.json");
if (!zip.file(".next/BUILD_ID") || !zip.file("server.js")) die("the zip has no built site in it");
if (Object.keys(zip.files).some((n) => n.startsWith("src/"))) die("the zip contains the source code: pack it with `npm run pack -- --release`");
if (zip.file(".env.local") || zip.file(".env") || Object.keys(zip.files).some((n) => n.startsWith(".bms/"))) die("the zip contains secrets (.env / .bms)");

const version = pkg.version;
const name = `bms-${version}.zip`;
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const manifest = {
  version,
  released: new Date().toISOString().slice(0, 10),
  notes: readFileSync(notesPath, "utf8").split(/\r?\n/).map((l) => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean),
  critical: flag("critical"),
  zip: name,
  sha256: sha256(zipBuf),
  size: zipBuf.length,
  deps: sha256(lock),
  ...(opt("min") ? { min: opt("min") } : {}),
};

const body = Buffer.from(JSON.stringify(manifest, null, 2));
const sig = sign(null, body, createPrivateKey(readFileSync(keyPath))).toString("base64");

const out = resolve("release", "out", version);
mkdirSync(out, { recursive: true });
copyFileSync(zipPath, join(out, name));
writeFileSync(join(out, "manifest.json"), body);
writeFileSync(join(out, "manifest.sig"), sig + "\n");
writeFileSync(join(out, "notes.md"), manifest.notes.map((n) => `- ${n}`).join("\n") + "\n");
console.log(`release ${version}: ${out}`);
console.log(`  ${name}  ${(zipBuf.length / 1048576).toFixed(2)} MB  sha256 ${manifest.sha256.slice(0, 16)}…`);

if (flag("dry")) {
  console.log("--dry: nothing uploaded");
  process.exit(0);
}
execFileSync("gh", [
  "release", "create", `v${version}`,
  join(out, name), join(out, "manifest.json"), join(out, "manifest.sig"),
  "--repo", repo, "--title", `BMS ${version}`, "--notes-file", join(out, "notes.md"), "--latest",
], { stdio: "inherit" });
console.log(`published: https://github.com/${repo}/releases/tag/v${version}`);
