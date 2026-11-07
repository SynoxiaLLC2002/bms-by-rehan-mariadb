import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { posts } from "@/lib/db/schema";
import { getSiteSettings } from "@/lib/settings";
import { postPath } from "@/lib/permalinks";
import { isLive } from "@/lib/publishState";
import { formatSiteDate } from "@/lib/locale";
import ContentImage from "@/components/frontend/ContentImage";
import { intIn, speedSettings } from "@/lib/speed";

/**
 * A grid of published posts, chosen at render time.
 *
 * An async Server Component, so the query runs during static generation and
 * the visitor gets plain HTML — the same deal as the rest of the site. Pages
 * holding one still prerender; they just pick up new posts on revalidate.
 */
export default async function PostGridFE({
  heading,
  count,
  columns,
  categoryId,
  orderBy,
  showImage,
  showDate,
  showExcerpt,
  language,
}: {
  heading: string;
  count: number;
  columns: number;
  categoryId: number | null;
  orderBy: string;
  showImage: boolean;
  showDate: boolean;
  showExcerpt: boolean;
  /**
   * The page's language. Every other listing is scoped to one; this grid
   * was not, so a French page's grid mixed in every language's posts.
   */
  language: string;
}) {
  const where = and(
    isLive(posts),
    eq(posts.language, language),
    categoryId ? eq(posts.categoryId, categoryId) : undefined
  );

  // `id` breaks the tie. Without it two posts sharing a timestamp — which is
  // normal after a bulk import or two quick publishes — can swap places
  // between one query and the next, so a paginated listing shows one of them
  // twice and skips the other. Postgres gives no stable order for equal keys.
  const order =
    orderBy === "oldest" ? [asc(posts.publishedAt), asc(posts.id)]
    : orderBy === "title" ? [asc(posts.title), asc(posts.id)]
    : [desc(posts.publishedAt), desc(posts.id)];

  type Card = Pick<typeof posts.$inferSelect, "id" | "title" | "slug" | "excerpt" | "featuredImage" | "publishedAt" | "createdAt" | "language">;
  let rows: Card[] = [];
  const settings = await getSiteSettings();
  try {
    rows = await db.query.posts.findMany({
      where,
      orderBy: order,
      limit: Math.min(count, 24),
      // The grid renders cards; pulling every post's `content` JSON to do it
      // was the single heaviest query a page could run. The two dates are the
      // exception: a dated permalink is built from them.
      columns: {
        id: true, title: true, slug: true, excerpt: true,
        featuredImage: true, publishedAt: true, createdAt: true, language: true,
      },
    });
  } catch {
    return null;
  }
  if (rows.length === 0) return null;

  // Through the optimiser, like the archive cards. A plain <img> of the
  // original meant a six-post grid on a phone downloaded six full uploads,
  // up to 2000px wide each, where six ~400px WebPs would do. The widths
  // follow the grid in blockCss: one column to 600px, two to 900px, then
  // `columns` across a content column of about 800px.
  const cols = Math.min(Math.max(columns, 1), 4);
  const gridSizes = `(max-width: 600px) calc(100vw - 32px), (max-width: 900px) 50vw, ${Math.ceil(800 / cols)}px`;
  const gridQuality = intIn(speedSettings(settings).image_quality, 50, 90, 75);

  return (
    <section className="postgrid my-8">
      {heading && <h2 className="postgrid-heading text-2xl font-bold mb-5">{heading}</h2>}
      <div
        className="postgrid-items grid gap-6"
        style={{ ["--pg-cols" as string]: String(Math.min(Math.max(columns, 1), 4)) }}
      >
        {rows.map((post) => (
          <article key={post.id} className="postgrid-card">
            <Link href={postPath(post, settings)} className="block group">
              {showImage && post.featuredImage && (
                <ContentImage
                  src={post.featuredImage}
                  alt=""
                  width={640}
                  height={360}
                  sizes={gridSizes}
                  quality={gridQuality}
                  className="postgrid-img w-full aspect-video object-cover rounded-xl mb-3"
                />
              )}
              <h3 className="postgrid-title font-semibold leading-snug group-hover:opacity-70 transition-opacity">
                {post.title}
              </h3>
            </Link>
            {showDate && post.publishedAt && (
              <time className="postgrid-date block text-xs opacity-50 mt-1" dateTime={post.publishedAt.toISOString()}>
                {/* The site's date format and time zone, like every other date on it. */}
                {formatSiteDate(post.publishedAt, settings, language)}
              </time>
            )}
            {showExcerpt && post.excerpt && (
              <p className="postgrid-excerpt text-sm opacity-70 mt-2 leading-relaxed">{post.excerpt}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
