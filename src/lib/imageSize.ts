// Intrinsic pixel dimensions, read from the file's own header.
//
// Uploads stored a URL and nothing about the image, which cost two things:
//
//   • `og:image:width` / `og:image:height`, which a share card uses to lay out
//     a preview before it has fetched the image. Without them a link renders
//     small or late.
//   • `width`/`height` on the tag, which is what reserves space in the layout.
//     An image without them is a hole that pops open when it loads — Cumulative
//     Layout Shift, and one of the three Core Web Vitals.
//
// Done by reading the header rather than adding an image library: the upload
// allowlist is four raster formats plus AVIF, and their headers are a few bytes
// each. A dependency that decodes entire images to answer "how big is it" is a
// large amount of native code for a question the first 32 bytes answer.

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Reads dimensions from PNG, GIF, JPEG or WebP bytes.
 *
 * Returns `null` when the format is not one of those, or the header is
 * truncated or malformed. AVIF is deliberately unhandled: its dimensions live
 * in a nested ISOBMFF box tree, and guessing is worse than storing nothing —
 * a wrong size lays out a share card wrongly and reserves the wrong space.
 */
export function imageSize(buf: Uint8Array): ImageSize | null {
  return png(buf) ?? gif(buf) ?? webp(buf) ?? jpeg(buf);
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32be = (b: Uint8Array, i: number) =>
  ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

/** `\x89PNG`, then an IHDR whose first two fields are the dimensions. */
function png(b: Uint8Array): ImageSize | null {
  if (b.length < 24) return null;
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
  return valid({ width: u32be(b, 16), height: u32be(b, 20) });
}

/** `GIF87a`/`GIF89a`, then width and height as little-endian shorts. */
function gif(b: Uint8Array): ImageSize | null {
  if (b.length < 10) return null;
  if (b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null;
  return valid({ width: u16le(b, 6), height: u16le(b, 8) });
}

/**
 * RIFF container with a `WEBP` tag, then one of three chunk layouts — lossy
 * (`VP8 `), lossless (`VP8L`) or extended (`VP8X`) — each storing the size
 * differently.
 */
function webp(b: Uint8Array): ImageSize | null {
  if (b.length < 30) return null;
  const riff = String.fromCharCode(b[0], b[1], b[2], b[3]);
  const fmt = String.fromCharCode(b[8], b[9], b[10], b[11]);
  if (riff !== "RIFF" || fmt !== "WEBP") return null;

  const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);

  if (chunk === "VP8 ") {
    // 14 bits each, after a 3-byte start code.
    return valid({ width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff });
  }
  if (chunk === "VP8L") {
    // 14-bit width then 14-bit height, packed across four bytes, both minus one.
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return valid({ width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 });
  }
  if (chunk === "VP8X") {
    // 24-bit little-endian canvas size, each minus one.
    const w = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1;
    const h = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1;
    return valid({ width: w, height: h });
  }
  return null;
}

/**
 * Walks the JPEG marker chain to a Start Of Frame.
 *
 * The dimensions are not at a fixed offset: a file carries any number of
 * metadata segments (EXIF, ICC, comments) before the frame header, so the only
 * way to the size is to step over each segment by its declared length.
 */
function jpeg(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;

  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xff) {
      i++; // Resynchronise rather than give up: padding between segments is legal.
      continue;
    }
    const marker = b[i + 1];

    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // Start of scan — past this is entropy-coded data, and there is no frame
    // header left to find.
    if (marker === 0xda) return null;

    const length = u16be(b, i + 2);
    if (length < 2) return null;

    // SOF0–SOF15, excluding the four that are not frame headers.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isSof) {
      // height then width, after the one-byte sample precision.
      return valid({ width: u16be(b, i + 7), height: u16be(b, i + 5) });
    }
    i += 2 + length;
  }
  return null;
}

/** Guards against a header that parsed but says something impossible. */
function valid(size: ImageSize): ImageSize | null {
  const { width, height } = size;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 1 || height < 1) return null;
  // Larger than any real upload; a value this big means the header was misread.
  if (width > 100000 || height > 100000) return null;
  return { width, height };
}
