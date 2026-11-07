// Pure CSS builders shared by the server-rendered SiteLayout and the client-side
// preview bridge, so the live preview and the published page cannot disagree.

import { blockBoxCss } from "./blockBox";
import { readableOn } from "./color";
import { FACADE_CSS } from "@/lib/videoFacade";
import { LOAD_MORE_CSS, TIMELINE_CSS, blockGapCss, progressCss, scrollTopCss } from "@/lib/siteExtras";
import { DOWNLOAD_BOX_CSS } from "@/lib/downloadBox";
import { blockCss } from "./blockCss";
import { trimSiteCss } from "./cssTrim";
import { fontFallbackCss } from "./fontFallback";

import { resolveLogoLayout, parsePostElements, parsePageElements } from "./appearanceSettings";

export const PALETTE_SLOTS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] as const;

/** Used when a site has no palette saved, so references always resolve. */
export const PALETTE_FALLBACK = [
  "#2B6CB0", "#215387", "#1A202C",
  "#2D3748", "#4A5568", "#718096",
  "#EDF2F7", "#F7FAFC", "#ffffff",
  "#ffffff", "#13612e", "#1159af",
  "#b82105", "#f7630c", "#f5a524",
];

/**
 * Three saved palettes with one active, so a site can flip its whole scheme.
 * Stored as JSON; individual palette1..15 keys remain the fallback.
 */
export function activePalette(s: Record<string, string>): string[] {
  const fromKeys = PALETTE_SLOTS.map((n) => s[`palette${n}`] || PALETTE_FALLBACK[n - 1]);
  try {
    const sets = JSON.parse(s.palette_sets || "null");
    if (!Array.isArray(sets) || sets.length === 0) return fromKeys;
    const idx = Math.min(Math.max(parseInt(s.palette_active || "1"), 1), sets.length) - 1;
    const set = sets[idx];
    if (!Array.isArray(set)) return fromKeys;
    return PALETTE_SLOTS.map((n) => set[n - 1] || fromKeys[n - 1]);
  } catch {
    return fromKeys;
  }
}

/** A colour setting may name a palette slot instead of holding a hex value. */
export function isPaletteRef(v: string): boolean {
  return /^palette[1-9]$/.test((v || "").trim());
}

/**
 * Rewrites palette references to `var(--paletteN)`.
 *
 * Applied once to the whole settings map before any builder runs, so every
 * colour control supports palette slots without each builder knowing about them
 * — and changing a slot re-skins the site through the cascade.
 */
export function resolvePalette(s: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(s)) {
    out[k] = isPaletteRef(v) ? `var(--${v.trim()})` : v;
  }
  return out;
}

/** The palette slots themselves, plus their dark-mode overrides. */
export function paletteCss(s: Record<string, string>): string {
  // Always emit every slot. A site that has never opened the Customizer has no
  // palette rows saved, and a dangling var(--paletteN) resolves to nothing.
  const active = activePalette(s);
  const light = PALETTE_SLOTS.map((n) => `--palette${n}:${active[n - 1]}`).join(";");

  const dark = PALETTE_SLOTS
    .map((n) => (s[`palette_dark${n}`] ? `--palette${n}:${s[`palette_dark${n}`]}` : ""))
    .filter(Boolean)
    .join(";");

  const out: string[] = [];
  if (light) out.push(`:root{${light}}`);
  if (dark) {
    out.push(`:root[data-theme="dark"]{${dark}}`);
    if ((s.dark_mode || "off") === "system") {
      out.push(`@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}`);
    }
  }
  return out.join("");
}

export type BackgroundValue = {
  type?: "color" | "gradient" | "image";
  color?: string;
  gradient?: string;
  image?: string;
  size?: string;
  repeat?: string;
  position?: string;
  attachment?: string;
  overlay?: string;
};

/**
 * A background setting is either a plain colour string (what every existing
 * value is) or a JSON object describing a gradient or image. Accepting both
 * keeps older saved values working with no migration.
 */
export function parseBackground(raw: string): BackgroundValue | null {
  const v = (raw || "").trim();
  if (!v) return null;
  if (v.startsWith("{")) {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" ? (parsed as BackgroundValue) : null;
    } catch {
      return null;
    }
  }
  return { type: "color", color: v };
}

/** CSS declarations for a background value, or "" when nothing is set. */
export function backgroundDecls(raw: string): string {
  const bg = parseBackground(raw);
  if (!bg) return "";

  if (bg.type === "gradient" && bg.gradient) {
    return `background-image:${bg.gradient};background-color:transparent`;
  }

  if (bg.type === "image" && bg.image) {
    // An overlay is layered above the photo so text stays readable.
    const layers = bg.overlay
      ? `linear-gradient(${bg.overlay},${bg.overlay}),url("${bg.image}")`
      : `url("${bg.image}")`;
    return [
      `background-image:${layers}`,
      `background-size:${bg.size || "cover"}`,
      `background-repeat:${bg.repeat || "no-repeat"}`,
      `background-position:${bg.position || "center center"}`,
      `background-attachment:${bg.attachment || "scroll"}`,
    ].join(";");
  }

  return bg.color ? `background-color:${bg.color}` : "";
}

/** Site-wide and content backgrounds. */
export function surfaceCss(s: Record<string, string>): string {
  const out: string[] = [];
  const site = backgroundDecls(s.site_background);
  const content = backgroundDecls(s.content_background);
  if (site) out.push(`body{${site}}`);
  if (content) out.push(`.content-article,.search-item{${content}}`);
  return out.join("");
}

/**
 * The theme's variables alone, without a selector.
 *
 * Shared by the site's `:root` block and the editor canvas, so the two cannot
 * disagree about what the primary colour or the body font is.
 */
/**
 * A title alignment setting as CSS. "left" is the default the customizer
 * saves, and taken literally it put Arabic titles on the wrong side; it
 * means "the side lines start on", which `start` says in either direction.
 */
function startAlign(v: string | undefined): string {
  return !v || v === "left" ? "start" : v;
}

function themeVarDecls(s: Record<string, string>): string {
  // Text that can be read on the primary colour, worked out rather than
  // assumed to be white. See lib/color.ts — a white primary made every
  // generic button white-on-white.
  const primary = s.color_primary || "#0ea5e9";
  return `
  --color-primary: ${primary};
  --color-primary-fg: ${readableOn(primary) || "#ffffff"};
  --color-secondary: ${s.color_secondary || "#64748b"};
  --color-accent: ${s.color_accent || "#f59e0b"};
  --color-text: ${s.color_text || "#0f172a"};
  --color-heading: ${s.color_heading || "#0f172a"};
  --color-bg: ${s.color_bg || "#ffffff"};
  --font-heading: "${s.font_heading || "Inter"}", "${s.font_heading || "Inter"} Fallback", sans-serif;
  --font-body: "${s.font_body || "Inter"}", "${s.font_body || "Inter"} Fallback", sans-serif;
  --font-size-base: ${s.font_size_base || "16"}px;
  --font-weight-heading: ${s.font_weight_heading || "700"};
  --line-height-body: ${s.line_height_body || "1.7"};
  --header-height: ${s.header_height || "64"}px;
  --header-bg: ${s.header_bg_color || "#ffffff"};
  --header-text: ${s.header_text_color || "#0f172a"};
  --footer-bg: ${s.footer_bg_color || "#0f172a"};
  --footer-text: ${s.footer_text_color || "#94a3b8"};
  --footer-heading: ${s.footer_heading_color || "#ffffff"};`;
}

export function buildCssVars(s: Record<string, string>): string {
  return `
:root {${themeVarDecls(s)}
}
body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-body); font-size: var(--font-size-base); line-height: var(--line-height-body); overflow-x: hidden; }
h1,h2,h3,h4,h5,h6 { font-family: var(--font-heading); font-weight: var(--font-weight-heading); color: var(--color-heading); }`.trim();
}

/**
 * The theme as the editor canvas wears it.
 *
 * The canvas used to be a white sheet with dark Inter text whatever the site
 * looked like. On a site with a black background, white text and Poppins
 * headings, the author saw black-on-white Inter while writing and something
 * else entirely on Preview — a Text Advanced heading with no colour of its own
 * was dark in the editor and white on the page. Same variables, same body and
 * heading rules, same site/content backgrounds, scoped to `.bms-canvas` so the
 * admin chrome around the canvas is untouched. BlockNote paints its own text
 * colour and background from `--bn-colors-*`, so those are pointed at the
 * theme too, or the editor's #3f3f3f would sit on top of everything.
 */
export function canvasThemeCss(s: Record<string, string>): string {
  const heads = ["h1", "h2", "h3", "h4", "h5", "h6"].map((h) => `.bms-canvas ${h}`).join(",");
  const site = backgroundDecls(s.site_background) || "background:var(--color-bg)";
  const content = backgroundDecls(s.content_background);
  return [
    `.bms-canvas{${themeVarDecls(s)}}`,
    `.bms-canvas{${site};color:var(--color-text);font-family:var(--font-body);font-size:var(--font-size-base);line-height:var(--line-height-body)}`,
    `${heads}{font-family:var(--font-heading);font-weight:var(--font-weight-heading);color:var(--color-heading)}`,
    `.bms-canvas .bn-container{--bn-colors-editor-text:var(--color-text);--bn-colors-editor-background:transparent;font-family:var(--font-body)}`,
    // Same precedence as the site: a boxed article paints the page colour over
    // whatever the Content Background setting says.
    content ? `.bms-canvas .bms-canvas-article{${content}}` : "",
    `.bms-canvas .bms-canvas-article.is-boxed{background:var(--color-bg)}`,
  ].join("");
}

/** Swaps the desktop/mobile header sets at the configured breakpoint, and lets
 *  the header background be overridden per device. A row both sets agree on
 *  is emitted once as `.hdr-both` (SiteLayout) and is never hidden here. */
export function headerResponsiveCss(s: Record<string, string>): string {
  const bp = parseInt(s.header_mobile_breakpoint) || 1024;
  const parts = [
    `@media (max-width:${bp}px){.hdr-desktop{display:none !important}}`,
    `@media (min-width:${bp + 1}px){.hdr-mobile{display:none !important}}`,
  ];
  if (s.header_bg_color_tablet) {
    parts.push(`@media (max-width:1024px){:root{--header-bg:${s.header_bg_color_tablet}}}`);
  }
  if (s.header_bg_color_mobile) {
    parts.push(`@media (max-width:767px){:root{--header-bg:${s.header_bg_color_mobile}}}`);
  }
  return parts.join("");
}

/** Everything the header/footer chrome needs that is expressible as pure CSS. */
export function chromeCss(s: Record<string, string>): string {
  const showBorder = s.header_border !== "false";
  const transparent = s.header_transparent === "true";
  return [
    `.hdr-desktop,.hdr-mobile,.hdr-both{height:${s.header_height || "64"}px}`,
    // The rule is mixed from the header's own text colour: a fixed black at 8%
    // was invisible on every dark header (a live site's #0b0b0e).
    `header.hdr-desktop,header.hdr-mobile,header.hdr-both{background-color:${transparent ? "transparent" : "var(--header-bg)"};border-bottom:${showBorder && !transparent ? "1px solid color-mix(in srgb,var(--header-text,#000) 10%,transparent)" : "none"}}`,
    // Defaults for the Top Row and Bottom Row, as CSS rather than the inline
    // style they used to be — an inline `style` attribute beats every
    // external rule regardless of selector specificity, so the Customizer's
    // own Background control for these two rows (`headerRowCss`, same bare
    // `[data-hrow]` selector, emitted later in the sheet) could never win
    // even after the header/footer specificity fix. Plain CSS lets it.
    `[data-hrow="topbar"]{background-color:var(--color-secondary,#64748b)}`,
    `[data-hrow="bottombar"]{background-color:var(--header-bg)}`,
  ].join("");
}

/**
 * Search archive styling. Everything here is expressible as CSS — layout width,
 * columns, alignment, element visibility and order — so the Customizer can
 * preview all of it live without a server render.
 */
export function searchCss(s: Record<string, string>): string {
  const out: string[] = [];

  const widths: Record<string, string> = {
    normal: "64rem",
    narrow: "36rem",
    fullwidth: "100%",
    "left-sidebar": "72rem",
    "right-sidebar": "72rem",
  };
  const layout = s.search_archive_layout || "normal";
  out.push(`.search-shell{max-width:${widths[layout] ?? "64rem"}}`);

  const sidebar = layout === "left-sidebar" || layout === "right-sidebar";
  out.push(`.search-grid{display:grid;gap:2rem;grid-template-columns:${
    sidebar ? (layout === "left-sidebar" ? "260px 1fr" : "1fr 260px") : "1fr"
  }}`);
  out.push(`.search-sidebar{display:${sidebar ? "block" : "none"};order:${layout === "left-sidebar" ? 0 : 2}}`);
  out.push(`.search-main{order:1}`);

  const cols = Math.min(4, Math.max(1, parseInt(s.search_columns) || 3));
  out.push(`.search-items{display:grid;gap:1.75rem;grid-template-columns:repeat(1,minmax(0,1fr))}`);
  out.push(`@media(min-width:640px){.search-items{grid-template-columns:repeat(${Math.min(2, cols)},minmax(0,1fr))}}`);
  out.push(`@media(min-width:1024px){.search-items{grid-template-columns:repeat(${cols},minmax(0,1fr))}}`);

  // Title block
  out.push(`.search-title-block{display:${s.search_title_show === "false" ? "none" : "block"}}`);
  out.push(`.search-title-above{display:${s.search_title_layout === "above-content" ? "block" : "none"}}`);
  out.push(`.search-title-in{display:${s.search_title_layout === "above-content" ? "none" : "block"}}`);
  out.push(`.search-title-block{text-align:${startAlign(s.search_title_align)}}`);
  if (s.search_title_align_tablet) {
    out.push(`@media(max-width:1024px){.search-title-block{text-align:${startAlign(s.search_title_align_tablet)}}}`);
  }
  if (s.search_title_align_mobile) {
    out.push(`@media(max-width:767px){.search-title-block{text-align:${startAlign(s.search_title_align_mobile)}}}`);
  }
  if (s.search_title_color) out.push(`.search-title-block h1{color:${s.search_title_color}}`);

  // Boxed / unboxed cards
  const boxed = (s.search_content_style || "boxed") !== "unboxed";
  out.push(`.search-item{${boxed
    ? "background:var(--search-content-bg,#fff);border-radius:0.9rem;padding:1.25rem;box-shadow:0 1px 3px rgba(0,0,0,.08)"
    : "background:transparent;padding:0;box-shadow:none"}}`);

  // Backgrounds
  if (s.search_site_bg) out.push(`.search-shell-outer{background:${s.search_site_bg}}`);
  if (s.search_site_bg_tablet) out.push(`@media(max-width:1024px){.search-shell-outer{background:${s.search_site_bg_tablet}}}`);
  if (s.search_site_bg_mobile) out.push(`@media(max-width:767px){.search-shell-outer{background:${s.search_site_bg_mobile}}}`);
  if (s.search_content_bg) out.push(`:root{--search-content-bg:${s.search_content_bg}}`);
  if (s.search_content_bg_tablet) out.push(`@media(max-width:1024px){:root{--search-content-bg:${s.search_content_bg_tablet}}}`);
  if (s.search_content_bg_mobile) out.push(`@media(max-width:767px){:root{--search-content-bg:${s.search_content_bg_mobile}}}`);

  // Item typography
  const t: string[] = [];
  if (s.search_item_title_font) t.push(`font-family:"${s.search_item_title_font}",sans-serif`);
  if (s.search_item_title_size) t.push(`font-size:${s.search_item_title_size}px`);
  if (s.search_item_title_weight) t.push(`font-weight:${s.search_item_title_weight}`);
  if (t.length) out.push(`[data-search-el="title"]{${t.join(";")}}`);

  if (s.search_cat_color) out.push(`[data-search-el="categories"] a{color:${s.search_cat_color}}`);
  if (s.search_cat_hover_color) out.push(`[data-search-el="categories"] a:hover{color:${s.search_cat_hover_color}}`);
  if (s.search_cat_font_size) out.push(`[data-search-el="categories"]{font-size:${s.search_cat_font_size}px}`);
  if (s.search_meta_color) out.push(`[data-search-el="meta"]{color:${s.search_meta_color}}`);
  if (s.search_meta_hover_color) out.push(`[data-search-el="meta"] a:hover{color:${s.search_meta_hover_color}}`);
  if (s.search_meta_font_size) out.push(`[data-search-el="meta"]{font-size:${s.search_meta_font_size}px}`);

  // Element visibility + order
  try {
    const els = JSON.parse(s.search_elements || "[]");
    if (Array.isArray(els)) {
      els.forEach((el: { id: string; visible: boolean }, i: number) => {
        // Only emit display when hiding — `display:` with no value is invalid CSS.
        out.push(`[data-search-el="${el.id}"]{order:${i}${el.visible === false ? ";display:none" : ""}}`);
      });
    }
  } catch {
    /* keep server defaults */
  }

  return out.join("");
}

/**
 * Single Post Layout — the title area, its element order, and the blocks that
 * follow the content.
 *
 * Mirrors `searchCss`: the page renders every element unconditionally with a
 * `data-post-el` attribute, and order plus visibility are decided here. That is
 * what lets the Customizer preview reorder them without a re-render.
 */
/**
 * The title area of a single document, for either kind.
 *
 * Posts and pages ask the same questions of their title area — where it sits,
 * how it aligns at each width, what colour and size each element is, and in
 * what order the elements appear — so they are answered once here rather than
 * twice. The kind decides the prefix (`post_` or `page_`), the class names and
 * the data attribute, which keeps the two stylesheets fully independent while
 * the rules that generate them stay single-sourced.
 *
 * Categories and excerpt are emitted for posts only: a page has neither, and a
 * rule for an element that never renders is dead weight in every page's CSS.
 */
function titleAreaCss(s: Record<string, string>, kind: "post" | "page"): string[] {
  const p = (suffix: string) => s[`${kind}_${suffix}`] || "";
  const attr = `data-${kind}-el`;
  const out: string[] = [];

  // Title area placement and alignment.
  const above = p("title_layout") === "above-content";
  out.push(`.${kind}-title-above{display:${above ? "block" : "none"}}`);
  out.push(`.${kind}-title-in{display:${above ? "none" : "block"}}`);
  out.push(`.${kind}-title-block{display:flex;flex-direction:column;text-align:${startAlign(p("title_align"))}}`);
  if (p("title_align_tablet")) {
    out.push(`@media(max-width:1024px){.${kind}-title-block{text-align:${startAlign(p("title_align_tablet"))}}}`);
  }
  if (p("title_align_mobile")) {
    out.push(`@media(max-width:767px){.${kind}-title-block{text-align:${startAlign(p("title_align_mobile"))}}}`);
  }

  // Typography and colour, per element.
  const title: string[] = [];
  if (p("title_font")) title.push(`font-family:"${p("title_font")}",sans-serif`);
  if (p("title_size")) title.push(`font-size:${p("title_size")}px`);
  if (p("title_weight")) title.push(`font-weight:${p("title_weight")}`);
  if (p("title_color")) title.push(`color:${p("title_color")}`);
  if (title.length) out.push(`[${attr}="title"] h1{${title.join(";")}}`);

  const pair = (el: string, color: string, hover: string, size: string) => {
    if (color) out.push(`[${attr}="${el}"]{color:${color}}`);
    if (color) out.push(`[${attr}="${el}"] a{color:${color}}`);
    if (hover) out.push(`[${attr}="${el}"] a:hover{color:${hover}}`);
    if (size) out.push(`[${attr}="${el}"]{font-size:${size}px}`);
  };
  if (kind === "post") {
    pair("categories", p("cat_color"), p("cat_hover_color"), p("cat_font_size"));
  }
  pair("breadcrumb", p("crumb_color"), p("crumb_hover_color"), p("crumb_font_size"));
  pair("meta", p("meta_color"), p("meta_hover_color"), p("meta_font_size"));
  if (kind === "post") {
    pair("excerpt", p("excerpt_color"), "", p("excerpt_font_size"));
  }

  return out;
}

/**
 * Element order and visibility for a document's title area.
 *
 * Split from the rest because it has to run *after* the kind's own blocks, so
 * the ordering rules keep the position they had in the stylesheet.
 */
function titleOrderCss(s: Record<string, string>, kind: "post" | "page"): string[] {
  const attr = `data-${kind}-el`;
  // The older standalone toggles still win, so they keep meaning what they
  // always did rather than being quietly overruled by the element list.
  const forced: Record<string, boolean> = {
    title: s[`${kind}_title_show`] === "false",
    meta: kind === "post" ? s.post_meta_show === "false" : false,
  };
  // Parsed rather than read raw: a site that has never opened this screen has
  // no stored value, and the shipped defaults hide some elements — which only
  // happens if those defaults still produce rules.
  const list =
    kind === "post"
      ? parsePostElements(s.post_elements || "")
      : parsePageElements(s.page_elements || "");
  return list.map((el, i) => {
    const hidden = el.visible === false || forced[el.id];
    return `[${attr}="${el.id}"]{order:${i}${hidden ? ";display:none" : ""}}`;
  });
}

/** Backgrounds behind a document kind, at each width. */
function docBackgroundCss(s: Record<string, string>, kind: "post" | "page"): string[] {
  const p = (suffix: string) => s[`${kind}_${suffix}`] || "";
  const out: string[] = [];
  const bg = (key: string, sel: string) => {
    if (p(key)) out.push(`${sel}{background:${p(key)}}`);
    if (p(`${key}_tablet`)) out.push(`@media(max-width:1024px){${sel}{background:${p(`${key}_tablet`)}}}`);
    if (p(`${key}_mobile`)) out.push(`@media(max-width:767px){${sel}{background:${p(`${key}_mobile`)}}}`);
  };
  bg("site_bg", `body:has(.content-shell[data-kind="${kind}"])`);
  bg("content_bg", `.content-shell[data-kind="${kind}"] .content-article`);
  return out;
}

/**
 * The page equivalent of `singlePostCss`.
 *
 * Shorter than the post's because a page has no tags, author box, prev/next or
 * related posts — the after-content blocks are what genuinely separate the two
 * kinds, and a page has only comments and a featured image.
 */
export function singlePageCss(s: Record<string, string>): string {
  const out = titleAreaCss(s, "page");
  out.push(`.page-comments{display:${s.page_comments_show === "true" ? "block" : "none"}}`);
  out.push(`.content-shell[data-kind="page"] .content-feature{display:${s.page_feature_show === "false" ? "none" : "block"}}`);
  out.push(...docBackgroundCss(s, "page"));
  out.push(...titleOrderCss(s, "page"));
  return out.join("");
}

export function singlePostCss(s: Record<string, string>): string {
  const out: string[] = titleAreaCss(s, "post");

  // After-content blocks.
  out.push(`.post-tags{display:${s.post_tags_show === "false" ? "none" : "flex"}}`);
  out.push(`.post-comments{display:${s.post_comments_show === "false" ? "none" : "block"}}`);
  out.push(`.post-author-box{display:${s.post_author_box_show === "true" ? "flex" : "none"}}`);
  // Kadence's "author area in boxed mode": the card treatment is optional, and
  // turning it off leaves the author details sitting plainly in the flow.
  if (s.post_author_box_boxed === "false") {
    out.push(`.post-author-box{border:0;padding:0;border-radius:0}`);
  }
  out.push(`.post-nav{display:${s.post_nav_show === "false" ? "none" : "grid"}}`);
  out.push(`.post-related{display:${s.post_related_show === "false" ? "none" : "block"}}`);
  const related = Math.min(6, Math.max(1, parseInt(s.post_related_count) || 3));
  out.push(`.post-related-items{display:grid;gap:1.5rem;grid-template-columns:repeat(1,minmax(0,1fr))}`);
  out.push(`@media(min-width:640px){.post-related-items{grid-template-columns:repeat(${Math.min(2, related)},minmax(0,1fr))}}`);
  out.push(`@media(min-width:1024px){.post-related-items{grid-template-columns:repeat(${related},minmax(0,1fr))}}`);

  // Backgrounds.
  out.push(...docBackgroundCss(s, "post"));

  // Element order and visibility.
  out.push(...titleOrderCss(s, "post"));

  return out.join("");
}

/** Header Search item — style, sizing, colours, spacing and its modal. */
export function headerSearchCss(s: Record<string, string>): string {
  const out: string[] = [];
  const u = s.hsearch_pad_unit || "em";

  // Style and spacing apply to BOTH affordances — whichever one is on screen is
  // the "search", so targeting only the inline field left the icon unstyled.
  const bordered = s.hsearch_style === "bordered";
  out.push(`.hsearch-field{border:${bordered ? "1px solid currentColor" : "1px solid color-mix(in srgb,currentColor 18%,transparent)"};border-radius:0.5rem}`);
  out.push(`.hsearch-icon{border:${bordered ? "1px solid currentColor" : "1px solid transparent"};border-radius:0.5rem}`);

  const pad = ["hsearch_pad_top", "hsearch_pad_right", "hsearch_pad_bottom", "hsearch_pad_left"]
    .map((k) => (s[k] ? `${s[k]}${u}` : null));
  if (pad.some(Boolean)) {
    out.push(`.hsearch-field,.hsearch-icon{padding:${pad.map((v) => v ?? "revert").join(" ")}}`);
  }

  const mar = ["hsearch_margin_top", "hsearch_margin_right", "hsearch_margin_bottom", "hsearch_margin_left"]
    .map((k) => (s[k] ? `${s[k]}px` : "0"));
  if (mar.some((v) => v !== "0")) out.push(`.hsearch{margin:${mar.join(" ")}}`);

  if (s.hsearch_icon_size) out.push(`.hsearch-icon{font-size:${s.hsearch_icon_size}em}`);
  if (s.hsearch_icon_size_tablet) out.push(`@media(max-width:1024px){.hsearch-icon{font-size:${s.hsearch_icon_size_tablet}em}}`);
  if (s.hsearch_icon_size_mobile) out.push(`@media(max-width:767px){.hsearch-icon{font-size:${s.hsearch_icon_size_mobile}em}}`);

  if (s.hsearch_color) out.push(`.hsearch,.hsearch-field,.hsearch-icon{color:${s.hsearch_color}}`);
  if (s.hsearch_color_hover) out.push(`.hsearch:hover,.hsearch:hover .hsearch-icon,.hsearch-field:hover{color:${s.hsearch_color_hover}}`);
  if (s.hsearch_bg) out.push(`.hsearch-field,.hsearch-icon{background-color:${s.hsearch_bg}}`);
  if (s.hsearch_bg_hover) out.push(`.hsearch-field:hover,.hsearch-icon:hover{background-color:${s.hsearch_bg_hover}}`);

  if (s.hsearch_modal_text) out.push(`.hsearch-modal{color:${s.hsearch_modal_text}}`);
  if (s.hsearch_modal_text_hover) out.push(`.hsearch-modal a:hover,.hsearch-modal button:hover{color:${s.hsearch_modal_text_hover}}`);
  if (s.hsearch_modal_bg) out.push(`:root{--hsearch-modal-bg:${s.hsearch_modal_bg}}`);
  if (s.hsearch_modal_bg_tablet) out.push(`@media(max-width:1024px){:root{--hsearch-modal-bg:${s.hsearch_modal_bg_tablet}}}`);
  if (s.hsearch_modal_bg_mobile) out.push(`@media(max-width:767px){:root{--hsearch-modal-bg:${s.hsearch_modal_bg_mobile}}}`);

  // Which affordance shows — the inline field or the icon that opens the modal.
  const icon = s.hsearch_display === "icon";
  out.push(`.hsearch-inline{display:${icon ? "none" : "flex"}}`);
  out.push(`.hsearch-trigger{display:${icon ? "inline-flex" : "none"}}`);

  return out.join("");
}

/** Primary Navigation item — spacing, style, colours, font and its dropdowns. */
export function headerNavCss(s: Record<string, string>): string {
  const out: string[] = [];

  const gap = s.hnav_spacing || "1.25";
  out.push(`.hnav{display:flex;align-items:stretch;gap:${gap}em}`);
  if (s.hnav_stretch === "true") out.push(`.hnav{flex:1;justify-content:space-between}`);

  const style = s.hnav_style || "standard";
  const fullHeight = style === "full-height" || style === "full-height-underline";
  const underline = style === "underline" || style === "full-height-underline";

  out.push(`.hnav-link{position:relative;display:flex;align-items:center;${
    fullHeight ? "height:100%;padding-top:0;padding-bottom:0" : ""
  }}`);

  // The underline marker is always in the DOM; CSS decides whether it shows.
  out.push(`.hnav-underline{display:${underline ? "block" : "none"};position:absolute;left:0;right:0;bottom:0;height:2px;background:currentColor;opacity:0;transition:opacity .15s}`);
  out.push(`.hnav-link:hover .hnav-underline,.hnav-item.is-active > .hnav-link .hnav-underline{opacity:1}`);

  if (s.hnav_color) out.push(`.hnav-link{color:${s.hnav_color}}`);
  if (s.hnav_color_hover) out.push(`.hnav-link:hover{color:${s.hnav_color_hover}}`);
  if (s.hnav_color_active) out.push(`.hnav-item.is-active > .hnav-link{color:${s.hnav_color_active}}`);
  if (s.hnav_bg) out.push(`.hnav-link{background-color:${s.hnav_bg}}`);
  if (s.hnav_bg_hover) out.push(`.hnav-link:hover{background-color:${s.hnav_bg_hover}}`);
  if (s.hnav_bg_active) out.push(`.hnav-item.is-active > .hnav-link{background-color:${s.hnav_bg_active}}`);

  const f: string[] = [];
  if (s.hnav_font) f.push(`font-family:"${s.hnav_font}",sans-serif`);
  if (s.hnav_font_size) f.push(`font-size:${s.hnav_font_size}px`);
  if (s.hnav_font_weight) f.push(`font-weight:${s.hnav_font_weight}`);
  if (s.hnav_transform && s.hnav_transform !== "none") f.push(`text-transform:${s.hnav_transform}`);
  if (f.length) out.push(`.hnav-link{${f.join(";")}}`);

  // Dropdowns — closed by default, opened by :hover or the .is-open class.
  out.push(`.hnav-dd{width:${s.hnav_dd_width || "200"}px;border-radius:${s.hnav_dd_radius || "8"}px;background-color:${s.hnav_dd_bg || "#fff"};opacity:0;visibility:hidden;transform:translateY(-4px);transition:opacity .15s,transform .15s,visibility .15s}`);
  out.push(`.hnav-dd.is-open{opacity:1;visibility:visible;transform:none}`);
  if (s.hnav_dd_color) out.push(`.hnav-dd a{color:${s.hnav_dd_color}}`);
  if (s.hnav_dd_color_hover) out.push(`.hnav-dd a:hover{color:${s.hnav_dd_color_hover}}`);
  if (s.hnav_dd_divider) out.push(`.hnav-dd a + a{border-top:1px solid ${s.hnav_dd_divider}}`);
  // The current page inside a dropdown reuses the hover colour rather than
  // adding another control — one fewer thing to keep in sync.
  if (s.hnav_dd_color_hover) out.push(`.hnav-dd a.is-active{color:${s.hnav_dd_color_hover}}`);
  out.push(`.hnav-dd a.is-active{font-weight:600}`);

  // Hover opening is pure CSS; click opening is handled by the component and
  // must not also open on hover, hence the guard class on the nav root.
  if ((s.hnav_open_on || "hover") === "hover") {
    // Keyboard too: tabbing onto the parent link opens its panel, so Tab moves on into its links.
    out.push(`.hnav-item:hover > .hnav-dd,.hnav-item:focus-within > .hnav-dd{opacity:1;visibility:visible;transform:none}`);
  }

  // Mega menus span the header width and lay children out in columns.
  out.push(`.hnav-dd.is-mega{left:50%;transform:translateX(-50%) translateY(-4px);width:min(${s.hnav_mega_width || "900"}px,92vw);display:grid;grid-template-columns:repeat(var(--mega-cols,2),minmax(0,1fr));gap:.25rem;padding:1rem}`);
  out.push(`.hnav-dd.is-mega.is-open{transform:translateX(-50%) translateY(0)}`);
  out.push(`.hnav-item:hover > .hnav-dd.is-mega,.hnav-item:focus-within > .hnav-dd.is-mega{transform:translateX(-50%) translateY(0)}`);
  out.push(`.hnav-dd.is-mega .hnav-dd-item{border-radius:.5rem}`);
  out.push(`@media(max-width:767px){.hnav-dd.is-mega{grid-template-columns:1fr}}`);

  // Icons, badges and highlighted items
  out.push(`.hnav-icon{display:inline-flex;align-items:center;line-height:1}`);
  out.push(`.hnav-badge{display:inline-block;font-size:.65em;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:.15em .45em;border-radius:.35em;background:${s.hnav_badge_bg || "var(--color-accent,#f59e0b)"};color:${s.hnav_badge_text || "#ffffff"};line-height:1.4}`);
  out.push(`.hnav-link[data-highlight="primary"]{background:var(--color-primary,#0ea5e9);color:var(--color-primary-fg,#fff);border-radius:.5rem;padding-left:.75rem;padding-right:.75rem}`);
  out.push(`.hnav-link[data-highlight="accent"]{background:var(--color-accent,#f59e0b);color:#fff;border-radius:.5rem;padding-left:.75rem;padding-right:.75rem}`);
  out.push(`.hnav-link[data-highlight="outline"]{border:1px solid currentColor;border-radius:.5rem;padding-left:.75rem;padding-right:.75rem}`);

  return out.join("");
}

/** Site Identity — logo sizing and which of logo/title/tagline show. */
export function identityCss(s: Record<string, string>): string {
  const out: string[] = [];

  // "0" is a truthy string, so guard on the parsed number — a max-width of 0
  // would collapse the logo to nothing.
  const maxW = (k: string) => (parseInt(s[k]) > 0 ? parseInt(s[k]) : 0);
  const hasLogo = !!s.site_logo;
  // One rule for the logo, not three: height, max-width and display used to
  // be pushed separately, three `.site-logo{…}` blocks on every page.
  out.push(`.site-logo{display:${hasLogo ? "inline-block" : "none"};height:${parseInt(s.logo_height) || 32}px;width:auto${maxW("logo_max_width") ? `;max-width:${maxW("logo_max_width")}px` : ""}}`);
  if (maxW("logo_max_width_tablet")) out.push(`@media(max-width:1024px){.site-logo{max-width:${maxW("logo_max_width_tablet")}px}}`);
  if (maxW("logo_max_width_mobile")) out.push(`@media(max-width:767px){.site-logo{max-width:${maxW("logo_max_width_mobile")}px}}`);

  const layout = resolveLogoLayout(s);
  // With no logo the title always shows, so the header is never completely empty.
  const showTitle = layout !== "logo" || !hasLogo;
  const showTagline = layout === "logo-title-tagline";

  out.push(`.site-title{display:${showTitle ? "inline-block" : "none"}}`);
  out.push(`.site-tagline{display:${showTagline ? "block" : "none"}}`);
  // Nothing to sit beside the logo — drop the gap so the image isn't offset.
  if (!showTitle && !showTagline) out.push(`.site-branding{gap:0}`);

  return out.join("");
}

const LAYOUT_WIDTHS: Record<string, string> = {
  normal: "48rem",
  narrow: "36rem",
  // Between Normal and Fullwidth. Normal is a reading measure and Fullwidth is
  // edge to edge, with nothing in between — so a landing page with a two- or
  // three-column row had to choose between cramped and unbounded.
  wide: "64rem",
  fullwidth: "100%",
  "left-sidebar": "72rem",
  "right-sidebar": "72rem",
};

const SPACINGS: Record<string, string> = {
  default: "3rem",
  enable: "5rem",
  disable: "0",
  "top-only": "3rem 0 0",
  "bottom-only": "0 0 3rem",
};

/**
 * Posts/Pages Layout — site-wide defaults, plus the per-document overrides.
 *
 * ContentShell stamps the document's own choice on `data-layout` etc. and uses
 * the literal string "default" when it has none, so the rules below let a global
 * default apply while an explicit per-post value still wins. Driving it from CSS
 * (rather than server-side class names) is what makes it preview live.
 */
/**
 * The rules for one archive card design.
 *
 * Its own function because a category can override the site-wide design for
 * its listing alone (categories.archive_card_style). The site stylesheet
 * carries the site-wide choice; a term that picks a different one gets these
 * same rules in its own scoped block, so no site pays for five designs it
 * does not use.
 *
 * Every selector is `.archive-items.is-<style> .archive-card` — two classes,
 * so a design always wins over the flat default without `!important`.
 */
export function archiveCardStyleCss(style: string): string {
  const out: string[] = [];
  const card = `.archive-items.is-${style} .archive-card`;

  if (style === "elevated") {
    // Rounded and lifted, with a hover that answers the pointer.
    out.push(`${card}{border-radius:14px;box-shadow:0 1px 2px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.08);transition:transform .2s,box-shadow .2s}`);
    out.push(`${card}:hover{transform:translateY(-3px);box-shadow:0 2px 4px rgba(15,23,42,.07),0 16px 36px rgba(15,23,42,.13)}`);
    out.push(`@media(prefers-reduced-motion:reduce){${card}{transition:none}${card}:hover{transform:none}}`);
  } else if (style === "bordered") {
    // No shadow at all: a hairline box that takes the accent colour on hover.
    out.push(`${card}{border:1px solid rgba(100,116,139,.28);border-radius:10px;box-shadow:none;transition:border-color .2s}`);
    out.push(`${card}:hover{border-color:var(--color-primary,#0ea5e9)}`);
  } else if (style === "overlay") {
    // The text sits on the image, over a gradient dark enough to read on.
    // `min-height` so a post with no featured image is still a card.
    out.push(`${card}{position:relative;border-radius:14px;box-shadow:0 10px 30px rgba(15,23,42,.18);min-height:20rem;justify-content:flex-end}`);
    out.push(`${card} > a:first-child{position:absolute;inset:0}`);
    out.push(`${card} .archive-card-image{height:100%;width:100%;object-fit:cover;aspect-ratio:auto}`);
    out.push(`${card} > div{position:relative;z-index:1;flex:none;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.35)}`);
    out.push(`${card} > div::before{content:"";position:absolute;inset:-7rem 0 -2rem;background:linear-gradient(to top,rgba(0,0,0,.88),rgba(0,0,0,.55) 45%,transparent);z-index:-1;pointer-events:none}`);
    out.push(`${card} .archive-card-title,${card} .archive-card-title a,${card} .archive-card-meta,${card} .archive-card-excerpt,${card} .archive-card-more{color:#fff}`);
    out.push(`${card} .archive-card-more{padding-top:1rem;margin-top:0}`);
  } else if (style === "list") {
    // One row per post: the image beside the text rather than above it. Below
    // 640px it stacks again, where a side-by-side card is unreadable.
    out.push(`${card}{flex-direction:row;align-items:stretch;border-radius:12px}`);
    out.push(`${card} > a:first-child{flex:none;width:min(38%,20rem)}`);
    out.push(`${card} .archive-card-image{height:100%;aspect-ratio:auto;min-height:11rem}`);
    out.push(`@media(max-width:639px){${card}{flex-direction:column}${card} > a:first-child{width:100%}${card} .archive-card-image{aspect-ratio:16/10;min-height:0}}`);
  } else if (style === "minimal") {
    // No card at all — a rule between entries, the way a text-first blog
    // lists its posts.
    out.push(`${card}{background:transparent;box-shadow:none;border-radius:0;border-bottom:1px solid rgba(100,116,139,.22);padding-bottom:1.25rem}`);
    out.push(`${card} > div{padding-left:0;padding-right:0}`);
    out.push(`${card} .archive-card-image{border-radius:10px}`);
  }
  return out.join("");
}

/**
 * A colour as written by an administrator, or "" when it is not one.
 *
 * Exported because the archive renderer needs the identical rule for a term's
 * stored colours — it had its own character-for-character copy, which is one
 * regex away from the two paths disagreeing about what a colour is.
 *
 * Every value here is interpolated into a stylesheet, where a stray `}` ends
 * the rule and whatever follows is parsed as new CSS. The same guard the
 * archive's per-term overrides already use (BlogArchive `cssColor`), applied
 * to the site-wide fields so both paths answer the question the same way.
 */
export function archiveColour(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  const ok =
    /^#[0-9a-fA-F]{3,8}$/.test(v) ||
    /^rgba?\([\d\s.,%]+\)$/.test(v) ||
    /^hsla?\([\d\s.,%deg]+\)$/.test(v) ||
    /^var\(--[a-zA-Z0-9-]+\)$/.test(v) ||
    /^[a-zA-Z]{3,20}$/.test(v);
  return ok ? v : "";
}

/**
 * Every archive colour, from a record keyed by the Customizer's setting names.
 *
 * Exported because a category can override the same set for its own listing
 * (categories.archive_design, stored with these very keys): the term path and
 * the site path then produce identical rules and cannot drift. Anything unset
 * emits nothing, so a term overriding one colour keeps the site's for the rest.
 */
export function archiveColourCss(s: Record<string, string>): string {
  const out: string[] = [];
  const colour = (value: string | undefined, selector: string) => {
    const v = archiveColour(value);
    if (v) out.push(`${selector}{color:${v}}`);
  };
  // The two full-bleed strips. The spread shadow has to carry the same colour
  // as the background or the band stops at the reading column — see the bands
  // in contentCss for why it is painted this way at all.
  const band = (value: string | undefined, selector: string) => {
    const v = archiveColour(value);
    if (v) out.push(`${selector}{background:${v};box-shadow:0 0 0 100vmax ${v}}`);
  };
  band(s.archive_header_bg, ".archive-band");
  band(s.archive_body_bg, ".archive-body");
  colour(s.archive_title_color, ".archive-title");
  colour(s.archive_desc_color, ".archive-description");
  colour(s.archive_count_color, ".archive-count");
  colour(s.archive_card_title_color, ".archive-card-title,.archive-card-title a");
  colour(s.archive_card_meta_color, ".archive-card-meta");
  colour(s.archive_card_excerpt_color, ".archive-card-excerpt");
  colour(s.archive_card_term_color, ".archive-card-term");
  colour(s.archive_card_more_color, ".archive-card-more");
  colour(s.archive_card_title_hover, ".archive-card-title a:hover");
  out.push(archiveCardOverrideCss(s));
  // The opacity the markup uses for meta, excerpt, description and count is a
  // dimming trick that fights any colour chosen here, so a chosen colour
  // turns it off.
  if (archiveColour(s.archive_card_meta_color)) out.push(`.archive-card-meta{opacity:1}`);
  if (archiveColour(s.archive_card_excerpt_color)) out.push(`.archive-card-excerpt{opacity:1}`);
  if (archiveColour(s.archive_count_color)) out.push(`.archive-count{opacity:1}`);
  if (archiveColour(s.archive_desc_color)) out.push(`.archive-description{opacity:1}`);
  return out.join("");
}

/**
 * The owner's card colours and shape.
 *
 * `.archive-items .archive-card.archive-card` weighs the same as a design's
 * `.archive-items.is-x .archive-card` and is emitted after it, so a chosen
 * value wins. Written plainly it did not: Corner radius did nothing on
 * Elevated, Bordered and Overlay, and Card background did nothing on Minimal,
 * because the design rule out-specified it by two classes. The doubled class
 * is the trick `.bmsbtn.bmsbtn` uses in blockCss, for the same reason.
 *
 * Also emitted after a *term's* design block (see termOverrideCss), so a
 * category that picks its own design still shows the owner's colours.
 */
export function archiveCardOverrideCss(s: Record<string, string>): string {
  const out: string[] = [];
  const card = ".archive-items .archive-card.archive-card";
  const bg = archiveColour(s.archive_card_bg);
  const border = archiveColour(s.archive_card_border);
  const radius = parseInt(s.archive_card_radius ?? "", 10);
  if (bg) out.push(`${card}{background:${bg}}`);
  if (border) out.push(`${card}{border:1px solid ${border}}`);
  if (Number.isFinite(radius) && radius >= 0) out.push(`${card}{border-radius:${radius}px}`);
  return out.join("");
}

/** The grid gap each design uses, so `sizes` can subtract the right number. */
export function archiveGridGap(style: string): number {
  return style === "list" ? 20 : 28;
}

export function contentCss(s: Record<string, string>): string {
  const out: string[] = [];

  // Every explicit value, once — shared by pages, posts and archives.
  for (const [name, width] of Object.entries(LAYOUT_WIDTHS)) {
    out.push(`.content-shell[data-layout="${name}"]{max-width:${width}}`);
  }
  for (const [name, pad] of Object.entries(SPACINGS)) {
    out.push(`.content-shell[data-spacing="${name}"]{padding:${pad}}`);
  }
  // Descendant, not child: `.content-article` sits inside `.content-grid`, which
  // sits inside `.content-shell`. Written with `>` these rules matched nothing
  // at all, which is why Boxed and Unboxed rendered identically — the setting
  // saved correctly and then had no selector to land on.
  out.push(`.content-shell[data-style="boxed"] .content-article{background:var(--color-bg,#fff);border-radius:1rem;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:2rem}`);
  out.push(`.content-shell[data-style="unboxed"] .content-article{background:transparent;box-shadow:none;padding:0}`);

  // What "default" resolves to, per document kind.
  const kinds: [string, string, string, string][] = [
    ["page", s.page_layout, s.page_content_style, s.page_spacing],
    ["post", s.post_layout, s.post_content_style, s.post_spacing],
    ["archive", s.archive_layout, s.archive_content_style, s.archive_spacing],
  ];
  for (const [kind, layout, style, spacing] of kinds) {
    const sel = `.content-shell[data-kind="${kind}"]`;
    out.push(`${sel}[data-layout="default"]{max-width:${LAYOUT_WIDTHS[layout] ?? LAYOUT_WIDTHS.normal}}`);
    out.push(`${sel}[data-spacing="default"]{padding:${SPACINGS[spacing] ?? SPACINGS.default}}`);
    out.push(
      (style || "unboxed") === "boxed"
        ? `${sel}[data-style="default"] .content-article{background:var(--color-bg,#fff);border-radius:1rem;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:2rem}`
        : `${sel}[data-style="default"] .content-article{background:transparent;box-shadow:none;padding:0}`
    );
  }

  // The sidebar is always in the markup and revealed by layout, so it starts
  // hidden. Without this base rule the explicit non-sidebar layouts — fullwidth,
  // normal, narrow — matched nothing and showed the placeholder on every
  // document that had picked one.
  out.push(`.content-sidebar{display:none}`);

  // Sidebar presence follows whichever layout ends up applying.
  for (const kind of ["page", "post", "archive"] as const) {
    const chosen = kind === "page" ? s.page_layout : kind === "post" ? s.post_layout : s.archive_layout;
    const withSidebar = chosen === "left-sidebar" || chosen === "right-sidebar";
    out.push(`.content-shell[data-kind="${kind}"][data-layout="default"] .content-sidebar{display:${withSidebar ? "block" : "none"}}`);
    if (withSidebar) {
      out.push(`.content-shell[data-kind="${kind}"][data-layout="default"] .content-grid{display:grid;gap:2.5rem;grid-template-columns:${chosen === "left-sidebar" ? "260px 1fr" : "1fr 260px"}}`);
      out.push(`.content-shell[data-kind="${kind}"][data-layout="default"] .content-sidebar{order:${chosen === "left-sidebar" ? 0 : 2}}`);
    }
  }
  out.push(`.content-shell[data-layout="left-sidebar"] .content-grid,.content-shell[data-layout="right-sidebar"] .content-grid{display:grid;gap:2.5rem}`);
  out.push(`.content-shell[data-layout="left-sidebar"] .content-grid{grid-template-columns:260px 1fr}`);
  out.push(`.content-shell[data-layout="right-sidebar"] .content-grid{grid-template-columns:1fr 260px}`);
  out.push(`.content-shell[data-layout="left-sidebar"] .content-sidebar{display:block;order:0}`);
  out.push(`.content-shell[data-layout="right-sidebar"] .content-sidebar{display:block;order:2}`);
  out.push(`.content-article{order:1;min-width:0}`);

  // Title / meta / featured image visibility
  out.push(`.content-shell[data-kind="page"] .content-title{display:${s.page_title_show === "false" ? "none" : "block"}}`);
  out.push(`.content-shell[data-kind="post"] .content-title{display:${s.post_title_show === "false" ? "none" : "block"}}`);
  out.push(`.content-shell[data-kind="post"] .content-meta{display:${s.post_meta_show === "false" ? "none" : "block"}}`);
  out.push(`.content-shell[data-kind="post"] .content-feature{display:${s.post_feature_show === "false" ? "none" : "block"}}`);
  out.push(`.archive-title{display:${s.archive_title_show === "false" ? "none" : "block"}}`);

  // ── The archive's two bands ─────────────────────────────────────────────
  //
  // The header and the card grid each sit on a strip of colour that runs the
  // full width of the window while their contents stay in the reading column.
  //
  // `box-shadow` + `clip-path` rather than the usual `margin-left:calc(50% -
  // 50vw);width:100vw`: `100vw` counts the scrollbar, so that recipe adds a
  // horizontal scrollbar on every archive at most desktop widths. A spread
  // shadow paints the same colour outwards without touching layout at all, and
  // the `clip-path` stops it bleeding vertically onto its neighbours.
  const headerBg = s.archive_header_bg || "#f1f2f4";
  const bodyBg = s.archive_body_bg || "#fafafa";
  out.push(
    `.archive-band{background:${headerBg};box-shadow:0 0 0 100vmax ${headerBg};clip-path:inset(0 -100vmax);padding:3.25rem 0 2.75rem}`
  );
  out.push(
    `.archive-body{background:${bodyBg};box-shadow:0 0 0 100vmax ${bodyBg};clip-path:inset(0 -100vmax);padding:3rem 0 3.5rem}`
  );
  // The description is prose, so it gets a reading measure rather than the
  // full column width the title uses.
  out.push(`.archive-description{max-width:46rem}`);

  // The category filter chips. `color-mix` against `currentColor` rather than
  // a fixed `rgb(0 0 0/.05)`: the row used a black tint, which on a dark theme
  // is a chip you cannot see. The active one takes the site's primary colour,
  // as it always did — from CSS now, not an inline style, so the Custom CSS
  // box can reach it.
  out.push(`.archive-chip{background:color-mix(in srgb,currentColor 9%,transparent);transition:background .15s}`);
  out.push(`.archive-chip:hover{background:color-mix(in srgb,currentColor 16%,transparent)}`);
  out.push(`.archive-chip.is-active{background:var(--color-primary,#0ea5e9);color:var(--color-primary-fg,#fff)}`);
  // A browser without `color-mix` (Safari before 16.2) gets the old tint.
  out.push(`@supports not (background:color-mix(in srgb,red 1%,transparent)){.archive-chip{background:rgb(127 127 127/.14)}}`);

  // Owner colours, emitted after the defaults so they win, and only for the
  // ones actually set — an empty field keeps the tint above rather than
  // resolving to an invalid declaration. `archiveColour` is the same guard the
  // other archive colours use, so a value that could break out of the
  // declaration never reaches the stylesheet.
  const chipColor = archiveColour(s.archive_chip_color);
  const chipBg = archiveColour(s.archive_chip_bg);
  const chipOnColor = archiveColour(s.archive_chip_active_color);
  const chipOnBg = archiveColour(s.archive_chip_active_bg);
  if (chipColor || chipBg) {
    const decls = [chipColor && `color:${chipColor}`, chipBg && `background:${chipBg}`].filter(Boolean).join(";");
    // Doubled class so this outranks the `.archive-chip:hover` tint above,
    // which is a single class and would otherwise win on the hover state.
    out.push(`.archive-chip.archive-chip{${decls}}`);
  }
  if (chipOnColor || chipOnBg) {
    const decls = [chipOnColor && `color:${chipOnColor}`, chipOnBg && `background:${chipOnBg}`].filter(Boolean).join(";");
    out.push(`.archive-chip.archive-chip.is-active{${decls}}`);
  }

  // ── Card design ─────────────────────────────────────────────────────────
  //
  // One preset for the whole grid, applied as `is-<name>` on `.archive-items`
  // by the renderer. Every design is CSS over the same markup, so switching
  // one is a stylesheet change and never a republish.
  const style = s.archive_card_style || "classic";
  out.push(
    `.archive-card{background:var(--color-bg,#fff);border:0;border-radius:2px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04)}`
  );
  out.push(`.archive-card-image{border-radius:0}`);
  out.push(archiveCardStyleCss(style));

  // ── Archive colours ─────────────────────────────────────────────────────
  //
  // Each one is unset by default, so a site that has never opened this panel
  // keeps the look it had. They exist because the bands carry their own
  // background: a dark theme wrote white text onto a near-white strip and the
  // archive title was invisible, with no control anywhere to fix it.
  out.push(archiveColourCss(s));

  // Archive columns. The List design is one per row by definition, so it sets
  // the count rather than being overridden by it.
  const cols = style === "list" ? 1 : Math.min(4, Math.max(1, parseInt(s.archive_columns) || 3));
  out.push(`.archive-items{display:grid;gap:${style === "list" ? "1.25rem" : "1.75rem"};grid-template-columns:repeat(1,minmax(0,1fr))}`);
  if (cols > 1) {
    out.push(`@media(min-width:640px){.archive-items{grid-template-columns:repeat(${Math.min(2, cols)},minmax(0,1fr))}}`);
    if (cols > 2) out.push(`@media(min-width:1024px){.archive-items{grid-template-columns:repeat(${cols},minmax(0,1fr))}}`);
  }

  return out.join("");
}

/** Base, secondary and outline button styles, applied via .btn / .btn-2 / .btn-outline. */
export function buttonCss(s: Record<string, string>): string {
  const out: string[] = [];

  const solid = (sel: string, p: string, fallbackBg: string) => {
    const bg = s[p + "_bg"] || fallbackBg;
    // No explicit text colour: read it off the background rather than
    // assuming white. `readableOn` returns "" for a non-hex background such
    // as `var(--color-primary,…)`, and that case is carried by the
    // `--color-primary-fg` variable instead.
    const fg = s[p + "_text"] || readableOn(bg) || "#ffffff";
    out.push(`${sel}{display:inline-block;background:${bg};color:${fg};border-radius:${s[p + "_radius"] || "8"}px;padding:${s[p + "_pad_y"] || "10"}px ${s[p + "_pad_x"] || "18"}px;font-size:${s[p + "_font_size"] || "14"}px;font-weight:${s[p + "_font_weight"] || "600"};line-height:1.2;transition:background .15s,color .15s}`);
    if (s[p + "_bg_hover"] || s[p + "_text_hover"]) {
      const parts: string[] = [];
      if (s[p + "_bg_hover"]) parts.push(`background:${s[p + "_bg_hover"]}`);
      if (s[p + "_text_hover"]) parts.push(`color:${s[p + "_text_hover"]}`);
      out.push(`${sel}:hover{${parts.join(";")}}`);
    } else {
      out.push(`${sel}:hover{opacity:.9}`);
    }

    if (s[p + "_border_color"]) out.push(`${sel}{border:1px solid ${s[p + "_border_color"]}}`);
    if (s[p + "_border_color_hover"]) out.push(`${sel}:hover{border-color:${s[p + "_border_color_hover"]}}`);
    if (s[p + "_shadow"]) out.push(`${sel}{box-shadow:${s[p + "_shadow"]}}`);
    if (s[p + "_shadow_hover"]) out.push(`${sel}:hover{box-shadow:${s[p + "_shadow_hover"]}}`);
  };

  solid(".btn", "btn", "var(--color-primary,#0ea5e9)");
  solid(".btn-2", "btn2", "var(--color-secondary,#64748b)");

  const ob = s.btno_border || "currentColor";
  out.push(`.btn-outline{display:inline-block;background:transparent;color:${s.btno_text || "inherit"};border:${s.btno_border_width || "1"}px solid ${ob};border-radius:${s.btno_radius || "8"}px;padding:${s.btno_pad_y || "10"}px ${s.btno_pad_x || "18"}px;font-size:${s.btn_font_size || "14"}px;font-weight:${s.btn_font_weight || "600"};line-height:1.2;transition:background .15s,color .15s}`);
  // Only when there is something to say; an empty `.btn-outline:hover{}` was
  // on every page.
  if (s.btno_bg_hover || s.btno_text_hover) out.push(`.btn-outline:hover{${s.btno_bg_hover ? `background:${s.btno_bg_hover};` : ""}${s.btno_text_hover ? `color:${s.btno_text_hover}` : ""}}`);
  if (s.btno_shadow) out.push(`.btn-outline{box-shadow:${s.btno_shadow}}`);
  if (s.btno_shadow_hover) out.push(`.btn-outline:hover{box-shadow:${s.btno_shadow_hover}}`);

  return out.join("");
}

/** Transparent header state — used when a document opts in. */
export function transparentHeaderCss(s: Record<string, string>): string {
  const out: string[] = [];
  const sel = "header.is-transparent";
  out.push(`${sel}{background-color:${s.thdr_bg || "transparent"};border-bottom:${s.thdr_border ? `1px solid ${s.thdr_border}` : "none"}}`);
  if (s.thdr_height) out.push(`${sel}{height:${s.thdr_height}px}`);
  if (s.thdr_text) out.push(`${sel},${sel} a,${sel} .hnav-link{color:${s.thdr_text}}`);
  if (s.thdr_text_hover) out.push(`${sel} a:hover,${sel} .hnav-link:hover{color:${s.thdr_text_hover}}`);
  if (s.thdr_logo) out.push(`${sel} .site-logo{content:url(${s.thdr_logo})}`);
  return out.join("");
}

/** Sticky header — the stuck state is marked by StickyHeader adding .is-stuck. */
export function stickyHeaderCss(s: Record<string, string>): string {
  // Off: nothing to write. `position:static` is what a header is without any
  // rule, and no other rule here makes it sticky, so the line was a no-op on
  // every page of a site with the sticky header switched off.
  if (s.header_sticky === "false") return "";
  const out: string[] = [];
  out.push(`header.hdr-desktop,header.hdr-mobile,header.hdr-both{position:sticky;top:0;z-index:50}`);
  if (s.hsticky_rows === "all") {
    out.push(`.hdr-desktop,.hdr-mobile,.hdr-both{position:sticky;top:0;z-index:49}`);
  }
  const stuck = "header.is-stuck";
  if (s.hsticky_bg) out.push(`${stuck}{background-color:${s.hsticky_bg}}`);
  if (s.hsticky_text) out.push(`${stuck},${stuck} a,${stuck} .hnav-link{color:${s.hsticky_text}}`);
  out.push(`${stuck}{box-shadow:${s.hsticky_shadow === "false" ? "none" : "0 2px 12px rgba(0,0,0,.10)"}}`);
  if (s.hsticky_shrink === "true") {
    out.push(`${stuck}{height:${s.hsticky_shrink_height || "56"}px;transition:height .18s ease}`);
  }
  // A jump to a heading — a Table of Contents link, any `#section` link,
  // `scrollIntoView` — put the heading at the very top of the window, behind
  // the stuck header. `scroll-padding-top` moves every one of those down by
  // the header's stuck height: the main row (shrunk when that is on), plus
  // the top and bottom bars when shown, plus a little air.
  const px = (v: string | undefined, fallback: number) => {
    const n = parseInt(v ?? "", 10);
    return Number.isFinite(n) && n > 0 && n < 400 ? n : fallback;
  };
  const main = s.hsticky_shrink === "true" ? px(s.hsticky_shrink_height, 56) : px(s.header_height, 64);
  const bars =
    (s.header_topbar_enabled === "true" ? px(s.hrow_topbar_height, 40) : 0) +
    (s.header_bottombar_enabled === "true" ? px(s.hrow_bottombar_height, 40) : 0);
  out.push(`html{scroll-padding-top:${main + bars + 16}px}`);
  return out.join("");
}

/** Per-row footer colours and padding. */
export function footerRowCss(s: Record<string, string>): string {
  const out: string[] = [];
  for (const row of ["toprow", "main", "bottomrow"]) {
    const sel = `[data-bms-row="ftr:${row}"]`;
    const bg = s[`footer_${row}_bg`];
    const text = s[`footer_${row}_text`];
    const link = s[`footer_${row}_link`];
    const pad = s[`footer_${row}_padding`];
    // Independent top/bottom border per row — colour and width each their own
    // control, the same shape as the header's Main Row border.
    const borderTop = s[`footer_${row}_border_top`];
    const borderBottom = s[`footer_${row}_border_bottom`];
    const bwTop = s[`footer_${row}_border_width_top`] || "1";
    const bwBottom = s[`footer_${row}_border_width_bottom`] || "1";
    // One rule per row, not one per setting: four `[data-bms-row="ftr:main"]{…}`
    // blocks in a row were the same selector written four times.
    const own = [
      backgroundDecls(bg),
      text ? `color:${text}` : "",
      borderTop ? `border-top:${bwTop}px solid ${borderTop}` : "",
      borderBottom ? `border-bottom:${bwBottom}px solid ${borderBottom}` : "",
    ].filter(Boolean);
    if (own.length) out.push(`${sel}{${own.join(";")}}`);
    if (link) out.push(`${sel} a{color:${link}}`);
    if (pad) out.push(`${sel} > div{padding-top:${pad}px;padding-bottom:${pad}px}`);
  }
  return out.join("");
}

/** Dark mode palette, applied by the same variables the light theme uses. */
export function darkModeCss(s: Record<string, string>): string {
  const mode = s.dark_mode || "off";
  if (mode === "off") return "";

  const vars: string[] = [];
  // `color_bg_dark` is honoured as a fallback: a control on the Colors screen
  // wrote that key for a while and nothing read it, so any site that set a dark
  // background there has a saved value that never applied. Reading it here
  // makes those settings take effect rather than asking the owner to notice
  // and re-enter them.
  const darkBg = s.dark_bg || s.color_bg_dark;
  if (darkBg) vars.push(`--color-bg:${darkBg}`);
  if (s.dark_text) vars.push(`--color-text:${s.dark_text}`);
  if (s.dark_heading) vars.push(`--color-heading:${s.dark_heading}`);
  if (s.dark_primary) vars.push(`--color-primary:${s.dark_primary}`);
  if (s.dark_header_bg) vars.push(`--header-bg:${s.dark_header_bg}`);
  if (s.dark_header_text) vars.push(`--header-text:${s.dark_header_text}`);
  if (s.dark_footer_bg) vars.push(`--footer-bg:${s.dark_footer_bg}`);
  if (s.dark_footer_text) vars.push(`--footer-text:${s.dark_footer_text}`);
  if (!vars.length) return "";

  const block = vars.join(";");
  const out = [`:root[data-theme="dark"]{${block}}`];
  if (mode === "system") {
    // Follow the OS, but never override an explicit light choice.
    out.push(`@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${block}}}`);
  }
  return out.join("");
}

/** Header rows: layout, height, background, border and padding — per row. */
export function headerRowCss(s: Record<string, string>): string {
  const out: string[] = [];
  for (const row of ["topbar", "main", "bottombar"]) {
    // Only the "main" row is an actual `<header>` element (topbar/bottombar
    // are plain divs) — and chromeCss's `header.hdr-desktop` selector, which
    // only ever matches that element, has specificity (0,1,1). A bare
    // `[data-hrow="main"]` (0,1,0) always lost to it, so every Main Row
    // background/border setting here was silently overridden by the generic
    // header background and the "Bottom border" toggle's border, no matter
    // what colour or width the Customizer showed as saved.
    const sel = row === "main" ? `header[data-hrow="${row}"]` : `[data-hrow="${row}"]`;
    const k = (x: string) => s[`hrow_${row}_${x}`] || "";

    const layout = k("layout") || "standard";
    // "standard" keeps a full-width background with contained content;
    // "fullwidth" frees the content too; "contained" pulls the background in.
    out.push(`${sel} > .hrow-inner{max-width:${layout === "fullwidth" ? "100%" : "72rem"};margin-inline:auto}`);
    if (layout === "contained") out.push(`${sel}{max-width:72rem;margin-inline:auto}`);

    if (k("height")) out.push(`${sel}{min-height:${k("height")}px}`);
    const bg = backgroundDecls(k("bg"));
    if (bg) out.push(`${sel}{${bg}}`);
    if (k("padding")) out.push(`${sel} > .hrow-inner{padding-top:${k("padding")}px;padding-bottom:${k("padding")}px}`);

    // Legacy fallback: a site saved before the sides split kept one shared
    // width under `border_width`; either side's own key wins once set.
    const legacyBw = k("border_width") || "1";
    const bwTop = k("border_width_top") || legacyBw;
    const bwBottom = k("border_width_bottom") || legacyBw;
    if (k("border_top")) out.push(`${sel}{border-top:${bwTop}px solid ${k("border_top")}}`);
    if (k("border_bottom")) out.push(`${sel}{border-bottom:${bwBottom}px solid ${k("border_bottom")}}`);

    // Transparent-header variant wins over the normal background.
    const transBg = backgroundDecls(k("trans_bg"));
    if (transBg) out.push(`.is-transparent ${sel},${sel}.is-transparent{${transBg}}`);
  }
  return out.join("");
}

/** Per-level heading typography, h1 through h6. */
export function headingCss(s: Record<string, string>): string {
  const out: string[] = [];
  for (let n = 1; n <= 6; n++) {
    const parts: string[] = [];
    if (s[`h${n}_size`]) parts.push(`font-size:${s[`h${n}_size`]}px`);
    if (s[`h${n}_weight`]) parts.push(`font-weight:${s[`h${n}_weight`]}`);
    if (s[`h${n}_color`]) parts.push(`color:${s[`h${n}_color`]}`);
    if (s[`h${n}_lh`]) parts.push(`line-height:${s[`h${n}_lh`]}`);
    if (parts.length) out.push(`h${n}{${parts.join(";")}}`);
  }
  return out.join("");
}

/** The mobile off-canvas panel opened by the Trigger item. */
export function offCanvasCss(s: Record<string, string>): string {
  const side = s.offcanvas_side === "left" ? "left" : "right";
  const full = s.offcanvas_layout === "fullwidth";
  const width = full ? "100%" : `min(${s.offcanvas_width || "400"}px,90vw)`;
  const anim = s.offcanvas_anim || "fade";

  const hidden =
    anim === "scale" ? "opacity:0;transform:scale(.96)"
    : anim === "slice" ? `opacity:1;transform:translateX(${side === "left" ? "-100%" : "100%"})`
    : "opacity:0";

  return [
    `.offcanvas{position:fixed;top:0;bottom:0;${side}:0;width:${width};z-index:120;overflow-y:auto;padding:1.5rem;`
      + `${backgroundDecls(s.offcanvas_bg) || "background-color:var(--header-bg,#fff)"};color:${s.offcanvas_text || "var(--header-text,#0f172a)"};`
      + `text-align:${startAlign(s.offcanvas_align)};transition:opacity .2s ease,transform .2s ease;${hidden};visibility:hidden}`,
    `.offcanvas.is-open{opacity:1;transform:none;visibility:visible}`,
    `.offcanvas-backdrop{position:fixed;inset:0;z-index:119;background:rgba(0,0,0,.45);opacity:0;visibility:hidden;transition:opacity .2s}`,
    `.offcanvas-backdrop.is-open{opacity:1;visibility:visible}`,
    // 44px: a fingertip target (WCAG 2.5.5), whatever size the × itself is.
    `.offcanvas-close{font-size:${s.offcanvas_close_size || "24"}px;line-height:1;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;margin:-10px -10px 0 0}`,
    // The panel renders its items with the header's own zone markup (a row) and
    // the header's menu (also a row), so a five-link menu ran sideways off a
    // phone and pushed the header button out of view. Inside the panel both
    // are a column: one link per line, the button full width underneath.
    `.offcanvas>.flex.items-center{flex-direction:column;align-items:stretch;gap:1.25rem}`,
    `.offcanvas .hnav{display:flex;flex-direction:column;align-items:stretch}`,
    `.offcanvas .hnav-link{display:block;width:100%;padding:.8rem .25rem;font-size:1.0625rem}`,
    `.offcanvas .hnav-underline{display:none}`,
    // Dropdowns open on hover, which a phone does not have: the sub-pages were
    // unreachable from the panel. In it they are always shown, indented under
    // their parent, each a full-width tap target.
    `.offcanvas .hnav-item{flex-direction:column;align-items:stretch}`,
    `.offcanvas .hnav-dd,.offcanvas .hnav-dd.is-mega{position:static;opacity:1;visibility:inherit;transform:none;width:auto;display:block;box-shadow:none;background:transparent;border-radius:0;padding:0 0 .5rem;margin:0 0 0 .75rem;border-inline-start:2px solid color-mix(in srgb,currentColor 20%,transparent)}`,
    `.offcanvas .hnav-dd-item{display:block;padding:.65rem .75rem;font-size:1rem;min-height:44px}`,
    `.offcanvas .hnav-link>.ms-1{display:none}`,
    `.offcanvas .btn{display:block;text-align:center}`,
  ].join("");
}

/**
 * Content link styling and font rendering.
 *
 * The link rules are wrapped in `:where()` so they weigh no more than a bare
 * `a`. They used to be `.content-article a`, which outranks every single-class
 * rule — including the theme's own `.btn{color:#fff}`. A "Theme Base" button
 * in an article was white-on-red in the editor (no article wrapper there) and
 * red-on-red on the live page, where the link colour won. A block that sets
 * its own colour class is always the more specific intent; the article link
 * colour is the default for links that say nothing.
 *
 * The hover state is `:where(:hover)` for the same reason: it must not
 * outrank a block's normal-state colour either.
 */
export function typeExtrasCss(s: Record<string, string>): string {
  const out: string[] = [];
  const scope = ":where(.content-article,.search-item) a";
  const hover = `${scope}:where(:hover)`;

  if ((s.link_style || "standard") === "plain") {
    out.push(`${scope}{text-decoration:none}`);
    out.push(`${hover}{text-decoration:underline}`);
  } else {
    out.push(`${scope}{text-decoration:underline;text-underline-offset:.15em}`);
  }
  if (s.link_color) out.push(`${scope}{color:${s.link_color}}`);
  if (s.link_color_hover) out.push(`${hover}{color:${s.link_color_hover}}`);

  if (s.font_smoothing === "true") {
    out.push(`body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}`);
  }
  return out.join("");
}

/**
 * Every stylesheet the site needs, in one list.
 *
 * The server render and the live preview BOTH call this. Keeping a single list
 * is deliberate: when they each composed their own, adding the search builder to
 * one and forgetting the other made those controls silently stop previewing.
 * Add new CSS builders here and both paths pick them up.
 */
/**
 * Nothing this file produces may close the element it is written into.
 *
 * Every builder below interpolates settings values straight into declarations,
 * and the whole result goes inside a `<style>`. An HTML parser ends that
 * element at the first `</style`, whatever the CSS context — so a colour of
 * `red</style><script>…` broke out and ran. A colour comes from a picker and
 * has no business carrying markup, and Custom CSS is CSS, not HTML.
 *
 * Applied once to the assembled sheet rather than at ~200 interpolation sites:
 * a new builder cannot forget it, and no valid stylesheet contains this
 * sequence, so nothing legitimate is affected. The same neutralisation
 * `authorCss` already performs for a block's own custom CSS.
 */
function sealStyleElement(css: string): string {
  // Until nothing is left: a single pass turns `<</style/style>` into `</style>`.
  let out = css;
  for (let prev = ""; prev !== out; ) {
    prev = out;
    out = out.replace(/<\/\s*style/gi, "");
  }
  return out;
}

/**
 * Speed → Page optimisation → "Skip rendering what is off screen".
 *
 * Deliberately a positional rule rather than a class on each block: the
 * renderer wraps every top-level block in a fragment, so marking them would
 * mean a wrapper element around each one, and `.prose-content > *` selectors,
 * `:nth-child` ordering and block spacing all read the current shape of that
 * list. A rule that counts children changes no markup at all.
 *
 * The first few are always rendered, because the Largest Contentful Paint
 * element is normally among them and containing it would make the very
 * measurement this exists to improve worse.
 *
 * `contain-intrinsic-size: auto 600px` gives the browser a height to reserve
 * for a block it has not measured yet; `auto` then has it remember the real
 * height once it has, so a placeholder guess is wrong at most once and the
 * scrollbar settles. Screen only — in print there is no viewport to be
 * outside of, and a contained block would come out blank.
 */
export function offscreenCss(s: Record<string, string>): string {
  if (s.render_offscreen !== "true") return "";
  const raw = parseInt(s.render_offscreen_after || "3", 10);
  const after = Math.min(Math.max(Number.isFinite(raw) ? raw : 3, 1), 20);
  return `@media screen{.prose-content>*:nth-child(n+${after + 1}){content-visibility:auto;contain-intrinsic-size:auto 600px}}`;
}

export function allSiteCss(raw: Record<string, string>): string {
  // Resolve palette references once; every builder below then sees real colours.
  const s = resolvePalette(raw);
  return sealStyleElement([
    paletteCss(raw),
    buildCssVars(s),
    headerResponsiveCss(s),
    chromeCss(s),
    searchCss(s),
    singlePostCss(s),
    singlePageCss(s),
    headerSearchCss(s),
    headerNavCss(s),
    identityCss(s),
    surfaceCss(s),
    blockBoxCss(),
    blockCss(),
    FACADE_CSS,
    TIMELINE_CSS,
    DOWNLOAD_BOX_CSS,
    LOAD_MORE_CSS,
    scrollTopCss(s),
    blockGapCss(s),
    progressCss(s),
    headerRowCss(s),
    headingCss(s),
    typeExtrasCss(s),
    offCanvasCss(s),
    contentCss(s),
    buttonCss(s),
    transparentHeaderCss(s),
    stickyHeaderCss(s),
    footerRowCss(s),
    darkModeCss(s),
    offscreenCss(s),
    s.custom_css || "",
  ].join("\n"));
}

/** The stylesheet the preview bridge swaps in on every keystroke. */
export const previewCss = allSiteCss;

/**
 * `allSiteCss` for the server render, memoised on the settings it was built
 * from.
 *
 * Every page render rebuilds the same ~20 builders from the same rows, and the
 * result only changes when someone saves the Customizer. One entry is the right
 * size: a site has one set of settings, so the second request onward is a
 * string compare instead of the whole pipeline.
 *
 * Deliberately not used for `previewCss` — the customizer changes settings on
 * every keystroke, so it would miss every time and pay the key cost for nothing.
 */
/**
 * Keyed by the settings object's own identity, not a stringified copy of its
 * contents.
 *
 * A `let` holding the last computed value — module-level, shared by every
 * request this Node process ever handles — raced: while one request's
 * `getSiteSettings()` `await` was pending, a second, concurrent request could
 * run its own compute-and-overwrite in between, so the first request resumed
 * to find the shared slot pointing at a different request's CSS. The
 * `/site/[file]` route computed a stale "current" hash against the *correct*
 * settings, so the embedded `<link>` never matched, and the "current" hash
 * kept failing its own immutability check — every visitor's stylesheet
 * request skipped LiteSpeed's and Cloudflare's cache and hit Node every time,
 * silently, for as long as this had been live.
 *
 * `getSiteSettings()` is `cache()`-wrapped, so it returns one object per
 * request — every call within a request sees the same reference, and no two
 * requests ever share one. A `WeakMap` keyed on that reference is therefore
 * scoped to the request by construction, costs nothing across requests to
 * evict (garbage collected with the settings object itself), and cannot race.
 */
interface CssEntry {
  css: string;
  hash: string;
  /** The last trimmed variant, and the block types it was trimmed for. */
  trimmed?: { key: string; css: string; hash: string };
}

const _cssCache = new WeakMap<object, CssEntry>();

/**
 * The site stylesheet, optionally without the blocks this page does not use.
 *
 * `present` is the set of block types the page contains; leaving it out means
 * "emit everything", which is what the `/site/<hash>.css` route and the
 * customizer want. See `cssTrim.ts` for why trimming is only safe when the
 * stylesheet is inlined.
 *
 * One trimmed slot is enough: the cache is keyed on a settings object that
 * `getSiteSettings()` creates once per request, and a request renders one
 * page, so there is only ever one set of present blocks to remember.
 */
export function cachedSiteCss(raw: Record<string, string>, present?: Set<string>): string {
  if (!present) return (_cssCache.get(raw) ?? computeAndCache(raw)).css;
  return trimmedEntry(raw, present).css;
}

function trimmedEntry(raw: Record<string, string>, present: Set<string>): { key: string; css: string; hash: string } {
  const base = _cssCache.get(raw) ?? computeAndCache(raw);
  const key = [...present].sort().join(",");
  if (base.trimmed?.key === key) return base.trimmed;
  const css = trimSiteCss(base.css, present);
  base.trimmed = { key, css, hash: fingerprint(css) };
  return base.trimmed;
}

function computeAndCache(raw: Record<string, string>): CssEntry {
  const css = allSiteCss(raw) + fontFallbackCss(raw);
  const entry: CssEntry = { css, hash: fingerprint(css) };
  _cssCache.set(raw, entry);
  return entry;
}

/**
 * A short fingerprint of the current site CSS, for the stylesheet URL.
 *
 * The CSS used to be inlined in every page — 26 KB, and because React streams
 * a page as HTML *and* as a hydration payload, it was in every page twice.
 * Served as `/site/<hash>.css` instead, it downloads once per visitor and is
 * cached for a year; a settings change produces a new hash, so no cache is
 * ever wrong. Memoised with the CSS itself, since hashing on every render
 * would be paying for the thing we are trying to avoid.
 */
export function siteCssHash(raw: Record<string, string>, present?: Set<string>): string {
  if (present) return trimmedEntry(raw, present).hash;
  return (_cssCache.get(raw) ?? computeAndCache(raw)).hash;
}

/**
 * FNV-1a, run twice with different seeds, as 16 hex characters.
 *
 * Not `node:crypto`: this module is also bundled for the browser (the
 * customizer's preview bridge builds CSS client-side), and webpack refuses a
 * `node:` import there. For a cache-busting name, a 64-bit non-cryptographic
 * hash is more than enough — a collision would need two different settings
 * sets to produce the same key, and the cost would be one stale stylesheet.
 */
function fingerprint(text: string): string {
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return fnv(2166136261) + fnv(0x9747b28c);
}

/**
 * The few settings the preview genuinely cannot show without a server render.
 * Layout, zones and widget content are all live now — these are page-level
 * concerns the chrome preview doesn't cover.
 */
export const STRUCTURAL_KEYS = new Set<string>([
  "homepage_id",
  "posts_per_page",
  "maintenance_mode",
  "maintenance_title",
  "maintenance_message",
  "maintenance_bg_color",
  "script_head",
  "script_body_end",
  "dark_mode",
]);

/** Text bindings the bridge can update in place via data-bms-text attributes. */
export const TEXT_KEYS = ["site_name", "site_description", "footer_bottom_text", "header_button_text"] as const;
