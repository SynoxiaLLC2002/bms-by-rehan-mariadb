import { db } from "@/lib/db";
import { liveLanguageRoots } from "@/lib/liveLanguages";
import { showsFeaturedImage } from "@/lib/docFeature";
import { getSiteSettings } from "@/lib/settings";
import { absoluteUrlFor, homepageId as homepageIdFor, rootPath } from "@/lib/permalinks";
import { contentLanguages } from "@/lib/locale";
import { absoluteUrl, pageMetadata, autoOgImage, ogImageDescriptor, schemaId } from "@/lib/seoMeta";
import OgProperties from "@/components/frontend/OgProperties";
import { defaultContentLanguage, formatSiteDate, isContentLanguage } from "@/lib/locale";
import { pages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { jsonLd, readSeo, renderTemplate } from "@/lib/seo";
import { buildCustomSchemas, mainEntityId } from "@/lib/schemaTypes";
import { firstBlockEntityId } from "@/lib/blockSchema";
import { columnSizes, contentColumn, resolveDocLayout, resolveDocSpacing, resolveDocStyle } from "@/lib/contentColumn";
import BlockRenderer, { contentHasH1 } from "@/components/frontend/BlockRenderer";
import ContentImage from "@/components/frontend/ContentImage";
import BlogArchive from "@/components/frontend/BlogArchive";
import ContentShell from "@/components/frontend/ContentShell";
import PostTitleBlock from "@/components/frontend/PostTitleBlock";
import PostComments from "@/components/frontend/PostComments";
import { switcherLinks } from "@/lib/translations";
import type { Block } from "@blocknote/core";
import { siteUrl } from "@/lib/siteUrl";
import { robotsDirectives } from "@/lib/seoMeta";
import { isLiveNow } from "@/lib/publishState";

export const revalidate = 3600;


export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const settings = await getSiteSettings();
  // Each language has its own homepage setting, so the metadata has to be read
  // from that language's page rather than from the default's.
  const homepageId = homepageIdFor(lang, settings);

  // Language roots are each other's translations by definition — every
  // configured language has one and it always serves something, whether that
  // is a chosen page or the latest posts. So this needs no `translation_group`
  // and is the same for both branches below. Requiring a link here would leave
  // the most important page on the site with no `hreflang` until someone
  // remembered to connect three homepages by hand.
  // Only roots with something live on them (lib/liveLanguages): a language
  // added a minute ago from "Translate" has only a draft and an empty listing.
  const live = await liveLanguageRoots(settings);
  const rootAlternates: Record<string, string> = Object.fromEntries(
    contentLanguages(settings).filter((code) => live.has(code)).map((code) => [code, rootPath(code, settings)])
  );
  rootAlternates["x-default"] = rootPath(contentLanguages(settings)[0], settings);

  if (homepageId) {
    const page = await db.query.pages.findFirst({ where: eq(pages.id, homepageId) });
    // A draft homepage describes nothing: the metadata follows what is
    // actually served (the latest-posts fallback), not the hidden page.
    if (page && isLiveNow(page.status, page.publishedAt, page.deletedAt)) {
      const homeTitle = page.seoTitle || page.title || settings.site_name || "Home";
      const homeImage = page.ogImage || page.featuredImage || readSeo(settings).seo_og_default_image || autoOgImage(page.seoTitle || page.title || settings.site_name || "", settings);
      const meta = pageMetadata({
        settings,
        language: lang,
        // A homepage answers at its language root whatever its slug says, so
        // the canonical is the root — not `/fr/its-slug`, which only redirects.
        path: rootPath(lang, settings),
        title: homeTitle,
        description: page.seoDescription || settings.site_description,
        images: homeImage ? [homeImage] : [],
        canonicalOverride: page.canonicalUrl,
        // The homepage is the page `hreflang` matters most for, and it had
        // none: only `[...path]` emitted alternates, and a language root is
        // not served by that route.
        languages: rootAlternates,
      });
      // `homeTitle` is already `seoTitle || title || site_name`, so putting
      // `page.title` in front of it here made the SEO title unreachable for
      // the share preview: `<title>` and `twitter:title` used the SEO title
      // while `og:title` and `og:image:alt` used the raw page title. On
      // a live site those were two different strings — the raw title had a
      // missing space that the SEO title did not — and it read as a content
      // typo rather than the CMS ignoring a field. Posts and categories
      // already had this right (`ogTitle || <resolved title>`); this makes
      // pages agree with them.
      const homeShareTitle = page.ogTitle || homeTitle;
      return {
        ...meta,
        // Author-set OG title/description still win over the derived ones.
        openGraph: {
          ...meta.openGraph,
          title: homeShareTitle,
          description: page.ogDescription || page.seoDescription || settings.site_description || undefined,
          ...(homeImage ? { images: [await ogImageDescriptor(homeImage, homeShareTitle)] } : {}),
        },
        robots: robotsDirectives(!page.noIndex, !page.noFollow, page.robotsAdvanced),
      };
    }
  }

  const seo = readSeo(settings);
  const vars = { sitename: settings.site_name || "", sitedesc: settings.site_description || "" };
  const homeTitle =
    renderTemplate(seo.seo_home_title, vars, seo.seo_separator) || settings.site_name || "Home";

  return {
    ...pageMetadata({
      settings,
      language: lang,
      path: rootPath(lang, settings),
      // The plain string here also becomes `og:title`, which wants the readable
      // title rather than a Metadata object.
      title: homeTitle,
      description:
        renderTemplate(seo.seo_home_description, vars, seo.seo_separator) || settings.site_description,
      images: [seo.seo_og_default_image || autoOgImage(settings.site_name || "Home", settings)],
      languages: rootAlternates,
    }),
    // An empty language root — no live homepage and no posts yet — is not
    // worth a place in the index.
    ...(live.has(lang) ? {} : { robots: { index: false, follow: true } }),
    // Absolute: `seo_home_title` already renders the site name, and the layout
    // template would otherwise append it a second time.
    title: { absolute: homeTitle },
  };
}

/**
 * A language's root: `/` for the default language, `/fr` for French.
 *
 * This used to be `/` alone, with the catch-all answering `/fr` separately —
 * two code paths for one concept, which is how `/fr` ended up 404ing when its
 * homepage was still a draft while `/` fell back to a listing. One route now
 * answers every language root, so they cannot drift again.
 */
export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const settings = await getSiteSettings();
  if (!isContentLanguage(lang, settings)) notFound();
  const homepageId = homepageIdFor(lang, settings);

  // Custom page set as homepage
  if (homepageId) {
    const page = await db.query.pages.findFirst({
      where: eq(pages.id, homepageId),
      // For the title area's Meta element, same as the page's own route.
      with: { author: { columns: { name: true } } },
    });

    if (page && isLiveNow(page.status, page.publishedAt, page.deletedAt)) {
      // Empty properties are dropped rather than emitted as "". A blank
      // structured-data field asserts the page has no description instead of
      // leaving the question open. `inLanguage` is the structured-data half of
      // `<html lang>`, and the homepage's URL is its language root.
      // Written the way Next writes the canonical, og:url and hreflang for the
      // same page: the bare origin for the site root (absoluteUrlFor).
      const root = rootPath(lang, settings);
      const homeUrl = absoluteUrlFor(siteUrl(settings), root);
      const schema: Record<string, unknown> = {};
      for (const [k, v] of Object.entries({
        "@context": "https://schema.org",
        "@type": page.schemaType || "WebPage",
        // The id is a name, not the URL: written `https://x.net/#webpage` like
        // the site's `/#website` and `/#identity`, one format for all three.
        "@id": schemaId.webpage(homeUrl),
        name: page.title,
        description: page.seoDescription,
        inLanguage: lang,
        url: homeUrl,
        datePublished: page.publishedAt ? new Date(page.publishedAt).toISOString() : undefined,
        dateModified: page.updatedAt ? new Date(page.updatedAt).toISOString() : undefined,
        isPartOf: { "@id": schemaId.website(siteUrl(settings)) },
        // …or, with nothing named there, the first App Info / Download Box block (lib/blockSchema).
        ...(() => { const id = mainEntityId(page.schemas, { pageUrl: homeUrl, absolute: (u) => absoluteUrl(u, siteUrl(settings)) }) ?? firstBlockEntityId(page.content, homeUrl); return id ? { mainEntity: { "@id": id } } : {}; })(),
        ...(page.featuredImage ? { primaryImageOfPage: { "@type": "ImageObject", url: absoluteUrl(page.featuredImage, siteUrl(settings)) } } : {}),
      })) {
        if (v === null || v === undefined) continue;
        if (typeof v === "string" && v.trim() === "") continue;
        schema[k] = v;
      }

      // Rendered through ContentShell exactly like the page at its own URL.
      // This branch used to hardcode a 48rem column with its own padding, so
      // every Design setting on the page chosen as homepage — layout, content
      // style, spacing, title, featured image, header/footer, CSS classes,
      // custom CSS and scripts — was silently ignored on the one page that
      // gets the most traffic, while the editor canvas honoured them.
      const hideTitle = page.showTitle === "disable";
      const hideFeaturedImg = !showsFeaturedImage("page", page.showFeaturedImage, settings);
      const col = contentColumn(resolveDocLayout("page", page.postLayout, settings), { spacing: resolveDocSpacing("page", page.verticalSpacing, settings), style: resolveDocStyle("page", page.contentStyle, settings) });

      return (
        <ContentShell
          design={page}
          kind="page"
          pageType="front"
          documentContent={JSON.stringify(page.content ?? null)}
          currentPath={lang === defaultContentLanguage(settings) ? "/" : `/${lang}`}
          language={lang}
          direction={page.direction}
          switcherTargets={await switcherLinks("page", page, settings)}
          scriptHead={page.scriptHead}
          scriptBodyEnd={page.scriptBodyEnd}
          customCss={page.customCss}
        >
          <OgProperties updatedAt={page.updatedAt} />
          {/* Structured data the author added under SEO → Schema. */}
          {buildCustomSchemas(page.schemas, { pageUrl: homeUrl, absolute: (u) => absoluteUrl(u, siteUrl(settings)) }).map((s, i) => (
            <script key={`cs${i}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(s) }} />
          ))}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLd(schema) }}
          />
          {!hideTitle ? (
            <PostTitleBlock
              kind="page"
              as={contentHasH1(page.content) ? "p" : "h1"}
              title={page.title}
              publishedAt={page.publishedAt}
              authorName={page.author?.name}
              language={lang}
              dateText={formatSiteDate(page.publishedAt, settings, lang)}
              homeHref={root}
            />
          ) : (
            // Hidden visually, not removed: the document still needs one
            // programmatic heading. Falls back to the site name, because an
            // empty `<h1>` is barely better than none.
            !contentHasH1(page.content) && <h1 className="sr-only">{page.title?.trim() || settings.site_name || "Home"}</h1>
          )}
          {!hideFeaturedImg && page.featuredImage && (
            // The homepage's featured image is the site's most-viewed LCP
            // element, so it is the last place to serve an unoptimised file.
            <ContentImage
              priority
              src={page.featuredImage}
              alt={page.title}
              sizes={columnSizes(col)}
              className="w-full aspect-video object-cover rounded-xl mb-10"
            />
          )}
          <div className="max-w-none" data-page-body>
            <BlockRenderer blocks={(page.content as Block[]) ?? []} language={page.language} direction={page.direction} title={page.title} pageUrl={homeUrl} column={col} />
          </div>
          {(page.showComments === "enable" ||
            (page.showComments !== "disable" && settings.page_comments_show === "true")) && (
            <PostComments pageId={page.id} language={page.language} />
          )}
        </ContentShell>
      );
    }
  }

  // No page chosen: the front page is the latest posts, paginated at
  // `/page/2` — the same listing WordPress shows on a fresh install.
  return (
    <BlogArchive
      page={1}
      title={settings.site_name || "Latest posts"}
      description={settings.site_description || undefined}
      base={lang === defaultContentLanguage(settings) ? "/" : `/${lang}`}
      language={lang}
      pageType="front"
    />
  );
}
