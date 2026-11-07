// Slugs that are always present and always free.
//
// `posts.slug` and `pages.slug` are both `NOT NULL UNIQUE`, and both were being
// filled with `body.slug || toSlug(body.title)` and handed straight to INSERT.
// Two failures fell out of that:
//
//   • A duplicate slug — two posts called "Hello World", or a second untitled
//     one — raised a unique violation, which the route's catch-all turned into
//     `500 Failed to create post`. The author saw a save that just did not
//     work, with nothing saying why.
//
//   • A title that slugifies to nothing — "", "   ", "!!!", or any string of
//     pure punctuation — produced the *empty* slug. That is a legal value for
//     the column and a nonsense URL, and this database already contains one.
//
// So: never empty, never taken, and deterministic about how it disambiguates —
// `hello-world`, then `hello-world-2`, the convention every CMS uses.

import { and, eq, like, ne, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, pages, posts } from "@/lib/db/schema";
import { getSiteSettings } from "@/lib/settings";
import { categoryBaseRemoved } from "@/lib/permalinks";
import { capSlug, toSlug } from "@/lib/utils";
import { LANGUAGES } from "@/lib/locale";

export type SlugKind = "post" | "page";

/**
 * Slugs a post or page may not have: the site's own routes, and every
 * language code (a language prefix wins over a page of the same name).
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin", "api", "search", "tag", "category", "author", "page", "uploads", "fonts",
  "preview", "site", "og", "plugins", "indexnow", "_next", "sitemap-part", "feed",
  ...LANGUAGES.map((l) => l.code.toLowerCase()),
]);

/** How many `-n` suffixes to try before giving up and going random. */
const MAX_ATTEMPTS = 200;

/**
 * A free slug for this record.
 *
 * `desired` is what the author typed (or the title it was derived from),
 * `excludeId` is the record being edited — without it, saving a post without
 * touching its slug would see its own row and bump it to `-2` every time — and
 * `language` is the namespace being checked, since slugs are unique within a
 * language rather than across the site.
 */
export async function uniqueSlug(
  kind: SlugKind,
  desired: string,
  excludeId?: number,
  language = "en"
): Promise<string> {
  // An author who typed nothing gets something typeable rather than "".
  const base = capSlug(toSlug(desired || "")) || "untitled";

  // Both tables, not only this document's own. With the default permalinks a
  // post and a page both live at `/<slug>`, so a post and a page could both
  // become `/about` and one of them was simply unreachable. One query each
  // for the whole family, rather than a round trip per candidate. Scoped to
  // the language, because uniqueness is — `/about` and `/fr/about` differ.
  const family = (table: typeof posts | typeof pages, self: boolean) =>
    db
      .select({ slug: table.slug })
      .from(table)
      .where(
        and(
          eq(table.language, language),
          or(eq(table.slug, base), like(table.slug, `${base}-%`)),
          self && excludeId ? ne(table.id, excludeId) : undefined
        )
      );
  // With "Remove category base" on, category archives also live at
  // `/<slug>`, so their slugs are taken too — a page "news" and a category
  // "news" otherwise fought over `/news` and one of them was unreachable.
  const baseRemoved = categoryBaseRemoved(await getSiteSettings());
  const [ownRows, otherRows, catRows] = await Promise.all([
    family(kind === "post" ? posts : pages, true),
    family(kind === "post" ? pages : posts, false),
    baseRemoved
      ? db
          .select({ slug: categories.slug })
          .from(categories)
          .where(and(eq(categories.language, language), or(eq(categories.slug, base), like(categories.slug, `${base}-%`))))
      : Promise.resolve([] as { slug: string }[]),
  ]);

  const used = new Set([...ownRows, ...otherRows, ...catRows].map((row) => row.slug));
  // Addresses the site itself owns count as taken: a page titled "Search" or
  // "fr" got a URL a built-in route answers first, and could not be reached.
  for (const r of RESERVED_SLUGS) used.add(r);
  if (!used.has(base)) return base;

  for (let n = 2; n < MAX_ATTEMPTS; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }

  // 200 collisions on one base is not a real editorial situation; it is a
  // script. Give it something unique rather than looping or throwing.
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Why a category may not take this slug, or null when it may.
 *
 * Only matters with "Remove category base" on, when an archive answers at
 * `/<slug>` exactly where a page (or a post, under the default structure)
 * does. The site's own routes are refused for the same reason.
 */
export async function categorySlugProblem(slug: string, language: string): Promise<string | null> {
  if (!categoryBaseRemoved(await getSiteSettings())) return null;
  if (RESERVED_SLUGS.has(slug)) return `"${slug}" is used by the site itself. Choose another slug.`;
  const [page] = await db.select({ id: pages.id }).from(pages).where(and(eq(pages.language, language), eq(pages.slug, slug))).limit(1);
  const [post] = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.language, language), eq(posts.slug, slug))).limit(1);
  if (page || post) {
    return `A ${page ? "page" : "post"} already uses "${slug}". With the category base removed they would share one address — choose another slug.`;
  }
  return null;
}
