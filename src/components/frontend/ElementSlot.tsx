import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import BlockRenderer from "@/components/frontend/BlockRenderer";
import { db } from "@/lib/db";
import { elements } from "@/lib/db/schema";
import { matchesPage, parseConditions, type ElementHook, type SiteElement } from "@/lib/elements";
import type { PageType } from "@/lib/headerConditions";

/**
 * All published elements, once per request.
 *
 * `cache` dedupes across the component tree, so the six slots a page renders
 * cost a single query between them.
 */
export const getElements = cache(async (): Promise<SiteElement[]> => {
  try {
    const rows = await db.query.elements.findMany({
      // Filtered in the database, not afterwards: this ran on every page of
      // every request and fetched every draft element — `content` and all —
      // only to drop them here. Drafts are the elements most likely to be
      // half-finished and large.
      where: eq(elements.status, "published"),
      columns: { id: true, name: true, content: true, hook: true, status: true, priority: true, conditions: true },
      orderBy: [asc(elements.priority), asc(elements.id)],
    });
    return rows
      .map((r) => ({
        id: r.id,
        name: r.name,
        content: r.content,
        hook: r.hook,
        status: r.status,
        priority: r.priority,
        conditions: parseConditions(r.conditions),
      }));
  } catch {
    // A missing table shouldn't take the whole site down before the migration
    // has been applied.
    return [];
  }
});

/** Hooks that render before the article — an image there may be the page's LCP. */
const ABOVE_FOLD_HOOKS = new Set<ElementHook>(["before_header", "after_header", "before_content"]);

/**
 * Renders whatever Elements are assigned to one hook on this kind of page.
 *
 * A server component, so a page with elements stays as static as one without.
 * Renders nothing at all when the hook is empty, which is the common case.
 */
export default async function ElementSlot({
  hook,
  pageType,
  language,
  contentLanguage,
  direction,
}: {
  hook: ElementHook;
  pageType: PageType;
  /**
   * The page's language, so an Element renders in it.
   *
   * Nothing passed one, so `BlockRenderer` fell through to its default and
   * every Element used English theme text and default-language Post Grids —
   * on a French page, inside a French layout. The Element's own content is
   * whatever the author wrote; this is about the strings the blocks supply
   * themselves ("Show more", day names, "posts by") and about which
   * language a Post Grid lists.
   */
  language?: string;
  /**
   * The language the document's content belongs to, which is what an
   * Element's language targeting is matched against. Differs from `language`
   * only when a document overrides its `<html lang>`.
   */
  contentLanguage?: string;
  direction?: string | null;
}) {
  const all = await getElements();
  const matching = all.filter((el) => el.hook === hook && matchesPage(el, pageType, contentLanguage ?? language));
  if (matching.length === 0) return null;

  return (
    <>
      {matching.map((el) => (
        <div key={el.id} className={`bms-element bms-element-${hook}`} data-element={el.id}>
          <BlockRenderer
            blocks={(el.content as never) ?? []}
            aboveFold={ABOVE_FOLD_HOOKS.has(hook)}
            language={language}
            direction={direction}
          />
        </div>
      ))}
    </>
  );
}
