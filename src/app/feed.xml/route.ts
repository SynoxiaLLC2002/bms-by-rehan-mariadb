import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { defaultContentLanguage } from "@/lib/locale";
import { buildFeed, feedHeaders } from "@/lib/feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The default language's feed.
 *
 * Unprefixed, so a subscription made before the site had languages keeps
 * working. Every other language has its own at `/<code>/feed.xml`; the shared
 * builder is in `@/lib/feed`.
 */
export async function GET() {
  const settings = await getSiteSettings();
  return new Response(
    await buildFeed(defaultContentLanguage(settings), settings, siteUrl(settings)),
    { headers: await feedHeaders() }
  );
}
