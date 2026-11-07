// The site's icon, in the shapes browsers and search engines actually want.
//
// The Customizer stores one image as `site_favicon`, and the page used to hand
// that same file out as the icon, the shortcut icon and the Apple touch icon.
// Whatever the owner uploaded went out as-is — on the first live site a
// 602×602 WebP. Google's rules for the icon it shows beside a result are
// narrower than a browser's: a square whose side is a multiple of 48 pixels,
// in a format it renders, at a URL it can fetch, and it always tries
// `/favicon.ico` as well. That site failed all four (`/favicon.ico` was a
// 404), so the search result showed the placeholder Google keeps for sites
// with no usable icon. The placeholder it had cached, in fact, was this
// CMS's own `default-icon.svg` from before the owner chose an image.
//
// This module derives what is needed from whatever was uploaded: 48 px for
// `/favicon.ico` (a real ICO, wrapping PNG data, which every browser and
// crawler reads), 96 and 192 px PNGs for the page's own links, and 180 px for
// Apple. Each is rendered once per process and kept in memory; the URLs carry
// a fingerprint of the source, so a new icon is a new URL and the year-long
// cache on the old one is never wrong.

import { readFile } from "node:fs/promises";
import path from "node:path";

/** The one setting this reads; typed loosely because settings are a string map. */
type IconSettings = { site_favicon?: string };

/** The sizes served under `/icons/<hash>/<size>.png`. */
export const ICON_SIZES = [96, 180, 192] as const;
export type IconSize = (typeof ICON_SIZES)[number];

/** What the `<link>`s point at. Empty favicon still gets the default. */
export function iconSource(s: IconSettings): string {
  return (s.site_favicon || "").trim() || "/default-icon.svg";
}

/** A short, stable fingerprint of the source URL for cache-safe icon URLs. */
export function iconHash(s: IconSettings): string {
  const text = iconSource(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The metadata `icons` entry for a layout, with sizes and types Google reads. */
export function iconLinks(s: IconSettings) {
  const h = iconHash(s);
  return {
    icon: [
      { url: `/icons/${h}/96.png`, sizes: "96x96", type: "image/png" },
      { url: `/icons/${h}/192.png`, sizes: "192x192", type: "image/png" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    // No `shortcut`: `rel="shortcut icon"` is the pre-HTML5 spelling of the
    // `icon` link above and named the same file — every browser reads the
    // `icon` entry, so the second tag was a duplicate on every page.
    apple: [{ url: `/icons/${h}/180.png`, sizes: "180x180", type: "image/png" }],
  };
}

/**
 * The source image's bytes.
 *
 * A site-relative URL is read straight from `public/` — uploads and the
 * default icon both live there — and only fetched over HTTP when the file is
 * not on this disk: uploads in Blob storage are absolute URLs, but a build
 * verified on a machine without the site's uploads folder is not, and an
 * icon route that 404s there would look like a bug on the host too.
 */
async function sourceBytes(src: string, origin: string): Promise<Buffer | null> {
  if (src.startsWith("/")) {
    try {
      return await readFile(path.join(process.cwd(), "public", src.replace(/^\/+/, "").replace(/\?.*$/, "")));
    } catch {
      // Not on disk; fall through to fetching it from the site itself.
    }
  }
  try {
    const res = await fetch(new URL(src, origin), { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * A 48×48 PNG wrapped as an ICO.
 *
 * ICO has allowed PNG-compressed entries since Vista, and every browser and
 * crawler that asks for `/favicon.ico` reads them. The container is a 6-byte
 * header, one 16-byte directory entry, and the PNG.
 */
function icoFromPng(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12); // offset of the image data
  return Buffer.concat([header, entry, png]);
}

type Rendered = { body: Buffer; type: string };
const cache = new Map<string, Promise<Rendered | null>>();

/**
 * The icon at one size, as PNG (or ICO for the 48 px favicon). Cached for the
 * life of the process by source and size; the source's fingerprint is in
 * every URL that reaches here, so a changed icon never hits an old entry.
 */
export function renderIcon(
  s: IconSettings,
  origin: string,
  size: number,
  format: "png" | "ico"
): Promise<Rendered | null> {
  const src = iconSource(s);
  const key = `${src}|${size}|${format}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      const bytes = await sourceBytes(src, origin);
      if (!bytes) return null;
      try {
        const sharp = (await import("sharp")).default;
        const png = await sharp(bytes, { density: 384 })
          .resize(size, size, { fit: "cover", position: "centre" })
          .png({ compressionLevel: 9 })
          .toBuffer();
        return format === "ico"
          ? { body: icoFromPng(png, size), type: "image/x-icon" }
          : { body: png, type: "image/png" };
      } catch {
        // No sharp on this host, or an image it cannot read: hand out the
        // source unchanged rather than a 404. A wrong-sized icon is still an
        // icon; a missing one is the placeholder.
        return { body: bytes, type: guessType(src) };
      }
    })();
    cache.set(key, pending);
    // A failed render must not be remembered forever.
    pending.then((r) => { if (!r) cache.delete(key); }, () => cache.delete(key));
  }
  return pending;
}

function guessType(src: string): string {
  const ext = src.toLowerCase().replace(/\?.*$/, "").split(".").pop();
  return ext === "svg" ? "image/svg+xml"
    : ext === "png" ? "image/png"
    : ext === "webp" ? "image/webp"
    : ext === "ico" ? "image/x-icon"
    : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : "application/octet-stream";
}

/**
 * The `theme-color` for the browser chrome around the page on mobile.
 *
 * It used to be the primary colour, which is the accent — buttons, links —
 * not what surrounds the page. On a black site with a white accent the
 * address bar flashed white above a black header. The header's own
 * background is what the bar sits against, so that comes first (the mobile
 * one, since only mobile browsers tint), then the page background. Only a
 * plain colour is used: a gradient or `var()` means nothing to the browser.
 */
export function themeColorFor(s: Record<string, string | undefined>): string {
  const plain = (v: string | undefined) => (v && /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i.test(v.trim()) ? v.trim() : "");
  return plain(s.header_bg_color_mobile) || plain(s.header_bg_color) || plain(s.color_bg) || plain(s.color_primary) || "#ffffff";
}
