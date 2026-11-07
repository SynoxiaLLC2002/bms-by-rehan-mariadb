import Link from "next/link";
import { and, asc, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { posts, users } from "@/lib/db/schema";
import { tagsForPost } from "@/lib/postTags";
import { archiveText } from "@/lib/archiveText";
import { uiText } from "@/lib/uiText";
import ContentImage from "@/components/frontend/ContentImage";
import { contentColumn, resolveDocLayout, resolveDocSpacing, resolveDocStyle } from "@/lib/contentColumn";
import { authorPath, postPath, tagPath } from "@/lib/permalinks";
import { formatSiteDate, isoDate } from "@/lib/locale";
import { isLive } from "@/lib/publishState";

/** One settled result, or a fallback if that query failed. */
function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

/**
 * Author box, prev/next navigation and related posts.
 *
 * Each block is always rendered and hidden by `singlePostCss`, so toggling one
 * in the Customizer is a stylesheet change rather than a re-query. The queries
 * are cheap and only run for a published post, which is statically generated.
 */
export default async function PostAfterContent(props: {
  post: {
    id: number;
    slug: string;
    title: string;
    categoryId: number | null;
    authorId: string | null;
    publishedAt: Date | null;
    language: string;
  };
  settings: Record<string, string>;
}) {
  try {
    return await renderAfter(props);
  } catch (err) {
    console.error("[PostAfterContent]", err);
    return null;
  }
}

async function renderAfter({
  post,
  settings,
}: {
  post: {
    id: number;
    slug: string;
    title: string;
    categoryId: number | null;
    authorId: string | null;
    publishedAt: Date | null;
    /**
     * Related posts and prev/next never cross into another language.
     *
     * Content is partitioned: a French post has no relationship to an English
     * one, so surfacing them together sends the reader out of the language they
     * are reading in. Categories are shared across languages, which made this
     * worse rather than better -- "same category" alone matched every language.
     */
    language: string;
  };
  settings: Record<string, string>;
}) {
  const orderBy = settings.post_related_orderby || "random";
  const direction = settings.post_related_order === "asc" ? asc : desc;
  const count = Math.min(6, Math.max(1, parseInt(settings.post_related_count) || 3));

  const relatedOrder =
    orderBy === "title" ? direction(posts.title)
    : orderBy === "date" ? direction(posts.publishedAt)
    : sql`RAND()`;

  // What this site actually shows. Every one of these sections used to be
  // fetched on every post view and then hidden with `display:none` when its
  // setting was off — five queries, an author avatar and up to six related
  // thumbnails downloaded for markup nobody could see. The same reasoning the
  // sidebar already follows: resolve it on the server, do not paint it and
  // hide it. (The customizer previews through its own route, which renders
  // with the settings being edited, so nothing needs the hidden copy.)
  const showTags = settings.post_tags_show !== "false";
  const showAuthor = settings.post_author_box_show === "true";
  const showNav = settings.post_nav_show !== "false";
  const showRelated = settings.post_related_show !== "false";
  const t = archiveText(post.language);
  const u = uiText(post.language);
  // The related grid is `post_related_count` across inside the post column,
  // one across on a phone — the same shape the archive's cards use.
  const relatedCols = Math.min(6, Math.max(1, parseInt(settings.post_related_count) || 3));
  const postShell = contentColumn(resolveDocLayout("post", undefined, settings), {
    spacing: resolveDocSpacing("post", undefined, settings),
    style: resolveDocStyle("post", undefined, settings),
  });
  const relatedSizes = [
    `(max-width: 639px) ${postShell.gutter > 0 ? `calc(100vw - ${postShell.gutter}px)` : "100vw"}`,
    `(max-width: 1023px) calc((100vw - ${postShell.gutter + 24}px) / ${Math.min(2, relatedCols)})`,
    `${Math.max(1, Math.round((postShell.px - 24 * (relatedCols - 1)) / relatedCols))}px`,
  ].join(", ");

  const [authorR, relatedR, previousR, nextR, tagsR] = await Promise.allSettled([
    showAuthor && post.authorId
      ? db.query.users.findFirst({
          where: eq(users.id, post.authorId),
          // The five fields this box draws. Selecting the whole row pulled the
          // bcrypt hash, the TOTP secret, the e-mail address and the author
          // page's entire `content` JSON into the render of a public page —
          // none of which anything here reads, and the first two of which have
          // no business being in a page render at all.
          columns: { name: true, image: true, slug: true, publicProfile: true, bio: true },
        })
      : Promise.resolve(undefined),
    !showRelated ? Promise.resolve([]) : db.query.posts.findMany({
      where: and(
        isLive(posts),
        eq(posts.language, post.language),
        ne(posts.id, post.id),
        // Same category when the post has one; otherwise just the newest posts.
        post.categoryId ? eq(posts.categoryId, post.categoryId) : undefined
      ),
      orderBy: [relatedOrder],
      limit: count,
      columns: { id: true, slug: true, title: true, excerpt: true, featuredImage: true, publishedAt: true, createdAt: true, language: true },
    }),
    // Previous / next, as two bounded lookups rather than the whole archive.
    // This used to fetch every published post and scan the array in JS, so a
    // site with a thousand posts pulled a thousand rows to render two links.
    !showNav ? Promise.resolve(undefined) : db.query.posts.findFirst({
      where: and(
        isLive(posts),
        eq(posts.language, post.language),
        ne(posts.id, post.id),
        lt(posts.publishedAt, post.publishedAt ?? new Date())
      ),
      orderBy: [desc(posts.publishedAt), desc(posts.id)],
      columns: { id: true, slug: true, title: true, publishedAt: true, createdAt: true, language: true },
    }),
    !showNav ? Promise.resolve(undefined) : db.query.posts.findFirst({
      where: and(
        isLive(posts),
        eq(posts.language, post.language),
        ne(posts.id, post.id),
        gt(posts.publishedAt, post.publishedAt ?? new Date())
      ),
      orderBy: [asc(posts.publishedAt)],
      columns: { id: true, slug: true, title: true, publishedAt: true, createdAt: true, language: true },
    }),
    showTags ? tagsForPost(post.id) : Promise.resolve([]),
  ]);

  // Settled rather than all, and it matters which.
  //
  // These five queries decorate an article that has already been fetched and
  // rendered. Under `Promise.all` a single rejection threw out of the component
  // and took the whole post page to the error boundary — the reader lost the
  // article because the related-posts query failed, which is the wrong trade in
  // every case. Each section now falls back to empty and simply does not render.
  const author = settled(authorR, undefined);
  const related = settled(relatedR, []);
  const previous = settled(previousR, undefined);
  const next = settled(nextR, undefined);
  const tagList = settled(tagsR, []);

  return (
    <>
      {showTags && tagList.length > 0 && (
      <div className="post-tags mt-10 flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-50">{t.tagged}</span>
        {tagList.map((t) => (
          <Link
            key={t.id}
            href={tagPath(t.slug, post.language, settings)}
            className="rounded-full border border-black/10 px-2.5 py-1 text-xs opacity-80 transition-opacity hover:opacity-100"
          >
            {t.name}
          </Link>
        ))}
      </div>
      )}

      {showAuthor && (
      <div className="post-author-box mt-14 items-center gap-4 rounded-xl border border-black/10 p-5">
        {author?.image && (
          // Through the optimiser like every other picture on the site: this
          // was the raw upload, so a 56px avatar downloaded whatever the
          // author happened to upload.
          <ContentImage
            src={author.image}
            alt={author.name ?? ""}
            width={112}
            height={112}
            sizes="56px"
            className="h-14 w-14 shrink-0 rounded-full object-cover"
          />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {/* Links to the author's page when they have one. */}
            {author?.slug && author.publicProfile ? (
              <Link href={authorPath(author.slug, post.language, settings)} className="hover:underline">
                {author.name ?? "Author"}
              </Link>
            ) : (
              author?.name ?? "Author"
            )}
          </p>
          {/* The biography, not the email address.
              This previously fell back to `author.email` when an account had no
              name — publishing a staff email on every post that author wrote,
              to anyone who read it. An account without a name simply has no
              second line now. */}
          {author?.bio ? (
            <p className="text-sm opacity-60">{author.bio}</p>
          ) : author?.name ? (
            <p className="text-sm opacity-60">{u.postsBy(author.name)}</p>
          ) : (
            <p className="text-sm opacity-60">{u.siteTeam}</p>
          )}
        </div>
      </div>
      )}

      {showNav && (previous || next) && (
      <nav className="post-nav mt-12 grid-cols-1 gap-4 border-t border-black/10 pt-8 sm:grid-cols-2">
        <div>
          {previous && (
            <Link href={postPath(previous, settings)} className="group block">
              <span className="text-xs uppercase tracking-wide opacity-50">{t.previous}</span>
              <span className="mt-1 block font-semibold group-hover:underline">{previous.title}</span>
            </Link>
          )}
        </div>
        <div className="sm:text-right">
          {next && (
            <Link href={postPath(next, settings)} className="group block">
              <span className="text-xs uppercase tracking-wide opacity-50">{t.nextPost}</span>
              <span className="mt-1 block font-semibold group-hover:underline">{next.title}</span>
            </Link>
          )}
        </div>
      </nav>
      )}

      {showRelated && related.length > 0 && (
      <section className="post-related mt-14">
        {related.length > 0 && (
          <>
            <h2 className="mb-6 text-xl font-bold">{t.relatedPosts}</h2>
            <div className="post-related-items">
              {related.map((r) => (
                <Link key={r.id} href={postPath(r, settings)} className="group block">
                  {r.featuredImage && (
                    // Through the optimiser, with the width these cards really
                    // are. Written as a plain <img> it fetched the full upload
                    // — three of them, under the article, for thumbnails about
                    // 220px wide.
                    <ContentImage
                      src={r.featuredImage}
                      alt={r.title}
                      width={640}
                      height={360}
                      sizes={relatedSizes}
                      className="mb-3 aspect-video w-full rounded-lg object-cover"
                    />
                  )}
                  <h3 className="font-semibold leading-snug group-hover:underline">{r.title}</h3>
                  {r.publishedAt && (
                    <time dateTime={isoDate(r.publishedAt)} className="mt-1 block text-xs opacity-50">{formatSiteDate(r.publishedAt, settings, post.language)}</time>
                  )}
                </Link>
              ))}
            </div>
          </>
        )}
      </section>
      )}
    </>
  );
}
