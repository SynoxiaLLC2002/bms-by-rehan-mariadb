import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { purgeAll } from "@/lib/lscache";
import { purgeCloudflare } from "@/lib/cloudflarePurge";
import { getSiteSettings } from "@/lib/settings";
import { revalidatePublicSite } from "@/lib/revalidateSite";
import { rawQuery } from "@/lib/db/raw";

/**
 * Manual "Purge Cache" — the same purge every settings save already triggers
 * (see `lib/lscache.ts`), just available on demand rather than only as a
 * side effect of publishing something. Clears LiteSpeed's origin cache
 * always, and Cloudflare's edge cache too when a zone id and API token are
 * configured — the layer that made a published colour take a while to show
 * on a live site even after the origin already had it right.
 */
export async function POST() {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await getSiteSettings();
  // All three layers: Next's own page cache, LiteSpeed (header below), Cloudflare.
  revalidatePublicSite();
  const cloudflare = await purgeCloudflare(settings);
  await rawQuery(
    `INSERT INTO site_settings (\`key\`, value) VALUES ('cache_last_purge', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [new Date().toISOString()]
  ).catch(() => undefined);

  const res = NextResponse.json({ ok: true, cloudflare }, { headers: { "Cache-Control": "no-store" } });
  purgeAll(res.headers);
  return res;
}
