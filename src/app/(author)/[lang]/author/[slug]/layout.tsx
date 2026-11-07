import { decodeSegment } from "@/lib/permalinks";
import type { Metadata, Viewport } from "next";
import "../../../../site.css";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { iconLinks, themeColorFor } from "@/lib/siteIcon";
import { documentDir, isContentLanguage, defaultContentLanguage } from "@/lib/locale";

/**
 * Root layout for one author page — its own group so `<html>` can carry the
 * language and direction *that account* chose.
 *
 * The site's own root layout is one per language: it sees `[lang]` and nothing
 * else, so every page under it gets the URL's language on `<html>` whatever
 * the document itself says. An author page is the one document that answers at
 * every language's address at once, so for it that is the wrong answer — and a
 * layout cannot read its child page's data to find the right one.
 *
 * This layout sits deep enough to receive `[slug]` as well as `[lang]`, so it
 * can read the account directly and write the real values server-side, with no
 * client-side correction and without making any other page dynamic. Same move
 * `(preview)/preview/[type]/[id]` already makes for the same reason.
 *
 * Being a root layout, it repeats the font, stylesheet and document-level
 * metadata the site layout sets. Anything changed there wants changing here.
 */

/** The account's own language/direction, or the URL's when it has chosen none. */
async function authorDocument(lang: string, slug: string) {
  const settings = await getSiteSettings();
  const urlLang = isContentLanguage(lang, settings) ? lang : defaultContentLanguage(settings);
  try {
    const author = await db.query.users.findFirst({
      where: and(eq(users.slug, slug), eq(users.publicProfile, true)),
      columns: { language: true, direction: true },
    });
    const language = author?.language || urlLang;
    return { language, dir: documentDir(language, settings, author?.direction) };
  } catch {
    // A page that cannot reach the database still has to render its shell.
    return { language: urlLang, dir: documentDir(urlLang, settings) };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  // Never the product's own name: an unnamed site was publishing
  // "Next CMS" as its title to search engines and browser tabs.
  const name = s.site_name || "";
  return {
    // Relative URLs in the page's own metadata — canonical, og:image —
    // resolve against this. Without it they resolve against localhost.
    metadataBase: new URL(siteUrl(s)),
    title: name ? { default: name, template: `%s | ${name}` } : { default: "", template: "%s" },
    // Same rule as the site layout: no vendor fallback.
    description: s.site_description || undefined,
    // Derived sizes rather than the upload itself — see siteIcon.ts.
    icons: iconLinks(s),
  };
}

export async function generateViewport(): Promise<Viewport> {
  const s = await getSiteSettings();
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: themeColorFor(s),
  };
}

export default async function AuthorRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  const decodedSlug = decodeSegment(slug);
  const { language, dir } = await authorDocument(lang, decodedSlug);

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
