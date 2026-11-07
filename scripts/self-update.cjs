// One-click updates from the published releases (2026-10-22).
//
// A release is three files on GitHub Releases: the upload zip, manifest.json
// (version, the zip's SHA-256, the package-lock hash, notes) and manifest.sig,
// an Ed25519 signature of manifest.json made with a key that only exists on
// the maintainer's PC. A site installs nothing whose manifest does not verify
// against PUBLIC_KEY below, so a stolen GitHub account cannot push code to
// every site; it can only publish files that every site refuses.
//
// Applying swaps the program files in place, keeping what the swap replaced in
// .bms/update/previous so "Roll back" (or server.js, when the new version
// fails to start twice) can put it back. Never touched: uploads, plugins,
// fonts, backups, .env*, .bms, node_modules, logs — the zip does not carry
// them, and anything under those names is skipped if it ever does.
//
// Plain CommonJS so server.js can require it before Next loads (it must work
// when the new build is broken). Required by server.js only; the API reaches
// it through globalThis.__bmsUpdate.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// The maintainer's release key (public half). The private half never leaves the maintainer's PC.
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAvLrcmkAdsBcmnmjxl7OztICVvqCne2FBvGNSvyzSu8I=
-----END PUBLIC KEY-----`;

// Where releases are published. BMS_UPDATE_URL overrides it (tests, mirrors).
const RELEASES = "https://github.com/ESxREHAN032002/bms-releases/releases/latest/download";

const KEEP = /^(?:public\/uploads|plugins|fonts|backups|node_modules|\.bms|\.env[^/]*|startup\.log|stderr\.log|tmp)(?:\/|$)/;

const baseUrl = () => (process.env.BMS_UPDATE_URL || RELEASES).replace(/\/+$/, "");
const dir = (root, ...p) => path.join(root, ".bms", "update", ...p);
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function parse(v) {
  return String(v || "").replace(/^v/i, "").split(/[.-]/).map((n) => parseInt(n, 10)).filter(Number.isFinite);
}
function isNewer(a, b) {
  const x = parse(a), y = parse(b);
  if (!x.length || !y.length) return false;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

async function get(url, max = 200 << 20) {
  const res = await fetch(url, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`${url.split("/").pop()}: the release server answered ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > max) throw new Error("The download is larger than expected.");
  return buf;
}

/** The manifest, verified. Throws if the signature does not match the release key. */
async function signedManifest() {
  const raw = await get(`${baseUrl()}/manifest.json`, 1 << 20);
  const sig = Buffer.from((await get(`${baseUrl()}/manifest.sig`, 4096)).toString("utf8").trim(), "base64");
  let ok = false;
  try {
    ok = crypto.verify(null, raw, PUBLIC_KEY, sig);
  } catch {
    ok = false;
  }
  if (!ok) throw new Error("The release is not signed with the BMS release key. Nothing was installed.");
  return JSON.parse(raw.toString("utf8"));
}

const lockHash = (root) => {
  try {
    return sha256(fs.readFileSync(path.join(root, "package-lock.json")));
  } catch {
    return "";
  }
};

/** What an update to the published release would involve, without changing anything. */
async function plan(root, current) {
  const m = await signedManifest();
  return {
    version: String(m.version),
    newer: isNewer(m.version, current),
    // Older than the release's minimum (e.g. 1.9 → 2.0, a database change): by hand.
    tooOld: !!m.min && isNewer(m.min, current),
    // New packages: needs cPanel's "Run NPM Install", which the app cannot do itself.
    needsNpm: !!m.deps && m.deps !== lockHash(root),
    manifest: m,
  };
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

/** Moves each top-level entry of `from` into `root`, saving what it replaces in `saveTo`. */
function swapIn(root, from, saveTo) {
  for (const name of fs.readdirSync(from)) {
    // `public` holds the uploads: swap its children, never the folder itself.
    if (name === "public" && fs.statSync(path.join(from, name)).isDirectory()) {
      fs.mkdirSync(path.join(root, "public"), { recursive: true });
      fs.mkdirSync(path.join(saveTo, "public"), { recursive: true });
      for (const child of fs.readdirSync(path.join(from, "public"))) {
        if (KEEP.test(`public/${child}`)) continue;
        move(path.join(root, "public", child), path.join(saveTo, "public", child));
        move(path.join(from, "public", child), path.join(root, "public", child));
      }
      continue;
    }
    if (KEEP.test(name)) continue;
    move(path.join(root, name), path.join(saveTo, name));
    move(path.join(from, name), path.join(root, name));
  }
}
function move(a, b) {
  if (!fs.existsSync(a)) return;
  rmrf(b);
  fs.renameSync(a, b);
}

/** Downloads, verifies, unpacks and swaps in the published release. The caller restarts. */
async function apply(root, current, log = () => {}) {
  const p = await plan(root, current);
  if (!p.newer) throw new Error(`This site already runs ${current}.`);
  if (p.tooOld) throw new Error(`Version ${p.version} needs at least ${p.manifest.min}. Update by hand with the release zip.`);
  if (p.needsNpm) throw new Error(`Version ${p.version} adds new packages, so it needs cPanel's "Run NPM Install". Update by hand with the release zip.`);

  const m = p.manifest;
  const zipName = path.basename(String(m.zip || ""));
  const zip = await get(`${baseUrl()}/${zipName}`);
  if (sha256(zip) !== m.sha256) throw new Error("The downloaded zip does not match the signed release. Nothing was installed.");

  const JSZip = require("jszip");
  const archive = await JSZip.loadAsync(zip);
  const staging = dir(root, "new");
  rmrf(staging);
  fs.mkdirSync(staging, { recursive: true });
  for (const entry of Object.values(archive.files)) {
    const name = entry.name.replace(/\\/g, "/");
    if (name.startsWith("/") || name.split("/").includes("..")) throw new Error(`Unsafe path in the release: ${name}`);
    if (KEEP.test(name)) continue;
    const target = path.join(staging, name);
    if (entry.dir) fs.mkdirSync(target, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, await entry.async("nodebuffer"));
    }
  }
  if (!fs.existsSync(path.join(staging, ".next", "BUILD_ID")) || !fs.existsSync(path.join(staging, "server.js"))) {
    throw new Error("The release zip has no built site in it. Nothing was installed.");
  }

  const previous = dir(root, "previous");
  rmrf(previous);
  fs.mkdirSync(previous, { recursive: true });
  swapIn(root, staging, previous);
  rmrf(staging);
  fs.writeFileSync(dir(root, "state.json"), JSON.stringify({ from: current, to: p.version, at: new Date().toISOString(), failures: 0 }));
  log(`update: ${current} -> ${p.version} installed; restarting`);
  return p.version;
}

/** Puts back the program files the last update replaced. The caller restarts. */
function rollback(root, log = () => {}) {
  const previous = dir(root, "previous");
  if (!fs.existsSync(previous)) throw new Error("There is no earlier version to go back to.");
  const discard = dir(root, "discarded");
  rmrf(discard);
  fs.mkdirSync(discard, { recursive: true });
  swapIn(root, previous, discard);
  rmrf(previous);
  rmrf(discard);
  const state = readState(root);
  rmrf(dir(root, "state.json"));
  log(`update: rolled back${state ? ` from ${state.to} to ${state.from}` : ""}`);
}

function readState(root) {
  try {
    return JSON.parse(fs.readFileSync(dir(root, "state.json"), "utf8"));
  } catch {
    return null;
  }
}

// ── Called by server.js ─────────────────────────────────────────────────────
// A freshly installed version that fails to start twice in a row is rolled
// back before Next loads; one that reaches "ready" is kept.
function beforeStart(root, log) {
  const s = readState(root);
  if (s && !s.ok && s.failures >= 2 && fs.existsSync(dir(root, "previous"))) {
    log(`update: ${s.to} failed to start twice, going back to ${s.from}`);
    rollback(root, log);
  }
}
function started(root) {
  const s = readState(root);
  if (s && !s.ok) fs.writeFileSync(dir(root, "state.json"), JSON.stringify({ ...s, ok: true }));
}
function failedToStart(root) {
  const s = readState(root);
  if (s && !s.ok) fs.writeFileSync(dir(root, "state.json"), JSON.stringify({ ...s, failures: (s.failures || 0) + 1 }));
}
const canRollback = (root) => fs.existsSync(dir(root, "previous"));

module.exports = { plan, apply, rollback, beforeStart, started, failedToStart, canRollback, isNewer, PUBLIC_KEY_SET: !PUBLIC_KEY.includes("REPLACE_") };
