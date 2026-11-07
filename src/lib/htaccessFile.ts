// Writing the site's `.htaccess` from inside the CMS.
//
// Why this exists: the rules in `htaccess.ts` are the only part of this
// product that cannot be done from Node. LiteSpeed answers for any file that
// exists on disk without the request ever reaching the app, so the cache
// headers the Speed screen sets never touch an uploaded image — the host's
// own four-hour default does. The fix is a few lines in a file, and asking a
// site owner to open cPanel's File Manager, turn on hidden files and edit the
// one file that takes the whole site down when it has a typo is not a step a
// product can have.
//
// It is safe to do from here: the app already writes fonts, uploads and
// plugins at runtime, and the document root is a sibling directory under the
// same home and the same Unix user.
//
// Three things make it safe to do automatically:
//
//  1. The document root is identified, never guessed. A candidate counts only
//     if its `.htaccess` names this app's own root, which is what cPanel's
//     Node.js selector writes into the Passenger block. On an account with
//     twenty addon domains, that test is what stops this from writing to the
//     wrong site.
//  2. Only what lies between two markers is ever touched. The rest of the
//     file — above all the Passenger block, without which the site does not
//     run at all — is copied through byte for byte.
//  3. The site is fetched again after the write. A bad `.htaccess` is a 500
//     on every URL including the admin, so there would be no way back through
//     the screen that caused it. If the site stops answering, the previous
//     file is put back before this function returns.

import { copyFile, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { HTACCESS_FILE_RULES, HTACCESS_RULES } from "@/lib/htaccess";

const BEGIN = "# BEGIN BMS by Rehan";
const END = "# END BMS by Rehan";
const BACKUP = ".htaccess.bms-previous";

/** What the CMS puts in a file, markers included. */
export function managedBlock(rules: string = HTACCESS_RULES): string {
  return [
    BEGIN,
    "# Written by BMS by Rehan (Admin -> Speed -> Server rules). Anything",
    "# between these two markers is replaced when the rules change; anything",
    "# outside them, the Passenger block below included, is never touched.",
    rules,
    END,
    "",
  ].join("\n");
}

/**
 * The second file, beside the uploads.
 *
 * Apache reads the `.htaccess` files along the path of the file it is
 * serving. An uploaded image lives at `<app>/public/uploads/...`, which is
 * not under the domain's document root, so the rules there are read when a
 * page is served and never when an image is. This is the copy that actually
 * reaches them; the document root keeps the page-cache half, which is not a
 * directory-level directive and belongs only there.
 */
function publicHtaccess(): string {
  return path.join(process.cwd(), "public", ".htaccess");
}

export interface Docroot {
  /** The directory the domain is served from. */
  dir: string;
  /** The `.htaccess` inside it. */
  file: string;
  /** Its current contents. */
  content: string;
}

/**
 * The document root in front of this app, or null.
 *
 * cPanel puts an addon domain at `/home/<user>/<domain>` and the primary one
 * at `/home/<user>/public_html`, so both are tried — but a candidate is only
 * accepted when its `.htaccess` mentions this app's root, which is what the
 * Node.js selector writes into `PassengerAppRoot`. Without that check, a site
 * on an addon domain would happily rewrite the primary domain's file.
 */
export async function findDocroot(): Promise<Docroot | null> {
  const appRoot = process.cwd();
  const parent = path.dirname(appRoot);
  const override = process.env.BMS_DOCROOT?.trim();

  const siblings = await readdir(parent).catch(() => [] as string[]);
  const candidates = [
    ...(override ? [override] : []),
    // A domain folder has a dot in it; the primary domain is public_html.
    ...siblings.filter((name) => name.includes(".") || name === "public_html").map((name) => path.join(parent, name)),
  ];

  const seen = new Set<string>();
  for (const dir of candidates) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    const file = path.join(dir, ".htaccess");
    const content = await readFile(file, "utf8").catch(() => null);
    if (content === null) continue;
    // The Passenger block names the app it fronts. That is the proof.
    if (content.includes(appRoot)) return { dir, file, content };
    // An explicit override is trusted without it: a host that does not use
    // Passenger has no block to look for.
    if (override && dir === override) return { dir, file, content };
  }
  return null;
}

/** The file with our block spliced in at the top, or taken back out. */
export function splice(content: string, block: string | null): string {
  const start = content.indexOf(BEGIN);
  const endAt = content.indexOf(END);
  let rest = content;
  if (start !== -1 && endAt > start) {
    rest = content.slice(0, start) + content.slice(endAt + END.length);
  }
  // Whatever the block left behind, the file should not start with blank lines.
  rest = rest.replace(/^\s*\n/, "").replace(/^(\r?\n)+/, "");
  if (!block) return rest;
  return `${block}\n${rest}`;
}

export interface HtaccessStatus {
  /** Where the document-root file is, when it could be found. */
  path: string | null;
  /** The copy beside the uploads, which is the one images are served under. */
  publicPath?: string;
  /** Whether that second copy carries our block. */
  publicManaged?: "current" | "absent";
  /** Whether our block is present, and whether it matches this version. */
  managed: "current" | "outdated" | "absent" | "unknown";
  /** The Cache-Control an uploaded image is actually served with. */
  uploadsCacheControl?: string;
  /** How long that header keeps the file, in seconds. */
  uploadsMaxAge?: number;
  error?: string;
}

/** An uploaded image to test the rules against, as a site-relative URL. */
async function sampleUpload(): Promise<string | null> {
  const dir = path.join(process.cwd(), "public", "uploads");
  const names = await readdir(dir).catch(() => [] as string[]);
  const file = names.find((n) => /\.(webp|avif|png|jpe?g|gif)$/i.test(n));
  return file ? `/uploads/${encodeURIComponent(file)}` : null;
}

/**
 * What an uploaded image is really served with — asked over HTTP, so the
 * answer comes from LiteSpeed rather than from what this app believes it set.
 * That distinction is the whole point of this file. A query string keeps any
 * edge cache out of the reply.
 */
async function measureUploads(siteUrl: string): Promise<{ header?: string; maxAge?: number }> {
  const sample = await sampleUpload();
  if (!sample) return {};
  try {
    const res = await fetch(`${siteUrl}${sample}?bms=${Date.now()}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const header = res.headers.get("cache-control") ?? undefined;
    const match = header ? /max-age=(\d+)/i.exec(header) : null;
    return { header, maxAge: match ? parseInt(match[1], 10) : undefined };
  } catch {
    return {};
  }
}

export async function htaccessStatus(siteUrl: string): Promise<HtaccessStatus> {
  const pub = publicHtaccess();
  const [found, measured, pubContent] = await Promise.all([
    findDocroot(),
    measureUploads(siteUrl),
    readFile(pub, "utf8").catch(() => null),
  ]);
  const publicManaged =
    pubContent !== null && pubContent.includes(managedBlock(HTACCESS_FILE_RULES).trimEnd()) ? "current" : "absent";

  if (!found) {
    return {
      path: null,
      publicPath: pub,
      publicManaged,
      managed: "unknown",
      uploadsCacheControl: measured.header,
      uploadsMaxAge: measured.maxAge,
      error: "Could not find the folder this domain is served from.",
    };
  }
  const managed = !found.content.includes(BEGIN)
    ? "absent"
    : found.content.includes(managedBlock().trimEnd())
      ? "current"
      : "outdated";
  return {
    path: found.file,
    publicPath: pub,
    publicManaged,
    // Both copies have to be right for the rules to do their job, so a
    // missing one reads as "outdated" rather than quietly passing.
    managed: managed === "current" && publicManaged !== "current" ? "outdated" : managed,
    uploadsCacheControl: measured.header,
    uploadsMaxAge: measured.maxAge,
  };
}

export interface ApplyResult {
  ok: boolean;
  reason?: "written" | "removed" | "unchanged" | "not-found" | "unwritable" | "rolled-back";
  error?: string;
  status?: HtaccessStatus;
}

/** Two tries, because a cold LiteSpeed worker can lose the first one. */
async function siteAnswers(siteUrl: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${siteUrl}/robots.txt?bms=${Date.now()}`, {
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
        redirect: "follow",
      });
      if (res.status < 500) return true;
    } catch {
      // Fall through to the retry.
    }
  }
  return false;
}

/**
 * Adds or removes the block, then checks that the site still answers.
 *
 * LiteSpeed reads `.htaccess` fresh on the next request, so one request after
 * the write is enough to know whether the file was understood.
 */
export async function applyHtaccess(siteUrl: string, enable: boolean): Promise<ApplyResult> {
  const found = await findDocroot();
  if (!found) {
    return { ok: false, reason: "not-found", error: "Could not find the folder this domain is served from." };
  }

  const pub = publicHtaccess();
  const pubBefore = await readFile(pub, "utf8").catch(() => null);

  const nextRoot = splice(found.content, enable ? managedBlock() : null);
  const nextPub = splice(pubBefore ?? "", enable ? managedBlock(HTACCESS_FILE_RULES) : null);

  if (nextRoot === found.content && nextPub === (pubBefore ?? "")) {
    return { ok: true, reason: "unchanged", status: await htaccessStatus(siteUrl) };
  }

  /** Puts both files back exactly as they were, including not existing. */
  const restore = async () => {
    await writeFile(found.file, found.content, "utf8").catch(() => {});
    if (pubBefore === null) await rm(pub, { force: true }).catch(() => {});
    else await writeFile(pub, pubBefore, "utf8").catch(() => {});
  };

  try {
    // Kept deliberately: the next apply overwrites it, and it gives a human
    // something to compare against if the host ever disagrees with us.
    await copyFile(found.file, path.join(found.dir, BACKUP));
    await writeFile(found.file, nextRoot, "utf8");
    if (nextPub.trim() === "") await rm(pub, { force: true });
    else await writeFile(pub, nextPub, "utf8");
  } catch (err) {
    await restore();
    return {
      ok: false,
      reason: "unwritable",
      error: err instanceof Error ? err.message : "The file could not be written.",
    };
  }

  if (!(await siteAnswers(siteUrl))) {
    await restore();
    return {
      ok: false,
      reason: "rolled-back",
      error:
        "The site stopped answering after the change, so the previous files were put back. Nothing has been left broken.",
      status: await htaccessStatus(siteUrl),
    };
  }

  return { ok: true, reason: enable ? "written" : "removed", status: await htaccessStatus(siteUrl) };
}
