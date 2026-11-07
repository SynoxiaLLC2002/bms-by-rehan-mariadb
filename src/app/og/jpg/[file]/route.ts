import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileCacheHeaders } from "@/lib/lscache";
import { clientIp, rateLimited } from "@/lib/rateLimit";

/**
 * A JPEG copy of an uploaded image, for share previews only.
 *
 * Uploads are stored as WebP, and `og:image` pointed straight at them.
 * Facebook and Twitter decode WebP; WhatsApp, Telegram's older clients, LinkedIn
 * and most email scrapers do not, and show no picture at all. This serves the
 * same image as JPEG at share size (1200 px wide at most), so every scraper
 * gets one. The page itself keeps serving WebP — see `shareImageUrl` in
 * seoMeta, the only caller.
 *
 * `/og/jpg/<upload name>.jpg` → `public/uploads/<upload name>.(webp|avif|png)`.
 */
const UPLOADS = path.join(process.cwd(), "public", "uploads");
const MAX_WIDTH = 1200;

/**
 * Encoded JPEGs, kept for the life of the process.
 *
 * The rate limit below caps how fast this can be abused, but it did not stop
 * the work being repeated: every allowed request was a full sharp decode,
 * resize and JPEG encode, and share scrapers re-fetch the same handful of
 * images constantly. The response carries a long `Cache-Control`, but a query
 * string walks past every cache in front of this route, so the header alone
 * guarantees nothing. On a shared host that is a cheap way for anyone to burn
 * the CPU — and CPU exhaustion on this host once led to a cron that killed the
 * site every five minutes (see reasons.txt §8).
 *
 * Keyed by the source path *and its modification time*, so replacing an upload
 * invalidates its entry without anyone having to remember to clear anything.
 * Bounded, because the app runs under `--max-old-space-size=384` and a share
 * image is 100-200 KB: at 24 entries this is a few megabytes at worst, and the
 * oldest is dropped first. Same shape as the icon cache in lib/siteIcon.ts.
 */
const MAX_CACHED = 24;
const jpegCache = new Map<string, Buffer>();

function cacheGet(key: string): Buffer | undefined {
  const hit = jpegCache.get(key);
  // Re-inserting moves it to the end, so the oldest key is the least recently
  // used rather than merely the first ever stored.
  if (hit) {
    jpegCache.delete(key);
    jpegCache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, value: Buffer): void {
  jpegCache.set(key, value);
  while (jpegCache.size > MAX_CACHED) {
    const oldest = jpegCache.keys().next().value;
    if (oldest === undefined) break;
    jpegCache.delete(oldest);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  // Every request is a sharp decode and JPEG encode, and a query string
  // walks past every cache in front of it — the same guard `/og` has.
  if (rateLimited("og-jpg", clientIp(req), { max: 60, windowMs: 60_000 })) {
    return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  }
  const { file } = await params;
  const base = file.replace(/\.jpe?g$/i, "");
  if (!base || base.includes("..") || base.includes("/") || base.includes("\\")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  for (const ext of [".webp", ".avif", ".png", ".jpg", ".jpeg"]) {
    const source = path.join(UPLOADS, `${base}${ext}`);
    if (!source.startsWith(UPLOADS + path.sep)) break;
    // stat first: it is the cache key's freshness half, and it avoids reading
    // the whole original off disk on a hit.
    let key: string;
    try {
      const info = await stat(source);
      key = `${source}|${info.mtimeMs}|${info.size}`;
    } catch {
      continue;
    }

    const cached = cacheGet(key);
    if (cached) {
      return new NextResponse(new Uint8Array(cached), {
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(cached.length),
          ...(await fileCacheHeaders("uploads")),
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    let original: Buffer;
    try {
      original = await readFile(source);
    } catch {
      continue;
    }
    try {
      const sharp = (await import("sharp")).default;
      const out = await sharp(original, { failOn: "none" })
        .rotate()
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .flatten({ background: "#ffffff" }) // JPEG has no alpha; a transparent logo gets white behind it
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      cacheSet(key, out);
      return new NextResponse(new Uint8Array(out), {
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(out.length),
          ...(await fileCacheHeaders("uploads")),
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return NextResponse.json({ error: "Could not convert" }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
