import { cache } from "react";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tags, postTags } from "@/lib/db/schema";
import { toSlug } from "@/lib/utils";

/**
 * Replaces a post's tags with the given names.
 *
 * Takes names rather than ids so the editor can offer free typing: a name that
 * has no tag yet creates one, matched on slug so "Web Dev" and "web-dev" are
 * the same tag rather than two.
 *
 * Failures do not propagate: losing a tag must not lose the author's post. But
 * they are no longer silent. This was written when the tags migration had not
 * been applied, so "it threw" was the expected state and swallowing it was the
 * whole point; now that the tables exist, an exception here means something is
 * actually wrong and a bare `catch {}` would hide it while quietly dropping
 * every tag the author typed.
 */
export async function syncPostTags(
  postId: number,
  names: unknown,
  /**
   * The post's language. Tags belong to a language now, so a slug is unique
   * within one rather than across the site — resolving by slug alone could
   * attach a French post to the English "recipes" tag, or pick whichever row
   * the database happened to return first.
   *
   * Required rather than defaulted: a default of "en" is exactly the silent
   * wrong answer this parameter exists to prevent, and the compiler finding a
   * caller that forgot is worth more than the convenience.
   */
  language: string
): Promise<void> {
  if (!Array.isArray(names)) return;

  const wanted = new Map<string, string>();
  for (const raw of names) {
    const name = String(raw ?? "").trim().slice(0, 60);
    if (!name) continue;
    const slug = toSlug(name);
    if (slug) wanted.set(slug, name);
  }

  try {
    if (wanted.size === 0) {
      await db.delete(postTags).where(eq(postTags.postId, postId));
      return;
    }

    const slugs = [...wanted.keys()];
    const existing = await db.query.tags.findMany({
      where: and(inArray(tags.slug, slugs), eq(tags.language, language)),
    });
    const bySlug = new Map(existing.map((t) => [t.slug, t]));

    const missing = slugs.filter((s) => !bySlug.has(s));
    if (missing.length > 0) {
      // A tag another request created a moment ago is kept, not duplicated;
      // then every one of them is read back (MariaDB has no RETURNING here).
      await db.insert(tags)
        .values(missing.map((slug) => ({ name: wanted.get(slug)!, slug, language })))
        .onDuplicateKeyUpdate({ set: { slug: sql.raw("`slug`") } });
      const created = await db.query.tags.findMany({
        where: and(inArray(tags.slug, missing), eq(tags.language, language)),
      });
      created.forEach((t) => bySlug.set(t.slug, t));
      // New archives: no old redirect may keep hiding their address.
      if (created.length) {
        const [{ releaseRedirectFrom }, { tagPath }, { getSiteSettings }] = await Promise.all([
          import("@/lib/autoRedirect"),
          import("@/lib/permalinks"),
          import("@/lib/settings"),
        ]);
        const settings = await getSiteSettings();
        for (const t of created) await releaseRedirectFrom(tagPath(t.slug, t.language, settings));
      }
    }

    const rows = slugs.map((s) => bySlug.get(s)).filter(Boolean).map((t) => ({ postId, tagId: t!.id }));
    // Only now, with the new set resolved: deleting first meant any failure
    // above left the post with no tags at all.
    await db.delete(postTags).where(eq(postTags.postId, postId));
    if (rows.length > 0) await db.insert(postTags).values(rows).onDuplicateKeyUpdate({ set: { postId: sql.raw("`post_id`") } });
  } catch (err) {
    console.error("[tags] could not sync tags for post", postId, err);
  }
}

/** A post's tag names, for the editor and the published page. Once per request. */
export const tagsForPost = cache(async function tagsForPost(postId: number): Promise<{ id: number; name: string; slug: string }[]> {
  try {
    const rows = await db.query.postTags.findMany({
      where: eq(postTags.postId, postId),
      with: { tag: true },
    });
    return rows
      .map((r) => r.tag)
      .filter(Boolean)
      .map((t) => ({ id: t.id, name: t.name, slug: t.slug }));
  } catch (err) {
    // An empty list is the right fallback — a post renders fine without its
    // tags — but say so, or a broken join looks like "this post has no tags".
    console.error("[tags] could not read tags for post", postId, err);
    return [];
  }
});
