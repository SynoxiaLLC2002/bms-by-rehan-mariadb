import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pages, siteSettings } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isAdmin, FORBIDDEN } from "@/lib/authz";
import { purgeCloudflare } from "@/lib/cloudflarePurge";
import { revalidatePublicSite } from "@/lib/revalidateSite";
import { ADMIN_ONLY_SETTING, getSiteSettings, isPrivateSetting } from "@/lib/settings";
import { isLiveNow } from "@/lib/publishState";
import { toRowId } from "@/lib/utils";
import { forgetCacheSettings } from "@/lib/lscache";
import { viaToken } from "@/lib/apiTokens";

/** Generous ceilings; see the note in POST for why they exist and how sized. */
const MAX_SETTING_KEYS = 1000;
const MAX_SETTING_BYTES = 256 * 1024;

export async function GET() {
  try {
    // Every caller of this route is an admin screen, and the table holds
    // `script_head` / `script_body_end` — arbitrary markup that routinely
    // carries analytics and verification keys. The public site reads settings
    // straight from the database on the server, never through here.
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const result = await db.query.siteSettings.findMany();
    const settings: Record<string, string> = {};
    // Editors and authors read this route too (the categories and tags
    // screens do), but the table holds the Cloudflare API token and the
    // head/footer scripts. Those are an administrator's: nobody else can
    // write settings, so nobody else needs to read them.
    //
    // An API token is never shown them either, whatever its role: a token
    // lives in another program's config, and one that leaks should not hand
    // over the Cloudflare credentials with it.
    const admin = isAdmin(session) && !viaToken(session);
    result.forEach((s) => {
      // The SMTP password goes to nobody, administrators included: the Email
      // screen only ever learns whether one is saved.
      if (isPrivateSetting(s.key)) return;
      if (!admin && ADMIN_ONLY_SETTING.test(s.key)) return;
      settings[s.key] = s.value ?? "";
    });
    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Administrators only: settings carry `script_head`, which injects arbitrary markup into every page.
    if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const body = await req.json() as Record<string, string>;

    // Every request reads *all* of these — `getSiteSettings()` loads the whole
    // table, once per render — so an oversized settings row is a tax on every
    // page on the site, forever. Admin-only, so this is not about defending
    // against an attacker; it is about a paste into Custom CSS or a header
    // script not quietly becoming a permanent performance cost.
    //
    // The live table is 389 keys / 1.6 KB, largest value 192 bytes, so these
    // leave roughly a thousandfold of headroom: nothing legitimate can trip
    // them, and they still stop unbounded growth.
    const entries = Object.entries(body);
    // Email settings are saved by /api/mail-settings, which encrypts the
    // password and tests the connection; this route must not write them raw.
    if (entries.some(([k]) => k.startsWith("mail_"))) {
      return NextResponse.json({ error: "Email settings are saved from Admin → Email." }, { status: 400 });
    }
    // Credentials and the head/footer scripts are set from a browser only —
    // a token that could write `script_head` could put code on every page.
    if (viaToken(session)) {
      const refused = entries.find(([k]) => ADMIN_ONLY_SETTING.test(k));
      if (refused) return NextResponse.json({ error: `"${refused[0]}" can only be changed from the admin, not with an API token.` }, { status: 403 });
    }
    if (entries.length > MAX_SETTING_KEYS) {
      return NextResponse.json(
        { error: `Too many settings in one request (${entries.length}).` },
        { status: 400 }
      );
    }
    // A setting is text. An object here is a caller's mistake — String() of it
    // is "[object Object]", which was saved without complaint.
    const notText = entries.find(([, value]) => value !== null && typeof value === "object");
    if (notText) {
      return NextResponse.json({ error: `"${notText[0]}" must be a text value.` }, { status: 400 });
    }
    const oversized = entries.find(([, value]) => String(value ?? "").length > MAX_SETTING_BYTES);
    if (oversized) {
      return NextResponse.json(
        { error: `"${oversized[0]}" is too large — the limit is ${MAX_SETTING_BYTES / 1024} KB.` },
        { status: 400 }
      );
    }

    // The front page and the Posts page cannot be the same page.
    //
    // Nothing stopped this combination, and it makes the post listing
    // unreachable: the root route renders that page's CONTENT, and the
    // listing's own /page/2 redirects to /page/2, which 404s because a
    // homepage is set. The site silently loses its blog.
    //
    // Checked against the saved values merged with this request, because the
    // screens now send only the keys they changed — so one half of the pair
    // can arrive on its own.
    //
    // A draft is refused for either role for the same reason: the front page
    // falls back to the latest-posts listing while /page/2 still 404s.
    {
      const pageKeys = entries.filter(([k]) => /^(homepage_id|posts_page_id)(_[a-z-]{2,7})?$/.test(k));
      if (pageKeys.length) {
        const saved = await getSiteSettings();
        const merged: Record<string, string> = { ...saved, ...Object.fromEntries(entries.map(([k, v]) => [k, String(v ?? "")])) };
        const langs = new Set(pageKeys.map(([k]) => k.replace(/^(homepage_id|posts_page_id)/, "")));
        for (const suffix of langs) {
          const home = (merged[`homepage_id${suffix}`] ?? "").trim();
          const postsPage = (merged[`posts_page_id${suffix}`] ?? "").trim();
          if (home && postsPage && home === postsPage) {
            return NextResponse.json(
              { error: "The front page and the Posts page cannot be the same page — the post listing would become unreachable." },
              { status: 400 }
            );
          }
          for (const [label, id] of [["front page", home], ["Posts page", postsPage]] as const) {
            const numeric = toRowId(id);
            if (!numeric) continue;
            const row = await db.query.pages.findFirst({
              where: eq(pages.id, numeric),
              columns: { status: true, deletedAt: true, publishedAt: true, title: true },
            });
            if (row && !isLiveNow(row.status, row.publishedAt, row.deletedAt)) {
              return NextResponse.json(
                { error: `"${row.title}" is not published, so it cannot be used as the ${label}.` },
                { status: 400 }
              );
            }
          }
        }
      }
    }

    // The settings before this save, and after it (the request merged over
    // them) — for the Cloudflare rule below. Built here rather than re-read
    // after the write: `getSiteSettings` is memoised within a request.
    const settingsBefore = await getSiteSettings().catch(() => ({}) as Record<string, string>);
    const settingsAfter: Record<string, string> = { ...settingsBefore, ...Object.fromEntries(entries.map(([k, v]) => [k, String(v ?? "")])) };
    const exclusionsOf = (s: Record<string, string>) => `${s.cache_exclude_paths ?? ""}\n--\n${s.cache_exclude_cookies ?? ""}`;

    // One statement for every key. Doing these in a loop cost a full Neon
    // round trip per setting (~50 keys = ~7s to save the Appearance page).
    const rows = entries.map(([key, value]) => ({
      key,
      value: String(value),
      updatedAt: new Date(),
    }));

    if (rows.length > 0) {
      await db
        .insert(siteSettings)
        .values(rows)
        .onDuplicateKeyUpdate({ set: {
            value: sql.raw("VALUES(`value`)"),
            updatedAt: sql.raw("VALUES(`updated_at`)"),
          },
        });
    }

    // Settings decide URLs, titles, schema and menus on every page — so every
    // cached page is dropped, the same as a content save. Before this, a
    // changed SEO template or permalink option waited for the hourly refresh.
    revalidatePublicSite();

    // Best-effort: a settings save must never fail because Cloudflare is slow
    // or unreachable — it only shortens the gap before the published change
    // is visible, same as the LiteSpeed purge the middleware already fires
    // for every authenticated write. See lib/cloudflarePurge.ts.
    let warning: string | undefined;
    try {
      const fresh = await getSiteSettings();
      forgetCacheSettings();
      // Cache exclusions are folded into the Cloudflare rule (cloudflare.ts
      // cacheRuleExpression), but the rule only changed when someone pressed
      // its button — so excluding /account reached LiteSpeed at once and left
      // Cloudflare caching it, one visitor's page served to the next. When the
      // rule is in place it is rewritten here, before the purge below.
      // Only when they changed: the Speed screen sends every key on each save.
      if (exclusionsOf(settingsBefore) !== exclusionsOf(settingsAfter)) {
        const { cacheRuleState, cloudflareSetCacheRule } = await import("@/lib/cloudflare");
        // "stale" as well as "on": the rule is there, just not this version.
        const state = await cacheRuleState(settingsAfter).catch(() => null);
        if (state && (state.state === "on" || state.state === "stale")) {
          const r = await cloudflareSetCacheRule(settingsAfter, true);
          if (!r.ok) warning = `Saved, but the Cloudflare cache rule could not be updated with the new exclusions: ${r.error}. Update it from the Cloudflare card before relying on them.`;
        } else if (state && state.state === "unreadable") {
          warning = `Saved, but the Cloudflare cache rule could not be read (${state.error}). If Cloudflare caches pages, update its rule from the Cloudflare card.`;
        }
      }
      if (fresh.cf_purge_on_save !== "false") await purgeCloudflare(fresh);
    } catch {
      // Deliberately swallowed.
    }

    return NextResponse.json({ success: true, ...(warning ? { warning } : {}) });
  } catch {
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
