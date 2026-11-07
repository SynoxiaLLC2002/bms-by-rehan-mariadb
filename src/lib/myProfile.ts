// The public profile fields of one's own account, for a program signed in with
// an API token (lib/mcpServer.ts update_my_profile).
//
// The users routes stay refused to every token (middleware TOKEN_REFUSED): they
// also change email, password and role. This writes only what a reader sees on
// the author page and in a byline — name, address, bio, photo, links and the
// public-page switch — and only on the caller's own account. Same rules as the
// admin's Users screen: a slug is normalised and must be free, an old author
// address keeps answering, and the author pages are refreshed.

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { toSlug } from "@/lib/utils";
import { getSiteSettings } from "@/lib/settings";
import { authorPath } from "@/lib/permalinks";
import { contentLanguages } from "@/lib/locale";
import { recordSlugChange } from "@/lib/autoRedirect";
import { revalidatePublicSite } from "@/lib/revalidateSite";

/** Text fields, saved trimmed; empty clears. */
export const PROFILE_TEXT = ["name", "bio", "image", "website", "twitter", "linkedin", "facebook", "instagram", "github", "youtube"] as const;

const PUBLIC_COLUMNS = {
  id: true, name: true, slug: true, bio: true, image: true, publicProfile: true,
  website: true, twitter: true, linkedin: true, facebook: true, instagram: true, github: true, youtube: true,
} as const;

export async function readOwnProfile(userId: string) {
  return db.query.users.findFirst({ where: eq(users.id, userId), columns: PUBLIC_COLUMNS });
}

export async function updateOwnProfile(
  userId: string,
  body: Record<string, unknown>
): Promise<{ ok: true; profile: unknown } | { ok: false; error: string }> {
  const target = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, slug: true } });
  if (!target) return { ok: false, error: "Account not found." };

  const data: Record<string, unknown> = {};
  for (const k of PROFILE_TEXT) {
    if (body[k] === undefined) continue;
    const s = String(body[k] ?? "").trim();
    if (k === "name" && !s) return { ok: false, error: "name cannot be empty." };
    if (s.length > (k === "bio" ? 5000 : 500)) return { ok: false, error: `${k} is too long.` };
    data[k] = s === "" ? null : s;
  }
  if (body.publicProfile !== undefined) data.publicProfile = body.publicProfile === true || body.publicProfile === "true";
  if (body.slug !== undefined) {
    const slug = toSlug(String(body.slug ?? ""));
    if (!slug) return { ok: false, error: "slug is empty after cleaning; use letters, numbers and hyphens." };
    const clash = await db.query.users.findFirst({ where: eq(users.slug, slug), columns: { id: true } });
    if (clash && clash.id !== userId) return { ok: false, error: "Another author already uses that slug." };
    data.slug = slug;
  }
  if (!Object.keys(data).length) return { ok: false, error: "Nothing to change. Send at least one of: " + [...PROFILE_TEXT, "slug", "publicProfile"].join(", ") };

  await db.update(users).set(data).where(eq(users.id, userId));
  const profile = await readOwnProfile(userId);

  const settings = await getSiteSettings();
  const langs = contentLanguages(settings);
  const slugs = [...new Set([profile?.slug, target.slug].filter((s): s is string => !!s))];
  revalidatePublicSite({ cloudflarePaths: langs.flatMap((lang) => slugs.map((s) => authorPath(s, lang, settings))) });
  // A new address: the old one keeps answering, as a renamed post's does.
  if (profile?.slug && target.slug && profile.slug !== target.slug) {
    for (const lang of langs) {
      const from = authorPath(target.slug, lang, settings);
      const to = authorPath(profile.slug, lang, settings);
      if (from !== to) await recordSlugChange(from, to).catch(() => undefined);
    }
  }
  return { ok: true, profile };
}
