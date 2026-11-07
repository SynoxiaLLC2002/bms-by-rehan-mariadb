import type { Metadata, Viewport } from "next";
import "../../site.css";
import { getSiteSettings } from "@/lib/settings";
import { BUILD_WITHOUT_DATABASE } from "@/lib/prerender";
import { siteUrl } from "@/lib/siteUrl";
import { iconLinks, themeColorFor } from "@/lib/siteIcon";
import {
  contentLanguages,
  defaultContentLanguage,
  isContentLanguage,
  languageDir,
  siteDir,
} from "@/lib/locale";

/**
 * The public site's root layout — one per language.
 *
 * `<html lang>` has to name the language of the document, and a layout can only
 * know that if the language is a real route segment. It was not: every route
 * sat under one root layout that could not see the URL, so `/fr` and `/ur` both
 * served `lang="en" dir="ltr"` — wrong for translation, hyphenation and screen
 * readers, and for Urdu it laid a right-to-left language out left-to-right.
 *
 * So the language is a segment now, and the middleware rewrites public URLs
 * onto it: `/about` → `/en/about`, while `/fr/about` already matches. The
 * address bar is untouched — the default language stays unprefixed — and
 * because `lang` is a param rather than a header, every page still prerenders.
 *
 * The admin has its own root layout under `(admin)`, which is why there is no
 * `app/layout.tsx` any more: two root layouts, one per area.
 */
export async function generateStaticParams() {
  if (BUILD_WITHOUT_DATABASE) return [];
  try {
    return contentLanguages(await getSiteSettings()).map((lang) => ({ lang }));
  } catch {
    return [{ lang: "en" }];
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  // Never the product's own name: an unnamed site was publishing
  // "Next CMS" as its title to search engines and browser tabs.
  const name = s.site_name || "";
  return {
    // Every relative URL in a metadata export resolves against this — the
    // canonical tag, and `og:image` for a featured image stored as
    // `/uploads/…`. Unset, Next resolves them against localhost and says so
    // only as a build-time warning, so social previews on the live site
    // pointed at a machine nobody else could reach.
    metadataBase: new URL(siteUrl(s)),
    title: name ? { default: name, template: `%s | ${name}` } : { default: "", template: "%s" },
    // No vendor fallback. A page that sets no description of its own (search,
    // a 404) inherits this, and "Powered by Next CMS" was going out as the
    // meta description of every one of them. Nothing is better than that.
    description: s.site_description || undefined,
    // A site with no icon of its own still gets one, so the browser's request
    // for /favicon.ico is not a 404 on every single page view.
    // Derived sizes rather than the upload itself — see siteIcon.ts.
    icons: iconLinks(s),
    // Search-engine ownership proofs. Each is the bare token; the SEO screen
    // strips a pasted tag down to it. Absent ones emit nothing.
    verification: verificationTags(s),
  };
}

/**
 * The `<meta name="…-verification">` tags, from SEO → Webmaster Tools.
 *
 * Google and Yandex have first-class keys in Next's metadata; Bing and
 * Pinterest go through `other`, keyed by the exact `name` each service asks
 * for. Only set values are emitted — an empty token would be a tag that says
 * "verified by nobody".
 */
function verificationTags(s: Awaited<ReturnType<typeof getSiteSettings>>): Metadata["verification"] {
  const google = (s.seo_verify_google ?? "").trim();
  const yandex = (s.seo_verify_yandex ?? "").trim();
  const bing = (s.seo_verify_bing ?? "").trim();
  const pinterest = (s.seo_verify_pinterest ?? "").trim();
  const other: Record<string, string> = {};
  if (bing) other["msvalidate.01"] = bing;
  if (pinterest) other["p:domain_verify"] = pinterest;
  if (!google && !yandex && !bing && !pinterest) return undefined;
  return {
    ...(google ? { google } : {}),
    ...(yandex ? { yandex } : {}),
    ...(Object.keys(other).length ? { other } : {}),
  };
}

/**
 * `theme-color` tints the browser chrome around the page on mobile. It follows
 * the header's background (see themeColorFor) so the bar continues the
 * header. Next wants this in the viewport export, not in metadata.
 */
export async function generateViewport(): Promise<Viewport> {
  const s = await getSiteSettings();
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: themeColorFor(s),
  };
}

export default async function SiteRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const settings = await getSiteSettings();

  // Never `notFound()` here. The middleware already guarantees this segment is
  // a configured language -- an unknown first segment is rewritten *into* the
  // default language rather than passed through, so `/zz/blog` arrives as
  // `en/zz/blog` and 404s at the page, where it should. Throwing from the root
  // layout instead broke the 404 itself: rendering not-found re-enters this
  // layout, the throw aborted it, and Next fell back to its own bare `<html>`,
  // so the custom 404 page lost its language and direction.
  const language = isContentLanguage(lang, settings) ? lang : defaultContentLanguage(settings);

  // The site-wide direction setting still wins for the default language, so an
  // author who set it explicitly keeps that. Other languages derive their own —
  // a French page on an Urdu-default site is still left-to-right.
  const dir =
    language === defaultContentLanguage(settings) ? siteDir(settings) : languageDir(language);

  return (
    <html lang={language} dir={dir}>
      {/* No next/font here: it preloaded 48 KB of Inter on every page while
          the theme's own font (Customize → Typography) was what actually
          rendered. The body font, Inter when none is chosen, comes through
          SiteLayout's Google Fonts pipeline — inlined CSS, files served from
          this domain, and a preload for the weight the page uses. */}
      <body>{children}</body>
    </html>
  );
}
