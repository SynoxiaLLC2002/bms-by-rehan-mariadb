import { NextResponse } from "next/server";
import { fileCacheHeaders } from "@/lib/lscache";
import { readFile, stat } from "node:fs/promises";
import { sizedLogo } from "@/lib/logoSrc";
import path from "node:path";

/**
 * Serves `public/uploads/*` files that arrived after the server started.
 *
 * `next start` reads the list of `public/` files once, at boot, and answers
 * 404 for anything added later — so every image uploaded through Media was
 * broken until the next restart. Files that existed at boot are still served
 * by Next's static handler before this route is consulted; this catches the
 * rest, from disk, with the same year-long cache (upload names are unique).
 */
const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

const ROOT = path.join(process.cwd(), "public", "uploads");

export async function GET(_req: Request, { params }: { params: Promise<{ file: string[] }> }) {
  const { file } = await params;
  const rel = Array.isArray(file) ? file.join("/") : "";
  const type = TYPES[path.extname(rel).toLowerCase()];
  if (!rel || !type || rel.includes("..") || rel.includes("\\") || rel.startsWith("/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const full = path.join(ROOT, rel);
  if (!full.startsWith(ROOT + path.sep)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const st = await stat(full);
    if (!st.isFile()) throw new Error("not a file");
    const bytes = await readFile(full);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(bytes.length),
        // Browser lifetime from Speed → Browser cache; a year by default.
        ...(await fileCacheHeaders("uploads")),
        "X-Content-Type-Options": "nosniff",
        // An uploaded SVG is sanitised on the way in; this is the second lock.
        ...(type === "image/svg+xml" ? { "Content-Security-Policy": "script-src 'none'; sandbox" } : {}),
      },
    });
  } catch {
    // A logo size that has not been written yet — a page prerendered on the
    // build machine links it before any request here has made it.
    const made = await sizedLogo(rel).catch(() => null);
    if (made) {
      return new NextResponse(new Uint8Array(made), {
        headers: { "Content-Type": "image/webp", "Content-Length": String(made.length), ...(await fileCacheHeaders("uploads")), "X-Content-Type-Options": "nosniff" },
      });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
