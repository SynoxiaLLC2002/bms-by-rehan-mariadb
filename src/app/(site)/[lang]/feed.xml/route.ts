import { notFound } from "next/navigation";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { contentLanguages, isContentLanguage, defaultContentLanguage } from "@/lib/locale";
import { buildFeed, feedHeaders } from "@/lib/feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * A non-default language's feed: `/fr/feed.xml`.
 *
 * The default language's feed stays at the root `/feed.xml`, so subscriptions
 * made before languages existed keep working. This route is reached directly
 * rather than through the middleware rewrite — the matcher skips anything with
 * a file extension — which is why `/fr/feed.xml` needs a real route here.
 */
export async function generateStaticParams() {
  try {
    const settings = await getSiteSettings();
    const [defaultLang] = contentLanguages(settings);
    return contentLanguages(settings)
      .filter((lang) => lang !== defaultLang)
      .map((lang) => ({ lang }));
  } catch {
    return [];
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lang: string }> }
) {
  const { lang } = await params;
  const settings = await getSiteSettings();

  // The default language is served by the root route; answering here too would
  // put the same feed at two addresses.
  if (!isContentLanguage(lang, settings) || lang === defaultContentLanguage(settings)) {
    notFound();
  }

  return new Response(await buildFeed(lang, settings, siteUrl(settings)), {
    headers: await feedHeaders(),
  });
}
