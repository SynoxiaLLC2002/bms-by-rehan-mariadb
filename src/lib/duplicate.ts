// Duplicating a post or a page.
//
// A copy is a new draft with the same content, the same SEO fields, the same
// layout settings and (for posts) the same tags, ready to be edited into
// something else. It is *not* a translation and not a revision: it gets its
// own slug, a fresh timestamp, the current user as author, and no
// translation-group membership. The word "Copy of" in the title is what stops
// two identical titles sitting next to each other in a listing.

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { insertReturning } from "@/lib/db/write";
import { pages, posts } from "@/lib/db/schema";
import { uniqueSlug } from "@/lib/uniqueSlug";
import { syncPostTags, tagsForPost } from "@/lib/postTags";

type Kind = "post" | "page";

/** Columns that must never travel with a copy. Everything else does. */
const NEVER_COPIED = new Set([
  "id",
  "slug",
  "status",
  "publishedAt",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "translationGroup",
  "authorId",
]);

/**
 * The content with every contact form given a new block id.
 *
 * The submit endpoint finds a form's definition by its block id
 * (lib/formLookup). A verbatim copy kept the original's ids, so two pages
 * held "the same" form and editing either one made the other validate
 * against the wrong field list. Only forms are renumbered: other block ids
 * can be the target of in-page anchor links, and nothing looks them up.
 * Walks JSON-string props too (Row Layout `cols`, tabs, accordions).
 */
function withFreshFormIds(value: unknown, depth = 0): unknown {
  if (depth > 32 || value == null) return value;
  if (typeof value === "string") {
    const t = value.trimStart();
    if (!(t.startsWith("[") || t.startsWith("{")) || !value.includes("contactForm")) return value;
    try {
      return JSON.stringify(withFreshFormIds(JSON.parse(t), depth + 1));
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map((v) => withFreshFormIds(v, depth + 1));
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = withFreshFormIds(v, depth + 1);
    if (o.type === "contactForm" && typeof o.id === "string") out.id = crypto.randomUUID();
    return out;
  }
  return value;
}

function copyTitle(title: string | null): string {
  const t = (title ?? "").trim() || "Untitled";
  // "Copy of Copy of X" is nobody's intention.
  return t.startsWith("Copy of ") ? t : `Copy of ${t}`;
}

/**
 * Creates the copy and returns its id. Throws if the source does not exist,
 * so the route can answer 404 rather than inventing an empty document.
 */
export async function duplicateDocument(kind: Kind, id: number, authorId: string): Promise<number> {
  const table = kind === "post" ? posts : pages;

  const source =
    kind === "post"
      ? await db.query.posts.findFirst({ where: eq(posts.id, id) })
      : await db.query.pages.findFirst({ where: eq(pages.id, id) });
  if (!source) throw new Error("not found");

  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!NEVER_COPIED.has(key)) values[key] = value;
  }

  const title = copyTitle(source.title);
  values.title = title;
  values.slug = await uniqueSlug(kind, title, undefined, source.language);
  values.status = "draft";
  values.publishedAt = null;
  values.authorId = authorId;
  values.content = withFreshFormIds(source.content);

  const [created] = await insertReturning(table, values as never)
    ;

  if (kind === "post") {
    const tags = await tagsForPost(id);
    if (tags.length) await syncPostTags(created.id, tags.map((t) => t.name), source.language);
  }

  return created.id;
}
