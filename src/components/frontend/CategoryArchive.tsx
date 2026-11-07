import Link from "next/link";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import type { SiteSettings } from "@/lib/settings";
import BlogArchive, { archivePageCount } from "@/components/frontend/BlogArchive";
import { readSeo, renderTemplate, twitterSite } from "@/lib/seo";
import { categoryPath } from "@/lib/permalinks";
import { ogLocale, termRobots, autoOgImage, deriveDescription, ogImageDescriptor, robotsDirectives, twitterImage } from "@/lib/seoMeta";
import { termAlternateLanguages } from "@/lib/translations";
import { archiveText } from "@/lib/archiveText";

/**
 * One category archive — the metadata and the page — shared by the two
 * addresses it can live at: `/category/<slug>` and, with the category base
 * removed, `/<slug>` (served by the catch-all). One implementation, so the
 * setting changes the URL and nothing else.
 */
export type CategoryRow = typeof categories.$inferSelect;

export async function categoryArchiveMetadata(category: CategoryRow, lang: string, settings: SiteSettings, page = 1): Promise<Metadata> {
  const seo = readSeo(settings);
  const base = categoryPath(category.slug, lang, settings);
  // Page 2 onwards used to return a bare "Name — page N" outside the title
  // template, with no description, no share tags and no hreflang. It is the
  // same archive; only the title's suffix, the canonical and the robots
  // toggle differ, so it is built by the same code with those three adjusted.
  const paged = page > 1;
  // The suffix in the archive's own language (" · page 2 of 5"), from the
  // same table the listing prints it from — one COUNT, on paginated pages only.
  const pageSuffix = paged ? archiveText(lang).pageOf(page, await archivePageCount(lang, category.id)) : "";
  const path = paged ? `${base}/page/${page}` : base;

  const vars = {
    term: `${category.name}${pageSuffix}`,
    term_description: category.description || "",
    sitename: settings.site_name || "",
    sitedesc: settings.site_description || "",
  };

  // The term's own fields win over the site-wide template: a category that
  // has been given its own title has been given it precisely because the
  // template was wrong for that one.
  const title =
    (category.seoTitle ? `${category.seoTitle}${pageSuffix}` : "") ||
    renderTemplate(seo.seo_category_title, vars, seo.seo_separator) ||
    `${category.name}${pageSuffix}`;
  // Same chain a post has. It used to stop after the template, so a term with
  // no description of its own shipped with no meta description at all and
  // Google wrote the snippet from the category chips.
  const description = deriveDescription(
    category.seoDescription,
    renderTemplate(seo.seo_category_description, vars, seo.seo_separator),
    category.description,
    settings.site_description
  )?.concat(paged ? pageSuffix : "");

  const shareImage = category.ogImage || autoOgImage(category.name, settings, "Category");
  // Linked terms in other languages — the same `hreflang` a document gets.
  const languages = await termAlternateLanguages("category", category, settings);

  return {
    title: { absolute: title },
    description,
    alternates: {
      // Self-referencing canonical unless the term points elsewhere — the only
      // reason that field exists is to point a duplicate archive at the
      // original. A paginated page is its own canonical, like the front page's.
      canonical: paged ? path : category.canonicalUrl || base,
      // Only the first page has translations to point at: `/page/2` of one
      // language is not the same document as `/page/2` of another.
      ...(languages && !paged ? { languages } : {}),
    },
    robots: paged
      ? robotsDirectives(seo.seo_paginated_noindex !== "true" && !category.noIndex, !category.noFollow)
      : termRobots(category, seo.seo_category_noindex !== "true"),
    openGraph: {
      title: category.ogTitle || title,
      description: category.ogDescription || description,
      url: path,
      siteName: settings.site_name || undefined,
      type: "website",
      locale: ogLocale(lang),
      // Through the same descriptor a page or post uses: it swaps a WebP
      // upload for the JPEG copy Facebook and X can actually read, and adds
      // the type, the dimensions and the alt text. A term archive emitted a
      // bare `og:image` and none of that, so the one place a category is
      // shared from was the one place the share preview could come back empty.
      images: [await ogImageDescriptor(shareImage, category.ogTitle || title)],
    },
    twitter: {
      site: twitterSite(settings),
      card: "summary_large_image",
      title: category.ogTitle || title,
      description: category.ogDescription || description,
      images: [twitterImage(shareImage, category.ogTitle || title)],
    },
  };
}

export default async function CategoryArchive({ category, lang, settings, page = 1 }: { category: CategoryRow; lang: string; settings: SiteSettings; page?: number }) {
  // The hierarchy, made visible: a parent shows as a trail above the title;
  // children show as links under the description, because a parent category's
  // whole job is to lead somewhere more specific.
  const [parent, children] = await Promise.all([
    category.parentId
      ? db.query.categories.findFirst({ where: eq(categories.id, category.parentId), columns: { name: true, slug: true } })
      : Promise.resolve(undefined),
    db.query.categories.findMany({ where: eq(categories.parentId, category.id), columns: { id: true, name: true, slug: true } }),
  ]);

  return (
    <BlogArchive
      page={page}
      language={lang}
      direction={category.direction}
      categoryId={category.id}
      title={category.name}
      description={category.description}
      intro={
        parent ? (
          <nav className="archive-parent mb-3 text-xs uppercase tracking-wider opacity-50">
            <Link href={categoryPath(parent.slug, lang, settings)} className="hover:opacity-100">
              {parent.name}
            </Link>
          </nav>
        ) : null
      }
      outro={
        children.length > 0 ? (
          <div className="archive-children mt-5 flex flex-wrap justify-center gap-2">
            {children.map((c) => (
              <Link
                key={c.id}
                href={categoryPath(c.slug, lang, settings)}
                className="archive-chip rounded-full px-3 py-1 text-xs"
              >
                {c.name}
              </Link>
            ))}
          </div>
        ) : null
      }
      term={category}
      base={categoryPath(category.slug, lang, settings)}
    />
  );
}
