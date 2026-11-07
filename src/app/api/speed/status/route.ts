import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { rawQuery } from "@/lib/db/raw";
import { getSiteSettings } from "@/lib/settings";
import { previewCleanup } from "@/lib/maintenance";
import { allPublicUrls, CRAWLER_LAST_RUN, CRAWLER_LAST_PASS, WARM_LAST } from "@/lib/warmCache";
import { siteUrl } from "@/lib/siteUrl";

const LAST_PURGE = "cache_last_purge";

/** Everything the Speed dashboard shows that is not a setting. */
export async function GET() {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await getSiteSettings();
  const keys = [LAST_PURGE, WARM_LAST, CRAWLER_LAST_RUN, CRAWLER_LAST_PASS, "crawler_cursor", "cron_last_publish_check", "maintenance_last_cleanup"];
  const rows = await rawQuery<{ key: string; value: string }>("SELECT `key`, value FROM site_settings WHERE `key` IN (?)", [keys]).catch(() => []);
  const state = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const parse = (v: string | undefined) => {
    try {
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  };
  const [urls, cleanup, revisions] = await Promise.all([
    allPublicUrls(settings).catch(() => [] as string[]),
    previewCleanup().catch(() => null),
    rawQuery<{ n: number; docs: number }>("SELECT count(*) AS n, COUNT(DISTINCT document_kind, document_id) AS docs FROM revisions").catch(() => [{ n: 0, docs: 0 }]),
  ]);

  return NextResponse.json(
    {
      siteUrl: siteUrl(settings),
      urlCount: urls.length,
      lastPurge: state[LAST_PURGE] ?? null,
      lastWarm: parse(state[WARM_LAST]),
      crawler: { last: parse(state[CRAWLER_LAST_RUN]), lastPass: state[CRAWLER_LAST_PASS] ?? null, cursor: parseInt(state.crawler_cursor ?? "0", 10) || 0 },
      cron: { lastPublishCheck: state.cron_last_publish_check ?? null, tokenSet: !!(process.env.CRON_TOKEN || process.env.BACKUP_TOKEN) },
      cleanup,
      revisions: revisions[0] ?? { n: 0, docs: 0 },
      env: {
        imageOptimization: process.env.IMAGE_OPTIMIZATION !== "off",
        imageFormats: process.env.IMAGE_FORMATS === "avif" ? "avif+webp" : "webp",
        nodeEnv: process.env.NODE_ENV,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
