import Link from "next/link";
import type { Metadata } from "next";
import SiteLayout from "@/components/frontend/SiteLayout";
import ReportNotFound from "@/components/frontend/ReportNotFound";
import { readSeo, renderTemplate } from "@/lib/seo";
import { getSiteSettings } from "@/lib/settings";
import { defaultContentLanguage } from "@/lib/locale";
import { searchPath } from "@/lib/permalinks";
import { notFoundText } from "@/lib/notFoundText";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const seo = readSeo(settings);
  const title = renderTemplate(
    seo.seo_404_title,
    { sitename: settings.site_name || "", sitedesc: settings.site_description || "" },
    seo.seo_separator
  );
  // `absolute`: the template already ends in the site name, and the layout's
  // `%s | <site>` template would append it a second time ("… - Site | Site").
  // No `robots` here: Next adds `<meta name="robots" content="noindex">` to
  // every 404 response itself, and a second robots meta is what showed up.
  return {
    title: title ? { absolute: title } : notFoundText(defaultContentLanguage(settings)).title,
  };
}

export default async function NotFound() {
  // `not-found` receives no params, so the page's own language is not known
  // here; the site's default language is the right answer for almost every
  // mistyped link, and is what the header and footer below use too.
  const settings = await getSiteSettings();
  const lang = defaultContentLanguage(settings);
  const t = notFoundText(lang);
  return (
    // Linked, not inlined: this component is embedded in every page's data
    // under this segment — see `linkedAssets` in SiteLayout.
    <SiteLayout pageType="404" linkedAssets language={lang}>
      <ReportNotFound />
      <div className="max-w-xl mx-auto px-4 py-24 text-center">
        <p className="text-7xl font-bold opacity-50 mb-4">404</p>
        <h1 className="text-3xl font-bold mb-3">{t.title}</h1>
        <p className="opacity-60 mb-8">{t.body}</p>

        <form action={searchPath(lang, settings)} className="flex gap-2 max-w-sm mx-auto mb-8">
          <input
            type="search"
            name="q"
            placeholder={t.placeholder}
            aria-label={t.search}
            className="flex-1 text-sm border border-black/10 rounded-lg px-3 py-2 bg-black/5 focus:outline-none focus:border-black/25"
          />
          <button type="submit" className="btn">{t.search}</button>
        </form>

        <div className="flex items-center justify-center gap-4 text-sm">
          <Link href="/" className="btn">{t.home}</Link>
        </div>
      </div>
    </SiteLayout>
  );
}
