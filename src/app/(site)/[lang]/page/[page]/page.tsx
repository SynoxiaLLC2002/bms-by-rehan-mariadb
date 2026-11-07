import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BlogArchive, { archivePageCount } from "@/components/frontend/BlogArchive";
import { getSiteSettings } from "@/lib/settings";
import { isContentLanguage } from "@/lib/locale";
import { homepageId, rootPath } from "@/lib/permalinks";
import { readSeo, renderTemplate } from "@/lib/seo";
import { autoOgImage, pageMetadata, robotsDirectives } from "@/lib/seoMeta";
import { archiveText } from "@/lib/archiveText";

export const revalidate = 3600;

/**
 * Page 2 onwards of the front page's post listing — `/page/2`, `/fr/page/2`.
 *
 * Exists only while the front page shows the latest posts. Once a page is
 * chosen as the homepage there is nothing to paginate here, and the URL
 * answers 404 the way it does on WordPress.
 */
type Params = { params: Promise<{ lang: string; page: string }> };


export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { lang, page } = await params;
  const settings = await getSiteSettings();
  if (!isContentLanguage(lang, settings) || homepageId(lang, settings)) return {};
  const root = rootPath(lang, settings);
  const n = parseInt(page, 10);
  const seo = readSeo(settings);
  const vars = { sitename: settings.site_name || "", sitedesc: settings.site_description || "" };
  // The homepage's own title template, with the page suffix in the archive's
  // language — this used to be an English "— Page 2" glued to the site name,
  // outside the template, with no description and no share tags.
  const homeTitle = renderTemplate(seo.seo_home_title, vars, seo.seo_separator) || settings.site_name || "Latest posts";
  const title = `${homeTitle}${archiveText(lang).pageOf(n, await archivePageCount(lang))}`;
  const path = `${root === "/" ? "" : root}/page/${page}`;
  return {
    ...pageMetadata({
      settings,
      language: lang,
      path,
      title,
      description: `${renderTemplate(seo.seo_home_description, vars, seo.seo_separator) || settings.site_description || ""}${archiveText(lang).pageOf(n, await archivePageCount(lang))}`,
      images: [seo.seo_og_default_image || autoOgImage(settings.site_name || "Home", settings)],
    }),
    title: { absolute: title },
    robots: robotsDirectives(seo.seo_paginated_noindex !== "true", true),
  };
}

export default async function FrontPaged({ params }: Params) {
  const { lang, page } = await params;
  const settings = await getSiteSettings();
  if (!isContentLanguage(lang, settings) || homepageId(lang, settings)) notFound();
  const n = parseInt(page, 10);
  // Digits only: `parseInt` reads `2abc` and `02` as 2, which served page 2
  // at any number of addresses.
  if (!/^[1-9]\d*$/.test(page) || n < 2 || n > (await archivePageCount(lang))) notFound();
  return (
    <BlogArchive
      page={n}
      title={settings.site_name || "Latest posts"}
      description={settings.site_description || undefined}
      base={rootPath(lang, settings)}
      language={lang}
      pageType="front"
    />
  );
}
