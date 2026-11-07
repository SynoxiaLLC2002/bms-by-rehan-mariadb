// Shrinks an uploaded image before it is stored.
//
// Nothing resized uploads before: a 5 MB, 4,000-pixel phone photo went into
// the media library exactly as it arrived, and every visitor's browser was
// then offered that file as the fallback while the optimiser transcoded it
// on demand. Bloggers upload phone photos. This is where most of a site's
// page weight comes from, and the only place it can be fixed once for good.
//
// What happens: JPEG, PNG and WebP are resized so the longer side is at most
// Speed → Media → "Largest image size" (else MEDIA_MAX_PX, else 2000 —
// larger than any layout here shows) and
// re-encoded as WebP. GIF and AVIF are left alone: GIFs may be animated, and
// AVIF is already smaller than WebP. Anything sharp cannot read is stored as
// uploaded; a photo we could not shrink is still a photo.
//
// `sharp` arrives with Next as an optional dependency. If the host could not
// install it, this module does nothing and says so once in the log.

import { extname } from "node:path";

export interface OptimizedUpload {
  buffer: Buffer;
  /** Filename with the extension the encoded bytes actually have. */
  filename: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  /** True when the bytes are not the original upload. */
  changed: boolean;
  /** A ~16px blurred preview as a data URI, for a placeholder while loading. */
  blur?: string;
}

/**
 * The placeholder: the image at 16 pixels wide, lightly blurred, as WebP.
 * About 300–500 bytes — small enough to live in the HTML for every image on
 * a page and still be worth it, because it removes the blank-then-pop.
 */
async function makeBlur(sharp: Sharp, source: Buffer): Promise<string | undefined> {
  try {
    const out = await sharp(source, { failOn: "none" }).rotate().resize(16, 16, { fit: "inside" }).blur(0.8).webp({ quality: 40, alphaQuality: 40 }).toBuffer();
    return `data:image/webp;base64,${out.toString("base64")}`;
  } catch {
    return undefined;
  }
}

const MAX_PX = Math.max(400, Number(process.env.MEDIA_MAX_PX ?? 2000) || 2000);

/** The saved Speed setting when it is a sane size, else the environment's. */
export function maxPxFrom(setting: string | undefined): number {
  const n = parseInt(setting ?? "", 10);
  return Number.isFinite(n) && n >= 400 && n <= 8000 ? n : MAX_PX;
}
const QUALITY = Math.min(100, Math.max(40, Number(process.env.MEDIA_WEBP_QUALITY ?? 82) || 82));
const ENABLED = process.env.MEDIA_OPTIMIZE !== "off";
const CONVERTIBLE = new Set(["image/jpeg", "image/png", "image/webp"]);

// sharp 0.35 exports the callable as `default` (and types the namespace
// separately), so the module type is no longer the constructor.
type Sharp = typeof import("sharp").default;
let sharpModule: Promise<Sharp | null> | null = null;
function loadSharp(): Promise<Sharp | null> {
  if (!sharpModule) {
    sharpModule = import("sharp")
      .then((m) => (m.default ?? (m as unknown as { sharp?: Sharp }).sharp ?? m) as Sharp)
      .catch(() => {
        console.warn("[media] sharp is not available; uploads are stored as received.");
        return null;
      });
  }
  return sharpModule;
}

export async function optimizeUpload(
  original: Buffer,
  filename: string,
  mimeType: string,
  maxPx: number = MAX_PX
): Promise<OptimizedUpload> {
  const untouched: OptimizedUpload = { buffer: original, filename, mimeType, width: null, height: null, changed: false };
  if (!ENABLED || !CONVERTIBLE.has(mimeType)) return untouched;

  const sharp = await loadSharp();
  if (!sharp) return untouched;

  try {
    const image = sharp(original, { failOn: "none" }).rotate(); // honour EXIF orientation
    const meta = await image.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (!w || !h) return untouched;

    const needsResize = Math.max(w, h) > maxPx;
    const pipeline = needsResize ? image.resize({ width: maxPx, height: maxPx, fit: "inside", withoutEnlargement: true }) : image;
    const out = await pipeline.webp({ quality: QUALITY, effort: 4 }).toBuffer({ resolveWithObject: true });

    const blur = await makeBlur(sharp, original);

    // A conversion that made the file bigger is not an optimisation. This
    // happens with tiny PNG icons and already-tight WebPs; keep the original
    // FORMAT — but never the original BYTES.
    //
    // Two things were wrong with handing back `original` here.
    //
    // Privacy: a photo straight from a phone carries EXIF, and EXIF carries
    // GPS coordinates. Publishing the untouched bytes publishes the place the
    // picture was taken. sharp drops metadata unless asked to keep it, so
    // re-encoding in the same format strips it.
    //
    // Correctness: `w`/`h` were read from `image`, which has `.rotate()`
    // applied, while the bytes returned were the unrotated original. A
    // portrait phone photo was therefore stored landscape and described as
    // portrait — the width and height came out swapped, and every layout
    // reserving space for it was wrong.
    //
    // `animated: true` so a multi-frame GIF or WebP survives as an animation
    // instead of being flattened to its first frame.
    if (!needsResize && out.data.length >= original.length) {
      try {
        const stripped = await sharp(original, { failOn: "none", animated: true })
          .rotate()
          .toBuffer({ resolveWithObject: true });
        return {
          buffer: stripped.data,
          filename,
          mimeType,
          width: stripped.info.width,
          height: stripped.info.pageHeight ?? stripped.info.height,
          changed: true,
          blur,
        };
      } catch {
        // Could not re-encode: the original is still better than no upload.
        return { ...untouched, width: w, height: h, blur };
      }
    }

    const base = filename.slice(0, filename.length - extname(filename).length) || "image";
    return {
      buffer: out.data,
      filename: `${base}.webp`,
      mimeType: "image/webp",
      width: out.info.width,
      height: out.info.height,
      changed: true,
      blur,
    };
  } catch {
    return untouched;
  }
}

export interface ShrunkFile {
  buffer: Buffer;
  width: number | null;
  height: number | null;
  /** True when `buffer` is new bytes to write over the file. */
  changed: boolean;
  blur?: string;
}

/**
 * The same shrink for a file already in the media library (Speed → Media →
 * "Re-optimise existing images").
 *
 * Unlike an upload, the format is kept: the file's URL is already written
 * into posts, menus and settings, and changing `.jpg` to `.webp` would break
 * every one of them. So a JPEG stays a JPEG and a PNG a PNG, only smaller;
 * visitors get WebP from the optimiser either way. Nothing is rewritten
 * unless it was too large, and a result that came out bigger is dropped.
 */
export async function shrinkExisting(original: Buffer, mimeType: string, maxPx: number = MAX_PX): Promise<ShrunkFile> {
  const untouched: ShrunkFile = { buffer: original, width: null, height: null, changed: false };
  if (!CONVERTIBLE.has(mimeType)) return untouched;
  const sharp = await loadSharp();
  if (!sharp) return untouched;
  try {
    const image = sharp(original, { failOn: "none" }).rotate();
    const meta = await image.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (!w || !h) return untouched;
    const blur = await makeBlur(sharp, original);
    // `rotate()` applies EXIF orientation, so a portrait phone photo reports
    // its stored (landscape) size here; the output below is upright.
    const [uw, uh] = (meta.orientation ?? 1) >= 5 ? [h, w] : [w, h];
    if (Math.max(w, h) <= maxPx) return { ...untouched, width: uw, height: uh, blur };

    const resized = image.resize({ width: maxPx, height: maxPx, fit: "inside", withoutEnlargement: true });
    const encoded =
      mimeType === "image/jpeg" ? resized.jpeg({ quality: QUALITY, mozjpeg: true })
      : mimeType === "image/png" ? resized.png({ compressionLevel: 9, palette: meta.isPalette ?? false })
      : resized.webp({ quality: QUALITY, effort: 4 });
    const out = await encoded.toBuffer({ resolveWithObject: true });
    if (out.data.length >= original.length) return { ...untouched, width: uw, height: uh, blur };
    return { buffer: out.data, width: out.info.width, height: out.info.height, changed: true, blur };
  } catch {
    return untouched;
  }
}
