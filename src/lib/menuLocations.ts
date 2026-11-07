// Menu locations this theme actually renders. Each one is consumed somewhere in
// SiteLayout — no location is listed that the site would silently ignore.

export const MENU_LOCATIONS: { id: string; label: string; description: string }[] = [
  { id: "primary",   label: "Primary",              description: "Primary Navigation item in the header builder" },
  { id: "secondary", label: "Secondary",            description: "Secondary Navigation item in the header builder" },
  { id: "mobile",    label: "Mobile",               description: "Header navigation below the mobile breakpoint" },
  { id: "footer",    label: "Footer",               description: "Footer Navigation item in the footer builder" },
];

/**
 * The setting a location's menu is stored under.
 *
 * A language may assign its own menu to each location: `menu_loc_primary` is
 * the default language's, `menu_loc_primary_fr` is French. Deliberately a
 * per-language *assignment* rather than a `language` column on `menus` — a menu
 * is just a list of links, and this way one menu can be shared by two languages
 * where that makes sense, with no migration and no menu that exists only to be
 * a copy.
 */
export const locationKey = (id: string, language?: string) =>
  language ? `menu_loc_${id}_${language}` : `menu_loc_${id}`;

/**
 * Menu id assigned to a location, for a language.
 *
 * Falls back in the order that keeps a site working while it is being
 * translated: this language's menu for this location, then the default
 * language's, then Primary, then whatever menu exists. Without the fallback a
 * language with no menu assigned would render a header with no navigation at
 * all, which looks broken rather than untranslated.
 */
export function menuIdForLocation(
  settings: Record<string, string>,
  location: string,
  fallbackMenuId?: number | null,
  language?: string
): number | null {
  if (language) {
    const perLanguage = parseInt(settings[locationKey(location, language)] ?? "");
    if (!Number.isNaN(perLanguage)) return perLanguage;
  }
  const direct = parseInt(settings[locationKey(location)] ?? "");
  if (!Number.isNaN(direct)) return direct;
  if (location !== "primary") {
    if (language) {
      const primaryLang = parseInt(settings[locationKey("primary", language)] ?? "");
      if (!Number.isNaN(primaryLang)) return primaryLang;
    }
    const primary = parseInt(settings[locationKey("primary")] ?? "");
    if (!Number.isNaN(primary)) return primary;
  }
  return fallbackMenuId ?? null;
}
