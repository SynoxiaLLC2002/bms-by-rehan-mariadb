// Server-side backups: one zip in `backups/` next to the app — the full
// content export plus every local upload — keeping the newest seven.
//
// Two callers: the cron route (api/backup, BACKUP_TOKEN) and the MCP tools of
// a token given the "backups" scope (lib/mcpServer.ts). Same limits for both.

import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import JSZip from "jszip";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { buildExport } from "@/lib/exportSite";
import { bundleMediaStreaming, isLocalUpload } from "@/lib/exportMedia";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";

export const BACKUP_DIR = () => path.join(process.cwd(), "backups");
const BACKUP_NAME = /^backup-[0-9TZ-]+\.zip$/;

/**
 * The shortest gap between two backups, in hours (BACKUP_MIN_HOURS, default 20).
 *
 * Only the newest seven are kept, so with no limit anyone holding the token
 * could run it seven times in a minute and every real backup would be gone,
 * replaced by copies of whatever the site looks like now. With a 20-hour gap
 * that takes most of a week — long enough to notice — and a daily cron is
 * never affected.
 */
const minGapMs = () => Math.max(0, Number(process.env.BACKUP_MIN_HOURS ?? 20) || 0) * 3600_000;

/** One backup at a time: two at once doubled the memory a large library needs. */
let running = false;

export type BackupResult =
  | { ok: true; file: string; bytes: number; counts: unknown; media: { included: number; missing: number; remote: number }; removed: string[] }
  | { ok: false; status: 429; error: string; file?: string; retryAfterSeconds: number };

/** Writes one backup, or says why not (one running, or the last too recent). Throws on failure. */
export async function runBackup(): Promise<BackupResult> {
  if (running) return { ok: false, status: 429, error: "A backup is already running.", retryAfterSeconds: 600 };
  running = true;
  try {
    const dir0 = BACKUP_DIR();
    const previous = (await readdir(dir0).catch(() => [] as string[])).filter((f) => /^backup-.*\.zip$/.test(f)).sort();
    const newest = previous[previous.length - 1];
    if (newest) {
      const age = Date.now() - (await stat(path.join(dir0, newest))).mtimeMs;
      if (age < minGapMs()) {
        const wait = Math.ceil((minGapMs() - age) / 60_000);
        return {
          ok: false,
          status: 429,
          error: `The last backup (${newest}) is recent. The next one can run in ${wait} minutes.`,
          file: `backups/${newest}`,
          retryAfterSeconds: wait * 60,
        };
      }
    }

    const settings = await getSiteSettings();
    const zip = new JSZip();

    const payload = await buildExport(settings, siteUrl(settings));
    // The name Import looks for. Backups used to write `site.json`, and
    // Import refused them as "not a site export" — no backup could be restored.
    zip.file("content.json", JSON.stringify(payload, null, 2));

    const rows = await db.select({ url: media.url }).from(media);
    const local = rows.map((r) => r.url).filter(isLocalUpload);
    const bundled = await bundleMediaStreaming(zip, local);

    const dir = BACKUP_DIR();
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `backup-${stamp}.zip`;
    // Streamed from the uploads to the file: the whole archive never exists
    // in memory at once (see bundleMediaStreaming). Written under a temporary
    // name and renamed at the end, so a backup that dies halfway is never
    // mistaken for a complete one — or counted among the seven kept.
    const partial = path.join(dir, `${filename}.part`);
    try {
      await pipeline(
        zip.generateNodeStream({ type: "nodebuffer", streamFiles: true, compression: "DEFLATE", compressionOptions: { level: 6 } }),
        createWriteStream(partial)
      );
      await rename(partial, path.join(dir, filename));
    } catch (e) {
      await unlink(partial).catch(() => {});
      throw e;
    }

    // Keep the newest seven. A nightly cron otherwise fills the disk in a year.
    const keep = Math.max(1, Number(process.env.BACKUP_KEEP ?? 7) || 7);
    const existing = (await readdir(dir)).filter((f) => /^backup-.*\.zip$/.test(f)).sort();
    const removed: string[] = [];
    for (const old of existing.slice(0, Math.max(0, existing.length - keep))) {
      await unlink(path.join(dir, old)).catch(() => {});
      removed.push(old);
    }

    const size = (await stat(path.join(dir, filename))).size;
    return {
      ok: true,
      file: `backups/${filename}`,
      bytes: size,
      counts: payload.counts,
      media: { included: bundled.included, missing: bundled.missing.length, remote: bundled.skippedRemote },
      removed,
    };
  } finally {
    running = false;
  }
}

/** The backups on disk, newest first. */
export async function listBackups(): Promise<{ file: string; bytes: number; createdAt: string }[]> {
  const dir = BACKUP_DIR();
  const names = (await readdir(dir).catch(() => [] as string[])).filter((f) => BACKUP_NAME.test(f)).sort().reverse();
  const out: { file: string; bytes: number; createdAt: string }[] = [];
  for (const name of names) {
    const st = await stat(path.join(dir, name)).catch(() => null);
    if (st) out.push({ file: name, bytes: st.size, createdAt: st.mtime.toISOString() });
  }
  return out;
}

/**
 * The full path of a backup by its file name, or null. Only a plain name the
 * site itself writes — never a path — so nothing outside `backups/` is reachable.
 */
export function backupPath(file: string): string | null {
  const name = String(file ?? "").replace(/^backups\//, "");
  return BACKUP_NAME.test(name) ? path.join(BACKUP_DIR(), name) : null;
}
