import Link from "next/link";
import { uiText } from "@/lib/uiText";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { posts, tags, postTags, categories } from "@/lib/db/schema";
import { parseSidebarWidgets, SIDEBAR_WIDGET_IDS, type SidebarWidget } from "@/lib/appearanceSettings";
import { categoryPath, postPath, searchPath, tagPath } from "@/lib/permalinks";
import { isLive } from "@/lib/publishState";

/**
 * The real sidebar, replacing the placeholder box.
 *
 * Widgets are configured site-wide as one JSON setting, the way footer columns
 * already are. The dynamic types query on render; a site with none of them
 * configured costs no queries at all, which is why the lookups are gated on
 * what is actually in use rather than fetched up front.
 */
export default async function Sidebar(props: {
  settings: Record<string, string>;
  /** Recent posts are this language's; content is not shared across languages. */
  language: string;
}) {
  try {
    return await renderSidebar(props);
  } catch (err) {
    console.error("[Sidebar]", err);
    return null;
  }
}

async function renderSidebar({
  settings,
  language,
}: {
  settings: Record<string, string>;
  language: string;
}) {
  const configured = parseSidebarWidgets(settings.sidebar_widgets);
  const widgets = SIDEBAR_WIDGET_IDS
    .map((id) => ({ id: id as string, widget: configured[id] as SidebarWidget | undefined }))
    .filter((w): w is { id: string; widget: SidebarWidget } => !!w.widget);

  if (widgets.length === 0) return null;

  const needs = (type: SidebarWidget["type"]) => widgets.some((w) => w.widget.type === type);

  const [recent, cats, tagList] = await Promise.all([
    needs("recent")
      ? db.query.posts.findMany({
          where: and(isLive(posts), eq(posts.language, language)),
          orderBy: [desc(posts.publishedAt), desc(posts.id)],
          limit: 10,
          // The date columns are what a dated permalink is built from.
          columns: { id: true, title: true, slug: true, publishedAt: true, createdAt: true, language: true },
        }).catch(() => [])
      : Promise.resolve([]),
    needs("categories")
      ? db.query.categories
          .findMany({
            where: eq(categories.language, language),
            columns: { id: true, name: true, slug: true },
          })
          .catch(() => [])
      : Promise.resolve([]),
    needs("tags")
      ? db
          .select({ id: tags.id, name: tags.name, slug: tags.slug, uses: sql<number>`count(${postTags.postId})` })
          .from(tags)
          .leftJoin(postTags, eq(postTags.tagId, tags.id))
          // This language's tags only, for the same reason as categories.
          .where(eq(tags.language, language))
          .groupBy(tags.id)
          .orderBy(desc(sql`count(${postTags.postId})`))
          .limit(20)
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      {widgets.map(({ id, widget }) => (
        <section key={id} className="sidebar-widget" data-widget={widget.type}>
          {/* h2, not h3: a widget title is a section heading of the page, the
              same rank as a footer widget's. At h3 it jumped a level from the
              document's `<h1>` whenever the content itself had no headings —
              which is most short posts. */}
          {widget.title && <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">{widget.title}</h2>}

          {widget.type === "search" && (
            <form action={searchPath(language, settings)} className="flex">
              <input
                name="q"
                type="search"
                placeholder={uiText(language).searchPlaceholder}
                aria-label={uiText(language).searchPlaceholder}
                className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              />
              <button type="submit" className="sr-only">{uiText(language).search}</button>
            </form>
          )}

          {widget.type === "recent" && (
            <ul className="space-y-2 text-sm">
              {recent.slice(0, widget.count ?? 5).map((p) => (
                <li key={p.id}>
                  <Link href={postPath(p, settings)} className="opacity-80 hover:opacity-100 hover:underline">
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {widget.type === "categories" && (
            <ul className="space-y-2 text-sm">
              {cats.slice(0, widget.count ?? 10).map((c) => (
                <li key={c.id}>
                  <Link href={categoryPath(c.slug, language, settings)} className="opacity-80 hover:opacity-100 hover:underline">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {widget.type === "tags" && (
            <div className="flex flex-wrap gap-1.5">
              {tagList.slice(0, widget.count ?? 20).map((t) => (
                <Link
                  key={t.id}
                  href={tagPath(t.slug, language, settings)}
                  className="rounded-full border border-black/10 px-2.5 py-1 text-xs opacity-80 transition-opacity hover:opacity-100"
                >
                  {t.name}
                </Link>
              ))}
            </div>
          )}

          {widget.type === "links" && (
            <ul className="space-y-2 text-sm">
              {(widget.links ?? []).filter((l) => l.label).map((l, i) => (
                <li key={i}>
                  <Link href={l.url || "#"} className="opacity-80 hover:opacity-100 hover:underline">{l.label}</Link>
                </li>
              ))}
            </ul>
          )}

          {widget.type === "text" && widget.text && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed opacity-80">{widget.text}</p>
          )}
        </section>
      ))}
    </div>
  );
}
