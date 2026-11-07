import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { insertReturning } from "@/lib/db/write";
import { categories } from "@/lib/db/schema";

/**
 * The category a post gets when none is chosen — "Uncategorized", the way
 * WordPress does it. Every post belongs to a category, so every post has a
 * category archive and a full breadcrumb trail; a post with no category was
 * the only kind that rendered a shorter trail than the rest of the site.
 *
 * Per language, because terms are partitioned by language. Created on first
 * use rather than at setup, so a language added later gets one too.
 */
export async function defaultCategoryId(language: string): Promise<number> {
  const existing = await db.query.categories.findFirst({
    where: and(eq(categories.slug, "uncategorized"), eq(categories.language, language)),
    columns: { id: true },
  });
  if (existing) return existing.id;
  const [row] = await insertReturning(categories, { name: "Uncategorized", slug: "uncategorized", language })
    ;
  return row.id;
}
