// Conditional headers: change how the header behaves on specific kinds of page
// without maintaining a whole second header.
//
// A rule targets a page type and overrides a small set of header settings. The
// overrides are merged into the settings map *before* any CSS is built, so a
// rule changes the header exactly the way the Customizer would have.

export const PAGE_TYPES = [
  { id: "front",    label: "Front page" },
  { id: "blog",     label: "Blog index" },
  { id: "post",     label: "Single post" },
  { id: "page",     label: "Single page" },
  { id: "category", label: "Category archive" },
  { id: "search",   label: "Search results" },
  { id: "404",      label: "404 page" },
] as const;

export type PageType = (typeof PAGE_TYPES)[number]["id"] | "default";

/** The header settings a rule is allowed to change. */
export const CONDITION_KEYS = [
  "header_transparent",
  "header_sticky",
  "hrow_main_bg",
  "header_text_color",
  "header_height",
  "hide_header",
] as const;

export type ConditionKey = (typeof CONDITION_KEYS)[number];

export interface HeaderCondition {
  id: string;
  name: string;
  when: string;
  overrides: Partial<Record<ConditionKey, string>>;
}

export function parseConditions(raw: string): HeaderCondition[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? (v as HeaderCondition[]) : [];
  } catch {
    return [];
  }
}

/**
 * Merges any rule matching this page type into the settings.
 *
 * Later rules win, so the list reads top-to-bottom like CSS. Empty override
 * values are skipped rather than blanking the base setting.
 */
export function applyConditions(
  settings: Record<string, string>,
  pageType: PageType
): Record<string, string> {
  const rules = parseConditions(settings.header_conditions || "");
  if (rules.length === 0 || pageType === "default") return settings;

  const matching = rules.filter((r) => r.when === pageType);
  if (matching.length === 0) return settings;

  const out = { ...settings };
  for (const rule of matching) {
    for (const [key, value] of Object.entries(rule.overrides || {})) {
      if (value !== undefined && value !== "") out[key] = value;
    }
  }
  return out;
}
