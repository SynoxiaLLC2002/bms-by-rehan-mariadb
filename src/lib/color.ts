// Choosing text that can be read on a colour the owner picked.
//
// The theme used to write `color:#fff` next to every
// `background:var(--color-primary)`. That is correct for a dark brand colour
// and invisible for a light one — and nothing stopped anyone picking a light
// one. A live site set `--color-primary: #ffffff`, which made the generic
// `.btn` and `.bmsbtn.is-fill` white on white: the 404 page's "بحث" and
// "العودة إلى الرئيسية" buttons were there, focusable, and could not be seen.
//
// This is a CMS for people who are not going to reason about contrast ratios,
// so the theme works it out. A control whose label cannot be read is the same
// class of problem as a switch that does nothing: the admin did what the
// interface allowed and got something broken.
//
// The maths is WCAG 2.1's relative luminance, the same one the contrast
// checks in the Customizer use. Anything this cannot parse — `rgb()`, a CSS
// variable, a named colour — returns "" so the caller keeps its own default
// rather than guessing.

/** The dark option. Near-black, but not pure, so it matches the body text. */
const DARK = "#111827";
const LIGHT = "#ffffff";

/** `#abc` / `#aabbcc` → [r, g, b] 0–255, or null for anything else. */
function parseHex(value: string): [number, number, number] | null {
  const hex = value.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(hex)) return null;
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two luminances, 1–21. */
function ratio(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Text that can be read on this background: white where white works, dark
 * where it does not.
 *
 * Deliberately biased towards white rather than towards the better ratio: it
 * keeps white wherever white is legible, so a site whose brand colour already
 * works is not restyled to chase a higher number.
 *
 * Note that this does still change the stock `#0ea5e9` primary from white
 * text to dark. That is not a side effect to undo — white on that blue is
 * 2.6:1, which fails even the 3:1 allowed for large bold text. The default
 * was a mild contrast failure of its own, and white on a *white* primary was
 * the total one.
 *
 * `minRatio` is WCAG's 3:1 for large or bold text. Button and chip labels are
 * bold; pass 4.5 for anything set at body size and weight.
 *
 * Returns "" when `background` is not a hex colour, so callers keep whatever
 * default they had rather than this inventing an answer.
 */
export function readableOn(background: string | undefined | null, minRatio = 3): string {
  const rgb = parseHex(String(background ?? ""));
  if (!rgb) return "";
  const l = luminance(rgb);
  return ratio(l, luminance([255, 255, 255])) >= minRatio ? LIGHT : DARK;
}

/**
 * The contrast ratio between two hex colours, or null if either is unparseable.
 *
 * Exposed for the Customizer's own warnings — WCAG wants 4.5 for body text and
 * 3 for large or bold text, which is most button labels.
 */
export function contrastRatio(a: string, b: string): number | null {
  const one = parseHex(a);
  const two = parseHex(b);
  if (!one || !two) return null;
  return ratio(luminance(one), luminance(two));
}
