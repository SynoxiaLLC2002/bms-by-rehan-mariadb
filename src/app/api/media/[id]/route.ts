import { NextRequest, NextResponse } from "next/server";
import { rawQuery } from "@/lib/db/raw";
import { purgeCloudflarePaths } from "@/lib/revalidateSite";
import { WIDTHS as IMAGE_WIDTHS, QUALITIES as IMAGE_QUALITIES } from "@/lib/logoSrc";
import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { readByIds } from "@/lib/db/write";
import { media } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import type { Session } from "next-auth";
import { numericId } from "@/lib/routeParams";
import { isAuthor, sessionUser, FORBIDDEN } from "@/lib/authz";
import { isLocalUpload } from "@/lib/exportMedia";

/**
 * Whether this session may change or remove this upload.
 *
 * Editors and administrators: any file. An author: only what they uploaded —
 * the same line WordPress draws, and the one that stops one writer from
 * deleting the hero image out of another writer's published post.
 */
function mayTouch(session: Session | null, uploadedById: string | null): boolean {
  if (!isAuthor(session)) return true;
  const me = sessionUser(session);
  return !!me && !!uploadedById && uploadedById === me.id;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const existing = await db.query.media.findFirst({ where: eq(media.id, numId), columns: { uploadedById: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!mayTouch(session, existing.uploadedById)) return NextResponse.json(FORBIDDEN, { status: 403 });
    const body = await req.json();

    // Coerced and capped. These went from the request body into the columns
    // untouched, and this is the only path that writes them — a non-string
    // reached the insert as whatever it was, and nothing bounded the length,
    // though `alt` is emitted into every `<img>` that uses this image and the
    // caption is shown under it. React escapes both at render, so the cost was
    // page weight and a 500 rather than injection. `undefined` is left alone
    // so a patch that sends one field does not blank the other.
    const text = (v: unknown, max: number) =>
      v === undefined ? undefined : v === null ? null : String(v).trim().slice(0, max);

    await db.update(media).set({
      alt: text(body.alt, 300),
      caption: text(body.caption, 1000),
    }).where(eq(media.id, numId));
    const [item] = await readByIds(media, [numId]);

    return NextResponse.json({ media: item });
  } catch {
    return NextResponse.json({ error: "Failed to update media" }, { status: 500 });
  }
}

/**
 * Removes the upload — the row *and* the bytes.
 *
 * This used to delete only the database row. The file stayed in
 * `public/uploads` (or in Blob storage) forever: invisible in the library,
 * still served at its old URL, still counting against the disk. Deleting
 * from the library now means what it says. The row goes last, so a failure
 * to remove the file leaves the library honest rather than pointing at
 * nothing; a file that is already gone is not an error.
 */
/**
 * Where an upload is still used, in words — "2 posts, the site settings".
 *
 * Deleting an image that a post or the logo still shows left a broken image
 * on the live site with no warning. The content columns are JSON, searched as
 * text for the file's URL, which catches it in any block, column or prop.
 */
async function usesOf(url: string): Promise<string[]> {
  const like = `%${url.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const count = async (sql: string) => {
    try {
      // One value per `?` — MariaDB has no numbered placeholders to reuse.
      const rows = await rawQuery<{ n: number }>(sql, Array(sql.split("?").length - 1).fill(like));
      return Number(rows[0]?.n ?? 0);
    } catch {
      return 0;
    }
  };
  const [postsN, pagesN, elementsN, usersN, settingsN] = await Promise.all([
    count("SELECT count(*) AS n FROM posts WHERE deleted_at IS NULL AND (content LIKE ? OR featured_image LIKE ? OR og_image LIKE ?)"),
    count("SELECT count(*) AS n FROM pages WHERE deleted_at IS NULL AND (content LIKE ? OR featured_image LIKE ? OR og_image LIKE ?)"),
    count("SELECT count(*) AS n FROM elements WHERE content LIKE ?"),
    count("SELECT count(*) AS n FROM users WHERE content LIKE ? OR image LIKE ?"),
    count("SELECT count(*) AS n FROM site_settings WHERE value LIKE ?"),
  ]);
  const out: string[] = [];
  if (postsN) out.push(`${postsN} post${postsN === 1 ? "" : "s"}`);
  if (pagesN) out.push(`${pagesN} page${pagesN === 1 ? "" : "s"}`);
  if (elementsN) out.push(`${elementsN} element${elementsN === 1 ? "" : "s"}`);
  if (usersN) out.push(`${usersN} author profile${usersN === 1 ? "" : "s"}`);
  if (settingsN) out.push("the site settings (logo, icon or a default image)");
  return out;
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const existing = await db.query.media.findFirst({
      where: eq(media.id, numId),
      columns: { url: true, filename: true, uploadedById: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!mayTouch(session, existing.uploadedById)) return NextResponse.json(FORBIDDEN, { status: 403 });

    if (req.nextUrl.searchParams.get("force") !== "1") {
      const uses = await usesOf(existing.url);
      if (uses.length > 0) {
        return NextResponse.json(
          { error: `This file is still used in ${uses.join(", ")}. Deleting it leaves a broken image there.`, uses, code: "in_use" },
          { status: 409 }
        );
      }
    }

    if (isLocalUpload(existing.url)) {
      // `basename` keeps this inside the uploads directory whatever the row says.
      const file = path.join(process.cwd(), "public", "uploads", path.basename(existing.url));
      await unlink(file).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== "ENOENT") throw err;
      });
      // Everything else made from it. The resized copies in /uploads/_sized/
      // stayed public after a delete, and the untouched original — GPS and
      // all — stayed in uploads-originals/ (see api/speed/media).
      const name = path.basename(existing.url);
      const stem = name.replace(/\.[^.]+$/, "");
      await unlink(path.join(process.cwd(), "uploads-originals", name)).catch(() => undefined);
      const sizedDir = path.join(process.cwd(), "public", "uploads", "_sized");
      const sized = await readdir(sizedDir).catch(() => [] as string[]);
      for (const f of sized) {
        // Exactly `<stem>-<width>w.webp`: a prefix test also matched
        // `photo-2-120w.webp` when `photo.webp` was deleted.
        if (f.startsWith(`${stem}-`) && /^\d+w\.webp$/.test(f.slice(stem.length + 1))) await unlink(path.join(sizedDir, f)).catch(() => undefined);
      }
    } else if (process.env.BLOB_READ_WRITE_TOKEN && /^https?:\/\//.test(existing.url)) {
      const { del } = await import("@vercel/blob");
      await del(existing.url).catch(() => undefined);
    }

    await db.delete(media).where(eq(media.id, numId));
    // Cloudflare keeps an image for up to a year (Speed → Browser cache). The
    // file and every optimised variant are dropped by URL: the variants are
    // `/_next/image?url=…&w=…&q=…` over the widths and qualities in
    // next.config.mjs, a list this can write out. Emptying the whole zone
    // instead threw out every other image on the site too.
    if (existing.url.startsWith("/")) {
      const enc = encodeURIComponent(existing.url);
      const variants = IMAGE_WIDTHS.flatMap((w) => IMAGE_QUALITIES.map((q) => `/_next/image?url=${enc}&w=${w}&q=${q}`));
      purgeCloudflarePaths([existing.url, ...variants]);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete media" }, { status: 500 });
  }
}
