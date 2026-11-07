import Link from "next/link";
import { archiveText } from "@/lib/archiveText";
import { isoDate } from "@/lib/locale";

/**
 * The title area of a single post: breadcrumb, categories, title, meta, excerpt.
 *
 * Every element is rendered unconditionally and tagged with `data-post-el`.
 * Order and visibility come from `singlePostCss`, the same way the search item
 * card works — which is what lets the Customizer reorder them live without the
 * page having to re-render.
 */
export default function PostTitleBlock({
  title,
  excerpt,
  publishedAt,
  category,
  authorName,
  as = "h1",
  categoryHref = null,
  kind = "post",
  readingTime,
  language,
  dateText,
  homeHref = "/",
}: {
  /**
   * Where the trail's first crumb goes: the document's *language* root —
   * `/fr` for a French post, `/` for the default language.
   *
   * It was a hard-coded `/`, while `postCrumbs()` wrote `rootPath(lang)` into
   * the BreadcrumbList. On any non-default-language document the structured
   * data then described a trail the visitor could not see — the one mismatch
   * `breadcrumbSchema.ts` exists to prevent. Same input, both places.
   */
  homeHref?: string;
  /** "4 min read" — already worded; absent when the setting is off. */
  readingTime?: string | null;
  title: string;
  excerpt?: string | null;
  publishedAt?: Date | string | null;
  category?: { name: string; slug: string } | null;
  authorName?: string | null;
  /** Above-content copies render an h1 too, but only one of them is displayed. */
  as?: "h1" | "h2" | "p";
  /**
   * The archive this post belongs under — `/blog`, or `/fr/blog`.
   *
   * Passed in rather than built here so this stays presentational: the prefix
   * is already decided by the post's language, and the category link hangs off
   * the same base.
   */
  /** The post's category archive URL; the crumb and the label link there. */
  categoryHref?: string | null;
  /**
   * Which kind of document this titles.
   *
   * A page's title area asks the same questions a post's does, so it is the
   * same component rather than a near-copy that drifts. The kind picks the data
   * attribute and class prefix, which keeps the two stylesheets independent —
   * `singlePageCss` cannot reach a post and `singlePostCss` cannot reach a page
   * — and it drops the two elements a page has no data for.
   *
   * Defaulted to `post` so every existing caller keeps its exact markup.
   */
  kind?: "post" | "page";
  /** The document's language, for the two fixed words in this block. */
  language?: string;
  /**
   * The published date, already formatted by the caller.
   *
   * It used to be formatted here with `formatDate`, which hard-codes `en-US`:
   * an Arabic post's date read "Sep 21, 2026" while the same post's card in the
   * listing read "٢١ سبتمبر ٢٠٢٦", because archives go through `formatSiteDate`
   * — the one that honours Settings → Date format and the site's time zone.
   * The caller has the settings; this component should not need them.
   */
  dateText?: string | null;
}) {
  const Heading = as;
  const t = archiveText(language || "en");
  const isPage = kind === "page";
  // Spread rather than a template literal in JSX, so the attribute name itself
  // is what changes and neither stylesheet has to know about the other.
  const el = (name: string) => (isPage ? { "data-page-el": name } : { "data-post-el": name });

  return (
    <div className={`${kind}-title-block gap-0`}>
      {/* A landmark, so assistive tech can jump to (or skip) the trail the
          way it does the primary navigation. */}
      <nav {...el("breadcrumb")} aria-label="Breadcrumb" className="flex items-center gap-2 text-sm opacity-50 mb-6">
        <Link href={homeHref} className="hover:opacity-100 transition-opacity">{t.home}</Link>
        {isPage ? (
          // A page sits outside the blog, so its trail is Home / this page —
          // routing it through /blog would claim a parent it does not have.
          <>
            <span>/</span>
            <span>{title}</span>
          </>
        ) : (
          // Home / Category / (this post) — the trail WordPress renders; a
          // site has no listing page to put between them unless one is chosen.
          category && categoryHref && (
            <>
              <span>/</span>
              <Link href={categoryHref} className="hover:opacity-100 transition-opacity">
                {category.name}
              </Link>
            </>
          )
        )}
      </nav>

      {!isPage && category && (
        <div {...el("categories")} className="text-xs font-semibold uppercase tracking-wide">
          {categoryHref ? (
            <Link href={categoryHref} style={{ color: "var(--color-primary)" }}>
              {category.name}
            </Link>
          ) : (
            <span style={{ color: "var(--color-primary)" }}>{category.name}</span>
          )}
        </div>
      )}

      <div {...el("title")}>
        <Heading className="content-title text-4xl font-bold mt-2 mb-4 leading-tight">{title}</Heading>
      </div>

      <div {...el("meta")} className="content-meta flex items-center gap-4 text-sm opacity-40 mb-8">
        {/* `dateTime` is the machine-readable half: the visible text follows
            the site's date format and language, which nothing can parse. */}
        {publishedAt && dateText && <time dateTime={isoDate(publishedAt)}>{dateText}</time>}
        {authorName && <span>{t.by} {authorName}</span>}
        {readingTime && <span className="content-reading-time">{readingTime}</span>}
      </div>

      {/* An element with no content still takes its margin, so the empty cases
          are dropped rather than hidden. */}
      {!isPage && excerpt && (
        <div {...el("excerpt")} className="text-base opacity-70 mb-8">
          {excerpt}
        </div>
      )}
    </div>
  );
}
