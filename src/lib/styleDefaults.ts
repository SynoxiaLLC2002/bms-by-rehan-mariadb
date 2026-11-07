import type { CSSProperties } from "react";

/**
 * A style object minus the values a stylesheet rule already supplies.
 *
 * The block resolvers (`resolveSection`, `textAdvancedTextStyle`, …) return a
 * complete style, defaults included, because the editor canvas renders the
 * element live and needs everything on it. The published page does not: it
 * has a stylesheet, and a default written inline on every element is the
 * same bytes parsed once per element instead of once per page. Measured on
 * one real article — 384 inline style attributes, 41 distinct.
 *
 * So the public renderer keeps the shared resolvers untouched and strips the
 * defaults at the call site, with the same values placed once in the block's
 * CSS. A value is removed when it *equals* the default, not when it was left
 * unset: the editor stores some defaults explicitly, and those must not come
 * back as inline style either.
 *
 * The cascade holds. An inline default beat the theme's element rules; the
 * class rule that replaces it (0,1,0) beats them too; and anything the author
 * did change stays inline and still beats the class.
 */
export function withoutDefaults(
  style: CSSProperties | undefined,
  defaults: Partial<Record<keyof CSSProperties, unknown>>
): CSSProperties | undefined {
  if (!style) return style;
  const out = { ...(style as Record<string, unknown>) };
  for (const [key, value] of Object.entries(defaults)) {
    if (out[key] === value || out[key] === undefined) delete out[key];
  }
  return out as CSSProperties;
}

/** True when nothing is left to write inline. */
export function isEmptyStyle(style: CSSProperties | undefined): boolean {
  return !style || Object.values(style).every((v) => v === undefined);
}
