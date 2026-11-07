// The public content route: every page and every post.
//
// One catch-all rather than a route per permalink structure, because the
// structure is a *setting* — `/2025/06/15/my-post` and `/my-post` have to be
// servable by the same deployment, decided at request time. `parsePostSegments`
// reads the post out of whatever shape the URL has, and anything that is not
// the canonical path for the structure in force is permanently redirected to
// it. That is what keeps old `/blog/…` links, and links made under a previous
// structure, working instead of turning into 404s.
//
// Pages win over posts on a one-segment path: a page is an explicit, deliberate
// URL, and there are far fewer of them. Slugs are unique within each table but
// not across the two, so a post that collides with a page slug is reachable
// only through the page — the same trade WordPress makes.

import { tagsForPost } from "@/lib/postTags";
import { cache } from "react";
import { db } from "@/lib/db";
import { getSiteSettings, type SiteSettings } from "@/lib/settings";
import { categories, pages, posts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound, permanentRedirect } from "next/navigation";
import BlockRenderer, { contentHasH1 } from "@/components/frontend/BlockRenderer";
import BlogArchive, { archivePageCount } from "@/components/frontend/BlogArchive";
import CategoryArchive, { categoryArchiveMetadata } from "@/components/frontend/CategoryArchive";
import ContentShell from "@/components/frontend/ContentShell";
import ContentImage from "@/components/frontend/ContentImage";
import PostTitleBlock from "@/components/frontend/PostTitleBlock";
import { countWords, readingTimeLabel } from "@/lib/siteExtras";
import PostAfterContent from "@/components/frontend/PostAfterContent";
import PostComments from "@/components/frontend/PostComments";
import type { Metadata } from "next";
import { jsonLd, readSeo, renderTemplate, twitterHandle, twitterSite } from "@/lib/seo";
import { buildCustomSchemas, mainEntityId } from "@/lib/schemaTypes";
import { columnSizes, contentColumn, resolveDocLayout, resolveDocSpacing, resolveDocStyle } from "@/lib/contentColumn";
import { authorPath, categoryBaseRemoved, categoryPath, decodeSegments, isPostsPage, languagePrefix, pagePath, parsePostSegments, postPath, rootPath } from "@/lib/permalinks";
import { alternateLanguages, selfIndexable, switcherLinks, translationsFor } from "@/lib/translations";

import { contentLanguages, formatSiteDate } from "@/lib/locale";
import { archiveText } from "@/lib/archiveText";
import { showsFeaturedImage } from "@/lib/docFeature";
import type { Block } from "@blocknote/core";
import { siteUrl } from "@/lib/siteUrl";
import { absoluteUrl, autoOgImage, deriveDescription, lookupImageSize, ogImageDescriptor, ogLocale, publisherSchema, robotsDirectives, schemaId, schemaUrl, twitterImage } from "@/lib/seoMeta";
import OgProperties from "@/components/frontend/OgProperties";
import { isLive, isLiveNow } from "@/lib/publishState";
import { breadcrumbId, breadcrumbIsVisible, breadcrumbSchema, pageCrumbs, postCrumbs } from "@/lib/breadcrumbSchema";
import { firstBlockEntityId } from "@/lib/blockSchema";

// Statically generate published content, revalidate hourly as a fallback.
export const revalidate = 3600;

import { BUILD_WITHOUT_DATABASE, PRERENDER_POSTS } from "@/lib/prerender";

type Params = { params: Promise<{ lang: string; path: string[] }> };

export async function generateStaticParams() {
  if (BUILD_WITHOUT_DATABASE) return [];
  try {
    const [publishedPages, publishedPosts, settings] = await Promise.all([
      db.query.pages.findMany({
        where: isLive(pages),
        columns: { id: true, slug: true, language: true },
      }),
      db.query.posts.findMany({
        where: isLive(posts),
        columns: { id: true, slug: true, language: true, publishedAt: true, createdAt: true },
        // The newest only — older posts render on first visit (lib/prerender).
        orderBy: (p, { desc }) => [desc(p.publishedAt), desc(p.id)],
        limit: PRERENDER_POSTS,
      }),
      getSiteSettings(),
    ]);
    // `pagePath`/`postPath` build the *public* URL, which already carries the
    // language prefix. This route sits under `[lang]`, so the prefix is a
    // separate param and has to come back off the front of the path.
    const split = (url: string, language: string) => {
      const prefix = languagePrefix(language, settings);
      const rest = prefix && url.startsWith(prefix) ? url.slice(prefix.length) : url;
      return { lang: language, path: rest.split("/").filter(Boolean) };
    };

    const params = [
      // Through `pagePath` so a homepage prerenders at its language root rather
      // than at a slug it no longer answers on.
      ...publishedPages.map((p) => split(pagePath(p, settings), p.language)),
      // The post's params are its canonical path split back into segments, so a
      // dated structure pre-renders at the depth it is actually served from.
      ...publishedPosts.map((p) => split(postPath(p, settings), p.language)),
    ];

    // A homepage resolves to its language root, which splits to an empty array —
    // and a *required* catch-all can never match an empty path; the root is
    // served by `[lang]/page.tsx`. Handing Next an empty `path` asks it to
    // prerender a route that does not exist.
    return params.filter((p) => p.path.length > 0);
  } catch {
    return []; // DB unreachable at build — fall back to on-demand rendering
  }
}

/**
 * The page or post a path resolves to, with the page taking precedence.
 *
 * Memoised per request, and keyed on the joined path rather than the segment
 * array: Next calls `generateMetadata` and the component separately, and an
 * array argument is a new reference each time, so an un-keyed cache would miss
 * and every content view would run the lookup twice.
 *
 * The language arrives as a route param rather than being peeled off the path:
 * the middleware puts it there, so `/about` is `lang=en, path=[about]` and
 * `/fr/a-propos` is `lang=fr, path=[a-propos]`. The archives, the language root
 * and search are all real routes now, so this handles only pages and posts.
 *
 * A configured language code still wins over a page slug — with French enabled,
 * `/fr` is the French root and a page slugged `fr` is unreachable. That is
 * worth knowing rather than working around: silently serving the page instead
 * would make the language root vanish depending on what someone named a page,
 * and a two-letter slug that collides with a language is easy to rename.
 */
/** Drops keys whose value is empty, null or undefined — see the schema below. */
function pruneEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

/** The public URL these params were served from, prefix included. */
function servedPath(lang: string, segments: string[], settings: SiteSettings): string {
  return `${languagePrefix(lang, settings)}/${segments.join("/")}`;
}

const resolve = cache(async (language: string, path: string) => {
  const segments = path.split("/").filter(Boolean);

  // Pages are looked up within their own language: content is partitioned, so
  // an English slug must not answer under `/fr`.
  // `/<slug>/page/N` is the Posts page's pagination — and only the Posts
  // page's. Any other page has no page 2, and the segments fall through to
  // the post lookup below, which will not match them either.
  const paged = segments.length === 3 && segments[1] === "page" && /^\d+$/.test(segments[2]) ? parseInt(segments[2], 10) : 0;

  if ((segments.length === 1 || paged > 1) && segments[0]) {
    const page = await db.query.pages.findFirst({
      where: and(eq(pages.slug, segments[0]), eq(pages.language, language)),
      // The author comes along for the title area's Meta element. It is one
      // join on a query that already runs, rather than a second round trip.
      with: { author: { columns: { name: true } } },
    });
    // Only a live page claims the slug. A draft or trashed one used to win
    // here and then 404 below, taking a live post with the same slug down
    // with it — trashing a page could make an unrelated post vanish.
    if (page && isLiveNow(page.status, page.publishedAt, page.deletedAt)) {
      if (paged > 1) {
        const settings = await getSiteSettings();
        if (!isPostsPage(page.id, page.language, settings)) return null;
        return { kind: "page" as const, page, language, isHome: false, pageNum: paged };
      }
      return { kind: "page" as const, page, language, isHome: false, pageNum: 1 };
    }
  }

  const lookup = parsePostSegments(segments);
  if (!lookup) return null;

  const post = await db.query.posts.findFirst({
    where: and(
      lookup.by === "id" ? eq(posts.id, lookup.id) : eq(posts.slug, lookup.slug),
      eq(posts.language, language)
    ),
    // Narrowed on purpose. `author: true` selected the whole users row —
    // `password` and `totp_secret` included — for the sake of one display
    // name. Nothing rendered them and this is a server component, so they
    // never reached the browser, but a post object carrying a password hash
    // is one careless `<ClientThing post={post} />` away from leaking it.
    with: {
      category: { columns: { id: true, name: true, slug: true } },
      author: { columns: { id: true, name: true, slug: true, image: true, publicProfile: true, twitter: true } },
    },
  });
  // Same for a post against a category archive of the same slug.
  if (post && isLiveNow(post.status, post.publishedAt, post.deletedAt)) return { kind: "post" as const, post, language, isHome: false };

  // With the category base removed, `/<slug>` (and `/<slug>/page/N`) is a
  // category archive. Last, after pages and posts: those are explicit content
  // and win a slug collision, the same order WordPress resolves them in.
  if (segments.length === 1 || paged > 1) {
    const settings = await getSiteSettings();
    if (categoryBaseRemoved(settings)) {
      const category = await db.query.categories.findFirst({
        where: and(eq(categories.slug, segments[0]), eq(categories.language, language)),
      });
      if (category) return { kind: "category" as const, category, language, isHome: false, pageNum: paged > 1 ? paged : 1 };
    }
  }
  return null;
});

/**
 * `og:locale` plus every other configured language as an alternate.
 *
 * Open Graph had no locale at all, which on a multilingual site is the tag that
 * tells a share preview which language it is looking at.
 */
function ogLocales(language: string, settings: SiteSettings) {
  const alternateLocale = contentLanguages(settings)
    .filter((c) => c !== language)
    .map(ogLocale);
  return {
    locale: ogLocale(language),
    ...(alternateLocale.length ? { alternateLocale } : {}),
  };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { lang, path } = await params;
  const [found, settings] = await Promise.all([
    resolve(lang, decodeSegments(path).join("/")),
    getSiteSettings(),
  ]);
  if (!found) return {};

  // The component below calls `notFound()` for anything unpublished, but
  // metadata is produced *before* that happens — so a draft's title and
  // description were being built from content nobody is meant to see yet.
  // Guessing slugs would have surfaced them. Nothing is published, nothing is
  // described.
  // Scheduled counts as not-yet-published here, for the same reason a draft
  // does: describing a document nobody can open invites it to be indexed.
  if (found.kind === "category") return categoryArchiveMetadata(found.category, lang, settings, found.pageNum);

  const doc = found.kind === "page" ? found.page : found.post;
  if (!isLiveNow(doc.status, doc.publishedAt, doc.deletedAt)) return {};

  if (found.kind === "page") {
    const page = found.page;
    const pageSeo = readSeo(settings);
    // Pages have no `search_text` column — that flattening is done for posts,
    // for the search index — so there is no body text to fall back to here.
    // `seo_page_description` is a template on the SEO screen that pages never
    // consulted — posts used theirs, pages fell straight through to the site
    // description. Same chain as a post now: author's own, then the template,
    // then the site's.
    const pageDescription = deriveDescription(
      page.seoDescription,
      renderTemplate(
        pageSeo.seo_page_description,
        {
          title: page.title,
          sitename: settings.site_name || "",
          sitedesc: settings.site_description || "",
        },
        pageSeo.seo_separator
      ),
      settings.site_description
    );
    const pageExplicitTitle =
      page.seoTitle ||
      renderTemplate(
        pageSeo.seo_page_title,
        {
          title: page.title,
          sitename: settings.site_name || "",
          sitedesc: settings.site_description || "",
        },
        pageSeo.seo_separator
      );
    // Falls back to the site-wide default, as posts already did. Without it a
    // page with no image of its own shared as a bare link.
    const pageImage = page.ogImage || page.featuredImage || pageSeo.seo_og_default_image || autoOgImage(page.seoTitle || page.title, settings);
    // The share title has to fall through the SEO title, not jump straight to
    // the raw one. Skipping `pageExplicitTitle` meant `<title>` and
    // `og:title` disagreed whenever an author had set an SEO title — the same
    // bug the homepage had, and it looks like a content typo rather than a
    // field being ignored. Posts and categories already do it this way.
    const pageShareTitle = page.ogTitle || pageExplicitTitle || page.title;
    const [pageOg, pageTranslations] = await Promise.all([
      pageImage ? ogImageDescriptor(pageImage, pageShareTitle) : null,
      translationsFor("page", page, settings),
    ]);
    return {
      // Same rule as posts: absolute only when a template or an explicit SEO
      // title produced it, never for the bare page title.
      title: pageExplicitTitle ? { absolute: pageExplicitTitle } : page.title,
      description: pageDescription,
      openGraph: {
        title: pageShareTitle,
        description: page.ogDescription || pageDescription,
        images: pageOg ? [pageOg] : [],
        // Relative; Next resolves it against `metadataBase`, the same way the
        // `hreflang` URLs are resolved.
        url: pagePath(page, settings),
        siteName: settings.site_name || undefined,
        type: "website",
        ...ogLocales(page.language, settings),
      },
      twitter: {
        site: twitterSite(settings),
        card: pageImage ? "summary_large_image" : "summary",
        title: pageShareTitle,
        description: page.ogDescription || pageDescription,
        ...(pageImage ? { images: [twitterImage(pageImage, pageShareTitle)] } : {}),
      },
      // The per-page flag *and* the site-wide switch, the way posts already do
      // it. "Tell search engines not to index pages" was doing nothing at all.
      robots: robotsDirectives(
        !page.noIndex && pageSeo.seo_page_noindex !== "true" && !(found.pageNum > 1 && pageSeo.seo_paginated_noindex === "true"),
        !page.noFollow,
        page.robotsAdvanced
      ),
      // `hreflang`, so a crawler knows this page and its translations are the
      // same document in different languages rather than duplicates competing
      // with each other. Only published translations are advertised.
      alternates: {
        // Self-referencing by default. With no canonical at all a crawler has to
        // decide which URL is the real one, and a page reachable both by slug
        // and — when it is a homepage — by a language root makes that guess
        // worse. An author override still wins.
        canonical: (page.canonicalUrl || pagePath(page, settings)) + (found.pageNum > 1 ? `/page/${found.pageNum}` : ""),
        languages: alternateLanguages(
          {
            language: page.language,
            path: pagePath(page, settings),
            indexable:
              page.noIndex !== true &&
              pageSeo.seo_page_noindex !== "true" &&
              selfIndexable(pagePath(page, settings), false, page.canonicalUrl),
          },
          pageTranslations,
          settings
        ),
      },
    };
  }

  const post = found.post;
  const seo = readSeo(settings);

  // The post's own SEO fields win; the SEO templates fill the gaps.
  const vars = {
    title: post.title,
    sitename: settings.site_name || "",
    sitedesc: settings.site_description || "",
    excerpt: post.excerpt || "",
    category: post.category?.name || "",
  };
  // Absolute only when the title is genuinely complete — an author's explicit
  // SEO title, or a rendered template (every default ends in `%sitename%`).
  // Falling back to the bare post title is *not* complete: the layout's
  // `| <site name>` is then the only thing adding the site name, and marking it
  // absolute would strip it. That case appears the moment someone clears a
  // template in the SEO screen.
  const templatedTitle = renderTemplate(seo.seo_post_title, vars, seo.seo_separator);
  const explicitTitle = post.seoTitle || templatedTitle;
  const title = explicitTitle || post.title;
  // Falls through until something is worth saying. Without the body fallback a
  // post with no excerpt shipped with no description at all, and Google wrote
  // the snippet from whatever text it found first — usually the navigation.
  const description = deriveDescription(
    post.seoDescription,
    renderTemplate(seo.seo_post_description, vars, seo.seo_separator),
    post.excerpt,
    post.searchText,
    settings.site_description
  );
  // Own image, then the featured image, then the site default, then one drawn
  // from the title. Nothing shares without a picture any more.
  const ogImage = post.ogImage || post.featuredImage || seo.seo_og_default_image || autoOgImage(title, settings, post.category?.name);
  // 200 wpm is the figure the common plugins use, so the number matches what a
  // reader would see elsewhere. Rounded up, because "0 minutes" reads as broken.
  const words = (post.searchText ?? "").trim().split(/\s+/).filter(Boolean).length;
  const readingMinutes = words > 0 ? Math.max(1, Math.round(words / 200)) : 0;

  // The two extra rows an X/Twitter card shows under the description, plus the
  // OG image's type and size. Not exotic — every SEO plugin emits them — and
  // the data was already here: the author relation, and the flattened body kept
  // for the search index.
  //
  // Built as a plain record rather than spread inline: optional keys made the
  // inferred type a union of shapes that Next's `other` field rejects.
  const otherMeta: Record<string, string> = {};
  const cardText = archiveText(post.language);
  const [ogDesc, postTags, postTranslations] = await Promise.all([
    ogImage ? ogImageDescriptor(ogImage, post.ogTitle || post.title) : null,
    tagsForPost(post.id).catch(() => []),
    translationsFor("post", post, settings),
  ]);
  const postTagNames = postTags.map((t) => t.name);

  if (post.author?.name) {
    otherMeta["twitter:label1"] = cardText.writtenBy;
    otherMeta["twitter:data1"] = post.author.name;
  }
  if (readingMinutes) {
    otherMeta["twitter:label2"] = cardText.timeToRead;
    // The same wording the page itself shows, rather than an English
    // "2 minutes" under an Arabic headline.
    otherMeta["twitter:data2"] = `${readingMinutes} ${cardText.minRead}`;
  }
  // The author's own handle. (`og:updated_time` and `article:publisher` are
  // `property` tags, which `other` cannot write — the page renders them, see
  // OgProperties. The image's size and type ride on the image descriptor.)
  const creator = twitterHandle(post.author?.twitter);
  if (creator) otherMeta["twitter:creator"] = creator;

  return {
    title: explicitTitle ? { absolute: explicitTitle } : title,
    description,
    openGraph: {
      title: post.ogTitle || title,
      description: post.ogDescription || description,
      images: ogDesc ? [ogDesc] : [],
      url: postPath(post, settings),
      siteName: settings.site_name || undefined,
      // A post is an article, not a website — it is what lets a preview show a
      // published date and an author.
      type: "article",
      ...(post.publishedAt ? { publishedTime: new Date(post.publishedAt).toISOString() } : {}),
      ...(post.updatedAt ? { modifiedTime: new Date(post.updatedAt).toISOString() } : {}),
      // article:author / article:section / article:tag — the rest of what an
      // article preview can show. Tags come from the same lookup the page
      // body uses, so the two can never disagree.
      ...(post.author?.name ? { authors: [post.author.name] } : {}),
      ...(post.category?.name ? { section: post.category.name } : {}),
      ...(postTagNames.length ? { tags: postTagNames } : {}),
      ...ogLocales(post.language, settings),
    },
    twitter: {
      site: twitterSite(settings),
      card: (seo.seo_twitter_card === "summary" ? "summary" : "summary_large_image") as "summary" | "summary_large_image",
      title: post.twitterTitle || post.ogTitle || title,
      description: post.twitterDescription || description,
      images: post.twitterImage
        ? [twitterImage(post.twitterImage, post.twitterTitle || post.ogTitle || title)]
        : ogImage ? [twitterImage(ogImage, post.ogTitle || title)] : [],
    },
    robots: robotsDirectives(
      !post.noIndex && seo.seo_post_noindex !== "true",
      !post.noFollow,
      post.robotsAdvanced
    ),
    other: otherMeta,
    // Without an explicit canonical, the post's own permalink is the canonical
    // one — the redirect below means only one URL ever serves it anyway.
    alternates: {
      canonical: post.canonicalUrl || postPath(post, settings),
      languages: alternateLanguages(
        {
          language: post.language,
          path: postPath(post, settings),
          indexable:
            post.noIndex !== true &&
            seo.seo_post_noindex !== "true" &&
            selfIndexable(postPath(post, settings), false, post.canonicalUrl),
        },
          postTranslations,
        settings
      ),
    },
  };
}

export default async function ContentRoute({ params }: Params) {
  const { lang, path } = await params;
  const segments = decodeSegments(path).filter(Boolean);
  const [found, settings] = await Promise.all([
    resolve(lang, segments.join("/")),
    getSiteSettings(),
  ]);

  if (!found) notFound();


  /* ── A category archive, base removed ──────────────────────────────────── */

  if (found.kind === "category") {
    const n = found.pageNum;
    if (n > 1 && n > (await archivePageCount(lang, found.category.id))) notFound();
    return <CategoryArchive category={found.category} lang={lang} settings={settings} page={n} />;
  }

  /* ── A page ────────────────────────────────────────────────────────────── */

  if (found.kind === "page") {
    const page = found.page;
    if (!isLiveNow(page.status, page.publishedAt, page.deletedAt)) notFound();

    // One URL per page, same rule as posts. This is what makes a homepage's
    // address fixed: whichever page is set as the homepage answers at `/` (or
    // `/fr`), so reaching it by its slug redirects there rather than serving
    // the same document at two addresses. Changing the slug of a homepage
    // therefore changes nothing about where it lives — which is the point.
    const canonicalPage = pagePath(page, settings);
    // The served URL is the language prefix plus these segments; `segments`
    // alone lost the prefix when the language became its own route param, and
    // comparing without it made every non-default-language URL look wrong and
    // redirect to itself.
    // `canonicalPage` is "/" when the Posts page is also the homepage, and
    // `//page/2` would be a protocol-relative URL, not a path.
    const expected = found.pageNum > 1 ? `${canonicalPage === "/" ? "" : canonicalPage}/page/${found.pageNum}` : canonicalPage;
    if (servedPath(lang, segments, settings) !== expected) permanentRedirect(expected);

    // The Posts page: its URL lists the posts instead of showing its content
    // — WordPress's "Settings → Reading → Posts page". The page's own title,
    // design settings, scripts and CSS still apply; only the body is the list.
    if (isPostsPage(page.id, page.language, settings)) {
      if (found.pageNum > 1 && found.pageNum > (await archivePageCount(page.language))) notFound();
      return (
        <BlogArchive
          page={found.pageNum}
          title={page.title}
          description={page.seoDescription || undefined}
          base={canonicalPage}
          language={page.language}
          direction={page.direction}
          design={page}
          customCss={page.customCss}
          scriptHead={page.scriptHead}
          scriptBodyEnd={page.scriptBodyEnd}
          // "blog", not "page": this URL is the post listing, and the
          // "Blog index" target existed in PAGE_TYPES with nothing ever
          // reporting it — so every header rule and Element aimed at the
          // blog index matched nothing. It is still a page underneath, but
          // what a rule wants to target here is the listing.
          pageType="blog"
        />
      );
    }

    // Empty properties are dropped rather than emitted as "". A structured-data
    // field present but blank is worse than absent: it asserts the page has no
    // description instead of leaving the question open. `inLanguage` is the
    // structured-data half of `<html lang>` and was missing entirely.
    const pageUrl = `${siteUrl(settings)}${pagePath(page, settings)}`;
    const pageSchemaUrl = schemaUrl(pageUrl);
    const hideTitle = page.showTitle === "disable";
    // Home › This page — matching the trail the title block renders, and
    // only when that trail is on the page (`breadcrumbIsVisible`).
    const pageCrumbsSchema = breadcrumbIsVisible("page", settings, hideTitle)
      ? breadcrumbSchema(pageCrumbs(page, pagePath(page, settings), settings, siteUrl(settings)), pageUrl)
      : null;
    const schema = pruneEmpty({
      "@context": "https://schema.org",
      "@type": page.schemaType || "WebPage",
      name: page.title,
      description: page.seoDescription,
      inLanguage: page.language,
      url: pageSchemaUrl,
      "@id": schemaId.webpage(pageUrl),
      // The dates a post already carried. Without them a page's schema said
      // nothing about freshness, which is one of the few signals a static
      // landing page has.
      datePublished: page.publishedAt ? new Date(page.publishedAt).toISOString() : undefined,
      dateModified: page.updatedAt ? new Date(page.updatedAt).toISOString() : undefined,
      // Ties this page to the WebSite node emitted by the layout, instead of
      // leaving two unconnected assertions on the same page.
      isPartOf: { "@id": schemaId.website(siteUrl(settings)) },
      // What the page is about, when SEO → Schema names an app, a product…
      // or, failing that, the first App Info / Download Box block on the page
      // (see lib/blockSchema). A landing page built around one app said
      // nothing about the app in its own node before this.
      ...(() => {
        const id = mainEntityId(page.schemas, { pageUrl: pageSchemaUrl, absolute: (u) => absoluteUrl(u, siteUrl(settings)) }) ?? firstBlockEntityId(page.content, pageUrl);
        return id ? { mainEntity: { "@id": id } } : {};
      })(),
      ...(page.featuredImage
        ? { primaryImageOfPage: { "@type": "ImageObject", url: schemaUrl(absoluteUrl(page.featuredImage, siteUrl(settings))) } }
        : {}),
      // The trail below, by reference — one graph instead of two lists.
      ...(pageCrumbsSchema ? { breadcrumb: { "@id": breadcrumbId(pageUrl) } } : {}),
    });

    const hideFeaturedImg = !showsFeaturedImage("page", page.showFeaturedImage, settings);
    const col = contentColumn(resolveDocLayout("page", page.postLayout, settings), { spacing: resolveDocSpacing("page", page.verticalSpacing, settings), style: resolveDocStyle("page", page.contentStyle, settings) });

    return (
      <ContentShell
        design={page}
        kind="page"
        documentContent={JSON.stringify(page.content ?? null)}
        currentPath={pagePath(page, settings)}
        language={page.language}
        direction={page.direction}
        switcherTargets={await switcherLinks("page", page, settings)}
        scriptHead={page.scriptHead}
        scriptBodyEnd={page.scriptBodyEnd}
        customCss={page.customCss}
      >
        <OgProperties updatedAt={page.updatedAt} />
        {/* Structured data the author added under SEO → Schema. */}
        {buildCustomSchemas(page.schemas, { pageUrl: pageSchemaUrl, absolute: (u) => absoluteUrl(u, siteUrl(settings)) }).map((s, i) => (
          <script key={`cs${i}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(s) }} />
        ))}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
        {pageCrumbsSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(pageCrumbsSchema) }} />}
        {/* The same title block a post uses.
            A bare <h1> carried no `content-title` class and no element
            attributes, so the Customizer's page-title toggle generated a rule
            that matched nothing and the whole Page Layout title area — order,
            alignment, breadcrumb, meta — had nothing to act on. */}
        {!hideTitle ? (
          <PostTitleBlock
            kind="page"
            // One H1 per page: when the content opens with its own (a Text
            // Advanced heading in a hero row), the title area keeps its look
            // but not the tag, and the sr-only fallback below is not needed.
            as={contentHasH1(page.content) ? "p" : "h1"}
            title={page.title}
            publishedAt={page.publishedAt}
            authorName={page.author?.name}
            language={page.language}
            dateText={formatSiteDate(page.publishedAt, settings, page.language)}
            // The same root `pageCrumbs` writes into the BreadcrumbList.
            homeHref={rootPath(page.language, settings)}
          />
        ) : (
          // Hidden visually, not removed semantically.
          //
          // "Hide title" left the document with no `<h1>` at all — a screen
          // reader lost the page heading entirely and a crawler lost the
          // strongest on-page signal about what the page is. The setting is
          // about the design, so it is honoured in the design and nowhere else.
          !contentHasH1(page.content) && <h1 className="sr-only">{page.title}</h1>
        )}
        {!hideFeaturedImg && page.featuredImage && (
          <ContentImage
            priority
            src={page.featuredImage}
            alt={page.title}
            sizes={columnSizes(col)}
            className="w-full aspect-video object-cover rounded-xl mb-10"
          />
        )}
        <div className="max-w-none" data-page-body>
          <BlockRenderer blocks={(page.content as Block[]) ?? []} language={page.language} direction={page.direction} title={page.title} pageUrl={pageUrl} column={col} />
        </div>

        {/* Same precedence as a post: the page's own setting wins, and the
            Customizer default decides only when the page has not chosen.
            Pages ship with comments off, so this renders nothing until asked. */}
        {(page.showComments === "enable" ||
          (page.showComments !== "disable" && settings.page_comments_show === "true")) && (
          <PostComments pageId={page.id} language={page.language} />
        )}
      </ContentShell>
    );
  }

  /* ── A post ────────────────────────────────────────────────────────────── */

  const post = found.post;
  if (!isLiveNow(post.status, post.publishedAt, post.deletedAt)) notFound();

  // One URL per post. Anything else that resolves here — an old `/blog/` link,
  // a link made under a previous structure, a stray trailing segment — moves to
  // the canonical path rather than serving duplicate content at two addresses.
  const canonical = postPath(post, settings);
  if (servedPath(lang, segments, settings) !== canonical) permanentRedirect(canonical);

  // `headline` belongs to the Article family; a WebPage uses `name`. Emitting
  // the wrong one is the difference between valid structured data and an error
  // in Search Console.
  const schemaType = post.schemaType || "Article";
  const isArticleType = schemaType !== "WebPage";
  // The reading time's count (lib/siteExtras): word-aware for Thai, Chinese
  // and Japanese, where splitting on spaces counted a paragraph as one word.
  const postWords = countWords(post.searchText);
  const postUrl = `${siteUrl(settings)}${canonical}`;
  const postSchemaUrl = schemaUrl(postUrl);
  const postImage = post.featuredImage || post.ogImage ? schemaUrl(absoluteUrl((post.featuredImage || post.ogImage)!, siteUrl(settings))) : undefined;
  const hideTitle = post.showTitle === "disable";
  // The trail Google shows in place of a bare URL. Built from the same
  // category and title the title block renders, so the markup describes the
  // crumbs a visitor can actually see — and only when the trail is actually
  // on the page (`breadcrumbIsVisible`).
  const crumbsSchema = breadcrumbIsVisible("post", settings, hideTitle)
    ? breadcrumbSchema(postCrumbs(post, post.category, canonical, settings, siteUrl(settings)), postUrl)
    : null;
  // What the post is about, when a block on it names an app or a download and
  // the SEO → Schema tab has not named anything itself — see lib/blockSchema.
  const aboutId = mainEntityId(post.schemas, { pageUrl: postSchemaUrl, absolute: (u) => absoluteUrl(u, siteUrl(settings)) }) ?? firstBlockEntityId(post.content, postUrl);

  // The page the Article is on. `mainEntityOfPage` below has pointed at
  // `…#webpage` all along, and nothing emitted a node with that id — pages
  // and archives have one, posts did not. Valid JSON-LD, dangling reference.
  const webPage = pruneEmpty({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": schemaId.webpage(postUrl),
    url: postSchemaUrl,
    name: post.title,
    inLanguage: post.language,
    isPartOf: { "@id": schemaId.website(siteUrl(settings)) },
    datePublished: post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined,
    dateModified: post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined,
    ...(postImage ? { primaryImageOfPage: { "@type": "ImageObject", url: postImage } } : {}),
    ...(crumbsSchema ? { breadcrumb: { "@id": breadcrumbId(postUrl) } } : {}),
  });

  const schema = pruneEmpty({
    "@context": "https://schema.org",
    "@type": schemaType,
    ...(isArticleType ? { headline: post.title } : { name: post.title }),
    description: post.seoDescription || post.excerpt,
    // Encoded, like the `url` and `@id` beside it: an Arabic filename went out
    // raw here while every other URL in the same block was percent-encoded.
    image: postImage,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    inLanguage: post.language,
    // Length and section, as Rank Math reports them. `wordCount` is the same
    // count the reading time uses.
    ...(isArticleType && postWords > 0 ? { wordCount: postWords } : {}),
    ...(isArticleType && post.category?.name ? { articleSection: post.category.name } : {}),
    url: postSchemaUrl,
    // `mainEntityOfPage` is how an Article says which page it *is*, rather than
    // which page merely mentions it.
    mainEntityOfPage: { "@id": schemaId.webpage(postUrl) },
    isPartOf: { "@id": schemaId.website(siteUrl(settings)) },
    // The thing the article is about — the app it reviews or offers. An
    // Article is the page's main entity, so the app hangs off it as `about`
    // rather than competing for `mainEntity`.
    ...(aboutId ? { about: { "@id": aboutId } } : {}),
    // A bare name is a floating claim; a Person node with a `url` back to the
    // author's own page (and an `@id` on both ends) is one connected graph —
    // only possible when that page actually exists (`publicProfile` + `slug`).
    ...(post.author?.name
      ? {
          author: {
            "@type": "Person",
            name: post.author.name,
            ...(post.author.publicProfile && post.author.slug
              ? (() => {
                  const authorUrl = `${siteUrl(settings)}${authorPath(post.author.slug!, post.language, settings)}`;
                  return { "@id": `${authorUrl}#person`, url: authorUrl };
                })()
              : {}),
            // Encoded like every other URL in this block (an Arabic filename
            // went out raw).
            ...(post.author.image ? { image: schemaUrl(absoluteUrl(post.author.image, siteUrl(settings))) } : {}),
          },
        }
      : isArticleType
        ? {
            // No author (deleted, or never matched on import): Search Console
            // flags an Article without one. The site's own identity stands in
            // — the publisher when the Knowledge Graph names one, else the site.
            author:
              publisherSchema(settings, siteUrl(settings)) ??
              { "@type": "Organization", name: settings.site_name || new URL(siteUrl(settings)).hostname, url: siteUrl(settings) },
          }
        : {}),
    // Google's Article guidance asks for a publisher; the Knowledge Graph
    // settings finally supply one.
    ...(publisherSchema(settings, siteUrl(settings))
      ? { publisher: publisherSchema(settings, siteUrl(settings)) }
      : {}),
  });

  const hideFeaturedImg = !showsFeaturedImage("post", post.showFeaturedImage, settings);
  const postCol = contentColumn(resolveDocLayout("post", post.postLayout, settings), { spacing: resolveDocSpacing("post", post.verticalSpacing, settings), style: resolveDocStyle("post", post.contentStyle, settings) });
  const titleAbove = settings.post_title_layout === "above-content";

  // Size and placeholder for the featured image, from the media library.
  const featuredInfo = post.featuredImage ? await lookupImageSize(post.featuredImage) : null;

  const titleProps = {
    // One H1 per page — see the page branch above.
    as: (contentHasH1(post.content) ? "p" : "h1") as "p" | "h1",
    title: post.title,
    excerpt: post.excerpt,
    publishedAt: post.publishedAt,
    category: post.category,
    authorName: post.author?.name ?? null,
    categoryHref: post.category ? categoryPath(post.category.slug, post.language, settings) : null,
    readingTime: readingTimeLabel(settings, post.searchText, "post", post.language),
    language: post.language,
    // The same root `postCrumbs` writes into the BreadcrumbList below.
    homeHref: rootPath(post.language, settings),
    // Settings → Date format and the site's time zone, the same reading the
    // listing cards use — not the `en-US` shape this block used to hard-code.
    dateText: formatSiteDate(post.publishedAt, settings, post.language),
  };

  return (
    <ContentShell
      design={post}
      kind="post"
      documentContent={JSON.stringify(post.content ?? null)}
      currentPath={canonical}
      language={post.language}
      direction={post.direction}
      switcherTargets={await switcherLinks("post", post, settings)}
      scriptHead={post.scriptHead}
      scriptBodyEnd={post.scriptBodyEnd}
      customCss={post.customCss}
    >
      <OgProperties updatedAt={post.updatedAt} publisher={readSeo(settings).seo_fb_page} />
      {/* Structured data the author added under SEO → Schema. */}
      {buildCustomSchemas(post.schemas, { pageUrl: postSchemaUrl, absolute: (u) => absoluteUrl(u, siteUrl(settings)) }).map((s, i) => (
        <script key={`cs${i}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(s) }} />
      ))}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(webPage) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
      {crumbsSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(crumbsSchema) }} />}

      {/* One copy only. Rendering both and hiding one with CSS put two <h1>s in
          the document, and the Customizer previews site chrome rather than a
          real post, so the second copy bought nothing. */}
      {!hideTitle ? (
        <div className={titleAbove ? "post-title-above mb-10" : "post-title-in"}>
          <PostTitleBlock {...titleProps} />
        </div>
      ) : (
        // Same reasoning as the page branch above: the setting hides the
        // heading, it does not delete it from the document.
        !contentHasH1(post.content) && <h1 className="sr-only">{post.title}</h1>
      )}

      {!hideFeaturedImg && post.featuredImage && (
        <ContentImage
          priority
          src={post.featuredImage}
          alt={post.title}
          sizes={columnSizes(postCol)}
          className="content-feature w-full aspect-video object-cover rounded-xl mb-10"
          {...(featuredInfo ? { width: featuredInfo.width, height: featuredInfo.height, blurDataURL: featuredInfo.blur } : {})}
        />
      )}

      <div className="max-w-none">
        <BlockRenderer blocks={(post.content as Block[]) ?? []} language={post.language} direction={post.direction} title={post.title} pageUrl={postUrl} column={postCol} />
      </div>

      <PostAfterContent post={post} settings={settings} />
      {/* Resolved on the server rather than hidden with CSS. The site-wide
          switch works by `display:none`, which still fetches every comment and
          ships them in the HTML — invisible to a reader, entirely visible to a
          crawler, and a query nobody wanted. Off means not rendered. */}
      {(post.showComments === "enable" ||
        (post.showComments !== "disable" && settings.post_comments_show !== "false")) && (
        <PostComments postId={post.id} language={post.language} />
      )}
    </ContentShell>
  );
}
