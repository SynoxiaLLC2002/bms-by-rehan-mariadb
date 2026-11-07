import { NextRequest, NextResponse } from "next/server";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { insertReturning } from "@/lib/db/write";
import { media } from "@/lib/db/schema";
import { count, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { maxPxFrom, optimizeUpload } from "@/lib/optimizeUpload";
import { getSiteSettings } from "@/lib/settings";
import { sanitizeSvg } from "@/lib/sanitizeSvg";
import { imageSize } from "@/lib/imageSize";

/**
 * What the media library will store.
 *
 * An allowlist, not a blocklist, and checked against both the declared MIME
 * type and the filename extension — a browser's `file.type` is client-supplied
 * and trivially forged.
 *
 * This matters more since uploads moved to `public/uploads`: a file served from
 * the site's own origin can script against it, which a separate blob domain
 * could not. An `.html` upload would be stored XSS, and SVG is the same problem
 * wearing an image's clothes — it can carry `<script>`. It is on the list only
 * because every SVG is rewritten by `sanitizeSvg()` before it is stored.
 */
const ALLOWED: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
  // Only because it passes through sanitizeSvg() below — see that file.
  "image/svg+xml": [".svg"],
  // Lottie animations. Data, not code: parsed and checked below, served as JSON.
  "application/json": [".json"],
};

/** 10 MB. Large enough for a photo, small enough not to fill a disk by accident. */
const MAX_BYTES = 10 * 1024 * 1024;

function rejectFile(file: File, safeName: string): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB.`;
  }
  // Browsers send .json with no type, or text/plain, depending on the OS.
  const type = safeName.toLowerCase().endsWith(".json") && (!file.type || file.type === "text/plain") ? "application/json" : file.type;
  const allowedExts = ALLOWED[type];
  if (!allowedExts) {
    return `${file.type || "That file type"} is not allowed. Upload a JPEG, PNG, GIF, WebP, AVIF or SVG image, or a Lottie .json animation.`;
  }
  const dot = safeName.lastIndexOf(".");
  const ext = dot === -1 ? "" : safeName.slice(dot).toLowerCase();
  if (!allowedExts.includes(ext)) {
    return `The file extension ${ext || "(none)"} does not match its type ${type}.`;
  }
  return null;
}

/**
 * `filename`, or `name-2.ext`, `name-3.ext`… — the first one not already on
 * disk.
 *
 * Uploads keep their real name now instead of a timestamp prefix, so two
 * photos both called `sunset.jpg` are a real possibility. Silently writing
 * the second over the first would leave whatever post used the original
 * pointing at a different photo with no warning; this is the cheap way to
 * make that not happen without a database round trip.
 */
async function uniqueDiskName(dir: string, filename: string): Promise<string> {
  const ext = path.extname(filename);
  const base = filename.slice(0, filename.length - ext.length);
  let candidate = filename;
  for (let n = 2; ; n++) {
    try {
      await access(path.join(dir, candidate));
      candidate = `${base}-${n}${ext}`;
    } catch {
      return candidate; // ENOENT — nothing there yet.
    }
  }
}

// Blob is imported lazily so a deploy without the package or the token still
// boots — the disk path below is what runs there.
async function storeFile(filename: string, bytes: Buffer, mimeType: string): Promise<{ url: string; filename: string }> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(filename, bytes, { access: "public", contentType: mimeType });
    // Blob names its own file (it appends a suffix for uniqueness on its
    // side), so what is stored in `media.filename` is what the URL ends in.
    return { url: blob.url, filename: blob.pathname.split("/").pop() ?? filename };
  }

  // Any host with a writable filesystem — a VPS, a container, `next start` on a
  // plain Node box. Serverless platforms wipe this between invocations, which is
  // exactly the case the token above covers.
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const unique = await uniqueDiskName(dir, filename);
  await writeFile(path.join(dir, unique), bytes);
  return { url: `/uploads/${unique}`, filename: unique };
}

export async function GET(req: NextRequest) {
  try {
    // Admin-only — every caller is an admin screen.
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Paged, because this used to return the entire library on every load of
    // the media screen *and* every open of the picker. At a handful of uploads
    // that is invisible; at a few thousand it is the slowest thing in the admin.
    // The shape is unchanged — `media` is still an array — so older callers keep
    // working and simply get the first page.
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "") || 60, 1), 200);
    const page = Math.max(parseInt(searchParams.get("page") ?? "") || 1, 1);
    const offset = (page - 1) * limit;

    const [result, [counted]] = await Promise.all([
      db.query.media.findMany({
        orderBy: [desc(media.createdAt)],
        limit,
        offset,
      }),
      db.select({ n: count() }).from(media),
    ]);

    const total = counted?.n ?? result.length;
    return NextResponse.json({
      media: result,
      total,
      page,
      hasMore: offset + result.length < total,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch media" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    // The name reaches the filesystem, so anything that could climb out of the
    // uploads directory is stripped rather than escaped — but kept otherwise
    // recognisable: `\w` alone is ASCII-only, so an Arabic or other non-Latin
    // filename used to have every letter stripped, leaving nothing but the
    // dashes the collapsed-run replacement left behind. `\p{L}`/`\p{N}` keep
    // letters and digits from any script, and `\p{M}` keeps the combining
    // marks that go with them — Arabic diacritics are Marks, not Letters, so
    // without it "مجانًا.webp" saved as "مجان-ا.webp", the same way the
    // heading anchors broke (see `toSlug`). Then trimmed: most filesystems
    // refuse a name over 255 bytes, and a too-long upload failed with
    // ENAMETOOLONG and a 500 rather than saving under a shorter name.
    const safeName = path
      .basename(file.name)
      .normalize("NFC")
      .replace(/[^\p{L}\p{N}\p{M}._-]+/gu, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(-120) || "upload";

    const rejection = rejectFile(file, safeName);
    if (rejection) return NextResponse.json({ error: rejection }, { status: 400 });

    let original = Buffer.from(await file.arrayBuffer());
    let svgNotes: string[] = [];

    // SVG is a document. It is stored only in the sanitised form, and refused
    // outright when it does not parse as one <svg> — see lib/sanitizeSvg.ts.
    if (file.type === "image/svg+xml") {
      const cleaned = sanitizeSvg(original.toString("utf8"));
      if (!cleaned) return NextResponse.json({ error: "That file is not a valid SVG image." }, { status: 400 });
      original = Buffer.from(cleaned.svg, "utf8");
      svgNotes = cleaned.removed;
    }

    // A Lottie file must be one: valid JSON with the animation's frame data.
    const isJson = safeName.toLowerCase().endsWith(".json");
    if (isJson) {
      try {
        const anim = JSON.parse(original.toString("utf8"));
        if (!anim || typeof anim !== "object" || !Array.isArray(anim.layers) || typeof anim.fr !== "number") throw new Error("not lottie");
      } catch {
        return NextResponse.json({ error: "That .json file is not a Lottie animation." }, { status: 400 });
      }
    }

    // Shrink and re-encode before storing — see optimizeUpload for what that
    // means and what is left alone. The stored name carries the extension of
    // the bytes actually written, so a converted JPEG is `…webp`.
    const optimized = await optimizeUpload(original, safeName, isJson ? "application/json" : file.type, maxPxFrom((await getSiteSettings()).media_max_px));
    const { filename, buffer, mimeType } = optimized;

    // Dimensions from the bytes being stored. A failure must not fail the
    // upload: an image whose header we cannot read is still a perfectly good
    // image, it just renders without the width/height hint.
    let size: { width: number; height: number } | null =
      optimized.width && optimized.height ? { width: optimized.width, height: optimized.height } : null;
    if (!size && mimeType === "image/svg+xml") {
      // From the viewBox or explicit width/height; an SVG without either
      // simply has no intrinsic size, which is legitimate.
      const svg = buffer.toString("utf8");
      const vb = svg.match(/viewBox\s*=\s*["']\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
      const w = svg.match(/<svg[^>]*\swidth\s*=\s*["']?([\d.]+)/i)?.[1];
      const h = svg.match(/<svg[^>]*\sheight\s*=\s*["']?([\d.]+)/i)?.[1];
      const width = Math.round(Number(w ?? vb?.[1]));
      const height = Math.round(Number(h ?? vb?.[2]));
      if (width > 0 && height > 0) size = { width, height };
    }
    if (!size) {
      try {
        size = imageSize(new Uint8Array(buffer));
      } catch {
        size = null;
      }
    }

    const stored = await storeFile(filename, buffer, mimeType);

    const [mediaItem] = await insertReturning(media, {
      filename: stored.filename,
      originalName: file.name,
      url: stored.url,
      mimeType,
      size: buffer.length,
      width: size?.width ?? null,
      height: size?.height ?? null,
      blur: optimized.blur ?? null,
      uploadedById: session.user?.id,
    });

    return NextResponse.json({ media: mediaItem, ...(svgNotes.length ? { sanitized: svgNotes } : {}) }, { status: 201 });
  } catch (err) {
    // A silent 500 here is indistinguishable from a dead button, so the
    // reason is logged in full — but not echoed: a Node error message can
    // carry the server path, and this endpoint is open to every role.
    console.error("[media upload]", err);
    const code = (err as NodeJS.ErrnoException)?.code;
    const message =
      code === "EACCES" || code === "EROFS" ? "The uploads folder is not writable on this host."
      : code === "ENOSPC" ? "The host has run out of disk space."
      : "The upload could not be stored. Check the server log for the reason.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
