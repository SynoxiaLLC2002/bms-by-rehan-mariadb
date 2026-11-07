import Link from "next/link";
import { cache } from "react";
import { db } from "@/lib/db";
import { lookupImageSizes, schemaId, schemaUrl } from "@/lib/seoMeta";
import { posts, postTags, categories as categoriesTable } from "@/lib/db/schema";
import { and, count, desc, eq, exists, inArray, sql } from "drizzle-orm";
import { loadMoreLabel, paginationStyle, readingTimeFromWords } from "@/lib/siteExtras";
import { LoadMore } from "@/components/frontend/SiteExtras";
import ContentShell from "@/components/frontend/ContentShell";
import { siteUrl } from "@/lib/siteUrl";
import { jsonLd } from "@/lib/seo";
import ContentImage from "@/components/frontend/ContentImage";
import BlockStyle from "@/components/shared/BlockStyle";
import Pagination from "@/components/frontend/Pagination";
import { getSiteSettings } from "@/lib/settings";
import { absoluteUrlFor, authorPath, categoryPath, postPath, postUrl } from "@/lib/permalinks";
import { postsPagePath } from "@/lib/postsPage";
import type { PageType } from "@/lib/headerConditions";
import { documentDir, formatSiteDate, isoDate } from "@/lib/locale";
import { archiveText } from "@/lib/archiveText";
import { intIn, speedSettings } from "@/lib/speed";
import { columnSizes, contentColumn, resolveDocLayout, resolveDocSpacing, resolveDocStyle } from "@/lib/contentColumn";
import { archiveCardOverrideCss, archiveCardStyleCss, archiveColour, archiveColourCss, archiveGridGap } from "@/lib/siteCss";
import { isLive } from "@/lib/publishState";
import { rollUpCategoryStats } from "@/lib/categoryRollup";

/** Posts per page comes from the Customizer; 10 if unset. */
export async function postsPerPage(): Promise<number> {
  const settings = await getSiteSettings();
  return Math.max(1, parseInt(settings.posts_per_page ?? "") || 10);
}

/**
 * Page counts for every category at once.
 *
 * `generateStaticParams` used to call `archivePageCount` in a loop, one COUNT
 * per category and each awaited before the next started — N sequential round
 * trips to build a list of page numbers. One GROUP BY answers the whole thing.
 */
export async function archivePageCounts(language: string): Promise<Map<number, number>> {
  const perPage = await postsPerPage();
  const rows = await db
    .select({ categoryId: posts.categoryId, n: count() })
    .from(posts)
    .where(and(isLive(posts), eq(posts.language, language)))
    .groupBy(posts.categoryId);

  const own = new Map<number, { n: number; newest: Date | null }>();
  for (const row of rows) {
    if (row.categoryId === null) continue;
    own.set(row.categoryId, { n: Number(row.n), newest: null });
  }
  // Descendants count toward a parent, the way its archive lists them —
  // otherwise a parent whose posts all live in child categories had one page
  // prerendered and every later page rendered on first visit.
  const parents = new Map<number, number | null>();
  try {
    for (const c of await db
      .select({ id: categoriesTable.id, parentId: categoriesTable.parentId })
      .from(categoriesTable)
      .where(eq(categoriesTable.language, language))) {
      parents.set(c.id, c.parentId);
    }
  } catch {
    // No tree to walk — direct counts only.
  }
  const out = new Map<number, number>();
  for (const [id, s] of rollUpCategoryStats(own, parents)) out.set(id, Math.max(1, Math.ceil(s.n / perPage)));
  return out;
}

/**
 * A category and every category beneath it.
 *
 * A category archive matched `posts.categoryId` exactly, so a parent listed
 * nothing that had been filed under one of its children — "Guides" was empty
 * while "Guides / Android" held ten posts. Readers and crawlers both see that
 * as an empty section. WordPress has included descendants since forever and
 * this matches it.
 *
 * The table is small (one row per category per language) so it is cheaper to
 * read it once and walk it here than to run a recursive query. `seen` guards
 * against a parent chain that loops back on itself, which the schema permits:
 * without it a bad row would hang the request.
 */
const categoryTree = cache(async function categoryTree(categoryId: number, language: string): Promise<number[]> {
  let rows: { id: number; parentId: number | null }[] = [];
  try {
    rows = await db
      .select({ id: categoriesTable.id, parentId: categoriesTable.parentId })
      .from(categoriesTable)
      .where(eq(categoriesTable.language, language));
  } catch {
    return [categoryId];
  }
  const children = new Map<number, number[]>();
  for (const r of rows) {
    if (r.parentId == null) continue;
    const list = children.get(r.parentId) ?? [];
    list.push(r.id);
    children.set(r.parentId, list);
  }
  const out: number[] = [];
  const seen = new Set<number>();
  const walk = (id: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
    for (const child of children.get(id) ?? []) walk(child);
  };
  walk(categoryId);
  return out;
});

/** Total pages for an archive, so a route can validate a page number. */
export async function archivePageCount(language: string, categoryId?: number): Promise<number> {
  const perPage = await postsPerPage();
  const where = and(
    isLive(posts),
    eq(posts.language, language),
    // Descendants too, or the page count disagrees with the listing and the
    // last page 404s.
    categoryId ? inArray(posts.categoryId, await categoryTree(categoryId, language)) : undefined
  );
  const [row] = await db.select({ n: count() }).from(posts).where(where);
  return Math.max(1, Math.ceil((row?.n ?? 0) / perPage));
}

/**
 * The blog / category archive.
 *
 * One component behind every archive route so `/blog`, `/blog/page/2` and the
 * category equivalents cannot drift apart.
 */
/**
 * A term's stored archive colours, or null.
 *
 * Written by the category screen and already checked key by key when it was
 * saved (categoryFields `archiveDesign`); parsed defensively here anyway,
 * because a stylesheet is the last place to trust a string from a database.
 */
function termDesign(raw: string | null | undefined): Record<string, string> | null {
  if (!raw || !raw.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^archive_[a-z_]+$/.test(k)) continue;
      const value = k.endsWith("_radius") ? String(v ?? "").replace(/[^\d]/g, "") : archiveColour(String(v ?? ""));
      if (value) out[k] = value;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/**
 * The term's appearance overrides as a scoped stylesheet, or "" for none.
 *
 * `siteStyle` is the site-wide card design and `style` the one this archive
 * actually renders. When they differ the term has chosen its own, and the
 * site stylesheet carries no rules for it — so they come with the term, and
 * no other site pays for a design it never picked.
 */
function termOverrideCss(
  term: {
    archiveColor?: string | null;
    archiveHoverColor?: string | null;
    archiveColumns?: string | null;
    archiveDesign?: string | null;
  } | null | undefined,
  style: string,
  siteStyle: string,
  settings: Record<string, string>
): string {
  const out: string[] = [];
  if (style !== siteStyle) {
    out.push(archiveCardStyleCss(style));
    // The owner's card colours live in the site stylesheet, which this block
    // follows — so they are repeated here, after the design, exactly as
    // contentCss orders them. Otherwise a category with its own design lost
    // the site's card background and radius to that design's defaults.
    out.push(archiveCardOverrideCss(settings));
  }
  if (!term) return out.join("");

  // This category's own colours, last, so they beat both the site's and the
  // design's. Only the keys it actually set are in the JSON, so everything
  // else still follows Appearance → Archive.
  const own = termDesign(term.archiveDesign);
  if (own) out.push(archiveColourCss(own));

  const color = archiveColour(term.archiveColor ?? undefined);
  const hover = archiveColour(term.archiveHoverColor ?? undefined);
  if (color) out.push(`.archive-card-term{color:${color}}`);
  if (hover) out.push(`.archive-card-term:hover{color:${hover}}`);

  // `default` means "follow the site-wide setting", which has already emitted
  // its own rules — so this only speaks when the term overrides it. The List
  // design is one card per row whatever the count says, so it wins here too.
  const n = style === "list" ? 0 : parseInt(term.archiveColumns ?? "", 10);
  if (n >= 1 && n <= 4) {
    const gap = archiveGridGap(style);
    out.push(`.archive-items{grid-template-columns:repeat(1,minmax(0,1fr));gap:${gap / 16}rem}`);
    if (n > 1) {
      out.push(
        `@media(min-width:640px){.archive-items{grid-template-columns:repeat(${Math.min(2, n)},minmax(0,1fr))}}`
      );
      if (n > 2) {
        out.push(
          `@media(min-width:1024px){.archive-items{grid-template-columns:repeat(${n},minmax(0,1fr))}}`
        );
      }
    }
  } else if (style === "list") {
    // A term that picked List while the site is a grid needs the grid reset
    // to one column, which the site stylesheet has not done.
    out.push(`.archive-items{grid-template-columns:repeat(1,minmax(0,1fr));gap:1.25rem}`);
  }
  return out.join("");
}

/** The card designs the Customizer offers — see archiveCss in siteCss.ts. */
const CARD_STYLES = ["classic", "elevated", "bordered", "overlay", "list", "minimal"];

export default async function BlogArchive({
  page = 1,
  categoryId,
  tagId,
  authorId,
  title,
  description,
  intro,
  outro,
  hideTitle,
  direction,
  langOverride,
  design,
  customCss,
  scriptHead,
  scriptBodyEnd,
  term,
  base,
  language,
  pageType,
}: {
  page?: number;
  categoryId?: number;
  /** Restricts the archive to a set of ids — how the tag archive filters. */
  /**
   * Restricts the archive to one tag.
   *
   * A tag id rather than a list of post ids: the tag route used to load *every*
   * post id for the tag and pass them in, which builds an `IN (…)` clause the
   * size of the tag. Popular tags are exactly the ones with the most posts, so
   * the query got slower precisely where it is used most. A subquery does the
   * same filtering in the database and never leaves it.
   */
  tagId?: number;
  /** Restricts the archive to one author — how the author archive filters. */
  authorId?: string;
  title: string;
  description?: string | null;
  /**
   * Extra header content, above the title and below the description.
   *
   * The author archive needs an avatar above the name and a row of links under
   * the bio — an order no single slot can produce. Two named slots keep this
   * component owning the header's layout while the caller owns its contents,
   * rather than growing a second idea of what a header is.
   */
  intro?: React.ReactNode;
  outro?: React.ReactNode;
  /**
   * Skips the built-in `<h1>` and description text.
   *
   * The author archive uses this once `intro` is a custom-built page (an
   * Author Bio block, which already renders the name and biography) — without
   * it the name would print twice.
   */
  hideTitle?: boolean;
  /** "ltr" / "rtl" override — the author archive is the one archive with an owner who can set this. */
  direction?: string | null;
  /**
   * `<html lang>` override — the author archive answers at every language's
   * address, so `language` below (which decides *which* language's posts
   * this listing shows) must stay tied to the URL. This is separate on
   * purpose: it only changes what the tag says the page is written in.
   */
  langOverride?: string | null;
  /**
   * Per-document layout, for archives that belong to one thing.
   *
   * The author archive is a document with its own settings screen, so it can
   * choose a width and a sidebar the way a page does. The blog and term
   * archives pass nothing and keep following the Customizer's archive defaults.
   */
  design?: {
    postLayout?: string;
    contentStyle?: string;
    verticalSpacing?: string;
    cssClasses?: string | null;
    transparentHeader?: string | null;
    disableHeader?: boolean | null;
    disableFooter?: boolean | null;
  };
  customCss?: string | null;
  scriptHead?: string | null;
  scriptBodyEnd?: string | null;
  /**
   * The term's own appearance overrides, when this archive belongs to one.
   *
   * Passed in rather than looked up: the route has already fetched the term to
   * decide whether the archive exists at all, so re-reading it here would be a
   * second query for a row already in hand.
   */
  term?: {
    archiveColor?: string | null;
    archiveHoverColor?: string | null;
    headerImage?: string | null;
    /** `default` follows the site-wide Archive Columns setting. */
    archiveColumns?: string | null;
    /** `default` follows the site-wide Card Design setting. */
    archiveCardStyle?: string | null;
    /** This term's own archive colours as JSON — see categories.archiveDesign. */
    archiveDesign?: string | null;
  } | null;
  base: string;
  /** Header rules and Elements target this; the front page's listing is "front". */
  pageType?: PageType;
  /**
   * Which language's posts this archive lists.
   *
   * Archives were the last language-blind surface: `/blog` listed every
   * language together, which contradicts content being partitioned. Each
   * language now has its own archive at its own prefix.
   */
  language: string;
}) {
  const perPage = await postsPerPage();
  const inLanguage = and(isLive(posts), eq(posts.language, language));
  const where = tagId
    ? and(
        inLanguage,
        inArray(
          posts.id,
          db.select({ id: postTags.postId }).from(postTags).where(eq(postTags.tagId, tagId))
        )
      )
    : categoryId
      ? and(inLanguage, inArray(posts.categoryId, await categoryTree(categoryId, language)))
      : authorId
        ? and(inLanguage, eq(posts.authorId, authorId))
        : inLanguage;

  const [list, [totals], allCategories, settings] = await Promise.all([
    db.query.posts.findMany({
      where,
      orderBy: [desc(posts.publishedAt), desc(posts.id)],
      // The author comes along for the card byline. One join on a query that
      // already runs, rather than a lookup per card — which is exactly the
      // shape this file was careful to avoid for tags.
      // `slug` and `publicProfile` come along so the byline can link: an author
      // with no page must render as plain text rather than a link that 404s.
      with: {
        // Three fields, not the whole row. A category now carries its own
        // colours, canonical, robots, description, custom CSS and scripts —
        // none of which a card renders — and `category: true` fetched all of
        // them once per post in the listing.
        category: { columns: { id: true, name: true, slug: true } },
        author: { columns: { name: true, slug: true, publicProfile: true } },
      },
      limit: perPage,
      offset: (page - 1) * perPage,
      // Card fields only — the `content` JSON on a post can run to hundreds of
      // kilobytes, and a listing never renders it.
      columns: { id: true, title: true, slug: true, excerpt: true, featuredImage: true, publishedAt: true, createdAt: true, language: true },
      // Word count for the card's reading time, counted in the database so
      // the body text never leaves it. Words = spaces + 1 in the
      // whitespace-collapsed text (MariaDB has no array split).
      extras: {
        words: sql<number>`CHAR_LENGTH(TRIM(REGEXP_REPLACE(coalesce(${posts.searchText}, ''), '\\s+', ' '))) - CHAR_LENGTH(REPLACE(TRIM(REGEXP_REPLACE(coalesce(${posts.searchText}, ''), '\\s+', ' ')), ' ', '')) + 1`.as("words"),
      },
    }),
    db.select({ n: count() }).from(posts).where(where),
    // This language's terms. Unfiltered, the French archive offered a row of
    // English category chips leading to English-named archives.
    //
    // Guarded where the two queries above are not, and the asymmetry is the
    // point: the listing and its count *are* the page, so if they fail there is
    // nothing honest to render and the error boundary is the right answer. The
    // category chips are navigation furniture beside it, and losing a whole
    // archive of posts because a chip row would not load is the wrong trade.
    // Only terms that actually have something to show.
    //
    // A category with no published posts is a chip leading to an empty page:
    // a live site shipped a live "Uncategorized" chip with zero posts, which
    // is the WordPress default term nobody deleted, and the archive behind it
    // said "no posts yet" in English on an Arabic site. An empty term is also
    // a thin page for a crawler to find.
    //
    // `exists` rather than a count: the database stops at the first matching
    // row instead of counting every post in the term, and it reuses the same
    // `isLive` + language predicate the listing itself runs on, so a chip can
    // never disagree with the archive it points at.
    //
    // The chip row renders a name and links by slug. Everything else on the
    // row is per-category presentation settings the chips never read.
    db
      .select({ id: categoriesTable.id, name: categoriesTable.name, slug: categoriesTable.slug })
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.language, language),
          exists(
            db
              .select({ one: sql`1` })
              .from(posts)
              .where(and(inLanguage, eq(posts.categoryId, categoriesTable.id)))
          )
        )
      )
      .catch(() => []),
    getSiteSettings(),
  ]);

  // Placeholders for the cards, one query for the whole page of them.
  const cardImages = await lookupImageSizes(list.map((p) => p.featuredImage).filter((u): u is string => !!u));

  const total = totals?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const siteCardStyle = CARD_STYLES.includes(settings.archive_card_style) ? settings.archive_card_style : "classic";
  // The listing's fixed words, in the language this archive lists.
  const archiveLang = langOverride || language;
  const t = archiveText(archiveLang);
  // "Load more" and "min read" follow the listing's language too, unless the
  // Customizer has been given something other than the English default.
  const moreLabel = loadMoreLabel(settings, archiveLang);
  // The same rule the <html> tag uses, so the pagination arrows point the way
  // this document reads.
  const dir = documentDir(archiveLang, settings, direction);
  // The term's own design wins over the site's; `default` — and anything not
  // in the vocabulary — follows the site.
  const cardStyle = CARD_STYLES.includes(term?.archiveCardStyle ?? "") ? (term!.archiveCardStyle as string) : siteCardStyle;
  const termCss = termOverrideCss(term, cardStyle, siteCardStyle, settings);
  const cardCols = cardStyle === "list"
    ? 1
    : Math.min(4, Math.max(1, parseInt(term?.archiveColumns ?? "", 10) || parseInt(settings.archive_columns ?? "", 10) || 3));

  // How wide a card really is, so the browser fetches a file that size.
  //
  // This was the constant `(max-width: 640px) 100vw, (max-width: 1024px) 50vw,
  // 380px` on every archive: wrong at one column (a card is nearly the whole
  // column and was told 380px, so the image came back soft), wrong at four (a
  // 250px card fetched a 380px file), and wrong on every phone, where the
  // shell's own padding means a card is never the full 100vw. The shell's
  // width and padding come from the same reader the content column uses — an
  // archive obeys Archive Layout / Spacing / Content Style exactly as a page
  // obeys its own, so neither can be assumed here.
  const shell = contentColumn(resolveDocLayout("archive", design?.postLayout, settings), {
    spacing: resolveDocSpacing("archive", design?.verticalSpacing, settings),
    style: resolveDocStyle("archive", design?.contentStyle, settings),
  });
  const GRID_GAP = archiveGridGap(cardStyle);
  const tabletCols = Math.min(2, cardCols);
  const colWidth = Math.max(1, Math.round((shell.px - GRID_GAP * (cardCols - 1)) / cardCols));
  const vw = shell.gutter > 0 ? `calc(100vw - ${shell.gutter}px)` : "100vw";
  // The grid is one column below 640px, `tabletCols` to 1023px, `cardCols`
  // above; a share of one is the whole column, not "the column divided by 1".
  const share = (cols: number) =>
    cols === 1 ? vw : `calc((100vw - ${shell.gutter + GRID_GAP * (cols - 1)}px) / ${cols})`;
  const tablet = share(tabletCols);
  // A Fullwidth archive has no max width, so its cards grow with the window:
  // stating a pixel figure there is right at 1920 and too small above it, and
  // the desktop entry follows the viewport instead — the same rule the content
  // renderer applies to a fullwidth image (`column.fluid` in sizesFor).
  const desktop = shell.fluid ? share(cardCols) : `${colWidth}px`;
  const cardSizes = [
    // Only when the phone entry says something the tablet entry does not.
    ...(share(1) === tablet ? [] : [`(max-width: 639px) ${share(1)}`]),
    ...(tablet === desktop ? [] : [`(max-width: 1023px) ${tablet}`]),
    desktop,
  ].join(", ");
  // Speed → Media → "Image quality". The cards ignored it and always asked the
  // optimiser for 75, so an archive of twelve cards was the one place on the
  // site where the setting did not reach.
  const cardQuality = intIn(speedSettings(settings).image_quality, 50, 90, 75);
  const listingPath = await postsPagePath(language, settings);
  // This archive's own address. `base` is "/" when the archive is the
  // homepage: joined naively that made `https://x.net//page/2`, and the root
  // itself was written `…/` where the canonical says `…` (absoluteUrlFor).
  const archiveUrl = absoluteUrlFor(siteUrl(settings), `${base === "/" ? "" : base}${page > 1 ? `/page/${page}` : ""}` || "/");

  return (
    // Through ContentShell rather than a hardcoded wrapper: the Customizer's
    // Archive layout, spacing, content style and sidebar all key off
    // `.content-shell[data-kind="archive"]`, and this component rendered its own
    // `max-w-5xl` box instead — so every one of those settings emitted CSS that
    // matched nothing on /blog, /blog/category/… and /blog/tag/….
    <ContentShell
      design={design ?? {}}
      kind="archive"
      pageType={pageType}
      currentPath={base}
      language={language}
      direction={direction}
      langOverride={langOverride}
      customCss={customCss}
      scriptHead={scriptHead}
      scriptBodyEnd={scriptBodyEnd}
    >
      {/* What Rank Math emits for an archive: the page is a CollectionPage
          whose main entity is the ordered list of what it shows. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "@id": schemaId.webpage(archiveUrl),
            name: title,
            ...(description ? { description } : {}),
            // Encoded like the `@id` beside it and every ItemList url below.
            // Written raw, an Arabic slug put two spellings of one address in
            // the same node.
            url: schemaUrl(archiveUrl),
            inLanguage: language,
            isPartOf: { "@id": schemaId.website(siteUrl(settings)) },
            mainEntity: {
              "@type": "ItemList",
              itemListOrder: "https://schema.org/ItemListOrderDescending",
              numberOfItems: list.length,
              itemListElement: list.map((p, i) => ({
                "@type": "ListItem",
                position: (page - 1) * perPage + i + 1,
                // Percent-encoded, like every other URL this CMS puts in
                // structured data. Written raw, an Arabic slug went out as
                // `…/حل-المشكلات…` here while the post's own canonical said
                // `…/%D8%AD%D9%84…` — one address, two spellings, in
                // documents that point at each other.
                url: schemaUrl(postUrl(p, settings, siteUrl(settings))),
                name: p.title,
              })),
            },
          }),
        }}
      />
      <div>
        {/* The term's overrides, scoped to this archive.
            A stylesheet rather than inline styles because most of these are
            things inline styles cannot express: a hover colour, a column count
            that collapses on a narrow screen, a full-bleed band.

            Through BlockStyle, so it is hoisted into <head> after the site
            stylesheet — where a stylesheet belongs. Printed here in the body it
            was invalid HTML and was parsed only once the browser had reached
            this point, which is a repaint of the bands in the term's colours
            after they had already been painted in the site's. */}
        <BlockStyle css={termCss} />

        {/* The term's own introduction, given the room to be one.
            A category description was a single dim line under the count, so a
            paragraph written to introduce the section read as a caption. It
            leads now, centred, with the count demoted beneath it —
            `whitespace-pre-line` because these are written as prose and their
            paragraph breaks are meant. */}
        {/* Two full-bleed bands.
            The reference design puts the title and introduction on one tinted
            strip and the cards on another, each running the full width of the
            window while their contents stay in the reading column. Done with
            `box-shadow` + `clip-path` rather than a `100vw` margin — see
            `archiveBandCss` — because `100vw` includes the scrollbar width and
            buys a horizontal scrollbar on every archive. */}
        <header className="archive-band archive-header text-center">
          {intro}
          {!hideTitle && (
            <h1 className="archive-title text-[34px] font-bold uppercase tracking-tight">
              {title}
              {/* Page 2 onwards is its own page to a search engine: not page 1's H1 again. */}
              {page > 1 && totalPages > 1 && <span className="archive-title-page">{t.pageOf(page, totalPages)}</span>}
            </h1>
          )}
          {term?.headerImage && (
            // Decorative: the heading above already carries the meaning, so an
            // alt text here would only repeat it to a screen reader.
            //
            // `priority`, because when a term has a header image it is the
            // largest thing above the fold — the LCP element on that archive.
            <ContentImage
              src={term.headerImage}
              alt=""
              priority
              width={1600}
              height={400}
              sizes={columnSizes(shell)}
              className="archive-header-image mx-auto mt-6 max-h-64 w-full rounded-xl object-cover"
            />
          )}
          {!hideTitle && description && (
            <div className="archive-description mx-auto mt-5 max-w-3xl whitespace-pre-line text-[15px] leading-relaxed opacity-70">
              {description}
            </div>
          )}
          {outro}
          <p className="archive-count mt-4 text-xs opacity-60">
            {t.posts(total)}
            {totalPages > 1 && t.pageOf(page, totalPages)}
          </p>
        </header>

        {/* The second band: everything below the introduction sits on it. */}
        <div className="archive-body">
        {settings.archive_chips_show !== "false" && allCategories.length > 0 && (
          // A landmark, because this is how a reader moves between sections —
          // and `aria-current` so the one they are already in says so. The
          // colours live in `.archive-chip` (contentCss): `bg-black/5` is
          // invisible on a dark theme, which is most of the reason this row
          // looked broken on one.
          <nav aria-label={t.categories} className="flex flex-wrap justify-center gap-2 mb-10">
            {/* "All" only when a listing of everything exists to link to. */}
            {listingPath && (
              <Link
                href={listingPath}
                aria-current={categoryId ? undefined : "page"}
                className={`archive-chip px-3 py-1 rounded-full text-xs font-medium${categoryId ? "" : " is-active"}`}
              >
                {t.all}
              </Link>
            )}
            {allCategories.map((cat) => (
              <Link
                key={cat.id}
                href={categoryPath(cat.slug, language, settings)}
                aria-current={cat.id === categoryId ? "page" : undefined}
                className={`archive-chip px-3 py-1 rounded-full text-xs font-medium${cat.id === categoryId ? " is-active" : ""}`}
              >
                {cat.name}
              </Link>
            ))}
          </nav>
        )}

        {/* `archive-items` rather than a hand-rolled stack.
            `contentCss` has always emitted a responsive grid for this class off
            the Archive Columns setting — and nothing in the codebase rendered
            the class, so choosing 2, 3 or 4 columns changed nothing at all.
            The cards are what that grid was written for. */}
        {/* The design is a class, so every preset renders the same markup and
            switching one costs a stylesheet, not a republish. */}
        <div className={`archive-items is-${cardStyle}`}>
          {list.map((post, index) => (
            <article
              key={post.id}
              className="archive-card group flex flex-col"
            >
              {post.featuredImage && (
                <Link href={postPath(post, settings)} className="block overflow-hidden">
                  {/* Through the optimiser, which matters most here: an archive
                      renders up to twelve of these at once, so they are the
                      largest block of image bytes on the site. `sizes` is the
                      card width, not the content width — the grid is at most
                      four across, so a card never needs a full-width file. */}
                  <ContentImage
                    src={post.featuredImage}
                    alt={post.title}
                    width={640}
                    height={400}
                    sizes={cardSizes}
                    quality={cardQuality}
                    className="archive-card-image aspect-[16/10] w-full object-cover"
                    blurDataURL={cardImages.get(post.featuredImage)?.blur}
                    // The first row is on screen before any scrolling, and
                    // without a term header image the first card's picture
                    // is the largest thing there — the LCP element, which
                    // was lazy-loaded ("LCP image was lazily loaded"). That
                    // one is fetched first; the rest of its row eagerly.
                    priority={index === 0 && !term?.headerImage}
                    lazy={index >= cardCols}
                  />
                </Link>
              )}
              <div className="flex flex-1 flex-col px-5 pb-6 pt-5">
                {post.category && (
                  <Link
                    href={categoryPath(post.category.slug, language, settings)}
                    className="archive-card-term text-[11px] font-bold uppercase tracking-[0.08em]"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {post.category.name}
                  </Link>
                )}
                <h2 className="archive-card-title mt-2.5 text-[21px] font-bold leading-[1.3]">
                  <Link href={postPath(post, settings)} className="transition-opacity hover:opacity-70">
                    {post.title}
                  </Link>
                </h2>
                <p className="archive-card-meta mt-2 flex flex-wrap items-center gap-x-2 text-xs opacity-50">
                  {post.author?.name && (
                    <span>
                      {t.by}{" "}
                      {post.author.slug && post.author.publicProfile ? (
                        <Link
                          href={authorPath(post.author.slug, language, settings)}
                          className="hover:underline"
                        >
                          {post.author.name}
                        </Link>
                      ) : (
                        post.author.name
                      )}
                    </span>
                  )}
                  {post.author?.name && <span aria-hidden>&bull;</span>}
                  <time dateTime={isoDate(post.publishedAt)}>{formatSiteDate(post.publishedAt, settings, post.language)}</time>
                  {settings.reading_time_cards === "true" && (
                    <>
                      <span aria-hidden>&bull;</span>
                      <span>{readingTimeFromWords(settings, Number(post.words) || 0, "card", archiveLang)}</span>
                    </>
                  )}
                </p>
                {post.excerpt && (
                  <p className="archive-card-excerpt mt-3 line-clamp-6 text-[13.5px] leading-[1.65] opacity-75">
                    {post.excerpt}
                  </p>
                )}
                {/* Pushed to the bottom so cards of different text lengths still
                    line their actions up along one row.

                    `aria-label` because a listing of twelve posts is twelve
                    links all reading "Read more": a screen reader's link list
                    is then twelve identical entries, none of which says where
                    it goes (WCAG 2.4.4). The visible text stays as it is. */}
                <Link
                  href={postPath(post, settings)}
                  aria-label={`${t.readMore}: ${post.title}`}
                  className="archive-card-more mt-auto pt-5 text-[11px] font-bold uppercase tracking-[0.08em]"
                >
                  {t.readMore} <span aria-hidden>{dir === "rtl" ? "←" : "→"}</span>
                </Link>
              </div>
            </article>
          ))}
        </div>

        {list.length === 0 && (
          <p className="opacity-40 text-center py-16">
            {page > 1 ? t.emptyPage : t.empty}
          </p>
        )}

        <Pagination base={base} page={page} totalPages={totalPages} style={paginationStyle(settings)} label={moreLabel} language={archiveLang} rtl={dir === "rtl"} />
        {paginationStyle(settings) !== "numbers" && page < totalPages && (
          <LoadMore
            // As Pagination builds it: on the front page `base` is "/", and
            // `//page/2` is a protocol-relative URL to a host called "page" —
            // Load more failed there every time.
            nextHref={`${base === "/" ? "" : base.replace(/\/$/, "")}/page/${page + 1}`}
            mode={paginationStyle(settings) as "loadmore" | "infinite"}
            label={moreLabel}
          />
        )}
        </div>
      </div>
    </ContentShell>
  );
}

/** Looks up a category by slug — shared by the category routes. */
/**
 * A category by slug, within a language.
 *
 * Slugs are unique per language, not globally, so a bare slug lookup returns
 * whichever row the database happens to hand back first. Unscoped, this served
 * `/blog/category/<french-slug>` as a 200 with an empty list — the term
 * resolved, then the posts query filtered by English and matched nothing.
 * A thin, indexable page for a URL that should not exist.
 */
export async function findCategory(slug: string, language: string) {
  return db.query.categories.findFirst({
    where: and(eq(categoriesTable.slug, slug), eq(categoriesTable.language, language)),
  });
}
