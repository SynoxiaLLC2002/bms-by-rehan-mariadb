import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { FONTS_DIR, FONT_TYPES } from "@/lib/localFonts";
import { fileCacheHeaders } from "@/lib/lscache";

/**
 * Serves font files from `fonts/` at the project root: /fonts/g/<hash>.woff2
 * for Google copies, /fonts/custom/<name> for uploads. From disk on every
 * request rather than `public/`, because the files arrive while the server
 * runs. Cached for a year — the Google names are content hashes and an
 * uploaded font is replaced under a new name, so nothing served here changes.
 * The browser lifetime is the Speed → Browser cache setting.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string[] }> }) {
  const { file } = await params;
  if (!Array.isArray(file) || file.length !== 2 || !["g", "custom"].includes(file[0])) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const name = file[1];
  const ext = path.extname(name).toLowerCase();
  const type = FONT_TYPES[ext];
  if (!type || !/^[a-z0-9][a-z0-9._-]{0,80}$/i.test(name) || name.includes("..")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const bytes = await readFile(path.join(FONTS_DIR, file[0], name));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        ...(await fileCacheHeaders("fonts")),
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
