import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PLUGINS_DIR } from "@/lib/plugins";

/**
 * Serves an installed plugin's files: /plugins/<slug>/<file>.
 *
 * From disk on every request, because a plugin is installed while the server
 * runs and Next's own static handler only knows the files that existed at
 * startup. Paths are confined to the plugin's folder; anything that tries to
 * leave it is a 404, not a traversal.
 */
const TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; file: string[] }> }) {
  const { slug, file } = await params;
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug) || !Array.isArray(file) || file.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const rel = file.join("/");
  if (rel.includes("..") || rel.startsWith("/") || rel.includes("\\")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const type = TYPES[path.extname(rel).toLowerCase()];
  if (!type) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dir = path.join(PLUGINS_DIR, slug);
  const target = path.join(dir, rel);
  if (!target.startsWith(dir + path.sep)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const bytes = await readFile(target);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": type,
        // Scripts are versioned by ?v= on their URL, so a day is safe.
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
