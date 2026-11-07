import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { sessionAuth as auth } from "@/lib/auth"; // never an API token (lib/apiTokens.ts)
import { isAdmin, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import { buildExport, exportFilename } from "@/lib/exportSite";
import { bundleMedia } from "@/lib/exportMedia";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";

/**
 * Downloads a complete copy of the site's content.
 *
 * Administrators only. This is every post, page, comment and setting in one
 * response — the same reach as the database itself, so it belongs behind the
 * same door as the settings screen rather than any signed-in account.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

  const withMedia = req.nextUrl.searchParams.get("media") === "1";

  try {
    const settings = await getSiteSettings();
    const payload = await buildExport(settings, siteUrl(settings));

    // Pretty-printed on purpose. A backup that a person can open, read and diff
    // is worth more than the bytes saved by minifying it, and these files are
    // measured in kilobytes for any site one person writes.
    const json = JSON.stringify(payload, null, 2);
    const base = exportFilename(settings.site_name || "");

    if (!withMedia) {
      return new NextResponse(json, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${base}"`,
          // A backup is a point in time; serving a cached one would quietly
          // hand back yesterday's content.
          "Cache-Control": "no-store",
        },
      });
    }

    // ── With the uploaded files ──────────────────────────────────────────
    //
    // The JSON alone carries media *records* and none of the bytes, which is a
    // backup that silently loses every image. Only files stored on this machine
    // need bundling: when the site uses blob storage the URLs are absolute and
    // keep resolving after a restore, so copying them in would double the
    // storage for nothing.
    const zip = new JSZip();
    const urls = (payload.data.media as { url?: string }[] | undefined ?? [])
      .map((m) => String(m?.url ?? ""))
      .filter(Boolean);

    const result = await bundleMedia(zip, urls);

    // The manifest goes in after the files so its counts describe what is
    // actually in the archive rather than what was hoped for.
    zip.file(
      "content.json",
      JSON.stringify(
        {
          ...payload,
          media_bundle: {
            included: result.included,
            missingFromDisk: result.missing,
            alreadyHosted: result.skippedRemote,
          },
        },
        null,
        2
      )
    );

    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${base.replace(/\.json$/, "")}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    // The size guard is the one failure worth explaining: it is a real limit
    // with a real workaround, not a bug the person can do nothing about.
    const msg =
      e instanceof Error && e.message.startsWith("The uploads are larger")
        ? e.message
        : "Could not build the export.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
