// Text Advanced: one place that decides how the block looks.
//
// The wrapper and text styles used to exist twice — once in `customBlocks.tsx`
// for the canvas and again, hand-copied, inside `BlockRenderer`'s switch for the
// published page. Two copies of the same rules is how a block ends up looking
// one way while you edit it and another way once it is live, so both now call
// these.

import type { CSSProperties } from "react";
import { withoutDefaults } from "./styleDefaults";

type Props = Record<string, string>;

/**
 * Default size for each tag, used only when no explicit size is set.
 *
 * Changing the tag from `p` to `h2` produced an `<h2>` that was exactly the
 * size of the paragraph before it: Tailwind's preflight resets every heading to
 * `font-size: inherit`, and this block emitted a `font-size` only when one had
 * been typed in by hand. So the control worked and nothing moved — the reason
 * "heading change karne pr size change nahi hota".
 *
 * `em` rather than `px` so the block still scales with the surrounding text and
 * with the site's base font size, and so an author who does set an explicit
 * size still overrides it cleanly.
 */
export const TA_TAG_SIZES: Record<string, string> = {
  h1: "2.25em",
  h2: "1.75em",
  h3: "1.5em",
  h4: "1.25em",
  h5: "1.1em",
  h6: "1em",
};

/** Headings also carry their own weight and rhythm, or they read as body text. */
const TA_TAG_WEIGHT = "700";
const TA_TAG_LINE_HEIGHT = "1.25";

const isHeading = (tag: string) => tag in TA_TAG_SIZES;

const px = (v: string | undefined) => (v ? `${v}px` : undefined);

/**
 * One border side.
 *
 * A single `border` shorthand meant one colour for all four edges. An underline
 * under a heading, a left rule beside a quote, a box with one accent edge — all
 * of those need the sides to differ, which is why per-side values exist at all.
 * Each side falls back to the all-sides value, so a block styled before this
 * existed keeps rendering exactly as it did.
 */
function side(p: Props, name: "Top" | "Right" | "Bottom" | "Left"): string | undefined {
  const width = p[`border${name}Width`] || p.borderWidth;
  // "0" is a width too — an edge switched off — and it used to go out as
  // `border-top:0px solid #fff`: a declaration that draws nothing.
  if (!width || !parseFloat(width)) return undefined;
  const style = p[`border${name}Style`] || p.borderStyle || "solid";
  const color = p[`border${name}Color`] || p.borderColor || "#e2e8f0";
  return `${width}px ${style} ${color}`;
}

/**
 * The inset every Text Advanced block carries when none is set, and the least
 * height it keeps when it has no text yet.
 *
 * The canvas gave its wrapper `px-1 py-0.5 min-h-[1.5em]` so a block could be
 * clicked and typed into before it had any text; the published page gave it
 * nothing. So a red-background heading was a full bar in the editor and, with
 * its text not typed yet, a collapsed line on the page — and the ones with text
 * were a few pixels tighter than the author had been looking at. Both come from
 * here now.
 */
const DEFAULT_PAD_Y = "2px";
const DEFAULT_PAD_X = "4px";

/** Block-level styles: background, border, spacing, alignment, width. */
export function textAdvancedWrapStyle(p: Props): CSSProperties {
  const s: CSSProperties = {
    // "left" is the block's default, and on an Arabic page it pinned every
    // paragraph to the wrong side. It now means "where lines start": left in
    // English, right in Arabic. An explicit Right or Center is kept as chosen.
    textAlign: (!p.align || p.align === "left" ? "start" : p.align) as CSSProperties["textAlign"],
    backgroundColor: p.bgColor || undefined,
    borderRadius: px(p.borderRadius),
    paddingTop: px(p.paddingTop) ?? DEFAULT_PAD_Y,
    paddingRight: px(p.paddingRight) ?? DEFAULT_PAD_X,
    paddingBottom: px(p.paddingBottom) ?? DEFAULT_PAD_Y,
    paddingLeft: px(p.paddingLeft) ?? DEFAULT_PAD_X,
    marginTop: px(p.marginTop),
    marginBottom: px(p.marginBottom),
    maxWidth: p.maxWidth ? `${p.maxWidth}${p.maxWidthUnit || "%"}` : undefined,
    writingMode: (p.orientation === "vertical" ? "vertical-rl" : undefined) as CSSProperties["writingMode"],
  };

  // Written per side rather than as one shorthand so a single edge can differ.
  s.borderTop = side(p, "Top");
  s.borderRight = side(p, "Right");
  s.borderBottom = side(p, "Bottom");
  s.borderLeft = side(p, "Left");

  return s;
}

/** Text-level styles: typography, gradient, shadow, highlight. */
export function textAdvancedTextStyle(p: Props): CSSProperties {
  const tag = p.tag || "p";

  const s: CSSProperties = {
    fontFamily: p.fontFamily || undefined,
    // An explicit size always wins; otherwise a heading gets a heading's size
    // instead of inheriting the body size from Tailwind's reset.
    fontSize: p.fontSize ? `${p.fontSize}px` : TA_TAG_SIZES[tag],
    fontWeight:
      p.fontWeight && p.fontWeight !== "400"
        ? p.fontWeight
        : isHeading(tag)
          ? TA_TAG_WEIGHT
          : undefined,
    fontStyle: p.fontStyle && p.fontStyle !== "normal" ? p.fontStyle : undefined,
    lineHeight: p.lineHeight || (isHeading(tag) ? TA_TAG_LINE_HEIGHT : undefined),
    // One line's worth even with no text yet — measured in the tag's own size,
    // so an empty h2 bar is as tall on the page as the one being typed into.
    minHeight: isHeading(tag) ? `${TA_TAG_LINE_HEIGHT}em` : "1.5em",
    letterSpacing: p.letterSpacing || undefined,
    textTransform: (p.textTransform && p.textTransform !== "none"
      ? p.textTransform
      : undefined) as CSSProperties["textTransform"],
    textDecoration: p.textDecoration && p.textDecoration !== "none" ? p.textDecoration : undefined,
    textShadow:
      p.textShadow === "true"
        ? `${p.shadowX || 0}px ${p.shadowY || 2}px ${p.shadowBlur || 4}px ${p.shadowColor || "#00000040"}`
        : undefined,
  };

  if (p.textGradient === "true") {
    s.backgroundImage = `linear-gradient(${p.gradAngle || 90}deg, ${p.gradFrom || "#0ea5e9"}, ${p.gradTo || "#9333ea"})`;
    (s as Record<string, unknown>).WebkitBackgroundClip = "text";
    s.backgroundClip = "text";
    s.color = "transparent";
  } else {
    s.color = p.color || undefined;
  }

  if (p.highlightColor) {
    s.backgroundColor = p.highlightColor;
    s.borderRadius = p.highlightRadius ? `${p.highlightRadius}px` : "4px";
    s.padding = "0.1em 0.3em";
    (s as Record<string, unknown>).boxDecorationBreak = "clone";
    (s as Record<string, unknown>).WebkitBoxDecorationBreak = "clone";
  }

  return s;
}

// ── The published page: defaults in CSS, only the author's choices inline ──
//
// The two builders above write every value out, defaults included, because
// the editor canvas needs a complete style on the element it is rendering
// live. On the published page that was 66 bytes of identical inline style on
// every one of 45 headings, and 137 on every box — measured on one real page,
// 384 inline style attributes of which 41 were distinct. Inline styles are
// the most expensive form for the browser's style engine, each one parsed on
// its own, and every one is serialised a second time into the hydration
// payload. So the page gets the defaults once, as the rules below, and an
// element carries inline only what differs from them.
//
// "Differs" rather than "was set": the editor stores some defaults
// explicitly (`borderRadius: "0"` is in every block's props), and those must
// not come back as `border-radius:0px` on every element. Comparing against
// the default catches both cases with one rule.
//
// The cascade is preserved. An inline default used to beat the theme's
// `h1,h2,h3{…}` rules; a class rule (0,1,0) beats them too, and an author's
// inline override still beats the class. The one thing that changes is that
// a site's own custom CSS can now reach these elements with a class-qualified
// selector, which it never could before — that is the right way round.

/** Marks the wrapper; the public stylesheet's `.bmsta` rule supplies the defaults. */
export const TA_WRAP_CLASS = "bmsta";
/** The text element's classes for a tag: the shared rule plus the tag's own. */
export function taTextClass(tag: string): string {
  return `bmsta-t bmsta-${isHeading(tag) ? tag : "p"}`;
}

const WRAP_DEFAULTS: Partial<Record<keyof CSSProperties, string>> = {
  textAlign: "start",
  borderRadius: "0px",
  paddingTop: DEFAULT_PAD_Y,
  paddingRight: DEFAULT_PAD_X,
  paddingBottom: DEFAULT_PAD_Y,
  paddingLeft: DEFAULT_PAD_X,
};

function textDefaults(tag: string): Partial<Record<keyof CSSProperties, string>> {
  return isHeading(tag)
    ? { fontSize: TA_TAG_SIZES[tag], fontWeight: TA_TAG_WEIGHT, lineHeight: TA_TAG_LINE_HEIGHT, minHeight: `${TA_TAG_LINE_HEIGHT}em` }
    : { minHeight: "1.5em" };
}

/** `textAdvancedWrapStyle` minus everything the `.bmsta` rule already says. */
export function textAdvancedWrapOverrides(p: Props): CSSProperties {
  return withoutDefaults(textAdvancedWrapStyle(p), WRAP_DEFAULTS) ?? {};
}

/** `textAdvancedTextStyle` minus everything the tag's rule already says. */
export function textAdvancedTextOverrides(p: Props): CSSProperties {
  return withoutDefaults(textAdvancedTextStyle(p), textDefaults(p.tag || "p")) ?? {};
}

/**
 * The defaults, as the rules the published page carries instead.
 *
 * `.bmsta-t` first, so a heading's own rule wins the shared `min-height` on
 * equal specificity. Trimmed out of pages with no Text Advanced block — see
 * `cssTrim.ts`, where `bmsta` maps to this block.
 */
export const TEXT_ADVANCED_CSS =
  `.${TA_WRAP_CLASS}{text-align:start;padding:${DEFAULT_PAD_Y} ${DEFAULT_PAD_X};border-radius:0}` +
  `.bmsta-t{min-height:1.5em}` +
  `.bmsta-p{min-height:1.5em}` +
  Object.entries(TA_TAG_SIZES)
    .map(
      ([tag, size]) =>
        `.bmsta-${tag}{font-size:${size};font-weight:${TA_TAG_WEIGHT};line-height:${TA_TAG_LINE_HEIGHT};min-height:${TA_TAG_LINE_HEIGHT}em}`
    )
    .join("");
