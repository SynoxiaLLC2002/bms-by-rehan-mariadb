// A `srcSet` for the site logo, sized to the slot it is drawn in.
//
// The logo is uploaded once, at whatever size the designer exported — 602px
// square on a live site — and drawn at 32–98px tall in the header and the
// footer. Content images go through `/_next/image` and arrive at the width
// they are shown; the logo was a plain `<img>` of the original file, so every
// visitor downloaded 14 KiB to paint a 98px mark, and Lighthouse said so
// ("Improve image delivery"). This asks the optimiser for the two sizes a
// 1× and 2× screen actually need. `src` stays the original file: the
// customizer swaps it live by setting `img.src`, and a browser with no
// srcset support falls back to it.

import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImageInfo } from "@/lib/seoMeta";

/** The `imageSizes` + `deviceSizes` in next.config.mjs — the only widths `/_next/image` will serve. Keep in step: a width missing there is a 400. */
export const WIDTHS = [256, 384, 480, 640, 750, 828, 1080, 1200, 1920, 2560];
/** The `qualities` in next.config.mjs, same rule. */
export const QUALITIES = [50, 60, 65, 70, 75, 80, 85, 90];

/**
 * Only local uploads the optimiser accepts. SVG is served as-is by Next unless
 * explicitly allowed, and an animated GIF would lose its frames.
 */
function optimisable(src: string): boolean {
  return /^\/(?!\/)/.test(src) && /\.(png|jpe?g|webp|avif)$/i.test(src) && process.env.IMAGE_OPTIMIZATION !== "off";
}

function nearest(width: number): number {
  return WIDTHS.find((w) => w >= width) ?? WIDTHS[WIDTHS.length - 1];
}

/**
 * The logo at the widths a page draws it, as plain files on disk.
 *
 * Through `/_next/image` every size is a request the Node process has to
 * answer until each Cloudflare location has cached it. On the first live
 * site the header logo was the last thing on the page to appear — PageSpeed
 * saw the 2x file as a cache miss, waited on the shared host, and the late
 * change cost Speed Index most of a second. Written once to
 * `/uploads/_sized/`, the same files are served by LiteSpeed straight from
 * disk and cached by Cloudflare as ordinary `.webp`, with Node never asked.
 *
 * Upload names are never reused (api/media), so a name plus a width is a
 * stable, cache-forever URL. Anything that fails — no sharp, a read-only
 * disk, a remote logo — leaves the width unmarked, and `logoSrcSet` keeps
 * using the optimiser for it.
 */
const SIZED_DIR = "_sized";
const ready = new Set<string>();
const pending = new Map<string, Promise<void>>();

function sizedUrl(src: string, width: number): string {
  const base = path.basename(src).replace(/\.[^.]+$/, "");
  return `/uploads/${SIZED_DIR}/${base}-${width}w.webp`;
}

/** The exact 1x and 2x widths for a logo drawn `height` tall, never past the file's own width. */
function logoWidths(size: ImageInfo, height: number): [number, number] {
  const width = Math.ceil((height * size.width) / size.height);
  return [Math.min(width, size.width), Math.min(width * 2, size.width)];
}

/**
 * `/uploads/_sized/<name>-<width>w.webp` requested before it exists: makes it
 * from the original, for the uploads route. `src` is the upload's public
 * path. Returns the bytes, or null when there is no such original.
 */
/** Logo heights the header and footer can draw (px); the widths a request may ask for follow from these. */
const LOGO_HEIGHTS = { min: 8, max: 200 };
/** A ceiling on generated files, whatever else goes wrong. */
const MAX_SIZED_FILES = 400;

/**
 * Whether `width` is one a logo of this file could actually be drawn at —
 * the 1x or 2x width for some height in LOGO_HEIGHTS.
 *
 * Any width from 16 to 1920 used to be accepted for any image in uploads, and
 * each new one was resized and written to disk: ~1,900 files per image, made
 * on demand by anyone, with no login — CPU and disk on request.
 */
async function plausibleLogoWidth(original: string, width: number): Promise<boolean> {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(original).metadata();
  if (!meta.width || !meta.height) return false;
  for (let h = LOGO_HEIGHTS.min; h <= LOGO_HEIGHTS.max; h++) {
    const [w1, w2] = logoWidths({ width: meta.width, height: meta.height } as ImageInfo, h);
    if (w1 === width || w2 === width) return true;
  }
  return false;
}

export async function sizedLogo(rel: string): Promise<Buffer | null> {
  const m = rel.match(/^_sized\/(.+)-(\d{2,4})w\.webp$/);
  if (!m) return null;
  const width = parseInt(m[2], 10);
  if (!(width >= 8 && width <= 1920)) return null;
  const dir = path.join(process.cwd(), "public", "uploads");

  // Only the configured site logo is resized on demand. Everything else in
  // uploads goes through /_next/image, which has its own fixed width list.
  const { getSiteSettings } = await import("@/lib/settings");
  const logo = ((await getSiteSettings()).site_logo || "").replace(/[?#].*$/, "");
  if (!logo.startsWith("/uploads/")) return null;

  // Bounded no matter what: past this many files, nothing new is made.
  const existing = await readdir(path.join(dir, SIZED_DIR)).catch(() => [] as string[]);
  if (existing.length >= MAX_SIZED_FILES) return null;

  // The original's extension is not in the sized name; try the usual ones.
  for (const ext of [".webp", ".png", ".jpg", ".jpeg"]) {
    const original = path.join(dir, `${m[1]}${ext}`);
    if (!original.startsWith(dir + path.sep)) return null;
    if (`/uploads/${m[1]}${ext}` !== logo) continue;
    try {
      await access(original);
      if (!(await plausibleLogoWidth(original, width))) return null;
      await writeSized(`/uploads/${m[1]}${ext}`, width);
      return await readFile(path.join(dir, `${SIZED_DIR}/${m[1]}-${width}w.webp`));
    } catch {
      continue;
    }
  }
  return null;
}

async function writeSized(src: string, width: number): Promise<void> {
  const url = sizedUrl(src, width);
  const file = path.join(process.cwd(), "public", url);
  try {
    await access(file);
  } catch {
    const original = await readFile(path.join(process.cwd(), "public", src.replace(/^\/+/, "").replace(/\?.*$/, "")));
    const sharp = (await import("sharp")).default;
    const out = await sharp(original).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, out);
  }
  ready.add(`${src}|${width}`);
}

/**
 * Makes sure the static files for these logo heights exist. Awaited by the
 * layout before it renders; cheap after the first call in a process, since
 * both finished and in-flight writes are remembered.
 */
export async function prepareLogo(src: string, size: ImageInfo | null | undefined, heights: number[]): Promise<void> {
  if (!src || !size?.width || !size?.height || !optimisable(src) || !src.startsWith("/uploads/")) return;
  const widths = new Set(heights.flatMap((h) => logoWidths(size, h)));
  await Promise.all(
    [...widths].map((w) => {
      const key = `${src}|${w}`;
      if (ready.has(key)) return undefined;
      let job = pending.get(key);
      if (!job) {
        job = writeSized(src, w).catch(() => undefined).finally(() => pending.delete(key));
        pending.set(key, job);
      }
      return job;
    })
  );
}

/**
 * `srcSet` for a logo drawn `height` pixels tall, or undefined when the file's
 * size is unknown (not uploaded here) or the optimiser cannot take it.
 * Static files from `prepareLogo` when they exist, the optimiser otherwise.
 */
export function logoSrcSet(src: string, size: ImageInfo | null | undefined, height: number): string | undefined {
  if (!src || !size?.width || !size?.height || !optimisable(src)) return undefined;
  const [s1, s2] = logoWidths(size, height);
  // Always the static URLs for an upload, whether or not the files have been
  // written yet. They used to be emitted only once `prepareLogo` had made
  // them — but pages are prerendered on the build machine, which has no
  // uploads, so every prerendered page shipped `/_next/image` URLs and kept
  // them for a day of cache. A `_sized` file that does not exist yet is made
  // on its first request by the uploads route (see `sizedLogo` there).
  if (src.startsWith("/uploads/")) {
    return s2 > s1 ? `${sizedUrl(src, s1)} 1x, ${sizedUrl(src, s2)} 2x` : `${sizedUrl(src, s1)} 1x`;
  }
  const width = Math.ceil((height * size.width) / size.height);
  // `w` must be one of the configured widths or the optimiser answers 400; a
  // width past the file's own is fine, it serves the original size then.
  const w1 = nearest(width);
  const w2 = nearest(width * 2);
  const url = (w: number) => `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=80`;
  return w2 > w1 ? `${url(w1)} 1x, ${url(w2)} 2x` : `${url(w1)} 1x`;
}
