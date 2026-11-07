// The site's readiness, as a list of checks.
//
// Every one of these is something that went wrong, or nearly did, on a real
// deployment: a canonical tag pointing at localhost because Site URL was never
// set; a login that redirected to the wrong domain because NEXTAUTH_URL did
// not match; a schema change deployed without its migration; uploads that
// would fail on a read-only disk. None of them produce an error anywhere —
// the site simply behaves wrongly until somebody notices. This turns each into
// a line on one screen, with where to fix it.
//
// Everything here is cheap and local: settings already in memory, a couple of
// small queries, a directory permission. Reaching the public site from the
// outside is a separate, on-demand check (see the `live` route), because a
// server cannot always reach its own public address.

import { access, constants, mkdir, readdir, readFile, stat, statfs } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { turnstileEnabled } from "@/lib/turnstile";
import { mailStatus } from "@/lib/mail";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, pages, posts } from "@/lib/db/schema";
import { rawQuery } from "@/lib/db/raw";
import { getSiteSettings, type SiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { isLive, notTrashed } from "@/lib/publishState";
import { CURRENT_VERSION } from "@/lib/version";
import { previewCleanup } from "@/lib/maintenance";
import { orphanReport } from "@/lib/orphans";
import { HEALTH_GUIDES } from "@/lib/siteHealthGuides";
import { extraHealthChecks } from "@/lib/siteHealthExtra";
import { homepageId } from "@/lib/permalinks";
import { defaultContentLanguage } from "@/lib/locale";
import { renderIcon } from "@/lib/siteIcon";

/** The description the front page serves — the homepage's own, if it has one. */
async function homepageDescription(s: SiteSettings): Promise<string> {
  const id = homepageId(defaultContentLanguage(s), s);
  if (id) {
    try {
      const [row] = await rawQuery<{ d: string | null; live: boolean }>(
        "SELECT seo_description AS d, (status = 'published' AND deleted_at IS NULL) AS live FROM pages WHERE id = ?",
        [id]
      );
      if (row?.live && row.d?.trim()) return row.d.trim();
    } catch {
      // Fall through to the setting.
    }
  }
  return (s.site_description ?? "").trim();
}

export type { HealthStatus, HealthCategory, HealthCheck, HealthStat, HealthReport } from "@/lib/siteHealthTypes";
export { CATEGORY_LABELS, formatBytes } from "@/lib/siteHealthTypes";
import { formatBytes, type HealthStatus, type HealthCategory, type HealthCheck, type HealthStat, type HealthReport } from "@/lib/siteHealthTypes";

function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * How often this app is being restarted, read from `startup.log`.
 *
 * This check exists because of a real outage that took hours to find and
 * should have taken seconds. A site was restarting 44 times in 4.6 hours —
 * a visitor would open it, it worked, and minutes later it was dead again.
 * The cause was a cron job on the hosting account running
 * `pkill -15 -f lsnode` every five minutes, which terminated the app around
 * the clock.
 *
 * Nothing surfaced it. SIGTERM is a polite kill: the process exits normally,
 * writes no stack trace, and the next request starts a fresh one that logs a
 * perfectly healthy boot. `stderr.log` had no errors either. And the check
 * that stood here before — "Running for 4m — restarted recently" — reported
 * status "ok" every single time, because it only ever saw the *current*
 * process and had no idea it was the forty-fourth.
 *
 * `server.js` writes one `starting —` line per boot, so the history is
 * already on disk. Counting it turns an invisible problem into one red line.
 *
 * Deliberately generous thresholds: a deploy, a settings save that triggers a
 * rebuild, and an idle host waking the app are all normal. Six or more starts
 * in an hour is not.
 */
function restartCheck(): HealthCheck {
  const uptime = `Running for ${formatDuration(process.uptime())}`;
  let starts: number[];
  try {
    // Only the tail matters and the file grows forever on a busy host, so
    // read it whole but keep just the recent lines — it is a few hundred KB
    // at worst, and this check runs on one screen, not on every request.
    const raw = readFileSync(path.join(process.cwd(), "startup.log"), "utf8");
    starts = raw
      .split("\n")
      .filter((line) => line.includes("starting —"))
      .map((line) => Date.parse(line.slice(1, line.indexOf("]"))))
      .filter((t) => Number.isFinite(t));
  } catch {
    // No log file: a host that runs the app some other way, or a first boot.
    return { id: "uptime", label: "Uptime", status: "ok", detail: `${uptime}.`, category: "server" };
  }

  if (!starts.length) {
    return { id: "uptime", label: "Uptime", status: "ok", detail: `${uptime}.`, category: "server" };
  }

  const now = Date.now();
  const lastHour = starts.filter((t) => now - t < 3_600_000).length;
  const lastDay = starts.filter((t) => now - t < 86_400_000).length;
  const history = `${lastHour} restart${lastHour === 1 ? "" : "s"} in the last hour, ${lastDay} in the last 24 h.`;

  if (lastHour >= 6) {
    return {
      id: "uptime",
      label: "Restarting repeatedly",
      status: "fail",
      detail:
        `${history} ${uptime}. Something is stopping this app — it is not crashing, or there would be errors in startup.log. ` +
        `Check the hosting account's cron jobs first: a scheduled \`pkill -f lsnode\` (sometimes suggested to control memory) kills the site every time it runs. ` +
        `Then check whether the host stops idle apps — the publish cron every 15 minutes on /api/cron/publish holds it open.`,
      category: "server",
    };
  }

  if (lastHour >= 3 || lastDay >= 30) {
    return {
      id: "uptime",
      label: "Restarting often",
      status: "warn",
      detail:
        `${history} ${uptime}. Some restarting is normal on shared hosting, which stops idle apps. ` +
        `If this keeps climbing, check the account's cron jobs for anything that kills processes, and add a keep-alive cron for /api/cron/publish.`,
      category: "server",
    };
  }

  return { id: "uptime", label: "Uptime", status: "ok", detail: `${uptime}. ${history}`, category: "server" };
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function has(v: string | undefined | null): boolean {
  return typeof v === "string" && v.trim() !== "";
}

export async function runHealthChecks(): Promise<HealthReport> {
  const s = await getSiteSettings();
  const checks: HealthCheck[] = [];

  // ── Identity ───────────────────────────────────────────────────────────────
  const url = siteUrl(s);
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(url);
  const configuredUrl =
    has(s.site_url) ||
    has(process.env.NEXT_PUBLIC_SITE_URL) ||
    has(process.env.AUTH_URL) ||
    has(process.env.NEXTAUTH_URL);
  if (!configuredUrl || isLocal) {
    checks.push({
      id: "site-url",
      label: "Site URL",
      status: "fail",
      detail: `Resolves to ${url}. Every canonical tag, og:url and sitemap entry uses this, so search engines are being told the site lives there.`,
      href: "/admin/settings",
    });
  } else if (!url.startsWith("https://")) {
    checks.push({ id: "site-url", label: "Site URL", status: "warn", detail: `${url} is not https. Browsers mark it insecure and HSTS is never sent.`, href: "/admin/settings" });
  } else {
    checks.push({ id: "site-url", label: "Site URL", status: "ok", detail: url });
  }

  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  try {
    if (authUrl && !isLocal && new URL(authUrl).origin !== new URL(url).origin) {
      checks.push({
        id: "auth-url",
        label: "Login address",
        status: "warn",
        detail: `NEXTAUTH_URL is ${new URL(authUrl).origin} but the site is ${new URL(url).origin}. Login redirects go to the first one.`,
      });
    } else {
      checks.push({ id: "auth-url", label: "Login address", status: authUrl ? "ok" : "warn", detail: authUrl ? "NEXTAUTH_URL matches the site." : "NEXTAUTH_URL is not set; login redirects fall back to the request host." });
    }
  } catch {
    checks.push({ id: "auth-url", label: "Login address", status: "warn", detail: "NEXTAUTH_URL is not a valid URL." });
  }

  checks.push(
    has(s.site_name)
      ? { id: "site-name", label: "Site name", status: "ok", detail: s.site_name }
      : { id: "site-name", label: "Site name", status: "fail", detail: "Empty. Titles have no suffix and og:site_name is missing.", href: "/admin/settings" }
  );
  // What the front page actually serves: the homepage's own meta description
  // when a page is chosen and has one, else the site description. The check
  // used to read only the setting and called the home page description-less
  // while the page itself had a perfectly good one.
  {
    const homeDesc = await homepageDescription(s);
    checks.push(
      homeDesc
        ? { id: "site-description", label: "Front page description", status: "ok", detail: `${homeDesc.length} characters${has(s.site_description) ? "" : " (from the homepage; the site description itself is empty — it is the fallback for the feed and other listings)"}.` }
        : has(s.site_description)
          ? { id: "site-description", label: "Site description", status: "ok", detail: `${s.site_description.length} characters` }
          : { id: "site-description", label: "Front page description", status: "warn", detail: "Empty. The front page has no meta description — neither the homepage's SEO tab nor the site description is filled.", href: "/admin/settings" }
    );
  }
  checks.push(
    has(s.site_favicon)
      ? { id: "favicon", label: "Favicon", status: "ok", detail: "Set." }
      : { id: "favicon", label: "Favicon", status: "warn", detail: "Not set — the generic default icon is shown in browser tabs.", href: "/admin/settings" }
  );

  // ── SEO ────────────────────────────────────────────────────────────────────
  checks.push(
    has(s.seo_og_default_image)
      ? { id: "og-image", label: "Default share image", status: "ok", detail: "Set." }
      : { id: "og-image", label: "Default share image", status: "warn", detail: "Not set. Posts without a featured image share with no picture.", href: "/admin/seo" }
  );
  checks.push(
    has(s.seo_kg_logo) || has(s.site_logo)
      ? { id: "kg-logo", label: "Publisher logo", status: "ok", detail: "Set." }
      : { id: "kg-logo", label: "Publisher logo", status: "warn", detail: "No logo for the Organization schema. Google uses it for the publisher in rich results.", href: "/admin/seo" }
  );
  const verified = ["seo_verify_google", "seo_verify_bing", "seo_verify_yandex", "seo_verify_pinterest"].filter((k) => has(s[k]));
  checks.push(
    verified.length
      ? { id: "verification", label: "Search engine verification", status: "ok", detail: `${verified.length} service${verified.length === 1 ? "" : "s"} verified.` }
      : { id: "verification", label: "Search engine verification", status: "info", detail: "No verification tokens. Add Google Search Console at least, to see how the site is indexed.", href: "/admin/seo" }
  );
  checks.push(
    (s.seo_sitemap_enabled ?? "true") !== "false"
      ? { id: "sitemap", label: "Sitemap", status: "ok", detail: `${url}/sitemap_index.xml` }
      : { id: "sitemap", label: "Sitemap", status: "warn", detail: "Disabled. Search engines discover new posts more slowly without it.", href: "/admin/seo" }
  );

  // ── Platform ───────────────────────────────────────────────────────────────
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  checks.push(
    secret.length >= 32
      ? { id: "auth-secret", label: "Session secret", status: "ok", detail: "Set, and long enough." }
      : { id: "auth-secret", label: "Session secret", status: "fail", detail: secret ? "AUTH_SECRET is shorter than 32 characters." : "AUTH_SECRET is not set." }
  );

  const [major, minor] = process.versions.node.split(".").map(Number);
  const nodeOk = major > 18 || (major === 18 && minor >= 18);
  checks.push({ id: "node", label: "Node.js", status: nodeOk ? "ok" : "fail", detail: `v${process.versions.node}${nodeOk ? "" : " — Next 15 needs 18.18 or newer"}` });

  if (has(process.env.BLOB_READ_WRITE_TOKEN)) {
    checks.push({ id: "storage", label: "Media storage", status: "ok", detail: "Vercel Blob." });
  } else {
    const dir = path.join(process.cwd(), "public", "uploads");
    try {
      // upload.zip never carries `uploads`, so on a fresh install the folder
      // does not exist yet and a bare `access` reported "not writable" on
      // every new site — while uploading actually worked, because the upload
      // route creates it with this same call. Create it, then judge it.
      await mkdir(dir, { recursive: true });
      await access(dir, constants.W_OK);
      checks.push({ id: "storage", label: "Media storage", status: "ok", detail: "public/uploads on this server's disk. Include it in backups." });
    } catch {
      checks.push({ id: "storage", label: "Media storage", status: "fail", detail: "public/uploads is not writable and no Blob token is set — uploads will fail. On a serverless host set BLOB_READ_WRITE_TOKEN." });
    }
  }

  checks.push(
    process.env.IMAGE_OPTIMIZATION === "off"
      ? { id: "images", label: "Image optimisation", status: "info", detail: "Off (IMAGE_OPTIMIZATION=off). Original images are served as uploaded." }
      : { id: "images", label: "Image optimisation", status: "ok", detail: "On." }
  );

  // Either source counts: the host's variables, or Admin → Email.
  const mail = await mailStatus().catch(() => ({ configured: false, detail: "" }));
  checks.push(
    mail.configured
      ? { id: "smtp", label: "Email", status: "ok", detail: `Sending through ${mail.detail}.` }
      : { id: "smtp", label: "Email", status: "warn", detail: "Email is not set up: \"Forgot password\" cannot send reset links (an account with two-factor sign-in can still reset with its authenticator app), and form submissions are saved but nobody is emailed. Set it up in Admin → Email.", href: "/admin/email" }
  );

  checks.push(
    turnstileEnabled()
      ? { id: "turnstile", label: "Spam protection", status: "ok", detail: "Cloudflare Turnstile is on for comments and forms." }
      : { id: "turnstile", label: "Spam protection", status: "info", detail: "Only the honeypot. Set NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY to add Cloudflare Turnstile (free)." }
  );
  checks.push(
    has(process.env.BACKUP_TOKEN)
      ? { id: "backups", label: "Scheduled backups", status: "ok", detail: "BACKUP_TOKEN is set — point a daily cron at /api/backup?token=…" }
      : { id: "backups", label: "Scheduled backups", status: "info", detail: "Not configured. Set BACKUP_TOKEN and add a daily cron for /api/backup." }
  );

  // ── Database ───────────────────────────────────────────────────────────────
  let dbReachable = true;
  try {
    const applied = new Set(
      (await rawQuery<{ name: string }>("SELECT name FROM cms_migrations")).map((r) => r.name)
    );
    let files: string[] = [];
    try {
      files = (await readdir(path.join(process.cwd(), "drizzle"))).filter((f) => f.endsWith(".sql")).sort();
    } catch {
      // No drizzle/ next to the app — nothing to compare against.
    }
    const pending = files.filter((f) => !applied.has(f));
    if (files.length === 0) {
      checks.push({ id: "migrations", label: "Database schema", status: "info", detail: `${applied.size} migrations recorded; no drizzle/ folder here to compare against.` });
    } else if (pending.length) {
      checks.push({ id: "migrations", label: "Database schema", status: "fail", detail: `${pending.length} migration${pending.length === 1 ? "" : "s"} not applied: ${pending.join(", ")}. Run npm run db:migrate.` });
    } else {
      checks.push({ id: "migrations", label: "Database schema", status: "ok", detail: `Up to date — ${files.length} migrations applied.` });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/cms_migrations/.test(msg) && /does not exist/.test(msg)) {
      checks.push({ id: "migrations", label: "Database schema", status: "warn", detail: "Reachable, but no migration record exists. Run npm run db:migrate once to create it." });
    } else {
      dbReachable = false;
      checks.push({ id: "database", label: "Database", status: "fail", detail: `Cannot query the database: ${msg}` });
    }
  }
  if (dbReachable) {
    const t0 = Date.now();
    let latency = -1;
    try {
      await rawQuery("SELECT 1");
      latency = Date.now() - t0;
    } catch {
      // Already known reachable; a hiccup here is not a finding.
    }
    checks.unshift({
      id: "database",
      label: "Database",
      status: latency > 400 ? "warn" : "ok",
      detail: latency < 0 ? "Reachable." : `Reachable, ${latency} ms round trip.${latency > 400 ? " That is slow — every admin page pays it several times. A database in the same region as the server is the fix." : ""}`,
    });
    const dbUrl = process.env.DATABASE_URL ?? "";
    try {
      const u = new URL(dbUrl);
      checks.push({
        id: "db-driver",
        label: "Connection",
        status: "ok",
        detail: `${u.hostname} — MariaDB/MySQL, pool of ${process.env.DB_POOL_MAX ?? 2} per process.`,
      });
    } catch {
      checks.push({ id: "db-driver", label: "Connection", status: dbUrl ? "warn" : "fail", detail: dbUrl ? "DATABASE_URL is not a valid URL." : "DATABASE_URL is not set." });
    }
    try {
      const [row] = await rawQuery<{ bytes: string; conns: number; rev: number }>(
        // Connections: this account's own sessions on this database (all an
        // account without the PROCESS privilege can see — the ones that count).
        `SELECT CAST(COALESCE((SELECT SUM(data_length + index_length) FROM information_schema.tables WHERE table_schema = DATABASE()), 0) AS CHAR) AS bytes,
                (SELECT COUNT(*) FROM information_schema.processlist WHERE db = DATABASE()) AS conns,
                (SELECT COUNT(*) FROM revisions) AS rev`
      );
      const bytes = Number(row.bytes);
      checks.push({ id: "db-size", label: "Size", status: bytes > 400 * 1048576 ? "warn" : "ok", detail: `${formatBytes(bytes)} on disk · ${plural(row.conns, "open connection")} · ${plural(row.rev, "revision")} kept.${bytes > 400 * 1048576 ? " Free-tier databases cap around 500 MB." : ""}` });
    } catch {
      // Permission to read pg_stat_activity varies by host; skip quietly.
    }
  }

  // ── Content ────────────────────────────────────────────────────────────────
  if (dbReachable) {
    try {
      const [{ n }] = await db.select({ n: count() }).from(posts).where(isLive(posts));
      // The count itself is a tile; only the empty site is worth a line.
      if (n === 0) checks.push({ id: "content", label: "Published posts", status: "info", detail: "None yet. The home page and blog are empty.", href: "/admin/posts/new" });
    } catch {
      // Not worth failing the report over.
    }
  }

  // Scheduled publishing: a cron has to hit /api/cron/publish for scheduled
  // posts to appear on time. Only worth a warning when something is actually
  // scheduled and nothing has run recently.
  if (dbReachable) {
    try {
      const [{ n }] = await rawQuery<{ n: number }>("SELECT count(*) AS n FROM posts WHERE status = 'published' AND deleted_at IS NULL AND published_at > now()");
      const last = (await rawQuery<{ value: string }>("SELECT value FROM site_settings WHERE `key` = 'cron_last_publish_check'"))[0]?.value;
      const lastMs = last ? Date.parse(last) : NaN;
      const recent = Number.isFinite(lastMs) && Date.now() - lastMs < 6 * 3600 * 1000;
      // The endpoint refuses every request — with a 404, indistinguishable
      // from a wrong token — until CRON_TOKEN (or BACKUP_TOKEN) is set. A cron
      // added without one therefore runs on schedule and achieves nothing,
      // which is exactly the state this check used to report as "no cron has
      // run yet: add a cron", advice that is wrong for the site that already
      // has one. Say what is actually missing.
      const cronToken = (process.env.CRON_TOKEN || process.env.BACKUP_TOKEN || "").trim();
      if (cronToken.length < 16) {
        checks.push({
          id: "cron",
          label: "Scheduled posts",
          status: n > 0 ? "warn" : "info",
          detail: `\`/api/cron/publish\` answers 404 to every request until CRON_TOKEN is set${cronToken ? " (the one set is shorter than 16 characters)" : ""}, so any cron already pointed at it is doing nothing — scheduled posts wait for the hourly refresh and the cache is never warmed after a publish.${n > 0 ? ` ${n} post${n === 1 ? " is" : "s are"} scheduled right now.` : ""}`,
          category: "integrations",
        });
      } else if (n > 0 && !recent) {
        checks.push({ id: "cron", label: "Scheduled posts", status: "warn", detail: `${n} post${n === 1 ? " is" : "s are"} scheduled but the publish cron has not run${last ? ` since ${new Date(lastMs).toLocaleString()}` : ""}. Without it they appear up to an hour late. Add a cron for /api/cron/publish?token=… (the token is CRON_TOKEN).`, category: "integrations" });
      } else if (recent) {
        checks.push({ id: "cron", label: "Scheduled posts", status: "ok", detail: `Publish cron last ran ${new Date(lastMs).toLocaleString()}.`, category: "integrations" });
      } else {
        checks.push({ id: "cron", label: "Scheduled posts", status: "info", detail: "No cron has run yet. Press Speed → Cron jobs → “Set up cron jobs” (it adds a 15-minute cron for /api/cron/publish) so scheduled posts go live on time (it also keeps the site warm).", category: "integrations" });
      }
    } catch {
      // Not worth failing the report over.
    }
  }

  // Recent errors, from the log the admin can read.
  if (dbReachable) {
    try {
      const [{ n }] = await rawQuery<{ n: number }>("SELECT count(*) AS n FROM error_log WHERE created_at > now() - INTERVAL 24 HOUR");
      checks.push(
        n > 0
          ? { id: "errors", label: "Errors (24h)", status: "warn", detail: `${n} recorded in the last day.`, href: "/admin/errors" }
          : { id: "errors", label: "Errors (24h)", status: "ok", detail: "None." }
      );
    } catch {
      // The table arrives with migration 0003; the schema check above already says if it is missing.
    }
  }

  const toggles = ["post_comments_show", "post_tags_show", "post_nav_show", "post_related_show"].filter((k) => (s[k] ?? "false") === "true");
  checks.push(
    toggles.length
      ? { id: "post-extras", label: "Post extras", status: "ok", detail: `${toggles.length} of 4 shown (comments, tags, prev/next, related).` }
      : { id: "post-extras", label: "Post extras", status: "info", detail: "Comments, tags, prev/next and related posts are all hidden on posts.", href: "/admin/customize" }
  );

  // ── Security ───────────────────────────────────────────────────────────────
  checks.push(
    // The trimmed comparison matters. A host panel that writes environment
    // variables into a shell script will happily store "production " with a
    // trailing space, and `"production " === "production"` is false — so Next
    // logs "non-standard NODE_ENV" on every boot and runs in a half-production
    // mode. This check already caught that, but it printed the value raw, and
    // a trailing space is invisible on screen: the line read "NODE_ENV is
    // production." and looked like a false alarm. Name the whitespace instead.
    process.env.NODE_ENV === "production"
      ? { id: "node-env", label: "Production mode", status: "ok", detail: "NODE_ENV is production." }
      : (process.env.NODE_ENV ?? "").trim() === "production"
        ? {
            id: "node-env",
            label: "Production mode",
            status: "fail",
            detail:
              `NODE_ENV is "${process.env.NODE_ENV}" — the right word with stray whitespace around it, which is not the same value. ` +
              `Next treats it as a non-standard environment. On cPanel, delete the NODE_ENV variable in Setup Node.js App entirely: ` +
              `the "Application mode: Production" dropdown sets it correctly on its own, and setting both is how the space got there.`,
          }
        : { id: "node-env", label: "Production mode", status: "warn", detail: `NODE_ENV is ${process.env.NODE_ENV ?? "unset"}. Error pages show stack traces and nothing is cached.` }
  );
  if (dbReachable) {
    try {
      const admins = await rawQuery<{ n: number; with2fa: number }>(
        "SELECT count(*) AS n, COUNT(CASE WHEN totp_enabled THEN 1 END) AS with2fa FROM users WHERE role = 'admin'"
      );
      const { n, with2fa } = admins[0] ?? { n: 0, with2fa: 0 };
      if (n === 0) {
        checks.push({ id: "admins", label: "Administrators", status: "fail", detail: "No admin account exists. Nobody can change settings or manage users.", href: "/admin/users" });
      } else {
        checks.push({ id: "admins", label: "Administrators", status: n > 3 ? "info" : "ok", detail: n > 3 ? `${n} admin accounts. Fewer is safer — most people only need editor.` : plural(n, "admin account"), href: "/admin/users" });
        checks.push(
          with2fa === n
            ? { id: "2fa", label: "Two-factor login", status: "ok", detail: `On for ${n === 1 ? "the admin account" : "every admin"}.` }
            : { id: "2fa", label: "Two-factor login", status: "warn", detail: `${n - with2fa} of ${n} admin${n === 1 ? "" : "s"} sign in with a password alone. A leaked password is then enough to take the site.`, href: "/admin/users" }
        );
        // What an admin who forgets their password has left. With no email and
        // no authenticator there is nothing: the Forgot password page can send
        // no link and has no code to accept, and only someone with database
        // access could get back in.
        checks.push(
          mail.configured || with2fa > 0
            ? {
                id: "recovery",
                label: "Password recovery",
                status: "ok",
                detail: mail.configured
                  ? with2fa > 0 ? "By emailed link, or with an authenticator code." : "By emailed link."
                  : "With an authenticator code (Forgot password → Use your authenticator app). Email is not set up, so no links are sent.",
              }
            : {
                id: "recovery",
                label: "Password recovery",
                status: "warn",
                detail: "No way back in if a password is forgotten: email is not set up, so no reset link can be sent, and no admin has two-factor sign-in, so the authenticator reset cannot be used either.",
              }
        );
      }
      const [{ n: total }] = await rawQuery<{ n: number }>("SELECT count(*) AS n FROM users");
      checks.push(
        total > 0
          ? { id: "setup", label: "Setup page", status: "ok", detail: "Closed — the first-run setup refuses once an account exists." }
          : { id: "setup", label: "Setup page", status: "fail", detail: "Open. Anyone who finds /setup can create the first admin.", href: "/setup" }
      );
    } catch {
      // Not worth failing the report over.
    }
  }
  checks.push(
    has(process.env.CRON_TOKEN)
      ? { id: "cron-token", label: "Cron token", status: "ok", detail: "CRON_TOKEN is set; cron routes refuse other callers." }
      : has(process.env.BACKUP_TOKEN)
        ? {
            id: "cron-token",
            label: "Cron token",
            status: "warn",
            detail:
              "CRON_TOKEN is not set, so the publish cron is using BACKUP_TOKEN. That token then sits in a crontab line and the host's access logs, and whoever reads it can also trigger backups. Set a separate CRON_TOKEN, change the cron to use it, and Restart.",
          }
        : { id: "cron-token", label: "Cron token", status: "info", detail: "CRON_TOKEN is not set, so the publish cron answers nobody. Set it to a long random string." }
  );

  // ── Server ─────────────────────────────────────────────────────────────────
  let nextVersion = "";
  try {
    nextVersion = JSON.parse(await readFile(path.join(process.cwd(), "node_modules", "next", "package.json"), "utf8")).version ?? "";
  } catch {
    // Not installed next to the app (a bundle) — leave it out.
  }
  checks.push({ id: "versions", label: "Software", status: "ok", detail: `BMS ${CURRENT_VERSION}${nextVersion ? ` · Next.js ${nextVersion}` : ""} · ${process.platform} ${process.arch}`, href: "/admin/updates" });
  try {
    const built = (await readFile(path.join(process.cwd(), process.env.BUILD_DIR || ".next", "BMS_NEXT_VERSION"), "utf8")).trim();
    if (built && nextVersion) {
      checks.push(
        built === nextVersion
          ? { id: "build-match", label: "Build matches Next.js", status: "ok", detail: `Built with and running on ${built}.` }
          : { id: "build-match", label: "Build matches Next.js", status: "fail", detail: `Built with Next.js ${built}, but ${nextVersion} is installed. Some pages will fail with a plain 500. In cPanel run NPM Install again (the version is pinned), then Restart.` }
      );
    }
  } catch {
    // No marker file — a build that was not packed with npm run pack.
  }
  const mem = process.memoryUsage();
  const rssMb = Math.round(mem.rss / 1048576);
  checks.push({
    id: "memory",
    label: "Memory",
    status: rssMb > 900 ? "warn" : "ok",
    detail: `${rssMb} MB in use by this process (heap ${Math.round(mem.heapUsed / 1048576)} of ${Math.round(mem.heapTotal / 1048576)} MB).${rssMb > 900 ? " Shared hosts usually cap Node apps around 1 GB — a restart frees it." : ""}`,
  });
  checks.push(restartCheck());
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const siteTz = s.site_timezone?.trim();
  checks.push(
    siteTz && siteTz !== tz
      ? { id: "timezone", label: "Timezone", status: "info", detail: `Server clock is ${tz}; the site publishes in ${siteTz}. Scheduled posts use the site timezone, so this is fine.` }
      : { id: "timezone", label: "Timezone", status: "ok", detail: `${tz} — server time ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC.` }
  );
  try {
    const fs = await statfs(process.cwd());
    const free = Number(fs.bavail) * Number(fs.bsize);
    const total = Number(fs.blocks) * Number(fs.bsize);
    const pct = total > 0 ? Math.round((1 - free / total) * 100) : 0;
    checks.push({
      id: "disk",
      label: "Disk space",
      status: free < 200 * 1048576 ? "fail" : free < 1024 * 1048576 ? "warn" : "ok",
      detail: `${formatBytes(free)} free of ${formatBytes(total)} (${pct}% used).${free < 1024 * 1048576 ? " Uploads and backups will start failing when it runs out." : ""}`,
    });
  } catch {
    // statfs is not available everywhere (older Node, some containers).
  }
  try {
    await import("sharp");
    checks.push({ id: "sharp", label: "Image processing", status: "ok", detail: "sharp is installed — uploads are converted to WebP and resized." });
  } catch {
    checks.push({ id: "sharp", label: "Image processing", status: "warn", detail: "sharp failed to load. Uploads are stored as-is, unoptimised. Run npm install on the server." });
  }

  // Backups on disk — what the cron actually produced, not just the token.
  try {
    const dir = path.join(process.cwd(), "backups");
    const files = (await readdir(dir)).filter((f) => /^backup-.*\.zip$/.test(f)).sort();
    const latest = files[files.length - 1];
    if (latest) {
      const st = await stat(path.join(dir, latest));
      const ageH = (Date.now() - st.mtimeMs) / 3600000;
      checks.push({
        id: "backup-files",
        label: "Last backup",
        status: ageH > 72 ? "warn" : "ok",
        detail: `${ago(st.mtimeMs)} (${formatBytes(st.size)}), ${plural(files.length, "archive")} kept in backups/.${ageH > 72 ? " The daily cron seems to have stopped." : ""}`,
      });
    } else if (has(process.env.BACKUP_TOKEN)) {
      checks.push({ id: "backup-files", label: "Last backup", status: "info", detail: "None written yet. The cron has not called /api/backup so far." });
    }
  } catch {
    // No backups/ folder yet.
  }

  // ── Content, in more detail ────────────────────────────────────────────────
  const stats: HealthStat[] = [];
  if (dbReachable) {
    try {
      const [p] = await rawQuery<{ live: number; drafts: number; scheduled: number; trashed: number; nofeat: number; nodesc: number; nocat: number; stale: number }>(
        `SELECT
           COUNT(CASE WHEN status = 'published' AND deleted_at IS NULL AND (published_at IS NULL OR published_at <= now()) THEN 1 END) AS live,
           COUNT(CASE WHEN status = 'draft' AND deleted_at IS NULL THEN 1 END) AS drafts,
           COUNT(CASE WHEN status = 'published' AND deleted_at IS NULL AND published_at > now() THEN 1 END) AS scheduled,
           COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) AS trashed,
           COUNT(CASE WHEN status = 'published' AND deleted_at IS NULL AND (featured_image IS NULL OR featured_image = '') THEN 1 END) AS nofeat,
           COUNT(CASE WHEN status = 'published' AND deleted_at IS NULL AND (seo_description IS NULL OR seo_description = '') AND (excerpt IS NULL OR excerpt = '') THEN 1 END) AS nodesc,
           COUNT(CASE WHEN status = 'published' AND deleted_at IS NULL AND category_id IS NULL THEN 1 END) AS nocat,
           COUNT(CASE WHEN status = 'published' AND deleted_at IS NULL AND updated_at < now() - INTERVAL 12 MONTH THEN 1 END) AS stale
         FROM posts`
      );
      const [pg] = await rawQuery<{ live: number; drafts: number }>(
        `SELECT COUNT(CASE WHEN status = 'published' AND deleted_at IS NULL THEN 1 END) AS live,
                COUNT(CASE WHEN status = 'draft' AND deleted_at IS NULL THEN 1 END) AS drafts FROM pages`
      );
      const [m] = await rawQuery<{ n: number; bytes: string; noalt: number }>(
        "SELECT count(*) AS n, coalesce(sum(size), 0) AS bytes, COUNT(CASE WHEN mime_type LIKE 'image/%' AND (alt IS NULL OR alt = '') THEN 1 END) AS noalt FROM media"
      );
      const [c] = await rawQuery<{ pending: number; approved: number }>(
        "SELECT COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending, COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved FROM comments"
      );
      const [nf] = await rawQuery<{ n: number; hits: number }>(
        "SELECT count(*) AS n, CAST(COALESCE(SUM(hits), 0) AS SIGNED) AS hits FROM not_found_log WHERE last_hit > now() - INTERVAL 7 DAY"
      );
      const [u] = await rawQuery<{ n: number }>("SELECT count(*) AS n FROM users");
      const [pl] = await rawQuery<{ n: number; enabled: number }>("SELECT count(*) AS n, COUNT(CASE WHEN enabled THEN 1 END) AS enabled FROM plugins");
      const [rd] = await rawQuery<{ n: number }>("SELECT count(*) AS n FROM redirects");
      const [ec] = await rawQuery<{ empty: number; total: number }>(
        `SELECT count(*) AS total,
                COUNT(CASE WHEN NOT EXISTS (SELECT 1 FROM posts p WHERE p.category_id = c.id AND p.status = 'published' AND p.deleted_at IS NULL) THEN 1 END) AS empty
         FROM categories c`
      );
      const [nav] = await rawQuery<{ n: number }>("SELECT count(*) AS n FROM nav_items");
      const [fs] = await rawQuery<{ n: number }>("SELECT count(*) AS n FROM form_submissions WHERE created_at > now() - INTERVAL 7 DAY").catch(() => [{ n: 0 }]);

      stats.push(
        { id: "posts", label: "Published posts", value: String(p.live), note: `${plural(p.drafts, "draft")} · ${p.scheduled} scheduled`, href: "/admin/posts", tone: p.live > 0 ? "good" : "neutral" },
        { id: "pages", label: "Pages", value: String(pg.live), note: pg.drafts ? plural(pg.drafts, "draft") : "all published", href: "/admin/pages" },
        { id: "media", label: "Media files", value: String(m.n), note: formatBytes(Number(m.bytes)), href: "/admin/media" },
        { id: "comments", label: "Comments waiting", value: String(c.pending), note: `${c.approved} approved`, href: "/admin/comments", tone: c.pending > 0 ? "warn" : "neutral" },
        { id: "notfound", label: "404s this week", value: String(nf.hits), note: plural(nf.n, "address", "addresses"), href: "/admin/seo", tone: nf.hits > 50 ? "warn" : "neutral" },
        { id: "users", label: "Users", value: String(u.n), note: "all roles", href: "/admin/users" },
        { id: "plugins", label: "Plugins", value: String(pl.enabled), note: pl.n !== pl.enabled ? `${pl.n - pl.enabled} off` : pl.n ? "all on" : "none installed", href: "/admin/plugins" },
        { id: "forms", label: "Form entries (7d)", value: String(fs.n), note: "contact forms", href: "/admin/forms" }
      );

      checks.push(
        p.drafts > 0
          ? { id: "drafts", label: "Drafts", status: "info", detail: `${plural(p.drafts, "draft")} waiting.`, href: "/admin/posts?status=draft", category: "content" }
          : { id: "drafts", label: "Drafts", status: "ok", detail: "None waiting.", category: "content" }
      );
      if (p.scheduled > 0) checks.push({ id: "scheduled", label: "Scheduled", status: "ok", detail: `${plural(p.scheduled, "post")} due to go live.`, href: "/admin/posts?status=scheduled", category: "content" });
      if (p.trashed > 0) checks.push({ id: "trash", label: "Trash", status: "info", detail: `${plural(p.trashed, "post")} in the trash.`, href: "/admin/posts?status=trash", category: "content" });
      checks.push(
        p.nofeat > 0
          ? { id: "featured", label: "Featured images", status: "warn", detail: `${plural(p.nofeat, "published post")} ha${p.nofeat === 1 ? "s" : "ve"} no featured image — shared without a picture and plain in listings.`, href: "/admin/posts", category: "content" }
          : { id: "featured", label: "Featured images", status: "ok", detail: p.live ? "Every published post has one." : "Nothing published yet.", category: "content" }
      );
      checks.push(
        p.nodesc > 0
          ? { id: "post-descriptions", label: "Post descriptions", status: "warn", detail: `${plural(p.nodesc, "published post")} ha${p.nodesc === 1 ? "s" : "ve"} neither a meta description nor an excerpt; search engines improvise one.`, href: "/admin/posts", category: "seo" }
          : { id: "post-descriptions", label: "Post descriptions", status: "ok", detail: p.live ? "Every published post has a description or excerpt." : "Nothing published yet.", category: "seo" }
      );
      checks.push(
        p.nocat > 0
          ? { id: "uncategorised", label: "Uncategorised", status: "info", detail: `${plural(p.nocat, "published post")} without a category.`, href: "/admin/posts", category: "content" }
          : { id: "uncategorised", label: "Categories on posts", status: "ok", detail: p.live ? "Every published post is filed under a category." : "Nothing published yet.", category: "content" }
      );
      checks.push(
        p.stale > 0
          ? { id: "stale", label: "Stale content", status: "info", detail: `${plural(p.stale, "post")} not touched in over a year. Refreshing old posts is the cheapest SEO there is.`, href: "/admin/posts/stale", category: "content" }
          : { id: "stale", label: "Stale content", status: "ok", detail: "Nothing older than a year without an update.", href: "/admin/posts/stale", category: "content" }
      );
      checks.push(
        m.noalt > 0
          ? { id: "alt-text", label: "Image alt text", status: "warn", detail: `${plural(m.noalt, "image")} in the library ha${m.noalt === 1 ? "s" : "ve"} no alt text — invisible to screen readers and image search.`, href: "/admin/media", category: "seo" }
          : { id: "alt-text", label: "Image alt text", status: "ok", detail: m.n ? "Every image has alt text." : "No images uploaded yet.", category: "seo" }
      );
      checks.push(
        c.pending > 0
          ? { id: "comments-pending", label: "Comments", status: "info", detail: `${plural(c.pending, "comment")} waiting for approval.`, href: "/admin/comments", category: "content" }
          : { id: "comments-pending", label: "Comments", status: "ok", detail: "Nothing waiting for moderation.", category: "content" }
      );
      checks.push(
        ec.empty > 0
          ? { id: "empty-categories", label: "Empty categories", status: "info", detail: `${ec.empty} of ${ec.total} categories have no published posts; their archive pages are empty.`, href: "/admin/categories", category: "content" }
          : { id: "empty-categories", label: "Categories", status: ec.total ? "ok" : "info", detail: ec.total ? `${plural(ec.total, "category", "categories")}, all with posts.` : "No categories yet.", href: "/admin/categories", category: "content" }
      );
      checks.push(
        nav.n > 0
          ? { id: "navigation", label: "Navigation", status: "ok", detail: `${plural(nav.n, "menu item")}.`, href: "/admin/navigation", category: "content" }
          : { id: "navigation", label: "Navigation", status: "warn", detail: "No menu items. Visitors have nowhere to go from the header.", href: "/admin/navigation", category: "content" }
      );
      checks.push(
        nf.hits > 50
          ? { id: "not-found", label: "404 hits (7d)", status: "warn", detail: `${nf.hits} hits on ${plural(nf.n, "missing address", "missing addresses")}. Add redirects for the busy ones.`, href: "/admin/seo", category: "seo" }
          : { id: "not-found", label: "404 hits (7d)", status: "ok", detail: nf.hits ? `${nf.hits} hits on ${plural(nf.n, "address", "addresses")}.` : "None.", href: "/admin/seo", category: "seo" }
      );
      try {
        const orphans = await orphanReport(s, url);
        checks.push(
          orphans.orphans.length > 0
            ? { id: "orphans", label: "Orphaned content", status: "warn", detail: `${plural(orphans.orphans.length, "published post or page", "published posts and pages")} with no internal link pointing to ${orphans.orphans.length === 1 ? "it" : "them"}.`, href: "/admin/links", category: "seo" }
            : { id: "orphans", label: "Orphaned content", status: "ok", detail: orphans.total ? "Everything published is linked from somewhere." : "Nothing published yet.", href: "/admin/links", category: "seo" }
        );
      } catch {
        // Not worth failing the report over.
      }
      checks.push({ id: "redirects", label: "Redirects", status: "ok", detail: rd.n ? `${plural(rd.n, "rule")} in place.` : "No rules yet; old addresses can be mapped under SEO → Redirects.", href: "/admin/seo", category: "seo" });
    } catch {
      // Any table missing means the schema check already says so.
    }
  }

  // ── SEO, the rest ──────────────────────────────────────────────────────────
  const noindex = ["seo_post_noindex", "seo_page_noindex", "seo_category_noindex"].filter((k) => s[k] === "true");
  checks.push(
    noindex.length
      ? { id: "noindex", label: "Indexing", status: "warn", detail: `${noindex.map((k) => k.replace("seo_", "").replace("_noindex", "")).join(", ")} pages are set to noindex. Search engines will drop them.`, href: "/admin/seo", category: "seo" }
      : { id: "noindex", label: "Indexing", status: "ok", detail: "Posts, pages and categories are all indexable.", category: "seo" }
  );
  // One by one too. A WordPress migration copied each page's robots tag and left a
  // 3,000-click page and both category hubs noindex; no setting above showed it.
  try {
    const [noPages, noPosts, noCats] = await Promise.all([
      db.query.pages.findMany({ where: and(eq(pages.status, "published"), eq(pages.noIndex, true), notTrashed(pages)), columns: { title: true } }),
      db.query.posts.findMany({ where: and(eq(posts.status, "published"), eq(posts.noIndex, true), notTrashed(posts)), columns: { title: true } }),
      db.query.categories.findMany({ where: eq(categories.noIndex, true), columns: { name: true } }),
    ]);
    const names = [...noPages.map((d) => `"${d.title}"`), ...noPosts.map((d) => `"${d.title}"`), ...noCats.map((c) => `category "${c.name}"`)];
    if (names.length) {
      checks.push({
        id: "noindex-items",
        label: "Hidden from Google",
        status: "warn",
        detail: `${plural(names.length, "published page, post or category", "published pages, posts and categories")} set to noindex on its own: ${names.slice(0, 8).join(", ")}${names.length > 8 ? " …" : ""}. Untick No Index on any that should be found in search.`,
        href: "/admin/seo",
        category: "seo",
      });
    }
  } catch {
    // A missing column is the schema check's to report.
  }
  checks.push(
    (s.seo_indexnow_enabled ?? "true") !== "false"
      ? { id: "indexnow", label: "IndexNow", status: "ok", detail: "On — Bing, Yandex and friends are pinged when something is published.", category: "seo" }
      : { id: "indexnow", label: "IndexNow", status: "info", detail: "Off. Turning it on gets new posts into Bing within minutes instead of days.", href: "/admin/seo", category: "seo" }
  );
  checks.push(
    has(s.seo_twitter_site)
      ? { id: "twitter", label: "X / Twitter handle", status: "ok", detail: s.seo_twitter_site, category: "seo" }
      : { id: "twitter", label: "X / Twitter handle", status: "info", detail: "Not set. Shared links do not credit the site's account.", href: "/admin/seo", category: "seo" }
  );
  checks.push(
    has(s.seo_kg_name)
      ? { id: "kg-name", label: "Organization schema", status: "ok", detail: `${s.seo_kg_type || "Organization"}: ${s.seo_kg_name}`, category: "seo" }
      : { id: "kg-name", label: "Organization schema", status: "info", detail: "No publisher name for structured data; the site name is used.", href: "/admin/seo", category: "seo" }
  );
  const socials = ["social_facebook", "social_twitter", "social_instagram", "social_linkedin"].filter((k) => has(s[k]));
  checks.push({ id: "social", label: "Social profiles", status: socials.length ? "ok" : "info", detail: socials.length ? `${socials.length} linked (sameAs in the Organization schema).` : "None linked. Profiles go into the Organization schema and the footer.", href: "/admin/seo", category: "identity" });
  checks.push({ id: "language", label: "Language", status: "ok", detail: `${s.site_language || "en"} · ${s.site_direction === "rtl" ? "right-to-left" : "left-to-right"}`, href: "/admin/settings", category: "identity" });
  checks.push(
    has(s.site_logo)
      ? { id: "logo", label: "Logo", status: "ok", detail: "Set.", category: "identity" }
      : { id: "logo", label: "Logo", status: "info", detail: "No logo — the header shows the site name as text.", href: "/admin/customize", category: "identity" }
  );

  // ── Categories for the checks written before this screen had columns ───────
  const CATEGORY_OF: Record<string, HealthCategory> = {
    "site-url": "identity", "auth-url": "security", "site-name": "identity", "site-description": "identity", favicon: "identity",
    "og-image": "seo", "kg-logo": "seo", verification: "seo", sitemap: "seo",
    "auth-secret": "security", "node-env": "security", admins: "security", "2fa": "security", recovery: "security", setup: "security", "cron-token": "security",
    node: "server", versions: "server", "build-match": "server", memory: "server", uptime: "server", timezone: "server", disk: "server", sharp: "server", storage: "server", images: "server",
    smtp: "integrations", turnstile: "integrations", backups: "integrations", "backup-files": "integrations", cron: "integrations",
    database: "database", migrations: "database", "db-size": "database", "db-driver": "database",
    content: "content", errors: "server", "post-extras": "content",
  };
  for (const c of checks) if (!c.category) c.category = CATEGORY_OF[c.id] ?? "server";

  // The newer checks, then the guide for every finding: where to fix it and
  // how, looked up by id so no check has to carry its own instructions.
  checks.push(...(await extraHealthChecks(s, dbReachable).catch(() => [])));
  const panel = (s.hosting_panel_url ?? "").trim();
  for (const c of checks) {
    const g = HEALTH_GUIDES[c.id];
    if (!g) continue;
    if (g.href === "host") {
      // Fixed in the hosting panel, not here. Link to it when known; a link
      // that lands back on this report is worse than no link.
      c.href = /^https?:\/\//.test(panel) ? panel : undefined;
      if (!c.how) c.how = (panel ? "" : "In your hosting control panel (add its address under Settings → Hosting control panel to link it here). ") + g.how;
    } else {
      if (!c.href || c.href === "/admin/health") c.href = g.href;
      if (!c.how) c.how = g.how;
    }
  }

  const counts: Record<HealthStatus, number> = { ok: 0, warn: 0, fail: 0, info: 0 };
  for (const c of checks) counts[c.status]++;
  const graded = counts.ok + counts.warn + counts.fail;
  const score = graded === 0 ? 100 : Math.max(0, Math.round(((counts.ok + counts.warn * 0.5) / graded) * 100) - counts.fail * 5);
  const cleanup = dbReachable ? await previewCleanup().catch(() => undefined) : undefined;
  return { checks, stats, counts, score, cleanup, ranAt: new Date().toISOString() };
}

/**
 * Reaches the public site from this server and reports what a visitor gets.
 *
 * On demand rather than part of the report: a shared host may not be able to
 * connect to its own public domain, and a 15-second timeout is not something
 * to pay on every page load of the admin.
 */
export async function checkLiveSite(s?: SiteSettings): Promise<HealthCheck[]> {
  const settings = s ?? (await getSiteSettings());
  const base = siteUrl(settings);
  const out: HealthCheck[] = [];
  const ua = "Mozilla/5.0 (compatible; BMS-HealthCheck/1.0)";

  const started = Date.now();
  try {
    const res = await fetch(`${base}/`, {
      headers: { "user-agent": ua, accept: "text/html" },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    const ms = Date.now() - started;
    const html = res.ok ? await res.text() : "";
    out.push({
      id: "live-home",
      label: "Home page",
      status: res.ok ? (ms > 3000 ? "warn" : "ok") : "fail",
      detail: res.ok ? `${res.status} in ${ms} ms` : `Status ${res.status}${res.status >= 300 && res.status < 400 ? ` → ${res.headers.get("location") ?? "?"}` : ""}`,
    });
    if (res.ok) {
      const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1];
      out.push({
        id: "live-canonical",
        label: "Canonical tag",
        status: canonical && canonical.startsWith(base) ? "ok" : "fail",
        detail: canonical ? canonical : "No canonical tag found.",
      });
      out.push({
        id: "live-description",
        label: "Meta description",
        status: /<meta[^>]+name="description"/i.test(html) ? "ok" : "warn",
        detail: /<meta[^>]+name="description"/i.test(html) ? "Present." : "Missing on the home page.",
      });
      // LiteSpeed answers `X-LiteSpeed-Cache: hit|miss` when its page cache is
      // on for this account; a LiteSpeed `Server` header without it means the
      // cache is switched off at the host, which the owner can turn on.
      const ls = res.headers.get("x-litespeed-cache");
      const server = res.headers.get("server") ?? "";
      const lsWanted = (settings.cache_litespeed ?? "true") !== "false";
      if (ls) {
        out.push({
          id: "live-lscache",
          label: "LiteSpeed page cache",
          status: ls.toLowerCase().startsWith("hit") ? "ok" : "info",
          detail: ls.toLowerCase().startsWith("hit")
            ? `Served by LiteSpeed's cache without touching the app (${ms} ms).`
            : `LiteSpeed is caching but this was a miss — the first visit after a change. Check again.`,
        });
      } else if (/litespeed/i.test(server)) {
        out.push({
          id: "live-lscache",
          label: "LiteSpeed page cache",
          status: lsWanted ? "warn" : "info",
          detail: lsWanted
            ? "LiteSpeed fronts the site but returned no cache status. Turn on LiteSpeed Cache for this domain in cPanel (LiteSpeed Web Cache Manager) so pages are served without waking the app."
            : "LiteSpeed fronts the site; page caching is switched off under Speed → Cache.",
        });
      }
      const cf = res.headers.get("cf-cache-status");
      const cc = res.headers.get("cache-control") ?? "";
      if (cf) {
        out.push({
          id: "live-cdn",
          label: "CDN cache",
          status: cf === "HIT" ? "ok" : "warn",
          detail: cf === "HIT" ? "Cloudflare served this from its edge." : `Cloudflare: ${cf}. HTML is not being cached at the edge; every visit reaches the origin (${ms} ms). A Cache Rule for everything except /admin* and /api* fixes it.`,
        });
      } else {
        out.push({ id: "live-cdn", label: "CDN cache", status: "info", detail: `No CDN in front. Origin answered in ${ms} ms.${cc ? ` Cache-Control: ${cc}` : ""}` });
      }
      out.push({
        id: "live-compression",
        label: "Compression",
        status: res.headers.get("content-encoding") ? "ok" : "info",
        detail: res.headers.get("content-encoding") ?? "None reported (the check does not send Accept-Encoding; browsers do).",
      });
    }
  } catch (err) {
    out.push({
      id: "live-home",
      label: "Home page",
      status: "warn",
      detail: `This server could not reach ${base} (${err instanceof Error ? err.message : String(err)}). That does not necessarily mean visitors cannot — some hosts block connections to their own domain.`,
    });
    return out;
  }

  for (const [id, label, p, expect] of [
    ["live-robots", "robots.txt", "/robots.txt", /Sitemap:/i],
    ["live-sitemap", "Sitemap", "/sitemap_index.xml", /<sitemapindex/i],
  ] as const) {
    try {
      const res = await fetch(`${base}${p}`, { headers: { "user-agent": ua }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const body = res.ok ? await res.text() : "";
      out.push({
        id,
        label,
        status: res.ok && expect.test(body) ? "ok" : "fail",
        detail: res.ok ? (expect.test(body) ? `${base}${p}` : `Served, but ${id === "live-robots" ? "has no Sitemap: line" : "is not a sitemap"}.`) : `Status ${res.status}`,
      });
    } catch {
      out.push({ id, label, status: "warn", detail: `Could not fetch ${p}.` });
    }
  }

  // `/favicon.ico` is the icon browser tabs and Google's results use, and a
  // cache in front (Cloudflare keeps .ico files for a day by default) goes on
  // serving the old one after the Site Icon changes. The first live site
  // showed the CMS's blue placeholder for hours after its real icon was set,
  // while every check in this report said the icon was fine. Compared by
  // bytes against what this process renders for the current setting.
  try {
    const [res, mine] = await Promise.all([
      fetch(`${base}/favicon.ico`, { headers: { "user-agent": ua }, cache: "no-store", signal: AbortSignal.timeout(15_000) }),
      renderIcon(settings, base, 48, "ico"),
    ]);
    const served = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    if (!served) {
      out.push({ id: "live-favicon", label: "Favicon", status: "fail", detail: `${base}/favicon.ico answered ${res.status}.` });
    } else if (mine) {
      const same = mine.body.equals(served);
      const age = res.headers.get("age");
      out.push({
        id: "live-favicon",
        label: "Favicon",
        status: same ? "ok" : "warn",
        detail: same
          ? "Visitors get the current Site Icon."
          : `Visitors get a different icon from the current Site Icon — an old copy kept by a cache${res.headers.get("cf-cache-status") ? ` (Cloudflare: ${res.headers.get("cf-cache-status")}${age ? `, ${Math.round(Number(age) / 60)} min old` : ""})` : ""}.`,
        how: same
          ? undefined
          : "Press Purge cache below; with Cloudflare filled in there, it clears Cloudflare too. Without it: Cloudflare dashboard → Caching → Configuration → Custom Purge → URL → this site's /favicon.ico. Left alone, the old copy expires within a day.",
      });
    }
  } catch {
    out.push({ id: "live-favicon", label: "Favicon", status: "warn", detail: "Could not fetch /favicon.ico." });
  }

  return out;
}
