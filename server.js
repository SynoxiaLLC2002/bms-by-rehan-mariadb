// Startup file for hosts that launch a Node app themselves.
//
// cPanel's "Setup Node.js App" (Phusion Passenger / LiteSpeed), Plesk's Node
// manager and similar all want one file they can require and expect it to
// listen. `next start` is a CLI command, not a module, so this is the same
// thing written as one: build the app, wrap its request handler in a plain
// HTTP server, listen.
//
// On a VPS with pm2 or systemd, `npm run start` does the same job and this
// file is not needed — but it works there too, so `pm2 start server.js` is
// fine if that is what your process manager already does.
//
// Under Passenger the port below is nominal: Passenger intercepts `listen()`
// and attaches the app to its own socket regardless of the number. It still
// has to be a real number, because Next uses it to build the origin it
// compares middleware rewrites against.

// Shared hosts (CloudLinux) count every THREAD against the account's process
// limit — 200 on the usual plan, shared by every site and by cPanel itself.
// libvips (sharp, the image optimiser) starts a thread per CPU core of the
// server, and libuv four more, so a few Node sites filled the limit and
// nothing could start, not even cPanel. Set before anything spins up a pool.
process.env.UV_THREADPOOL_SIZE ||= "2";
process.env.VIPS_CONCURRENCY ||= "1";

const fs = require("fs");
const path = require("path");

// One file, one module. Under LiteSpeed 6.3.7's launcher (lsnode.js, installed
// on the host 2026-10-20) Next was loaded under two names at once — through
// the app's `node_modules` link and through its real place in nodevenv — so
// it had two copies of its request store: route handlers ran inside one and
// `headers()` read the other ("`headers` was called outside a request scope"),
// and every signed-in API call failed with 500 on all sites. Plain Node on the
// same host resolved both to one path; the launcher's start does not. Every
// resolved file is therefore reduced to its real path here, before anything
// loads, so the same file can only ever be one module however we are started.
(function oneModulePerFile() {
  const Module = require("module");
  const resolve = Module._resolveFilename;
  const real = new Map();
  Module._resolveFilename = function (...args) {
    const file = resolve.apply(this, args);
    if (typeof file !== "string" || !path.isAbsolute(file)) return file;
    let canonical = real.get(file);
    if (canonical === undefined) {
      try {
        canonical = fs.realpathSync(file);
      } catch {
        canonical = file;
      }
      real.set(file, canonical);
    }
    return canonical;
  };
})();

// Everything this file has to say goes to a file next to it as well as to
// stderr. On shared hosting stderr frequently goes nowhere a user can read —
// the panel shows a bare 503 and no log — and a startup failure with no
// message is the single most expensive thing to debug from a File Manager.
const LOG = path.join(__dirname, "startup.log");
function log(...parts) {
  // The pid tells two Passenger workers, an idle exit and a crash loop apart.
  const line = `[${new Date().toISOString()}] [${process.pid}] ${parts.join(" ")}\n`;
  try {
    fs.appendFileSync(LOG, line);
  } catch {
    // Read-only filesystem — stderr is all there is.
  }
  process.stderr.write(line);
}

process.on("uncaughtException", (err) => {
  log("uncaught exception:", err && err.stack ? err.stack : String(err));
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  log("unhandled rejection:", err && err.stack ? err.stack : String(err));
  process.exit(1);
});

log(`starting — node ${process.version}, cwd ${process.cwd()}, NODE_ENV=${process.env.NODE_ENV || "(unset)"}`);

// A site set up from the browser keeps its database address and its login
// secret in .bms/ next to this file (src/lib/autoDatabase.ts), so a new site
// needs no variables typed into cPanel. Variables set there still win.
// Behind Passenger/LiteSpeed the Host header is the only address there is.
process.env.BMS_APP_ROOT ||= __dirname;
process.env.AUTH_TRUST_HOST ||= "true";
(function siteFile() {
  // .env.local and friends first (Next's own loader, which Next would run
  // later anyway): a secret kept there must never be replaced by a new one.
  try {
    require("@next/env").loadEnvConfig(__dirname, false, { info() {}, error: log });
  } catch (err) {
    log("env files could not be read —", err && err.message ? err.message : String(err));
  }
  const dir = path.join(__dirname, ".bms");
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(dir, "site.json"), "utf8"));
    if (!process.env.DATABASE_URL && saved.DATABASE_URL) process.env.DATABASE_URL = saved.DATABASE_URL;
  } catch {
    // Not set up from the browser (or not yet).
  }
  if (process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET) return;
  // LiteSpeed starts several copies at once and they must share one secret:
  // link() is atomic, so the first copy's file wins and the others read it.
  const file = path.join(dir, "auth-secret");
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}`;
    fs.writeFileSync(tmp, require("crypto").randomBytes(32).toString("base64"), { mode: 0o600 });
    try {
      fs.linkSync(tmp, file);
      log("auth: no AUTH_SECRET set, so one was generated in .bms/auth-secret");
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    } finally {
      fs.unlinkSync(tmp);
    }
    process.env.AUTH_SECRET = fs.readFileSync(file, "utf8").trim();
  } catch (err) {
    log("auth: AUTH_SECRET is not set and could not be generated —", err && err.message ? err.message : String(err));
  }
})();

// One-click updates (scripts/self-update.cjs). Loaded before Next so that a
// new version which cannot start is rolled back here, after its second failed
// start; one that reaches "ready" is kept. The Updates screen reaches the
// install/rollback actions through globalThis.__bmsUpdate.
let selfUpdate = null;
let readyForTraffic = false;
try {
  selfUpdate = require("./scripts/self-update.cjs");
  selfUpdate.beforeStart(__dirname, log);
} catch (err) {
  log("update: check skipped —", err && err.message ? err.message : String(err));
}
process.on("exit", (code) => {
  if (code !== 0 && !readyForTraffic && selfUpdate) {
    try {
      selfUpdate.failedToStart(__dirname);
    } catch {
      // Best effort: the next start simply does not count this one.
    }
  }
});
if (selfUpdate) {
  const current = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")).version;
    } catch {
      return "0.0.0";
    }
  };
  // Exit shortly after answering; the host starts the new version on the next
  // request, and the other copies follow through watchForNewBuild.
  const restartSoon = () => setTimeout(() => process.exit(0), 1500).unref();
  globalThis.__bmsUpdate = {
    signed: selfUpdate.PUBLIC_KEY_SET,
    plan: () => selfUpdate.plan(__dirname, current()),
    canRollback: () => selfUpdate.canRollback(__dirname),
    apply: async () => {
      const version = await selfUpdate.apply(__dirname, current(), log);
      restartSoon();
      return version;
    },
    rollback: () => {
      selfUpdate.rollback(__dirname, log);
      restartSoon();
    },
  };
}

let next;
try {
  next = require("next");
} catch (err) {
  log("could not load Next. Has `npm install` been run in this folder?");
  log(err && err.stack ? err.stack : String(err));
  process.exit(1);
}

// Same directory next.config.mjs builds into, so a BUILD_DIR override is
// honoured here too rather than this check looking in the wrong place.
const distDir = process.env.BUILD_DIR || ".next";
if (!fs.existsSync(path.join(__dirname, distDir, "BUILD_ID"))) {
  log(`no production build found (${distDir}/BUILD_ID is missing). Run \`npm run build\` and upload the ${distDir} folder.`);
  process.exit(1);
}

// A zip made on Windows carries no Unix permissions, and some extractors then
// create directories their own owner cannot list. The symptom was
// `EACCES: permission denied, scandir .next/static/<hash>` on a build that was
// perfectly good. Only the owner bits are touched, and only where they are
// actually missing, so a deliberately tightened file on a VPS is left alone.
function repairPermissions(root) {
  let fixed = 0;
  const walk = (dir) => {
    let entries;
    try {
      const mode = fs.statSync(dir).mode & 0o777;
      if ((mode & 0o700) !== 0o700) {
        fs.chmodSync(dir, mode | 0o700);
        fixed++;
      }
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      log(`could not repair ${dir}: ${err.message}`);
      return;
    }
    for (const entry of entries) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (entry.isFile()) {
        try {
          const mode = fs.statSync(p).mode & 0o777;
          if ((mode & 0o600) !== 0o600) {
            fs.chmodSync(p, mode | 0o600);
            fixed++;
          }
        } catch {
          // Unreadable and unfixable — Next will report it if it matters.
        }
      }
    }
  };
  walk(root);
  return fixed;
}

// `src`, `drizzle` and `scripts` are not read at runtime, but a folder that
// arrived without write permission makes the *next* upload fail to extract
// into it ("checkdir error: Permission denied"). Repairing them here means one
// restart fixes that for good.
for (const dir of [distDir, "public", "src", "drizzle", "scripts"]) {
  const full = path.join(__dirname, dir);
  if (!fs.existsSync(full)) continue;
  const fixed = repairPermissions(full);
  if (fixed) log(`repaired permissions on ${fixed} entries under ${dir}/`);
}

// A new upload extracted over a running app. The old process keeps serving
// from memory, and the first page it has not loaded yet asks for build files
// that the upload replaced — a bare "500 Internal Server Error" on pages that
// were fine a minute ago, until someone remembers to press Restart. Instead,
// when the BUILD_ID on disk stops matching the one this process started with,
// it exits; cPanel's Node manager (Passenger) starts a fresh one on the next
// request. Only where something will start it again: under Passenger, or when
// RESTART_ON_NEW_BUILD=1 (pm2, systemd). A plain `node server.js` keeps running.
function watchForNewBuild() {
  const supervised = typeof PhusionPassenger !== "undefined" || process.env.RESTART_ON_NEW_BUILD === "1";
  if (!supervised || process.env.RESTART_ON_NEW_BUILD === "0") return;
  const idFile = path.join(__dirname, distDir, "BUILD_ID");
  let started;
  try {
    started = fs.readFileSync(idFile, "utf8").trim();
  } catch {
    return;
  }
  let seenChange = 0;
  setInterval(() => {
    let now;
    try {
      now = fs.readFileSync(idFile, "utf8").trim();
    } catch {
      return; // Mid-extraction: the file is briefly missing.
    }
    if (now === started) {
      seenChange = 0;
      return;
    }
    // Wait for two checks in a row, so an upload still extracting has time to finish.
    if (++seenChange < 2) return;
    log(`new build detected (${started} -> ${now}); restarting to load it`);
    process.exit(0);
  }, 20000).unref();
}

// A copy of the app that nobody sends requests to any more exits by itself.
// On LiteSpeed/Passenger a Restart or an upload often leaves the previous
// process running beside the new one (13 copies of one site were found once),
// each holding memory and threads until the account hits its limits. The live
// copy keeps getting requests — visitors, and the publish cron every 15
// minutes — so only the orphans go quiet and leave; the host starts a fresh
// one on the next request if it ever does. IDLE_EXIT_MINUTES=0 turns it off.
let lastRequest = Date.now();
function exitWhenIdle() {
  const supervised = typeof PhusionPassenger !== "undefined" || process.env.RESTART_ON_NEW_BUILD === "1";
  // Longer than the publish cron's 15 minutes, so the live copy never idles out between runs.
  const minutes = Number(process.env.IDLE_EXIT_MINUTES ?? 20);
  if (!supervised || !(minutes > 0)) return;
  setInterval(() => {
    if (Date.now() - lastRequest < minutes * 60000) return;
    log(`no requests for ${minutes} minutes; exiting so an idle or orphaned copy does not hold the account's process limit`);
    process.exit(0);
  }, Math.min(60000, minutes * 30000)).unref();
}

// A build made with one Next.js version crashes page by page on another.
// `npm install` on the host can pull a newer patch release when package.json
// allows it; say so at the top of startup.log instead of leaving a mystery 500.
try {
  const built = fs.readFileSync(path.join(__dirname, distDir, "BMS_NEXT_VERSION"), "utf8").trim();
  const installed = require("next/package.json").version;
  if (built && installed && built !== installed) {
    log(`WARNING: this build was made with Next.js ${built} but ${installed} is installed. Pages will fail with 500 errors. Run "npm install" so the pinned version (${built}) is installed, then restart.`);
  }
} catch {
  // No marker (a build not packed with npm run pack) — nothing to compare.
}

const { createServer } = require("http");
const { StringDecoder } = require("string_decoder");

const port = parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "localhost";

const app = next({ dev: false, hostname, port, dir: __dirname });
const handle = app.getRequestHandler();

// Pending database migrations, applied on every start.
//
// An upload that adds a column used to need someone to open a terminal on the
// host and run `npm run db:migrate`; forget it and every page touching the new
// column answered 500 until they did. The upload carries drizzle/, so the
// restart that loads the new code can bring the schema with it.
//
// Runs *after* listen(), never before it. The first version awaited this
// between prepare() and listen(), and on the very host it was written for —
// shared hosting, where outbound Postgres TCP is blocked — the connection
// attempt hung, listen() never happened, and the whole site sat behind a
// "Request Timeout" until it was rolled back. A slow or failing migration must
// never keep the site from answering; the worst case is now what it was before
// this existed (a 500 on the pages that need the new column, until the
// migration lands), and startup.log says why.
async function migrateDatabase() {
  if (!process.env.DATABASE_URL) {
    log("migrations: DATABASE_URL is not set, skipped");
    return false;
  }
  try {
    const { applyMigrations } = require("./scripts/apply-migrations.cjs");
    const result = await applyMigrations({ root: __dirname, url: process.env.DATABASE_URL, log: (m) => log("migrations:", m) });
    if (result.applied.length) log(`migrations: ${result.applied.length} applied via ${result.driver}, ${result.skipped} already in place`);
    else log(`migrations: up to date (${result.skipped} in place, checked via ${result.driver})`);
    return true;
  } catch (err) {
    log("migrations: FAILED —", err && err.message ? err.message : String(err));
    log("migrations: the site is starting anyway; run `npm run db:migrate` after fixing the cause");
    return false;
  }
}
// The setup screen's "Create the database" builds the new database's tables with this.
globalThis.__bmsMigrate = migrateDatabase;

// ── Readable view-source ─────────────────────────────────────────────────
//
// React renders the whole document as one line. That is fine for browsers and
// crawlers and unreadable for a person who opens view-source — and every site
// owner compares that view with WordPress, where each tag sits on its own
// line. This lays out the <head> that way: one tag per line, indented, with
// <script> and <style> contents left exactly as they are.
//
// Only the head. React hydrates the body and compares it node for node with
// what the server sent; whitespace added between body elements is a text node
// the client did not render, and that is the hydration mismatch (#418) this
// project has already been bitten by. The head's tags are matched by identity
// rather than position, so it can be laid out freely. Verified in a browser
// console before shipping.
//
// Cost: the WHOLE document is held back — not just up to `<body>` — because
// trimming Tailwind (inlineSheets) needs every class the body uses, and the
// head scripts are copied from a template near the end of the body. Up to
// TW_BUFFER_MAX (4 MB); past that the head goes out untrimmed and the rest
// streams. reasons.txt 7.6 measured this and kept it: public pages render in
// one pass with no Suspense, so there is nothing to send early anyway.
// LiteSpeed and Cloudflare cache the result, so a page pays it once.
const PRETTY_SKIP = /^\/(?:_next\/|api\/|admin(?:\/|$)|preview\/|uploads\/|fonts\/|og(?:\?|$)|site\/|plugins\/)/;
const HEAD_TOKEN = /(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<title\b[^>]*>[\s\S]*?<\/title>|<!--[\s\S]*?-->|<[^>]+>)/g;

// ── Stylesheets inline, once ─────────────────────────────────────────────
//
// Pages link their stylesheets — Next's Tailwind file, the theme's per-page
// sheet, the font faces — and this puts each file's contents into the <head>
// in place of the link, so the first paint waits for no request.
//
// It is done here and not by React because React sends everything a server
// component renders twice: as HTML, and again as the data the browser
// hydrates from. Rendered as <style>, the three sheets were ~60 KB of the
// page two times over. Here they are in the HTML once, and React's data
// holds only the few bytes of each <link>.
//
// React still has to believe each stylesheet is on the page, or it inserts
// the <link> itself when it hydrates and the file downloads after all. It
// looks for `link[rel="stylesheet"][href="…"]` (react-dom: getResource,
// acquireResource, and preload() for Next's hints) and adopts what it finds
// as loaded. The HTML <link> cannot simply stay: Chrome fetches even a
// `disabled` one, at top priority (measured). So a few bytes of script in
// the head add a stand-in for each: a `link` element in the SVG namespace.
// The selector matches it; the browser does not treat it as a stylesheet
// and fetches nothing. The inline <style>s keep `data-precedence`, which is
// what React orders any later stylesheet against.
//
// Only files on this server with content-hashed names are touched, so a
// cached copy can never be stale. INLINE_CSS=off leaves every link alone,
// and so does INLINE_CSS=next (Next's own inlining, the old way).
const INLINE_SHEETS = process.env.INLINE_CSS !== "off" && process.env.INLINE_CSS !== "next";
const sheetCache = new Map();

function sheetFile(href) {
  const clean = href.split("?")[0];
  let m = clean.match(/^\/_next\/static\/css\/([A-Za-z0-9_.-]+\.css)$/);
  if (m) return path.join(__dirname, distDir, "static", "css", m[1]);
  m = clean.match(/^\/site\/([sf]-[a-f0-9]{8,40})\.css$/);
  if (m) return path.join(__dirname, distDir, "bms-css", m[1] + ".css");
  return null;
}

function readSheet(file) {
  const hit = sheetCache.get(file);
  if (hit !== undefined) return hit;
  let css;
  try {
    // `</style` inside the CSS would end the element early.
    css = fs.readFileSync(file, "utf8").replace(/<\/style/gi, "<\\/style");
  } catch {
    return null; // Not cached: the file may be written by the next render.
  }
  if (sheetCache.size > 300) sheetCache.clear();
  sheetCache.set(file, css);
  return css;
}

// ── Tailwind, trimmed to the page ────────────────────────────────────────
//
// Tailwind builds one stylesheet for the whole app, admin screens included,
// and it was inlined into every public page whole: 26 KB, of which one
// measured page used 3 KB. A utility rule applies only where its class is on
// an element, so a rule is kept when every class of one of its selectors is
// either in this document (class attributes and the hydration data) or in
// the safelist scripts/tw-safelist.mjs wrote at build time — the classes a
// client component can add after the fact. No safelist file, no trimming.
const TW_BUFFER_MAX = 4 * 1024 * 1024;
let twSafelist = null;
try {
  twSafelist = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, distDir, "bms-css", "tw-safelist.json"), "utf8")));
  log(`tailwind trim on: ${twSafelist.size} safelisted classes`);
} catch {
  log("tailwind trim off: no bms-css/tw-safelist.json in the build");
}

/** Every class named in the document: `class="…"` in the HTML, `"className":"…"` in the hydration data. */
function classesIn(html) {
  const out = new Set();
  for (const m of html.matchAll(/\sclass="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) out.add(c);
  for (const m of html.matchAll(/\\"className\\":\\"([^"\\]*)/g)) for (const c of m[1].split(/\s+/)) if (c) out.add(c);
  return out;
}

/** Top-level CSS rules, at-rules kept whole (brace counting; Tailwind's output has no braces in strings). */
function cssRules(css) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) { out.push(css.slice(start, i + 1)); start = i + 1; }
  }
  if (start < css.length) out.push(css.slice(start));
  return out;
}

const twCache = new Map();
function trimTailwind(css, pageClasses) {
  if (!twSafelist) return css;
  const key = css.length + ":" + [...pageClasses].sort().join(" ");
  const hit = twCache.get(key);
  if (hit !== undefined) return hit;
  const alive = (cls) => pageClasses.has(cls) || twSafelist.has(cls);
  const keepRule = (rule) => {
    const brace = rule.indexOf("{");
    if (brace < 0) return true;
    const prelude = rule.slice(0, brace);
    if (/^\s*@/.test(prelude)) {
      // @media / @supports hold rules; @font-face, @keyframes hold declarations.
      if (!/^\s*@(media|supports|layer|container)/.test(prelude)) return rule;
      const inner = cssRules(rule.slice(brace + 1, rule.lastIndexOf("}"))).map(keepRule).filter(Boolean).join("");
      return inner ? `${prelude}{${inner}}` : "";
    }
    const members = prelude.split(",");
    const live = members.some((sel) => {
      const classes = [...sel.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1].replace(/\\/g, ""));
      return classes.length === 0 || classes.every(alive);
    });
    return live ? rule : "";
  };
  const out = cssRules(css).map(keepRule).filter(Boolean).join("");
  if (twCache.size > 200) twCache.clear();
  twCache.set(key, out);
  return out;
}

function inlineSheets(head, html) {
  if (!INLINE_SHEETS) return head;
  const inlined = new Set();
  const pageClasses = html ? classesIn(html) : null;
  let out = head.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel="stylesheet"/i.test(tag) || /\sdisabled\b/i.test(tag)) return tag;
    // A sheet for print or a breakpoint must keep its own media rule.
    const media = (tag.match(/\smedia="([^"]*)"/i) || [])[1];
    if (media && media !== "all") return tag;
    const href = (tag.match(/\shref="([^"]+)"/i) || [])[1];
    if (!href) return tag;
    const file = sheetFile(href.replace(/&amp;/g, "&"));
    let css = file ? readSheet(file) : null;
    if (css === null) return tag;
    let trimmed = false;
    if (pageClasses && /^\/_next\/static\/css\//.test(href)) {
      const whole = css;
      css = trimTailwind(css, pageClasses);
      trimmed = css !== whole;
    }
    inlined.add(href);
    const precedence = (tag.match(/\sdata-precedence="([^"]*)"/i) || [])[1];
    // `data-href` is webpack's own marker for an inlined chunk stylesheet:
    // when a lazily loaded block's chunk lists this file, the runtime finds
    // the <style> by it and does not fetch the file (it did, once).
    // `data-bms-trimmed` marks a sheet cut down to this page; see the script
    // below for why it is filled in after load.
    return `<style data-href="${href}"${precedence ? ` data-precedence="${precedence}"` : ""}${trimmed ? " data-bms-trimmed" : ""}>${css}</style>`;
  });
  if (inlined.size) {
    // A preload of a sheet that is now inline would download it for nothing.
    out = out.replace(/<link\b[^>]*\brel="preload"[^>]*>/gi, (tag) => {
      const href = (tag.match(/\shref="([^"]+)"/i) || [])[1];
      return href && inlined.has(href) && /\sas="style"/i.test(tag) ? "" : tag;
    });
    // The stand-ins React looks for — see above. `href` as React will ask
    // for it (entities decoded); `<` escaped so no value can end the script.
    const hrefs = JSON.stringify([...inlined].map((h) => h.replace(/&amp;/g, "&"))).replace(/</g, "\\u003c");
    out += `<script>(function(h){for(var i=0;i<h.length;i++){var l=document.createElementNS("http://www.w3.org/2000/svg","link");l.setAttribute("rel","stylesheet");l.setAttribute("href",h[i]);document.head.appendChild(l)}})(${hrefs})</script>`;
    // The trimmed Tailwind holds only this page's classes, and the stand-in
    // above tells React the whole file is loaded — so after a menu, card or
    // pagination link (a navigation with no reload) the next page's classes
    // were simply missing: archive titles at the wrong size, no image
    // ratios, cramped pagination, until a reload. Once this page has loaded
    // and the browser is idle, the full file (content-hashed, so cached) is
    // written into the *same* <style>: its place in the cascade does not
    // move, the first paint stays small, and every later page has its rules.
    if (/data-bms-trimmed/.test(out)) {
      out += `<script>(function(){function f(){var s=document.querySelectorAll("style[data-bms-trimmed]");for(var i=0;i<s.length;i++)(function(e){fetch(e.getAttribute("data-href")).then(function(r){return r.ok?r.text():null}).then(function(t){if(t){e.textContent=t;e.removeAttribute("data-bms-trimmed")}})["catch"](function(){})})(s[i])}function g(){(window.requestIdleCallback||function(c){setTimeout(c,200)})(f,{timeout:3000})}if(document.readyState==="complete")g();else addEventListener("load",g)})()</script>`;
    }
  }
  return out;
}

/**
 * A page rendered on demand (a cache miss) carries a `Link: <…css>;
 * rel=preload; as="style"` header for each stylesheet, and the browser acts on
 * it before it has read a byte of HTML — so the one file inlineSheets put in
 * the document was downloaded anyway, and LiteSpeed would have cached the
 * header with the page. Entries for sheets this server inlines are removed;
 * anything else in the header is kept as it was.
 */
function stripInlinedLinkHeader(res) {
  if (!INLINE_SHEETS) return;
  const raw = res.getHeader("link");
  if (!raw) return;
  const entries = (Array.isArray(raw) ? raw : [String(raw)]).flatMap((v) => v.split(/,\s*(?=<)/));
  const kept = entries.filter((e) => {
    const m = e.match(/^<([^>]+)>/);
    return !(m && /as="?style"?/i.test(e) && sheetFile(m[1]));
  });
  if (kept.length === entries.length) return;
  if (kept.length) res.setHeader("link", kept.join(", "));
  else res.removeHeader("link");
}

// Settings → Head scripts, rendered by SiteLayout as an inert
// <template data-bms-head> in the body. Copied (not moved: the body must still
// match what React hydrates) to the top of <head>, right after the charset,
// where Tag Manager and consent-mode snippets expect to run first. The meta
// tells ScriptRunner the copy happened, so the browser does not do it again.
const HEAD_TEMPLATE = /<template data-bms-head="">([\s\S]*?)<\/template>/;

function withHeadScripts(inner, html) {
  const m = HEAD_TEMPLATE.exec(html);
  if (!m || !m[1]) return inner;
  const block = m[1] + '<meta name="bms-head-scripts"/>';
  const charset = /<meta charSet="[^"]*"\/>|<meta charset="[^"]*"\/?>/i.exec(inner);
  if (!charset) return block + inner;
  const at = charset.index + charset[0].length;
  return inner.slice(0, at) + block + inner.slice(at);
}

function layoutHead(html) {
  const headOpen = html.indexOf("<head");
  const headClose = html.indexOf("</head>");
  if (headOpen < 0 || headClose < 0) return html;
  const headStart = html.indexOf(">", headOpen) + 1;
  const before = html.slice(0, headStart);
  const inner = withHeadScripts(inlineSheets(html.slice(headStart, headClose), html), html);
  const after = html.slice(headClose);

  const lines = [];
  for (const tok of inner.split(HEAD_TOKEN)) {
    if (!tok || !tok.trim()) continue;
    lines.push("  " + tok.trim());
  }
  // <!DOCTYPE html><html …><head> → one per line; </head><body …> likewise.
  const NL = String.fromCharCode(10);
  const top = before
    .replace(/^(<!DOCTYPE[^>]*>)(<!--[\s\S]*?-->)?/i, (m, d, c) => d + NL + (c ? c + NL : ""))
    .replace(/(<html\b[^>]*>)(<head\b[^>]*>)/i, "$1" + NL + "$2");
  return top + NL + lines.join(NL) + NL + after.replace(/^<\/head>(<body\b)/i, "</head>" + NL + "$1");
}

function prettyHead(req, res) {
  if (req.method !== "GET") return;
  const path = (req.url || "/").split("?")[0];
  if (PRETTY_SKIP.test(path) || /\.[a-z0-9]+$/i.test(path)) return;

  const write = res.write.bind(res);
  const end = res.end.bind(res);
  // Next streams: the headers go out with the first chunk, long before the
  // body has been buffered here, so the Link header is cleaned at that
  // moment rather than when the document is written.
  const writeHead = res.writeHead.bind(res);
  res.writeHead = (...args) => {
    if (!res.headersSent && /text\/html/i.test(String(res.getHeader("content-type") || ""))) {
      stripInlinedLinkHeader(res);
      // The page is rewritten below (inline CSS), so its length changes. writeHead fixes
      // the headers, so flush() can't drop it later: an Astro page (it sends a length)
      // was cut off at the old size, losing its closing scripts.
      res.removeHeader("content-length");
      const h = args.find((a) => a && typeof a === "object");
      if (h && !Array.isArray(h)) for (const k of Object.keys(h)) if (k.toLowerCase() === "content-length") delete h[k];
    }
    return writeHead(...args);
  };
  // Chunks arrive as Buffer, Uint8Array or string, and a multi-byte character
  // can straddle two of them; the decoder carries the partial bytes over.
  const decoder = new StringDecoder("utf8");
  const text = (chunk) => (typeof chunk === "string" ? chunk : decoder.write(Buffer.from(chunk)));
  let buffer = "";
  let decided = false; // true once we know whether to touch this response
  let passthrough = false;

  const flush = (final) => {
    if (!decided) {
      const type = String(res.getHeader("content-type") || "");
      if (!/text\/html/i.test(type)) { passthrough = true; }
      decided = true;
    }
    if (passthrough) { if (buffer) { const ok = write(buffer); buffer = ""; return ok; } return true; }
    // The whole document, not just up to <body>: trimming Tailwind needs to
    // know which classes the body uses. Capped — past this the head goes out
    // as it is and the page is left untrimmed rather than held in memory.
    if (!final && buffer.length < TW_BUFFER_MAX) return true; // keep buffering
    if (!res.headersSent) res.removeHeader("content-length");
    // The socket's answer is passed back to Next: `false` means its buffer is
    // full, and Next waits for 'drain' before writing more instead of piling
    // the rest of a large page into memory behind a slow client.
    const ok = write(layoutHead(buffer));
    buffer = "";
    passthrough = true;
    return ok;
  };

  res.write = (chunk, ...rest) => {
    if (passthrough) return write(chunk, ...rest);
    buffer += text(chunk);
    return flush(false);
  };
  res.end = (chunk, ...rest) => {
    if (chunk && !passthrough) {
      buffer += text(chunk);
      chunk = undefined;
    }
    if (!passthrough) { buffer += decoder.end(); flush(true); }
    return end(chunk, ...rest);
  };
}

// ── Request body limits ─────────────────────────────────────────────────────
//
// Nothing limited how much a request may send — not Next, not the routes, not
// the .htaccess — and Cloudflare's free plan passes bodies up to 100 MB. Each
// route reads its whole body into memory, and some public ones (a comment,
// the 2FA check, first-run setup) read it before their rate limit applies:
// a few 100 MB requests at once pushed the ~384 MB process over its limit and
// took the site down until it restarted. Limits by route, checked here before
// the app sees the request: a declared size over the limit is refused at
// once (413), and a body that does not declare one (chunked) is counted as it
// arrives and cut off when it passes the limit.
const MB = 1024 * 1024;
const BODY_LIMITS = [
  // Admin uploads. Each route also checks the file itself; these only add the
  // multipart framing on top.
  [/^\/api\/import\/?$/, 1024 * MB], // a backup zip carries the media library
  [/^\/api\/media\/?$/, 12 * MB],
  [/^\/api\/(?:fonts|plugins)\/?$/, 6 * MB],
  [/^\/api\/preview\/?$/, 9 * MB],
  // Anyone on the internet can call these; none needs more than a form's worth.
  [/^\/api\/(?:comments|forms\/submit|errors|not-found-log|auth|setup)(?:\/|$)/, 256 * 1024],
];
const DEFAULT_BODY_LIMIT = 8 * MB; // documents, settings, menus — the admin's own saves

function bodyLimitFor(req) {
  const path = (req.url || "/").split("?")[0];
  for (const [re, limit] of BODY_LIMITS) if (re.test(path)) return limit;
  return DEFAULT_BODY_LIMIT;
}

/** False when the request was refused (and answered) here. */
function limitBody(req, res) {
  const method = req.method || "GET";
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const limit = bodyLimitFor(req);
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > limit) {
    res.statusCode = 413;
    res.setHeader("Connection", "close");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    // Answer, then drop the connection rather than read what follows.
    res.end("Request body too large.", () => req.socket.destroy());
    return false;
  }
  // No trustworthy size (chunked, or an understated one): count the bytes the
  // HTTP parser hands the request. Wrapping `push` sees every chunk without
  // consuming any, whoever reads the body later and however.
  let seen = 0;
  const push = req.push.bind(req);
  req.push = (chunk, encoding) => {
    if (chunk) {
      seen += chunk.length;
      if (seen > limit) {
        req.push = push;
        log("request body over limit, connection dropped:", req.method, (req.url || "").split("?")[0]);
        req.socket.destroy();
        return false;
      }
    }
    return push(chunk, encoding);
  };
  return true;
}

// ── Which client-IP headers to believe ──────────────────────────────────────
//
// Every per-visitor limit (login, comments, forms, search) keys on
// `cf-connecting-ip` first. That header is only true on a request that came
// through Cloudflare; anyone connecting to the host directly could send any
// value, get a fresh allowance per made-up address, and grow the limiter's
// memory with each. Here, the address that actually connected — the last hop
// the proxy in front (LiteSpeed) appended, or the socket itself without one —
// must be one of Cloudflare's for the header to stand. If it is not, the
// spoofable headers are removed and the app falls back to that hop (see
// lib/rateLimit clientIp). Whatever LiteSpeed is set to do, the outcome is a
// real address: when it already substitutes the visitor's IP, that IP is what
// the limits use.
const net = require("net");
const CLOUDFLARE_RANGES = new net.BlockList();
for (const cidr of [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
  "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
  "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
]) {
  const [addr, bits] = cidr.split("/");
  CLOUDFLARE_RANGES.addSubnet(addr, Number(bits), "ipv4");
}
for (const cidr of [
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32",
  "2a06:98c0::/29", "2c0f:f248::/32",
]) {
  const [addr, bits] = cidr.split("/");
  CLOUDFLARE_RANGES.addSubnet(addr, Number(bits), "ipv6");
}

function fromCloudflare(ip) {
  const clean = String(ip || "").trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");
  const kind = net.isIP(clean);
  if (!kind) return false;
  try {
    return CLOUDFLARE_RANGES.check(clean, kind === 6 ? "ipv6" : "ipv4");
  } catch {
    return false;
  }
}

// Loopback, private and link-local: a proxy on the same machine, not a visitor.
const LOCAL_RANGES = new net.BlockList();
for (const [addr, bits] of [["127.0.0.0", 8], ["10.0.0.0", 8], ["172.16.0.0", 12], ["192.168.0.0", 16], ["169.254.0.0", 16]]) {
  LOCAL_RANGES.addSubnet(addr, bits, "ipv4");
}
for (const [addr, bits] of [["::1", 128], ["fc00::", 7], ["fe80::", 10]]) LOCAL_RANGES.addSubnet(addr, bits, "ipv6");

function isLocal(ip) {
  const clean = String(ip || "").trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");
  const kind = net.isIP(clean);
  if (!kind) return true; // unknown: treat as "no information"
  try {
    return LOCAL_RANGES.check(clean, kind === 6 ? "ipv6" : "ipv4");
  } catch {
    return true;
  }
}

/**
 * Always true; strips the Cloudflare client-IP headers when the connection
 * provably did not come from Cloudflare.
 *
 * Only acts on a *public* address that is not Cloudflare's. When all that is
 * known is a local socket (a proxy that forwards no X-Forwarded-For), nothing
 * is changed — removing the headers then would make every visitor the same
 * address and put them all on one rate-limit allowance.
 */
function trustClientIpHeaders(req) {
  const hops = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  const peer = hops.length ? hops[hops.length - 1] : req.socket && req.socket.remoteAddress;
  if (!isLocal(peer) && !fromCloudflare(peer)) {
    delete req.headers["cf-connecting-ip"];
    delete req.headers["true-client-ip"];
    delete req.headers["x-real-ip"];
  }
  return true;
}

/**
 * A stale page must not be kept by any shared cache.
 *
 * A save calls revalidatePath and purges LiteSpeed and Cloudflare at once,
 * but Next answers the next request with the OLD render (`x-nextjs-cache:
 * STALE`) while it re-renders in the background — and that answer still
 * carries the middleware's `s-maxage=86400`. LiteSpeed and Cloudflare then
 * kept the pre-edit page for a day: measured on a live site 2026-10-07,
 * a homepage edit stayed invisible (cf-cache-status HIT, old title) until a
 * manual purge. Only the stale answer is vetoed; the fresh render that
 * follows is cached as usual.
 *
 * Error answers are held to the same rule. The middleware decides the cache
 * lifetime before the page renders, so a 404 or 500 produced while the
 * database was down carried the full day too: a live site 2026-10-21 kept
 * answering 404 on its homepage from LiteSpeed long after Neon came back
 * (INCIDENT-2026-10-21.md). A 5xx is never kept; a 404 that was going to be
 * cached is kept five minutes, enough to absorb a bot hammering dead URLs and
 * short enough that a false one heals by itself.
 */
const ERROR_404_TTL = 300;
function noSharedCacheWhenStale(res) {
  const setHeader = res.setHeader.bind(res);
  const writeHead = res.writeHead.bind(res);
  res.writeHead = (...args) => {
    if (!res.headersSent) {
      const status = typeof args[0] === "number" ? args[0] : res.statusCode;
      if (status >= 500 || String(res.getHeader("x-nextjs-cache") || "").toUpperCase() === "STALE") {
        setHeader("Cache-Control", "private, no-cache, max-age=0");
        setHeader("X-LiteSpeed-Cache-Control", "no-cache");
      } else if (status === 404) {
        if (/^public/i.test(String(res.getHeader("x-litespeed-cache-control") || ""))) setHeader("X-LiteSpeed-Cache-Control", `public, max-age=${ERROR_404_TTL}`);
        if (/s-maxage/i.test(String(res.getHeader("cache-control") || ""))) setHeader("Cache-Control", `public, max-age=0, s-maxage=${ERROR_404_TTL}`);
      }
    }
    return writeHead(...args);
  };
}

// ── Public pages rendered by Astro ─────────────────────────────────────────
//
// The middleware sends public pages to Astro (src/app/bms-render, astro/).
// Two jobs here: Astro's own browser files, and the way back to Next.
//
// /_astro/<name>.<hash>.js: the island scripts a page with React components
// loads (astro/dist/client). Content-hashed names, so kept for a year.
const ASTRO_CLIENT = path.join(__dirname, "astro", "dist", "client");
const ASTRO_TYPES = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".map": "application/json" };
function serveAstroFile(req, res) {
  let rel = "";
  try { rel = decodeURIComponent((req.url || "").split("?")[0]).replace(/^\/+/, ""); } catch { /* bad escape: 404 */ }
  const file = path.join(ASTRO_CLIENT, rel);
  if (!file.startsWith(ASTRO_CLIENT + path.sep) || !ASTRO_TYPES[path.extname(file)] || !fs.existsSync(file)) {
    res.statusCode = 404;
    res.setHeader("X-LiteSpeed-Cache-Control", "no-cache");
    res.end("Not found");
    return;
  }
  res.setHeader("Content-Type", ASTRO_TYPES[path.extname(file)]);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  if (req.method === "HEAD") { res.end(); return; }
  fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
}

// A page Astro does not answer (no such page, an archive, an error, no build)
// comes back from the route marked `x-bms-next`. Nothing has been sent yet:
// the answer is dropped and Next is asked again with `x-bms-no-astro`, which
// makes the middleware render the request the way it always did. Installed
// last, so the wrappers above (head layout, stale-cache veto) see only the
// answer that is really sent.
const NEXT_META = Symbol.for("NextInternalRequestMeta");
function astroFallback(req, res, again) {
  const url = req.url;
  const inner = { writeHead: res.writeHead, write: res.write, end: res.end };
  // Checked at every step, not only in writeHead: an empty answer goes straight
  // to end(), and Node writes the head from inside it — too late to drop.
  let dropped = false;
  const marked = () => dropped || (dropped = !res.headersSent && !!res.getHeader("x-bms-next"));
  res.writeHead = function (...args) { return marked() ? res : inner.writeHead.apply(res, args); };
  res.write = function (...args) { return marked() ? true : inner.write.apply(res, args); };
  res.end = function (...args) {
    if (!marked()) return inner.end.apply(res, args);
    Object.assign(res, inner);
    for (const name of res.getHeaderNames()) res.removeHeader(name);
    res.statusCode = 200;
    req.url = url;
    req.headers["x-bms-no-astro"] = "1";
    delete req[NEXT_META];
    // After the first answer has unwound.
    setImmediate(again);
    return res;
  };
}

app
  .prepare()
  .then(() => {
    createServer((req, res) => {
      lastRequest = Date.now();
      // LiteSpeed page cache guard. A React payload (a client-side navigation,
      // marked by the RSC header or the _rsc parameter) must never be kept
      // under a page URL, or the next visitor could be handed raw payload
      // instead of HTML. Next hides both markers from middleware, which makes
      // the caching decision, so the veto is applied here, where the request
      // is still whole: whatever the app sets, these responses say no-cache.
      const flight = req.headers["rsc"] !== undefined || req.headers["next-router-prefetch"] !== undefined || /[?&]_rsc=/.test(req.url || "");
      if (flight) {
        const setHeader = res.setHeader.bind(res);
        res.setHeader = (name, value) =>
          String(name).toLowerCase() === "x-litespeed-cache-control" ? setHeader(name, "no-cache") : setHeader(name, value);
        const writeHead = res.writeHead.bind(res);
        res.writeHead = (...args) => {
          if (!res.headersSent) setHeader("X-LiteSpeed-Cache-Control", "no-cache");
          return writeHead(...args);
        };
      }
      // One URL, one file. The optimiser picks its output from the Accept
      // header: WebP when the client says it can show WebP, and a JPEG
      // re-encode otherwise (Next's fallback for a WebP source). Cloudflare
      // keys its cache on the URL alone — `Vary: Accept` is ignored below the
      // enterprise plan — so the first client to ask for a variant decided the
      // format for everyone for a year, and a curl, an uptime monitor or an
      // old crawler left a larger JPEG behind for every browser after it
      // (measured: 27.5 KB JPEG for a 20.8 KB WebP). `images.formats` is
      // WebP-only, every browser since 2020 renders it, and the pipeline
      // stores uploads as WebP — so the answer is always WebP, whatever was
      // asked for.
      //
      // Except with IMAGE_FORMATS=avif: that switch turns AVIF on, and forcing
      // WebP here made it do nothing while the Speed screen said AVIF was on.
      // A browser that asks for AVIF then gets it; everything else still gets
      // WebP. (The Speed screen already says AVIF leaves the edge-cache rule.)
      if ((req.url || "").startsWith("/_next/image?")) {
        const wantsAvif = process.env.IMAGE_FORMATS === "avif" && /image\/avif/i.test(String(req.headers.accept || ""));
        req.headers.accept = wantsAvif ? "image/avif,image/webp,*/*;q=0.8" : "image/webp,*/*;q=0.8";
      }
      if (!trustClientIpHeaders(req)) return;
      if (!limitBody(req, res)) return;
      const get = req.method === "GET" || req.method === "HEAD";
      if (get && (req.url || "").startsWith("/_astro/")) return serveAstroFile(req, res);
      if (!flight) prettyHead(req, res);
      if (get) noSharedCacheWhenStale(res);
      const run = () =>
        handle(req, res).catch((err) => {
          log("request failed:", err && err.stack ? err.stack : String(err));
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end("Internal Server Error");
          }
        });
      if (get && !flight) astroFallback(req, res, run);
      run();
    }).listen(port, () => {
      log(`ready on http://${hostname}:${port}`);
      readyForTraffic = true;
      if (selfUpdate) selfUpdate.started(__dirname);
      watchForNewBuild();
      exitWhenIdle();
      // Deliberately not awaited: the site is up; this catches the schema up.
      void migrateDatabase();
    });
  })
  .catch((err) => {
    // A build that is missing or was made by a different Next version lands
    // here. Say so plainly — the host's own error page is not helpful.
    log("could not start. Has `npm run build` been run on this code?");
    log(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
