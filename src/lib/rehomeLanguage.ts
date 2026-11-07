import { getSiteSettings } from "@/lib/settings";
import { isContentLanguage } from "@/lib/locale";

/**
 * The language a saved document may move to, or null when it stays put.
 *
 * Content is partitioned by language, so a move is not a cosmetic edit: the
 * document leaves one set of listings, links and cached paths for another.
 * The update routes take care of that (slug re-checked in the new language,
 * old address redirected, category dropped when it belongs to the old
 * language). What is refused here is only a move into a language the site
 * does not publish — that would strand the document with no public address,
 * which is exactly the state the Language control exists to get out of.
 */
export async function rehomeLanguage(
  current: string | null | undefined,
  requested: unknown
): Promise<string | null> {
  if (typeof requested !== "string" || !current || requested === current) return null;
  const settings = await getSiteSettings();
  return isContentLanguage(requested, settings) ? requested : null;
}
