import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { invalidateSiteSettings } from "@/lib/settings";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { siteSettings } from "@/lib/db/schema";
import { customFontFileName, FONT_EXTENSIONS, fontFingerprint, removeCustomFont, saveCustomFont } from "@/lib/localFonts";
import { parseCustomFonts, type CustomFont } from "@/lib/customFonts";
import { LS_PURGE } from "@/lib/lscache";

const SETTING = "custom_fonts";
const MAX_BYTES = 5 * 1024 * 1024;

async function readList(): Promise<CustomFont[]> {
  const row = await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, SETTING) });
  return parseCustomFonts(row?.value ?? "");
}

async function writeList(list: CustomFont[]): Promise<void> {
  const value = JSON.stringify(list);
  await db
    .insert(siteSettings)
    .values({ key: SETTING, value })
    .onDuplicateKeyUpdate({ set: { value } });
  invalidateSiteSettings();
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ fonts: await readList() });
}

/** Uploads one font face: multipart with `file`, `family`, `weight`, `style`. Admins only. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    const family = String(form.get("family") ?? "").trim().replace(/["\\]/g, "").slice(0, 80);
    const weight = String(form.get("weight") ?? "400").trim();
    const style = String(form.get("style") ?? "normal") === "italic" ? "italic" : "normal";
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a font file." }, { status: 400 });
    if (!family) return NextResponse.json({ error: "Give the font a family name." }, { status: 400 });
    if (!/^\d{3}(\s\d{3})?$/.test(weight)) return NextResponse.json({ error: "Weight must be like 400, or 100 900 for a variable font." }, { status: 400 });
    const ext = path.extname(file.name).toLowerCase();
    if (!FONT_EXTENSIONS.has(ext)) return NextResponse.json({ error: "Use a .woff2, .woff, .ttf or .otf file (.woff2 is smallest)." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Font files over 5 MB are not accepted." }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    // Cheap check on the container so a renamed image cannot be installed as a font.
    const head = bytes.subarray(0, 4).toString("latin1");
    const okMagic =
      (ext === ".woff2" && head === "wOF2") ||
      (ext === ".woff" && head === "wOFF") ||
      (ext === ".ttf" && (head === "\0\u0001\0\0" || head === "true")) ||
      (ext === ".otf" && head === "OTTO");
    if (!okMagic) return NextResponse.json({ error: "That file is not a font of the type its name says." }, { status: 400 });

    // The filename carries a fingerprint of the bytes, so replacing a face
    // produces a new URL. Font files are served `immutable` for a year; with
    // a stable name, returning visitors kept the old file and the owner had
    // no way to push the new one out. See customFontFileName.
    const name = customFontFileName(family, weight, style, ext, fontFingerprint(bytes));
    const served = await saveCustomFont(name, bytes);
    const previous = (await readList()).filter((f) => f.family === family && f.weight === weight && f.style === style);
    const list = (await readList()).filter((f) => !(f.family === family && f.weight === weight && f.style === style));
    list.push({ family, weight, style, file: served });
    // Delete the file this face used to point at, now that nothing references
    // it — otherwise every re-upload leaves an orphan behind on disk.
    for (const old of previous) {
      if (old.file && old.file !== served) await removeCustomFont(old.file).catch(() => undefined);
    }
    await writeList(list);
    return NextResponse.json({ ok: true, fonts: list }, { headers: { [LS_PURGE]: "*" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed." }, { status: 500 });
  }
}

/** Removes one face (`?file=/fonts/custom/…`) or a whole family (`?family=`). */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const file = req.nextUrl.searchParams.get("file");
  const family = req.nextUrl.searchParams.get("family");
  const list = await readList();
  const gone = list.filter((f) => (file ? f.file === file : family ? f.family === family : false));
  if (gone.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  for (const f of gone) await removeCustomFont(f.file);
  const kept = list.filter((f) => !gone.includes(f));
  await writeList(kept);
  return NextResponse.json({ ok: true, fonts: kept }, { headers: { [LS_PURGE]: "*" } });
}
