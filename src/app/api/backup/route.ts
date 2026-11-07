import { NextRequest, NextResponse } from "next/server";
import { presentedToken, secretMatches } from "@/lib/secretCompare";
import { runBackup } from "@/lib/backup";

/**
 * A scheduled backup, for a cron job to call.
 *
 * Settings → Export needs a person at a keyboard; this does not. Given the
 * secret in BACKUP_TOKEN it writes one zip — the full content export plus
 * every local upload — into `backups/` next to the app, and keeps the newest
 * seven. On cPanel that is one line under Cron Jobs:
 *
 *     curl -s "https://example.com/api/backup?token=…" >/dev/null
 *
 * The folder is outside `public/`, so the archives are never served. They are
 * on the same disk as the site, which is protection against a bad edit and a
 * bad update, not against losing the host — download one now and then.
 *
 * Without BACKUP_TOKEN the route does nothing at all, and a wrong token is
 * indistinguishable from a missing one.
 */
export async function GET(req: NextRequest) {
  const expected = (process.env.BACKUP_TOKEN ?? "").trim();
  const given = presentedToken(req, "x-backup-token");
  if (!secretMatches(expected, given)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const r = await runBackup();
    if (!r.ok) {
      return NextResponse.json(
        { error: r.error, ...(r.file ? { file: r.file } : {}) },
        { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds), "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Backup failed." }, { status: 500 });
  }
}
