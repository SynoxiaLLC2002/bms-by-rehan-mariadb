import { NextRequest, NextResponse } from "next/server";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, gt, inArray, isNull, like, or, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { getSiteSettings } from "@/lib/settings";
import { maxPxFrom, shrinkExisting } from "@/lib/optimizeUpload";

// Speed → Media → "Re-optimise existing images".
//
// Uploads are shrunk on the way in, but only since that was added: anything
// older is still the 4,000-pixel phone photo it arrived as, with no blurred
// placeholder and often no recorded size. This walks the media library a few
// files per request (the page calls it until `done`), so a shared host's
// request timeout is never reached and the admin sees progress.
//
// Each file keeps its name and format — see shrinkExisting — so nothing that
// links to it changes. The untouched original is copied to
// `uploads-originals/` beside the app, outside `public/`, before it is
// overwritten: the step LiteSpeed's plugin calls irreversible is reversible
// here by copying the file back.

const CONVERTIBLE = ["image/jpeg", "image/png", "image/webp"];
const BATCH = 4;
const UPLOADS = path.join(process.cwd(), "public", "uploads");
const BACKUPS = path.join(process.cwd(), "uploads-originals");

/**
 * Rows worth opening: local, a format sharp rewrites, and either never looked
 * at (no placeholder — every upload since placeholders exist has one) or
 * larger than the current limit, which catches them again if it is lowered.
 */
function candidates(maxPx: number) {
  return and(
    inArray(media.mimeType, CONVERTIBLE),
    like(media.url, "/uploads/%"),
    or(isNull(media.blur), sql`greatest(${media.width}, ${media.height}) > ${maxPx}`)
  );
}

/** The file on disk for an `/uploads/…` URL, or null when it would leave the folder. */
function diskPath(url: string): string | null {
  let rel = url.slice("/uploads/".length);
  try {
    rel = decodeURIComponent(rel);
  } catch {}
  const full = path.resolve(UPLOADS, rel);
  return full.startsWith(UPLOADS + path.sep) ? full : null;
}

export async function GET() {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const maxPx = maxPxFrom((await getSiteSettings()).media_max_px);
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(media).where(candidates(maxPx));
  return NextResponse.json({ pending: row?.n ?? 0, maxPx }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Uploads are stored in Vercel Blob on this site, not on disk." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { after?: number };
  const after = Number.isFinite(body.after) ? Number(body.after) : 0;
  const maxPx = maxPxFrom((await getSiteSettings()).media_max_px);

  const rows = await db
    .select({ id: media.id, url: media.url, mimeType: media.mimeType })
    .from(media)
    .where(and(candidates(maxPx), gt(media.id, after)))
    .orderBy(asc(media.id))
    .limit(BATCH);

  let resized = 0;
  let filled = 0;
  let saved = 0;
  const failed: string[] = [];

  for (const r of rows) {
    const file = diskPath(r.url);
    try {
      if (!file) throw new Error("outside uploads");
      const original = await readFile(file);
      const out = await shrinkExisting(original, r.mimeType, maxPx);
      if (out.changed) {
        const backup = path.join(BACKUPS, path.relative(UPLOADS, file));
        await mkdir(path.dirname(backup), { recursive: true });
        // Never over an earlier backup: that one is the real original.
        await access(backup).catch(() => copyFile(file, backup));
        await writeFile(file, out.buffer);
        saved += original.length - out.buffer.length;
        resized++;
      } else if (out.width) {
        filled++;
      }
      await db
        .update(media)
        .set({
          size: out.buffer.length,
          // Only when read: a size sharp could not determine stays unknown
          // rather than being guessed.
          ...(out.width && out.height ? { width: out.width, height: out.height } : {}),
          // An empty string marks "tried, no placeholder possible", so the
          // row stops coming back as a candidate on every run.
          blur: out.blur ?? "",
        })
        .where(sql`${media.id} = ${r.id}`);
    } catch {
      failed.push(r.url);
      // Mark it looked-at so one missing file cannot stall the walk.
      await db.update(media).set({ blur: "" }).where(sql`${media.id} = ${r.id}`).catch(() => {});
    }
  }

  const last = rows.at(-1)?.id ?? after;
  return NextResponse.json(
    { ok: true, processed: rows.length, resized, filled, saved, failed, after: last, done: rows.length < BATCH },
    { headers: { "Cache-Control": "no-store" } }
  );
}
