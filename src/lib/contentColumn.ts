// How wide the content column really is, for image `sizes`.
//
// The renderer assumed 800 px for every image on every layout. The column
// is 736 px on Normal (48rem less padding), 544 on Narrow, 992 on Wide and
// the whole viewport on Fullwidth — so a Fullwidth site's 1000 px images
// were told they render at 800 and the browser fetched a file it then had
// to stretch. `sizes` is what decides which srcset file is downloaded;
// telling the truth here is the whole optimisation.
//
// The numbers mirror LAYOUT_WIDTHS in siteCss.ts (rem × 16), and the padding
// mirrors SPACINGS there. Both matter: `.content-shell[data-spacing]` sets
// `padding` (3rem by default), which *overrides* the `px-4` class on the same
// element, and a Boxed content style adds another 2rem inside `.content-article`.
// Counting only the 16 px from `px-4` overstated every column by up to 80 px a
// side. Measured on a live post at 412 px: the image renders 316 px wide and
// `sizes` claimed 380, so the browser took the 750 w file where 640 w was
// enough (PageSpeed: 19 KiB wasted, on every content image of the page).
//
// Sidebar layouts share a 72rem grid with a 260 px sidebar and a 2.5rem gap
// (siteCss `.content-grid`), which is what leaves the article its width.

import type { SiteSettings } from "./settings";

/** `px` is the desktop column; `gutter` is what the viewport loses at mobile and tablet. */
export type ContentColumn = { px: number; fluid: boolean; gutter: number };

/** Shell max-width per layout, in px — LAYOUT_WIDTHS × 16. */
const LAYOUT_PX: Record<string, number> = {
  normal: 768,
  narrow: 576,
  wide: 1024,
  "left-sidebar": 1152,
  "right-sidebar": 1152,
};

/**
 * Horizontal padding *per side* of the shell, per Vertical Spacing value —
 * SPACINGS in siteCss.ts. "Top only" and "Bottom only" write `3rem 0 0` and
 * `0 0 3rem`, so their sides are zero, and "Disable" is zero all round: with
 * no padding left on the shell the content really does run to the edge, and
 * an image told `calc(100vw - 32px)` there fetches a file too small for the
 * space it fills.
 */
const SPACING_SIDE_PX: Record<string, number> = {
  default: 48,
  enable: 80,
  disable: 0,
  "top-only": 0,
  "bottom-only": 0,
};

/** The Boxed content style's own padding, per side (siteCss: `padding:2rem`). */
const BOXED_SIDE_PX = 32;

const SIDEBAR_PX = 260;
const SIDEBAR_GAP_PX = 40; // gap:2.5rem

/**
 * A document's effective layout: its own, else the site default for its kind.
 *
 * "archive" is a kind here because an archive is a document too as far as the
 * shell is concerned — ContentShell renders it with `data-kind="archive"` and
 * the same three settings decide its width.
 */
type Kind = "page" | "post" | "archive";

const pick = (kind: Kind, settings: SiteSettings, page: string, post: string, archive: string) =>
  settings[(kind === "page" ? page : kind === "post" ? post : archive) as keyof SiteSettings] as string | undefined;

export function resolveDocLayout(kind: Kind, own: string | null | undefined, settings: SiteSettings): string {
  const fallback = pick(kind, settings, "page_layout", "post_layout", "archive_layout") || "normal";
  return !own || own === "default" ? fallback : own;
}

/** The same fallback rule for Vertical Spacing and Content Style. */
export function resolveDocSpacing(kind: Kind, own: string | null | undefined, settings: SiteSettings): string {
  const fallback = pick(kind, settings, "page_spacing", "post_spacing", "archive_spacing") || "default";
  return !own || own === "default" ? fallback : own;
}

export function resolveDocStyle(kind: Kind, own: string | null | undefined, settings: SiteSettings): string {
  const fallback = pick(kind, settings, "page_content_style", "post_content_style", "archive_content_style") || "unboxed";
  return !own || own === "default" ? fallback : own;
}

export function contentColumn(
  layout: string,
  design?: { spacing?: string | null; style?: string | null }
): ContentColumn {
  const side = SPACING_SIDE_PX[design?.spacing ?? "default"] ?? SPACING_SIDE_PX.default;
  const boxed = design?.style === "boxed" ? BOXED_SIDE_PX : 0;
  const gutter = (side + boxed) * 2;

  // Fullwidth has no max width, so the column is the viewport less the gutter.
  // 1920 is the largest srcset width, which is what a desktop candidate is
  // capped at anyway.
  if (layout === "fullwidth") return { px: Math.max(1, 1920 - gutter), fluid: true, gutter };

  const shell = LAYOUT_PX[layout] ?? LAYOUT_PX.normal;
  // `box-sizing: border-box` is set site-wide, so the padding sits inside the
  // max width rather than adding to it.
  const inner = shell - gutter;
  const px = layout === "left-sidebar" || layout === "right-sidebar" ? inner - SIDEBAR_PX - SIDEBAR_GAP_PX : inner;
  return { px: Math.max(1, px), fluid: false, gutter };
}

/**
 * `sizes` for an image that fills the content column — a featured image, say.
 * The block renderer has its own version for images inside rows (it knows each
 * column's share); this is the simple case, and it exists so no caller has to
 * guess the gutter again.
 */
export function columnSizes(col: ContentColumn): string {
  const vw = col.gutter > 0 ? `calc(100vw - ${col.gutter}px)` : "100vw";
  return col.fluid ? vw : `(max-width: ${col.px + col.gutter}px) ${vw}, ${col.px}px`;
}
