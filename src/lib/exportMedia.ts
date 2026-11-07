// Putting the uploaded files into the backup.
//
// The JSON export carries the media *records* — filename, alt text, dimensions,
// which post used it — and none of the bytes. That is a backup that silently
// loses every image, which is the kind of thing that looks complete right up
// until the day it is needed.
//
// Only files stored on this machine need bundling. When the site uses blob
// storage the media URLs are absolute and keep resolving after a restore, so
// copying them into the archive would double the storage to no purpose.

import JSZip from "jszip";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { createReadStream, type ReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { sanitizeSvg } from "@/lib/sanitizeSvg";

/**
 * How large an archive this will build.
 *
 * The zip is assembled in memory, so an unbounded media library is a way to
 * take the server down while trying to back it up. A site past this should be
 * copying its uploads directory with a tool built for it, and the error says so
 * rather than failing with a heap message.
 */
export const MEDIA_ZIP_LIMIT = 150 * 1024 * 1024;

/** A `/uploads/...` path is a local file; anything absolute is already hosted. */
export function isLocalUpload(url: string): boolean {
  return url.startsWith("/uploads/");
}

/** Where a local upload lives on disk. Never escapes the uploads directory. */
function diskPath(url: string): string | null {
  const name = path.basename(url);
  // `basename` already strips any traversal, but the comparison is explicit:
  // these URLs come from a file that arrived over the network.
  if (!name || name.includes("..") || name !== url.slice("/uploads/".length)) return null;
  return path.join(process.cwd(), "public", "uploads", name);
}

export interface MediaBundleResult {
  zip: JSZip;
  included: number;
  missing: string[];
  skippedRemote: number;
  bytes: number;
}

/**
 * Adds every local upload to `uploads/` inside the archive.
 *
 * A file recorded in the database but absent from disk is reported rather than
 * throwing: that is a real state — someone deleted it by hand — and the rest of
 * the backup is still worth having.
 */
export async function bundleMedia(zip: JSZip, urls: string[]): Promise<MediaBundleResult> {
  const missing: string[] = [];
  let included = 0;
  let bytes = 0;
  let skippedRemote = 0;

  for (const url of urls) {
    if (!isLocalUpload(url)) { skippedRemote++; continue; }
    const p = diskPath(url);
    if (!p) { missing.push(url); continue; }
    try {
      const buf = await readFile(p);
      bytes += buf.byteLength;
      if (bytes > MEDIA_ZIP_LIMIT) {
        throw new Error(
          `The uploads are larger than ${Math.round(MEDIA_ZIP_LIMIT / 1024 / 1024)} MB. Export without media and copy public/uploads across yourself.`
        );
      }
      zip.file(`uploads/${path.basename(p)}`, buf);
      included++;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("The uploads are larger")) throw e;
      missing.push(url);
    }
  }

  return { zip, included, missing, skippedRemote, bytes };
}

/**
 * A read stream that opens its file on the first read, not on creation.
 *
 * `createReadStream` opens the file straight away. Handing JSZip one per
 * upload therefore held every file in the library open before a byte was
 * written, and a few thousand images passes the ~1,024 open files a shared
 * host allows (EMFILE) — the backup failed on exactly the sites with the most
 * to lose. JSZip pauses each input and resumes them one entry at a time, so
 * opening lazily keeps one file open at once.
 */
function lazyReadStream(file: string): Readable {
  let src: ReadStream | null = null;
  const out: Readable = new Readable({
    read() {
      if (src) {
        src.resume();
        return;
      }
      src = createReadStream(file);
      src.on("data", (chunk) => {
        if (!out.push(chunk)) src?.pause();
      });
      src.on("end", () => out.push(null));
      src.on("error", (e) => out.destroy(e));
    },
    destroy(err, cb) {
      src?.destroy();
      cb(err);
    },
  });
  return out;
}

/**
 * The same, for the scheduled backup: each upload is added as a read stream,
 * so nothing is held in memory and there is no size cap.
 *
 * `bundleMedia` reads every file into a Buffer, and the zip is then built in
 * memory on top of them — on a 384 MB heap a media library of a few hundred
 * megabytes took the whole app down mid-backup. Paired with
 * `generateNodeStream` (see /api/backup) the archive flows from disk to disk.
 * Uploads are already compressed formats, so they are stored, not deflated:
 * deflating a JPEG costs CPU and saves nothing.
 */
export async function bundleMediaStreaming(zip: JSZip, urls: string[]): Promise<MediaBundleResult> {
  const missing: string[] = [];
  let included = 0;
  let bytes = 0;
  let skippedRemote = 0;
  for (const url of urls) {
    if (!isLocalUpload(url)) { skippedRemote++; continue; }
    const p = diskPath(url);
    if (!p) { missing.push(url); continue; }
    try {
      const info = await stat(p);
      if (!info.isFile()) { missing.push(url); continue; }
      bytes += info.size;
      zip.file(`uploads/${path.basename(p)}`, lazyReadStream(p), { compression: "STORE" });
      included++;
    } catch {
      missing.push(url);
    }
  }
  return { zip, included, missing, skippedRemote, bytes };
}

/**
 * Writes files out of an archive back into the uploads directory.
 *
 * Deliberately never overwrites: a filename that already exists is left alone
 * and reported. Media rows are matched by URL on import, so an existing file
 * means that upload is already here — replacing it would be the one destructive
 * thing an import is not allowed to do.
 */
/**
 * Extensions a restored file may have.
 *
 * The upload endpoint allowlists types and rewrites every SVG through
 * `sanitizeSvg`; this path did neither, so an archive could put any file at
 * all into `public/uploads` — and on the production host LiteSpeed serves that
 * directory straight from disk, without going through the Next route that
 * allowlists content types and stamps `script-src 'none'; sandbox` on an SVG.
 * An imported archive could therefore plant an `.html` page, a `.js` file, or
 * an SVG with a `<script>` in it, and have the site's own origin serve it.
 *
 * The same list the uploader accepts, for the same reasons.
 */
const RESTORABLE = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".json", ".ico"]);

export async function restoreMedia(zip: JSZip): Promise<{ written: number; skipped: number }> {
  const dir = path.join(process.cwd(), "public", "uploads");
  let written = 0;
  let skipped = 0;

  const entries = Object.values(zip.files).filter(
    (f) => !f.dir && f.name.startsWith("uploads/")
  );
  if (entries.length === 0) return { written: 0, skipped: 0 };

  await mkdir(dir, { recursive: true });

  for (const entry of entries) {
    const name = path.basename(entry.name);
    if (!name || name.includes("..")) { skipped++; continue; }
    if (!RESTORABLE.has(path.extname(name).toLowerCase())) { skipped++; continue; }
    const target = path.join(dir, name);
    try {
      let data = Buffer.from(await entry.async("arraybuffer"));
      // An SVG is a document. Stored unchecked it would be served from this
      // site's own origin — the uploader never allows that, and neither does
      // this. A file that does not parse as one <svg> is not restored.
      if (path.extname(name).toLowerCase() === ".svg") {
        const clean = sanitizeSvg(data.toString("utf8"));
        if (!clean) { skipped++; continue; }
        data = Buffer.from(clean.svg, "utf8");
      }
      // `wx` fails if the file exists, which is exactly the check wanted —
      // and does it atomically rather than in a race between stat and write.
      await writeFile(target, data, { flag: "wx" });
      written++;
    } catch {
      skipped++;
    }
  }

  return { written, skipped };
}
