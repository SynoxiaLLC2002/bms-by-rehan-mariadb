// What a post or page save may contain.
//
// The save routes passed the body straight to the database. Any text was a
// status — a post saved as "Published " or "live" existed, in no listing and on
// no page. A title sent as a number or an object reached a `text` column and
// came back as a generic "Failed to update post". And an author, the
// lowest-trust role, could point a post's canonical URL or share image at any
// site on the internet — telling Google another domain is the real copy.

export const DOC_STATUSES = ["draft", "published"] as const;

const STRING_FIELDS = [
  "title", "slug", "excerpt", "featuredImage", "seoTitle", "seoDescription", "seoKeywords",
  "ogTitle", "ogDescription", "ogImage", "twitterTitle", "twitterDescription", "twitterImage",
  "canonicalUrl", "cssClasses",
] as const;

/** Fields whose value is a URL a search engine or a share card follows. */
const URL_FIELDS = ["canonicalUrl", "ogImage", "twitterImage", "featuredImage"] as const;

function sameSite(value: string, site: string): boolean {
  const v = value.trim();
  if (!v) return true;
  // A path on this site.
  if (v.startsWith("/") && !v.startsWith("//")) return true;
  try {
    const u = new URL(v);
    const s = new URL(site);
    return u.host.toLowerCase() === s.host.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * A readable reason the body cannot be saved, or null when it can.
 *
 * Absent fields are fine — saves are partial. Present ones must be the right
 * type; `null` clears a string field and is allowed.
 */
export function docBodyProblem(
  body: Record<string, unknown>,
  opts: { authorRole: boolean; siteUrl: string; allowed?: ReadonlySet<string> }
): string | null {
  if (body.status !== undefined && !(DOC_STATUSES as readonly unknown[]).includes(body.status)) {
    return `Unknown status "${String(body.status).slice(0, 40)}". Use draft or published.`;
  }
  for (const key of STRING_FIELDS) {
    const v = body[key];
    if (v !== undefined && v !== null && typeof v !== "string") return `"${key}" must be text.`;
  }
  if (typeof body.title === "string" && body.title.length > 500) return "The title is longer than 500 characters.";
  if (body.content !== undefined && body.content !== null && !Array.isArray(body.content)) {
    return "The content could not be read.";
  }
  if (opts.authorRole) {
    for (const key of URL_FIELDS) {
      const v = body[key];
      if (typeof v === "string" && !sameSite(v, opts.siteUrl) && !opts.allowed?.has(v.trim())) {
        return key === "canonicalUrl"
          ? "Authors can only set a canonical URL on this site."
          : "Authors can only use images from this site's media library.";
      }
    }
  }
  return null;
}

/**
 * `docBodyProblem` for a save route, with the off-site values an author may
 * legitimately send.
 *
 * The same-site rule alone refused two things that are not an author
 * pointing a post elsewhere: a value already stored on the document (an
 * imported share image, one an editor set) — the editor sends every field on
 * every save, so the post could not be saved at all, not even for a typo —
 * and the site's own uploads when media lives in Vercel Blob, whose URLs are
 * on the Blob host. Both are accepted; anything new and foreign still is not.
 * The lookups only run when an author actually sends an off-site URL.
 */
export async function docBodyProblemFor(
  body: Record<string, unknown>,
  opts: { authorRole: boolean; siteUrl: string; kind: "post" | "page"; id?: number }
): Promise<string | null> {
  const offSite = opts.authorRole
    ? URL_FIELDS.map((k) => body[k])
        .filter((v): v is string => typeof v === "string" && !sameSite(v, opts.siteUrl))
        .map((v) => v.trim())
    : [];
  if (offSite.length === 0) return docBodyProblem(body, opts);

  const { rawQuery } = await import("@/lib/db/raw");
  const allowed = new Set<string>();
  try {
    const media = await rawQuery<{ url: string }>("SELECT url FROM media WHERE url IN (?)", [offSite]);
    for (const m of media) allowed.add(m.url);
  } catch {
    /* no media table yet: nothing extra allowed */
  }
  if (opts.id !== undefined) {
    const table = opts.kind === "post" ? "posts" : "pages";
    try {
      const [row] = await rawQuery<Record<string, string | null>>(
        `SELECT canonical_url, og_image, twitter_image, featured_image FROM ${table} WHERE id = ?`,
        [opts.id]
      );
      for (const v of Object.values(row ?? {})) if (v) allowed.add(v.trim());
    } catch {
      /* fall through to the strict rule */
    }
  }
  return docBodyProblem(body, { ...opts, allowed });
}
