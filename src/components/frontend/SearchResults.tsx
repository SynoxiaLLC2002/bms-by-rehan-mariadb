import Link from "next/link";
import { uiText } from "@/lib/uiText";
import { categoryPath, postPath, searchPath } from "@/lib/permalinks";
import { documentDir, formatSiteDate } from "@/lib/locale";
import { archiveText } from "@/lib/archiveText";
import Pagination from "./Pagination";
import ContentImage from "./ContentImage";
import { intIn, speedSettings } from "@/lib/speed";

export interface SearchPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  featuredImage: string | null;
  publishedAt: Date | null;
  createdAt: Date | null;
  /** Decides the URL prefix; without it a French result linked into `/`. */
  language: string;
  category?: { name: string; slug: string } | null;
}

/**
 * The search archive. Every element is always rendered and tagged with
 * `data-search-el`; visibility, order, columns and layout come entirely from
 * CSS (see `searchCss`), which is what lets the Customizer preview it live.
 */
export default function SearchResults({
  query, posts, total = posts.length, capped = false, page = 1, totalPages = 1, settings, language,
}: {
  query: string;
  posts: SearchPost[];
  /** All matches across every page — the count the heading reports. */
  total?: number;
  /** More matched than were counted; the count reads "240+". */
  capped?: boolean;
  page?: number;
  totalPages?: number;
  /** Site settings, for the permalink structure. */
  settings: Record<string, string>;
  /** Which language is being searched; category links and the search form
   *  stay inside it rather than dropping the reader into the default. */
  language: string;
}) {
  const t = uiText(language);
  const a = archiveText(language);
  const rtl = documentDir(language, settings) === "rtl";
  const base = searchPath(language, settings);
  const pageHref = (n: number) =>
    `${base}?q=${encodeURIComponent(query)}${n > 1 ? `&page=${n}` : ""}`;
  const heading = query ? t.searchResultsFor(query) : t.search;
  const href = (p: SearchPost) => postPath(p, settings);

  /**
   * One copy of the title, not two.
   *
   * Both placements were rendered and one hidden with CSS, which put two
   * `<h1>`s carrying identical text into the document — a screen reader
   * announces the page heading twice, and a crawler sees a page that cannot
   * decide what it is called. The single-post title block had exactly this bug
   * and was fixed the same way; search was the sibling that got missed.
   *
   * The cost is that switching this setting in the Customizer needs a re-render
   * rather than a CSS toggle. That was the accepted trade for posts and it is
   * the right one here too: correct markup for every visitor beats a smoother
   * preview for one administrator.
   */
  const titleAbove = settings.search_title_layout === "above-content";

  const titleBlock = (
    <>
      <h1 className="text-3xl font-bold">{heading}</h1>
      <p className="opacity-60 text-sm mt-1">
        {/* Search only finds posts, so the archive's own "N posts" is the
            right phrase — and it is already in the site's language. */}
        {capped ? a.posts(total).replace(/^(\d+)/, "$1+") : a.posts(total)}
        {totalPages > 1 ? a.pageOf(page, totalPages) : ""}
      </p>
    </>
  );

  return (
    <div className="search-shell-outer">
      <div className="search-shell mx-auto px-4 py-12">
        {titleAbove && (
          <div className="search-title-block search-title-above mb-8">{titleBlock}</div>
        )}

        <div className="search-grid">
          <aside className="search-sidebar">
            <form action={base} className="mb-6">
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder={t.searchPlaceholder}
                className="w-full text-sm border border-black/10 rounded-lg px-3 py-2 bg-black/5 focus:outline-none focus:border-black/20"
              />
            </form>
          </aside>

          <div className="search-main">
            {!titleAbove && (
              <div className="search-title-block search-title-in mb-8">{titleBlock}</div>
            )}

            {posts.length === 0 ? (
              <p className="opacity-60">{t.noResults}</p>
            ) : (
              <div className="search-items">
                {posts.map((p) => (
                  <article key={p.id} className="search-item flex flex-col gap-2">
                    <Link href={href(p)} data-search-el="feature" className="block overflow-hidden rounded-lg bg-black/5 aspect-[16/9]">
                      {p.featuredImage && (
                        // Optimised and sized to the result card (one column
                        // on phones, two on tablets, up to three wide), not
                        // the original upload.
                        <ContentImage
                          src={p.featuredImage}
                          alt={p.title}
                          width={640}
                          height={360}
                          sizes="(max-width: 639px) calc(100vw - 32px), (max-width: 1023px) 50vw, 400px"
                          quality={intIn(speedSettings(settings).image_quality, 50, 90, 75)}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </Link>

                    <div data-search-el="categories" className="text-xs uppercase tracking-wide">
                      {p.category ? (
                        <Link href={categoryPath(p.category.slug, language, settings)} className="hover:opacity-70 transition-opacity" style={{ color: "var(--color-primary,#0ea5e9)" }}>
                          {p.category.name}
                        </Link>
                      ) : null}
                    </div>

                    <h2 data-search-el="title" className="text-lg font-semibold leading-snug">
                      <Link href={href(p)} className="hover:opacity-70 transition-opacity">{p.title}</Link>
                    </h2>

                    <div data-search-el="meta" className="text-xs opacity-60">
                      {p.publishedAt ? formatSiteDate(p.publishedAt, settings, language) : null}
                    </div>

                    <p data-search-el="excerpt" className="text-sm opacity-80 leading-relaxed">
                      {p.excerpt}
                    </p>

                    <div data-search-el="readmore">
                      <Link href={href(p)} className="text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: "var(--color-primary,#0ea5e9)" }}>
                        {a.readMore} {rtl ? "←" : "→"}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <Pagination
              base={base}
              page={page}
              totalPages={totalPages}
              language={language}
              rtl={rtl}
              hrefFor={pageHref}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
