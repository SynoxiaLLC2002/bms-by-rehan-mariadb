import { NextRequest, NextResponse } from "next/server";
import { sessionAuth as auth } from "@/lib/auth"; // never an API token (lib/apiTokens.ts)
import { isAdmin, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import JSZip from "jszip";
import { ImportError, importSite } from "@/lib/importSite";
import { restoreMedia } from "@/lib/exportMedia";
import { revalidatePublicSite } from "@/lib/revalidateSite";

/**
 * Restores an export.
 *
 * Administrators only, for the same reason the export is: this writes content,
 * users and — if asked — the site's whole configuration.
 *
 * The import itself never deletes, so the dangerous direction here is not data
 * loss but a half-finished run. `importSite` inserts in dependency order and
 * skips anything that already exists, so running the same file twice is safe
 * and lands nothing the second time — unless `overwrite` (restore mode) is
 * asked for, which puts existing posts and pages back to the file's version,
 * each with its current version saved in History first.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

  // Two shapes arrive here: the JSON export posted as JSON, and the
  // media-bearing `.zip` posted as a file. The zip is unpacked to the same
  // `{ file, settings, dryRun }` the JSON path produces, so `importSite` never
  // learns which one it came from.
  let file: unknown;
  let settings = false;
  let dryRun = false;
  let overwrite = false;
  let mediaZip: JSZip | null = null;

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    settings = form.get("settings") === "true";
    overwrite = form.get("overwrite") === "true";
    dryRun = form.get("dryRun") === "true";
    const upload = form.get("file");
    if (!(upload instanceof File)) {
      return NextResponse.json({ error: "No export file was sent." }, { status: 400 });
    }
    try {
      mediaZip = await JSZip.loadAsync(await upload.arrayBuffer());
    } catch {
      return NextResponse.json({ error: "That file is not a readable .zip." }, { status: 400 });
    }
    // `site.json` is what automatic backups wrote before 1.9.62; same format.
    const manifest = mediaZip.file("content.json") ?? mediaZip.file("site.json");
    if (!manifest) {
      return NextResponse.json(
        { error: "That archive has no content.json — it is not a site export or backup." },
        { status: 400 }
      );
    }
    try {
      file = JSON.parse(await manifest.async("string"));
    } catch {
      return NextResponse.json({ error: "The content.json inside is not valid JSON." }, { status: 400 });
    }
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "That file is not valid JSON." }, { status: 400 });
    }
    const payload = body as { file?: unknown; settings?: boolean; dryRun?: boolean; overwrite?: boolean };
    if (!payload?.file) {
      return NextResponse.json({ error: "No export file was sent." }, { status: 400 });
    }
    file = payload.file;
    settings = payload.settings === true;
    overwrite = payload.overwrite === true;
    dryRun = payload.dryRun === true;
  }

  try {
    const report = await importSite(file, { settings, dryRun, overwrite });

    // Files last, and only for a real run: a dry run must not write to disk,
    // and restoring images for content that was skipped anyway is wasted work.
    if (mediaZip && !dryRun) {
      const { written, skipped } = await restoreMedia(mediaZip);
      if (written || skipped) {
        report.notes.push(
          `${written} uploaded file(s) restored${skipped ? `, ${skipped} left alone because a file of that name already existed` : ""}.`
        );
      }
    } else if (mediaZip && dryRun) {
      const count = Object.values(mediaZip.files).filter(
        (f) => !f.dir && f.name.startsWith("uploads/")
      ).length;
      if (count) report.notes.push(`${count} uploaded file(s) are in this archive and would be restored.`);
    }

    // Content, menus and maybe settings changed underneath every cached
    // page; a restore especially must show at once, not after the cache ages.
    if (!dryRun) revalidatePublicSite();

    return NextResponse.json(report);
  } catch (e) {
    // A rejection the person can act on — a wrong file, a newer format —
    // is theirs to see. Anything else is ours.
    if (e instanceof ImportError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[import] failed", e);
    return NextResponse.json({ error: "The import failed partway through." }, { status: 500 });
  }
}
