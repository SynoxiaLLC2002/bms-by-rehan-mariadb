// A Server Component on purpose: it has no state, no handlers and no browser
// APIs, so shipping its ~560 lines to the browser would buy nothing. Only the
// four interactive blocks below are client code, and each loads on demand.

import { htmlSig } from "@/lib/htmlSig";
import React from "react";
import dynamic from "next/dynamic";
import { parseBox, hasBox, boxClass, boxVars, boxMargin } from "@/lib/blockBox";
import {
  RowDivider,
  RowOverlay,
  resolveRow,
  rowCustomCss,
  rowLinkCss,
  rowHiddenForViewer,
  usesViewerVisibility,
  parseAllColumns,
  parseColumns,
  serializeColumns,
} from "@/lib/rowLayout";
import { auth } from "@/lib/auth";
import { resolveSection, sectionHiddenClass } from "@/lib/section";
import { parseConditions, parseInZone, shouldDisplay, usesConditions, type ViewerContext } from "@/lib/conditions";
import ScrollAnimations from "./ScrollAnimations";
import { uiText, type UiText } from "@/lib/uiText";
import ButtonGroup from "./blocks/ButtonGroup";
import IconListView from "./blocks/IconListView";
import { iconListScope } from "@/lib/iconList";
import InfoBoxView from "./blocks/InfoBoxView";
import IframeEmbedView from "./blocks/IframeEmbedView";
import StepsGridView from "./blocks/StepsGridView";
import HighlightPanelView from "./blocks/HighlightPanelView";
import type { ImgRender } from "./blocks/blockKit";
import HeroView from "./blocks/HeroView";
import CtaBandView from "./blocks/CtaBandView";
import CardGridView from "./blocks/CardGridView";
import StatsStripView from "./blocks/StatsStripView";
import ProsConsView from "./blocks/ProsConsView";
import CallBarView from "./blocks/CallBarView";
import LogoStripView from "./blocks/LogoStripView";
import NoticeBarView from "./blocks/NoticeBarView";
import ComparisonTableView from "./blocks/ComparisonTableView";
import VersionHistoryView from "./blocks/VersionHistoryView";
import LinkGridView from "./blocks/LinkGridView";
import ReviewGridView from "./blocks/ReviewGridView";
import PriceListView from "./blocks/PriceListView";
import KeyTakeawaysView from "./blocks/KeyTakeawaysView";
import FactSheetView from "./blocks/FactSheetView";
import ShareButtonsView from "./blocks/ShareButtonsView";
import { infoBoxScope } from "@/lib/infoBox";
import { accordionScope, faqSchemaFor, parsePanes, resolveAccordion, serializePanes } from "@/lib/accordion";
import { headingSlug, tocScope } from "@/lib/tableOfContents";
import { authorBioScope } from "@/lib/authorBio";
import type { AuthorLike } from "@/components/frontend/AuthorProfile";
import { jsonLd } from "@/lib/seo";
import { tableScope } from "@/lib/table";
import TableView from "./blocks/TableView";
import { buttonScope } from "@/lib/button";
import CountUpFE from "./blocks/CountUpClient";
import CountdownFE from "./blocks/CountdownClient";
import PostGridFE from "./blocks/PostGridFE";
import { socialHref, socialNetwork } from "@/lib/socialNetworks";
import { parseFields } from "@/lib/forms";
import { withoutDefaults } from "@/lib/styleDefaults";
import { textAdvancedWrapOverrides, textAdvancedTextOverrides, TA_WRAP_CLASS, taTextClass } from "@/lib/textAdvanced";
import { absoluteUrl, lookupImageSizes, type ImageInfo } from "@/lib/seoMeta";
import { getSiteSettings } from "@/lib/settings";
import { intIn, on, speedSettings } from "@/lib/speed";
import { facadeHtml, facadeIframes, facadeTarget } from "@/lib/videoFacade";
import DownloadBoxView from "@/components/shared/DownloadBoxView";
import { inferCategory, resolveDownloadBox } from "@/lib/downloadBox";
import { appInfoSchema, resolveAppInfo } from "@/lib/appInfo";
import { pruneUndefined } from "@/lib/pruneTree";
import { safeHref, styleClass } from "@/lib/blockStyle";
import type { ContentColumn } from "@/lib/contentColumn";
import { preconnectHosts } from "@/lib/preconnect";
import { renderInline, resolveColor, textBlockStyle } from "@/lib/inlineContent";
import { DAYS, addressLines, dayName, localEnabled, mapEmbedUrl, parseHours } from "@/lib/localSeo";
import { siteUrl } from "@/lib/siteUrl";
import { documentDir, siteLang } from "@/lib/locale";
import { expandShortcodes, loadPlugin, pluginContainerHtml, soleShortcode } from "@/lib/plugins";
import ContentImage from "@/components/frontend/ContentImage";
import Icon from "@/components/shared/Icon";

// The interactive (client) blocks come through a client module so each gets
// a chunk of its own — see blocks/lazy.tsx for why `dynamic()` here did not.
import { AccordionFE, ContactFormFE, ImageCompareFE, LottieFE, ModalFE, ShowMoreFE, SliderFE, TableOfContentsFE, TabsFE } from "./blocks/lazy";
// A Server Component: it stays here, and this `dynamic` only defers its import.
const AuthorBioFE = dynamic(() => import("./blocks/AuthorBioFE"));
import AppInfoView from "./blocks/AppInfoView";
import { blockSchemaId } from "@/lib/blockSchema";
import { DEFAULT_LINK_POLICY, externalLinkPolicy, externalLinkProps, newTabProps, type ExternalLinkPolicy } from "@/lib/linkRel";
import BlockStyle from "@/components/shared/BlockStyle";

type AnyBlock = Record<string, any>;

function getTextContent(content: AnyBlock[]): string {
  if (!Array.isArray(content)) return "";
  return content.map((c) => (c.type === "link" ? getTextContent(c.content ?? []) : c.text ?? "")).join("");
}

function getEmbedUrl(url: string): string | null {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return url;
}

/**
 * Wraps a block in its spacing / visibility box when it has one.
 *
 * Blocks with no box render exactly as before — no extra element — so this
 * costs nothing on content that never used the controls.
 */
function withBox(block: AnyBlock, node: React.ReactNode): React.ReactNode {
  const box = parseBox((block.props as Record<string, unknown> | undefined)?.bx);
  if (!hasBox(box)) return node;
  return (
    <div
      className={boxClass(box)}
      style={boxVars(box) as React.CSSProperties}
      data-bx-an-replay={box.an && box.anR === "1" ? "1" : undefined}
    >
      {node}
    </div>
  );
}

/**
 * One malformed block must not take down the page.
 *
 * Every block's markup is built eagerly inside `renderBlockInner` — the `.map`
 * calls, the JSON parsing, the number coercions all run right here — so a
 * single bad prop threw straight out of the render and the visitor got a 500
 * for the *whole post*, not a missing block. Content that survived an editor
 * upgrade, or a block type that changed shape, is exactly the kind of thing
 * that should degrade to a gap rather than an error page.
 *
 * Not a substitute for an error boundary: this catches what is thrown while the
 * element tree is being built, which is where this renderer does its work, but
 * not what a child component throws later during React's own render.
 */
/**
 * Intrinsic sizes for the images in the document being rendered.
 *
 * Set once per `BlockRenderer` pass, immediately before the tree is built, and
 * read synchronously while it is. Module scope rather than a parameter because
 * `renderBlock` recurses through every block type, and threading a map to the
 * one case that needs it would touch the entire file.
 *
 * Server rendering is synchronous within a pass, so this cannot interleave
 * between two documents: the value is written and consumed before any await.
 */
let imageSizes: Map<string, ImageInfo> = new Map();

/**
 * Plugin markup for the blocks that carry a shortcode, keyed by block id.
 * Resolved before the tree is built, like image sizes: plugins are read
 * from the database and disk, and the block renderer itself is synchronous.
 */
let pluginHtml: Map<string, string> = new Map();
/** Settings → Timezone, for blocks that store a wall-clock time (the countdown). */
let siteTz: string | undefined;
/** Whether video embeds render as click-to-play facades (Customizer → Speed). */
let videoFacade = true;
/** External origins worth a preconnect for the document being rendered. */
let preconnects: string[] = [];
/** Site settings, for the blocks that print them (Business Info). */
let businessSettings: Record<string, string> | null = null;
/** The account whose page this is, for the Author Bio block. Null off an author page. */
let authorContext: AuthorLike | null = null;
/** The language of the document being rendered, for blocks that list content. */
let documentLanguage = "";
/** The document's absolute URL, for the `@id` of the schema nodes blocks emit; "" outside a document. */
let documentUrl = "";
/** `rel`/`target` for links in text that leave the site — SEO → Titles & Meta → Links. */
let linkPolicy: ExternalLinkPolicy = DEFAULT_LINK_POLICY;

/**
 * The document's hero — the one image most likely to be its Largest
 * Contentful Paint — so it can be asked for before anything else.
 *
 * Every content image is lazy, which is right for the twenty below the fold
 * and wrong for the one at the top: the browser only starts fetching it once
 * layout has decided it is visible. A Row Layout background is worse, since a
 * CSS `url()` is not discovered until the row is styled. Lighthouse reported
 * both on a live site — the hero row's background was the LCP element with
 * 0.7s of "load delay" while the only preload on the page went to the logo.
 *
 * Only the first few top-level blocks are candidates: that is what fits in a
 * phone viewport, and preloading more than one image just makes them race.
 */
let hero: { kind: "row"; src: string } | { kind: "image"; id: string } | null = null;
/** How many leading blocks may hold the hero — Speed → Media, 0 turns it off. */
let heroScan = 3;
/** Speed → Media: lazy images, lazy iframes, blur placeholders, quality. */
let media = { lazy: true, lazyIframes: true, blur: true, quality: 75 };

function findHero(blocks: AnyBlock[]): typeof hero {
  for (const block of blocks.slice(0, heroScan)) {
    const p = block?.props ?? {};
    if (block?.type === "rowLayout" && p.bgType === "image" && typeof p.bgImage === "string" && /^(\/|https?:)/.test(p.bgImage)) {
      return { kind: "row", src: p.bgImage };
    }
    if (block?.type === "image" && p.url) return { kind: "image", id: String(block.id ?? "") };
    if (block?.type === "imageAdvanced" && p.src) return { kind: "image", id: String(block.id ?? "") };
    if (block?.type === "hero" && p.image && p.layout !== "plain") return { kind: "image", id: String(block.id ?? "") };
  }
  return null;
}

/**
 * A row background from the media library, in three widths through the
 * optimiser. The background used to be the original file for every screen
 * — a hero photo of 2,000 px sent to a 412 px phone. The row's CSS picks a
 * width by viewport, and the hero preload carries the same set so the phone
 * fetches only the small one. External images (no optimiser) are left alone.
 */
function bgVariants(src: string): { m: string; t: string; d: string } | null {
  if (!/^\/uploads\/[^?#]+\.(jpe?g|png|webp|avif)$/i.test(src)) return null;
  const at = (w: number) => `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${media.quality}`;
  return { m: at(828), t: at(1200), d: at(1920) };
}

/** True for the one content image that should load eagerly, at high priority. */
function isHeroImage(block: AnyBlock): boolean {
  return hero?.kind === "image" && hero.id === String(block.id ?? "");
}

/**
 * Alt text for a content image: the author's, else the caption, else empty.
 *
 * It used to fall back to the document's title, Rank Math's "add missing ALT"
 * default. That fills the audit checkbox and nothing else: a post with eight
 * screenshots gave a screen reader the post title eight times, and Google's
 * image guidance is explicit that alt text repeated from the page title (or
 * repeated across images) reads as stuffing. An empty `alt=""` marks the
 * image decorative and is honest about it; the author's own words are the
 * only good alt, and the editor's checks ask for them.
 */
function altFor(...candidates: unknown[]): string {
  for (const c of candidates) {
    const s = typeof c === "string" ? c.trim() : "";
    if (s) return s;
  }
  return "";
}
/**
 * Every heading in the document, in reading order, for the Table of Contents.
 *
 * The block used to look only at its own sibling list, and only at `heading`
 * blocks. A page written with Text Advanced headings, or with the contents
 * block sitting in a Row Layout column, listed nothing — the editor showed a
 * Table of Contents and the published page had a gap where it should be.
 */
let documentHeadings: { level: number; text: string; anchor?: string }[] = [];

/**
 * Block id → the anchor stamped on that heading.
 *
 * Built once per document so the heading, the Table of Contents and anything
 * else linking to it all name the same id. Keyed on the block rather than on
 * its text, because the whole point is that two blocks can share their text:
 * a page with two "البحث الذكي" headings gave both the same id, which is
 * invalid HTML, fails the accessibility audit, and left the second contents
 * link scrolling to the first heading.
 */
let documentAnchors: Map<string, string> = new Map();

/** The anchor for a heading block: its own if one was assigned, else its text. */
function anchorFor(blockId: unknown, text: string): string {
  const own = typeof blockId === "string" ? documentAnchors.get(blockId) : undefined;
  return own ?? slugify(text);
}

/** Text Advanced tags that are headings, with the level each one is. */
const TA_HEADING_LEVEL: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };

/** Walks the whole tree — Row Layout columns included — and lists the headings. */
function collectHeadings(
  blocks: AnyBlock[],
  out: { level: number; text: string; anchor?: string; blockId?: string }[] = []
) {
  for (const b of blocks ?? []) {
    const props = (b?.props ?? {}) as Record<string, unknown>;
    if (b?.type === "heading") {
      const text = getTextContent(b.content ?? []);
      if (text) out.push({ level: Number(props.level) || 1, text, blockId: b.id as string | undefined });
    } else if (b?.type === "hero" && String(props.headingTag) === "h1") {
      const text = String(props.heading ?? "");
      if (text) out.push({ level: 1, text, blockId: b.id as string | undefined });
    } else if (b?.type === "textAdvanced" && TA_HEADING_LEVEL[String(props.tag)]) {
      const text = getTextContent(b.content ?? []);
      if (text) out.push({ level: TA_HEADING_LEVEL[String(props.tag)], text, blockId: b.id as string | undefined });
    } else if (b?.type === "rowLayout" && typeof props.cols === "string") {
      // `parseColumns`, not `parseAllColumns`: a row dropped from three
      // columns to two keeps the third column's blocks in the JSON so they
      // come back if the count goes up again. Walking all of them listed
      // headings that are not on the page, and the Table of Contents linked
      // to anchors that were never rendered.
      for (const c of parseColumns(props.cols, parseInt(String(props.columns) || "2", 10) || 2)) {
        collectHeadings(c.blocks ?? [], out);
      }
    }
    // Nested children (anything indented with Tab in the editor) render
    // since 1.9.57 — see `withChildren` — so their headings are on the page
    // and belong in the list, in document order: right after their parent.
    // This list must describe what was rendered, nothing more.
    if (Array.isArray(b?.children) && b.children.length) collectHeadings(b.children as AnyBlock[], out);
  }
  return out;
}

/**
 * Gives every heading a unique anchor, in document order.
 *
 * The first heading with a given slug keeps it, so existing links and search
 * results still land; a repeat becomes `slug-2`, `slug-3`, the same way
 * WordPress numbers a duplicate permalink.
 */
function assignAnchors(headings: { text: string; anchor?: string; blockId?: string }[]): Map<string, string> {
  const seen = new Map<string, number>();
  const byBlock = new Map<string, string>();
  for (const h of headings) {
    const base = slugify(h.text);
    if (!base) continue;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    h.anchor = n === 1 ? base : `${base}-${n}`;
    if (h.blockId) byBlock.set(h.blockId, h.anchor);
  }
  return byBlock;
}

/**
 * Whether the content already renders its own `<h1>`.
 *
 * "Hide title" swaps the visible title for a screen-reader-only `<h1>` so the
 * document is never headless. A landing page usually hides the title precisely
 * because a hero block carries its own H1 — and then the page had two, saying
 * the same thing. Callers use this to add the hidden one only when it is needed.
 */
export function contentHasH1(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false;
  return collectHeadings(blocks as AnyBlock[]).some((h) => h.level === 1);
}

async function resolvePluginBlocks(blocks: AnyBlock[], ctx: { lang: string; dir: "ltr" | "rtl" }): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (list: AnyBlock[]) => {
    for (const b of list) {
      const id = String(b.id ?? "");
      const props = (b.props ?? {}) as Record<string, unknown>;
      if (b.type === "paragraph") {
        const code = soleShortcode(getTextContent(b.content));
        if (code && id) {
          const loaded = await loadPlugin(code.slug);
          if (loaded) out.set(id, pluginContainerHtml(loaded, code, ctx));
        }
      } else if (b.type === "htmlEmbed" && typeof props.html === "string" && props.html.includes("[")) {
        const expanded = await expandShortcodes(props.html, ctx);
        if (expanded !== props.html && id) out.set(id, expanded);
      } else if (b.type === "plugin" && typeof props.slug === "string" && props.slug) {
        let attrs: Record<string, string> = {};
        try {
          attrs = JSON.parse(String(props.attrs || "{}"));
        } catch {
          attrs = {};
        }
        const loaded = await loadPlugin(props.slug);
        if (loaded && id) out.set(id, pluginContainerHtml(loaded, { slug: props.slug, attrs }, ctx));
      }
      if (Array.isArray(b.children)) await walk(b.children as AnyBlock[]);
      // A Row Layout keeps its columns as JSON *text* in `props.cols`, not as
      // an array — so the array sweep below never saw them, and a Plugin block
      // or a `[slug]` paragraph inside a column rendered nothing. Same column
      // count the renderer uses, so only the columns on the page are loaded.
      if (b.type === "rowLayout") {
        for (const c of parseColumns(props.cols, parseInt(String(props.columns) || "2", 10) || 2)) {
          await walk((c.blocks ?? []) as AnyBlock[]);
        }
      }
      for (const v of Object.values(props)) if (Array.isArray(v) && v.length && typeof v[0] === "object") await walk(v as AnyBlock[]);
    }
  };
  await walk(blocks);
  return out;
}

/** `width`/`height` for a src when the media library recorded them, plus the blurred placeholder — for `ContentImage`. */
function imageAttrs(src: unknown): { width: number; height: number; blurDataURL?: string } | Record<string, never> {
  const found = typeof src === "string" ? imageSizes.get(src) : undefined;
  return found ? { width: found.width, height: found.height, ...(found.blur && media.blur ? { blurDataURL: found.blur } : {}) } : {};
}

/** An image inside a view block (Hero, Card Grid, Logo Strip): optimised, sized from the media library. */
const viewImg: ImgRender = (src, alt, o) => (
  <ContentImage src={src} alt={alt} className={o.className} priority={o.priority} lazy={media.lazy} quality={media.quality} {...imageAttrs(src)} sizes={o.sizes} />
);

/**
 * The share of the content column the block being rendered now occupies, at
 * each breakpoint the row grid uses (<640, 640–1023, ≥1024).
 *
 * Set by a Row Layout around the rendering of each column's children, and
 * multiplied through nested rows. It works because children are rendered by
 * direct calls inside the column loop, not deferred: the value is in place
 * exactly while that column's blocks are being turned into elements.
 */
type Share = { m: number; t: number; d: number };
let columnShare: Share = { m: 1, t: 1, d: 1 };
/** Icon-list symbols this render has already drawn — see IconListView. */
let iconSymbols = new Set<string>();

/** The fractions of an `fr` grid template, `minmax(0, 2fr) minmax(0, 1fr)` → [2/3, 1/3]. */
function templateShares(template: string): number[] {
  const fr = [...template.matchAll(/(\d*\.?\d+)fr/g)].map((m) => parseFloat(m[1]));
  const repeat = template.match(/repeat\(\s*(\d+)\s*,/);
  const list = repeat ? Array(parseInt(repeat[1])).fill(fr[0] ?? 1) : fr;
  const sum = list.reduce((a, b) => a + b, 0) || 1;
  return list.map((f) => f / sum);
}

/** The content column at desktop, set per render from the document's layout — see lib/contentColumn.ts. */
let column: ContentColumn = { px: 800, fluid: false, gutter: 96 };
let keepEmptyParagraphs = false;

/**
 * `sizes` for a content image, from where it actually sits.
 *
 * The one value every image used to get — "calc(100vw - 32px) on a phone,
 * else 800px" — is right for a full-width image and wrong for everything in a
 * row: a picture in a three-column row renders about 250px wide on desktop
 * and was told it was 800, so the browser fetched a candidate three times too
 * large. The desktop figure is also capped at the file's own width, since an
 * image never renders wider than itself here.
 *
 * `own` is a width the block sets on itself (Advanced Image), as a percentage
 * of its column or in pixels.
 */
function sizesFor(intrinsic: number | undefined, own?: { pct?: number; px?: number }): string {
  const pct = own?.pct && own.pct > 0 && own.pct < 100 ? own.pct / 100 : 1;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  // The gutter is what the shell's padding and a Boxed article take out of the
  // viewport — 96px by default, not the 16px of `px-4` this used to assume.
  const g = column.gutter;
  const vw = (share: number) =>
    share >= 0.999
      ? (g > 0 ? `calc(100vw - ${g}px)` : "100vw")
      : (g > 0 ? `calc((100vw - ${g}px) * ${r(share)})` : `calc(100vw * ${r(share)})`);
  let desktop = column.px * columnShare.d * pct;
  if (own?.px && own.px > 0) desktop = Math.min(desktop, own.px);
  if (intrinsic && intrinsic > 0) desktop = Math.min(desktop, intrinsic);
  const px = Math.max(1, Math.round(desktop));
  // On a fullwidth layout nothing but the image's own width or file bounds
  // it, so the desktop entry follows the viewport like the phone entries do.
  const bounded = (own?.px && own.px > 0) || (intrinsic && intrinsic > 0);
  const desktopSize = column.fluid && !bounded ? vw(columnShare.d * pct) : `${px}px`;
  // A pixel width only binds where the screen is wider than it: a 1000px
  // image on a phone is as wide as the column, not 1000px. Below those
  // thresholds the column share decides, as for any other image.
  const fixed = own?.px && own.px > 0 ? own.px : 0;
  const mobile = fixed && fixed < 320 ? `${fixed}px` : vw(columnShare.m * pct);
  const tablet = fixed && fixed < 600 ? `${fixed}px` : vw(columnShare.t * pct);
  // A condition whose value equals the next one's is dead weight: the browser
  // reads the list in order and the next entry would have said the same.
  const entries: string[] = [];
  if (mobile !== tablet) entries.push(`(max-width: 639px) ${mobile}`);
  if (tablet !== desktopSize) entries.push(`(max-width: 1023px) ${tablet}`);
  entries.push(desktopSize);
  return entries.join(", ");
}

function renderBlock(block: AnyBlock, t: UiText): React.ReactNode {
  try {
    return withBox(block, renderBlockInner(block, t));
  } catch (err) {
    console.error(`[block] ${String(block?.type)} failed to render`, err);
    return null;
  }
}

function renderBlockInner(block: AnyBlock, t: UiText): React.ReactNode {
  const content = block.content ?? [];
  const textContent = getTextContent(content);
  // Formatted: bold, italic, links, inline colours. `textContent` stays for ids and checks.
  const rich = renderInline(content, linkPolicy);
  const p = block.props ?? {};

  switch (block.type) {
    // ── Built-in blocks ────────────────────────────────────────────────────────
    case "paragraph": {
      // A paragraph that is exactly `[slug]` is a plugin, not a sentence.
      const plugin = pluginHtml.get(String(block.id ?? ""));
      if (plugin) return <div className="my-6" data-bms-html={htmlSig(plugin)} dangerouslySetInnerHTML={{ __html: plugin }} />;
      // An empty line — Enter pressed for breathing room — is a `<p> </p>`
      // on the published page: sixty of them on one measured article, each
      // an element to parse and a gap of a font-dependent height. Left out
      // unless Speed → Rendering says to keep them (a site that laid itself
      // out with blank lines wants its gaps).
      if (!textContent.trim() && !keepEmptyParagraphs) return null;
      return <p className="mb-4 leading-relaxed" style={textBlockStyle(p)}>{textContent ? rich : " "}</p>;
    }

    case "plugin": {
      const plugin = pluginHtml.get(String(block.id ?? ""));
      if (plugin) return <div className="my-6" data-bms-html={htmlSig(plugin)} dangerouslySetInnerHTML={{ __html: plugin }} />;
      // Not installed or switched off: say so where the author will see it,
      // rather than leaving a silent gap.
      return null;
    }

    case "heading": {
      const level = p.level ?? 1;
      const cls = level === 1 ? "text-4xl font-bold mt-8 mb-4" : level === 2 ? "text-2xl font-bold mt-6 mb-3" : "text-xl font-semibold mt-5 mb-2";
      const hs = textBlockStyle(p);
      const hid = anchorFor(block.id, textContent);
      if (level === 1) return <h1 id={hid} className={cls} style={hs}>{rich}</h1>;
      if (level === 2) return <h2 id={hid} className={cls} style={hs}>{rich}</h2>;
      return <h3 id={hid} className={cls} style={hs}>{rich}</h3>;
    }

    case "bulletListItem":
      return <li className="mb-1" style={textBlockStyle(p)}>{rich}</li>;

    case "numberedListItem":
      return <li className="mb-1" style={textBlockStyle(p)}>{rich}</li>;

    case "checkListItem":
      // `readOnly` does nothing on a checkbox — visitors could tick it — and a
      // bare input is an unlabelled form control to Lighthouse. Disabled, and
      // wrapped in a label with its text. The surrounding <ul> comes from
      // wrapListItems, like the other list types.
      return (
        <li className="mb-1">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={!!p.checked} disabled className="mt-1" />
            <span className={p.checked ? "line-through opacity-50" : ""} style={textBlockStyle(p)}>{rich}</span>
          </label>
        </li>
      );

    case "image": {
      if (!p.url) return null;
      // The size and alignment set in the editor. Dragging an image smaller
      // saves `previewWidth` (px), which was never read — a 300px logo or
      // phone screenshot went out at full column width, blown up and soft.
      const shown = Number(p.previewWidth) > 0 ? Math.round(Number(p.previewWidth)) : undefined;
      const place = p.textAlignment === "left" ? { marginLeft: 0, marginRight: "auto" }
        : p.textAlignment === "right" ? { marginLeft: "auto", marginRight: 0 }
        : undefined;
      return (
        <figure className="my-6" style={shown ? { maxWidth: `${shown}px`, ...(place ?? { marginLeft: "auto", marginRight: "auto" }) } : place ? { textAlign: p.textAlignment } : undefined}>
          {/* Through the optimiser — an in-content image is usually the biggest
              file on an article, and it is what an author uploads straight from
              a phone. `ContentImage` falls back to a plain tag for any host the
              optimiser will not accept, so a pasted external URL still renders. */}
          <ContentImage
            src={String(p.url)}
            alt={altFor(p.alt, p.caption)}
            className="rounded-xl max-w-full mx-auto"
            priority={isHeroImage(block)}
            lazy={media.lazy}
            quality={media.quality}
            {...imageAttrs(p.url)}
            sizes={sizesFor(imageSizes.get(String(p.url))?.width, shown ? { px: shown } : undefined)}
          />
          {p.caption && <figcaption className="text-center text-sm opacity-50 mt-2">{p.caption}</figcaption>}
        </figure>
      );
    }

    case "video": {
      if (!p.url) return null;
      const shown = Number(p.previewWidth) > 0 ? Math.round(Number(p.previewWidth)) : undefined;
      const box = shown ? { maxWidth: `${shown}px`, marginLeft: "auto", marginRight: "auto" } : undefined;
      // A YouTube or Vimeo address in BlockNote's own Video block: a <video>
      // element cannot play a web page, so it showed a dead player. Those go
      // out as the same embed (and click-to-play poster) the Video Embed block
      // uses; a file stays a <video>. Both reserve a 16:9 box, so the page no
      // longer jumps when the player arrives.
      if (/(?:youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/\d)/.test(String(p.url))) {
        const embedUrl = getEmbedUrl(String(p.url));
        if (!embedUrl) return null;
        const facade = videoFacade ? facadeTarget(String(p.url)) : null;
        return (
          <figure className="my-6" style={box}>
            {facade ? (
              <div className="bms-video-wrap !my-0" style={{ aspectRatio: "16 / 9" }} dangerouslySetInnerHTML={{ __html: facadeHtml(facade, p.caption || p.name || "", "", t) }} />
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ aspectRatio: "16 / 9" }}>
                <iframe src={embedUrl} className="w-full h-full" allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" title={p.caption || p.name || "Video"} loading={media.lazyIframes ? "lazy" : undefined} />
              </div>
            )}
            {p.caption && <figcaption className="text-center text-sm opacity-50 mt-2">{p.caption}</figcaption>}
          </figure>
        );
      }
      return (
        <figure className="my-6" style={box}>
          <video src={p.url} controls preload="metadata" width={1280} height={720} className="rounded-xl w-full h-auto" style={{ aspectRatio: "16 / 9" }} />
          {p.caption && <figcaption className="text-center text-sm opacity-50 mt-2">{p.caption}</figcaption>}
        </figure>
      );
    }

    case "audio":
      return p.url ? <div className="my-4"><audio src={p.url} controls className="w-full" /></div> : null;

    // BlockNote's own File block (it is in the / menu with the other
    // defaults). There was no case for it, so the fallback printed nothing and
    // an attached file vanished from the published page. A download link,
    // named after the file, with its caption.
    case "file": {
      const href = safeHref(String(p.url ?? ""));
      if (!href) return null;
      const name = String(p.name || "").trim() || decodeURIComponent(href.split("?")[0].split("/").pop() || "") || href;
      return (
        <figure className="my-4">
          <a
            href={href}
            download={href.startsWith("/") ? "" : undefined}
            {...externalLinkProps(href, linkPolicy)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium no-underline hover:bg-slate-50"
          >
            <span aria-hidden="true">📎</span>
            <span>{name}</span>
          </a>
          {p.caption && <figcaption className="mt-1 text-sm opacity-50">{p.caption}</figcaption>}
        </figure>
      );
    }

    case "table": {
      // BlockNote keeps a table's rows in `content` (`{ type: "tableContent",
      // rows, headerRows?, headerCols? }`); older documents had them in props.
      const tc = block.content && !Array.isArray(block.content) ? (block.content as AnyBlock) : null;
      // `??` only guards null and undefined — a `rows` that arrived as a
      // string still reaches `.map` and throws.
      const rows: AnyBlock[] = Array.isArray(tc?.rows) ? tc!.rows : Array.isArray(p.rows) ? p.rows : [];
      const headerRows = Number(tc?.headerRows ?? p.headerRows) || 0;
      const headerCols = Number(tc?.headerCols ?? p.headerCols) || 0;
      const cellClass = "border border-slate-200 px-3 py-2";
      // A cell is `{ type: "tableCell", props, content }` in this BlockNote
      // (0.30) and a bare inline array in older documents. Only the array was
      // read, so every table saved by the current editor published as an
      // empty grid. Content goes through `renderInline`, so a link or bold in
      // a cell survives (a "Download" link in a comparison table lost its
      // link as plain text); merges, colours and alignment come from props.
      // Header cells as `<th scope>`, not `<td>`: the editor's "header row" was
      // published as plain cells, which reads as data to a screen reader.
      const cells = (row: AnyBlock, i: number) =>
        (Array.isArray(row?.cells) ? row.cells : []).map((raw: AnyBlock, j: number) => {
          const cell = Array.isArray(raw) ? { content: raw, props: {} } : (raw ?? {});
          const cp = (cell.props ?? {}) as AnyBlock;
          const span = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 1 ? n : undefined; };
          const align = ["left", "center", "right", "justify"].includes(cp.textAlignment) && cp.textAlignment !== "left" ? cp.textAlignment : undefined;
          const style: React.CSSProperties = {
            color: resolveColor(cp.textColor, "text"),
            backgroundColor: resolveColor(cp.backgroundColor, "background"),
            textAlign: align as React.CSSProperties["textAlign"],
          };
          const attrs = { key: j, className: cellClass, colSpan: span(cp.colspan), rowSpan: span(cp.rowspan), style };
          const inner = renderInline(Array.isArray(cell.content) ? cell.content : [], linkPolicy);
          return i < headerRows ? <th scope="col" {...attrs}>{inner}</th>
            : j < headerCols ? <th scope="row" {...attrs}>{inner}</th>
            : <td {...attrs}>{inner}</td>;
        });
      return (
        <div className="overflow-x-auto my-6">
          <table className="w-full border-collapse text-sm">
            {headerRows > 0 && <thead>{rows.slice(0, headerRows).map((row, i) => <tr key={i}>{cells(row, i)}</tr>)}</thead>}
            <tbody>{rows.slice(headerRows).map((row, i) => <tr key={i}>{cells(row, i + headerRows)}</tr>)}</tbody>
          </table>
        </div>
      );
    }

    case "quote":
      return (
        <blockquote className="border-s-4 ps-4 py-1 my-4 italic opacity-70" style={{ borderColor: "var(--color-primary,#0ea5e9)", ...textBlockStyle(p) }}>
          {rich}
        </blockquote>
      );

    case "codeBlock":
      return (
        // Code reads left to right whatever the page: on an Arabic page it was
        // laid out right-to-left, with punctuation on the wrong side.
        <pre dir="ltr" className="bg-slate-900 text-slate-100 rounded-xl p-4 my-4 overflow-x-auto text-sm font-mono text-left">
          <code>{textContent}</code>
        </pre>
      );

    // ── Custom blocks ──────────────────────────────────────────────────────────
    case "button":
      // The whole block — group layout, per-button styling and the CSS it
      // generates — comes out of `resolveButtons`, the same call the canvas
      // makes, so the two cannot drift.
      return <ButtonGroup props={p} scopeBase={buttonScope(block)} />;

    case "tableAdvanced":
      // Structure, styling and the CSS they generate all come out of
      // `resolveTable`, the same call the canvas makes.
      return <TableView props={p} scopeBase={tableScope(block)} />;

    case "spacer":
      return (
        <div className="bms-spacer" style={parseInt(p.height) && parseInt(p.height) !== 40 ? { height: `${parseInt(p.height)}px` } : undefined}>
          {p.showDivider === "true" && (
            <hr
              style={{
                borderStyle: p.dividerStyle && p.dividerStyle !== "solid" ? p.dividerStyle : undefined,
                borderColor: p.dividerColor && p.dividerColor !== "#e2e8f0" ? p.dividerColor : undefined,
              }}
            />
          )}
        </div>
      );

    case "callout":
      return (
        <div className="bms-callout flex gap-3 rounded-xl p-4 my-4 items-start" style={p.bgColor && p.bgColor !== "#fef9c3" ? { backgroundColor: p.bgColor } : undefined}>
          <span className="text-xl shrink-0">{p.emoji || "💡"}</span>
          <p className="text-sm leading-relaxed">{p.text}</p>
        </div>
      );

    case "iframeEmbedAdvanced":
      // An embedded page in a card: header, notice, the page, a footer button.
      return <IframeEmbedView props={p} />;

    case "stepsGrid":
      // 1–25 numbered steps, joined grid or separate cards.
      return <StepsGridView props={p} linkProps={(href) => externalLinkProps(href, linkPolicy)} />;

    case "highlightPanel":
      // A coloured panel: heading, intro and 1–12 points in columns.
      return <HighlightPanelView props={p} linkProps={(href) => externalLinkProps(href, linkPolicy)} />;

    // The hookless view blocks (blocks/blockKit.tsx): markup and CSS only, no
    // script. Their photos go through the optimiser at the size they are shown.
    case "hero":
      // As the first block of a page its photo is the LCP image: loaded first, never lazy.
      return <HeroView props={p} linkProps={(href) => externalLinkProps(href, linkPolicy)} img={viewImg} priority={isHeroImage(block)} />;

    case "ctaBand":
      return <CtaBandView props={p} linkProps={(href) => externalLinkProps(href, linkPolicy)} />;

    case "cardGrid":
      return <CardGridView props={p} linkProps={(href) => externalLinkProps(href, linkPolicy)} img={viewImg} />;

    case "statsStrip":
      return <StatsStripView props={p} />;

    case "prosCons":
      return <ProsConsView props={p} />;

    case "callBar":
      // With no number of its own, the one in SEO → Local SEO.
      return <CallBarView props={p} linkProps={(href) => externalLinkProps(href, linkPolicy)} sitePhone={businessSettings?.local_phone ?? ""} />;

    case "logoStrip":
      return <LogoStripView props={p} linkProps={(href) => externalLinkProps(href, linkPolicy)} img={viewImg} />;

    case "noticeBar":
      return <NoticeBarView props={p} linkProps={(href) => externalLinkProps(href, linkPolicy)} />;

    case "comparisonTable":
      return <ComparisonTableView props={p} />;

    case "versionHistory":
      return <VersionHistoryView props={p} />;

    case "linkGrid":
      return <LinkGridView props={p} linkProps={(href) => externalLinkProps(href, linkPolicy)} />;

    case "reviewGrid":
      return <ReviewGridView props={p} />;

    case "priceList":
      return <PriceListView props={p} />;

    case "keyTakeaways":
      return <KeyTakeawaysView props={p} />;

    case "factSheet":
      return <FactSheetView props={p} />;

    case "shareButtons":
      // Shares the document it is in; with no address (an Element) it draws nothing.
      return <ShareButtonsView props={p} pageUrl={documentUrl} />;

    case "infoBox":
      // Layout, media, typography, the link and the CSS they generate all come
      // out of `resolveInfoBox`, the same call the canvas makes.
      return <InfoBoxView props={p} scopeBase={infoBoxScope(block)} />;

    case "progressBar": {
      const val = Math.min(100, Math.max(0, parseInt(p.value) || 0));
      return (
        <div className="my-5">
          {p.label && (
            <div className="flex justify-between text-sm mb-2">
              <span>{p.label}</span>
              {p.showLabel !== "false" && <span className="opacity-50">{val}%</span>}
            </div>
          )}
          <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bms-prog-fill"
              style={{ width: `${val}%`, backgroundColor: p.color || undefined }}
            />
          </div>
        </div>
      );
    }

    case "countUp":
      return (
        <CountUpFE
          to={parseInt(p.to) || 100}
          prefix={p.prefix || ""}
          suffix={p.suffix || ""}
          title={p.title || ""}
          duration={parseFloat(p.duration) || 2}
          color={p.color || "var(--color-primary,#0ea5e9)"}
        />
      );

    case "appInfo":
      return <AppInfoView props={p} schemaId={documentUrl ? blockSchemaId(documentUrl, "app", block.id) : undefined} />;

    case "countdown": {
      // The end time is stored as wall-clock text ("2026-10-01T10:00"). Read
      // in the browser, it meant ten o'clock wherever each visitor was, so the
      // offer ended at a different moment in every country. It is resolved
      // here, in the site's time zone, to one instant for everyone.
      const at = parseInZone(p.targetDate || undefined, siteTz);
      if (!p.targetDate || Number.isNaN(at)) {
        return <div className="text-center text-slate-400 py-4 text-sm">{t.noDateSet}</div>;
      }
      const expired = p.expiredText || t.offerEnded;
      // The words are in the HTML — for search engines and for the first
      // paint — and the digit row has its height reserved, so nothing below
      // jumps when the client draws it.
      return (
        <div className="bms-countdown text-center py-6">
          {Date.now() >= at ? (
            <p className="text-slate-600">{expired}</p>
          ) : (
            <>
              {p.title && <p className="text-sm text-slate-500 mb-4">{p.title}</p>}
              <div className="min-h-[88px]">
                <CountdownFE targetAt={at} expiredText={expired} />
              </div>
            </>
          )}
        </div>
      );
    }

    case "testimonial": {
      // Clamped: `"☆".repeat(5 - stars)` throws on a rating over 5 (or under
      // 0), and a thrown block renders as nothing at all.
      const stars = Math.min(5, Math.max(0, parseInt(p.rating) || 5));
      return (
        <div className="bg-slate-50 rounded-2xl p-6 my-6">
          <div className="flex text-yellow-400 text-lg mb-3">{"★".repeat(stars)}{"☆".repeat(5 - stars)}</div>
          <p className="text-lg italic mb-4">&ldquo;{p.quote}&rdquo;</p>
          <div className="flex items-center gap-3">
            {p.avatar && (
              // Shown at 40px; it downloaded the original photo.
              <ContentImage src={String(p.avatar)} width={80} height={80} alt={p.name || ""} lazy={media.lazy} quality={media.quality} sizes="40px" className="w-10 h-10 rounded-full object-cover" />
            )}
            <div>
              <div className="font-semibold text-sm">{p.name}</div>
              {p.role && <div className="text-xs opacity-50">{p.role}</div>}
            </div>
          </div>
        </div>
      );
    }

    case "videoEmbed": {
      const embedUrl = getEmbedUrl(p.url);
      if (!embedUrl) return null;
      // Click-to-play: the poster now, the player (and its half-megabyte of
      // script) only when the visitor asks for it. See lib/videoFacade.ts.
      const facade = videoFacade ? facadeTarget(p.url) : null;
      return (
        <figure className="my-6">
          {facade ? (
            <div
              className="bms-video-wrap !my-0"
              style={{ height: `${parseInt(p.height) || 400}px`, aspectRatio: "auto" }}
              dangerouslySetInnerHTML={{ __html: facadeHtml(facade, p.title || "", "", t) }}
            />
          ) : (
          <div className="rounded-xl overflow-hidden" style={{ height: `${parseInt(p.height) || 400}px` }}>
            <iframe src={embedUrl} className="w-full h-full" allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" title={p.title || "Video"} loading={media.lazyIframes ? "lazy" : undefined} />
          </div>
          )}
          {p.title && <figcaption className="text-center text-sm opacity-50 mt-2">{p.title}</figcaption>}
        </figure>
      );
    }

    case "googleMap": {
      if (!p.query) return null;
      const mapUrl = `https://maps.google.com/maps?q=${encodeURIComponent(p.query)}&z=${p.zoom || 14}&output=embed`;
      return (
        <div className="my-6 rounded-xl overflow-hidden" style={{ height: `${parseInt(p.height) || 400}px` }}>
          <iframe src={mapUrl} className="w-full h-full border-0" loading={media.lazyIframes ? "lazy" : undefined} title={t.map} />
        </div>
      );
    }

    case "accordion": {
      const scope = accordionScope(block);
      const acc = resolveAccordion(p, scope);
      const faq = acc.faqSchema ? faqSchemaFor(acc.panes, documentUrl ? blockSchemaId(documentUrl, "faq", block.id) : undefined) : null;
      return (
        <>
          <AccordionFE props={p} scopeBase={scope} titleIcons={acc.panes.map((pane, i) => <Icon key={i} value={pane.titleIcon} />)} />
          {/* FAQ structured data, opt-in per block. Escaped at the point of
              embedding so a pane's text cannot close the script element. */}
          {faq && (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: jsonLd(faq) }}
            />
          )}
        </>
      );
    }

    case "tabs": {
      let tabs: { label: string; content: string }[] = [];
      try { tabs = JSON.parse(p.tabs); } catch {}
      return <TabsFE tabs={tabs} />;
    }

    case "gallery": {
      let imgs: { src: string; alt?: string; caption?: string }[] = [];
      try { imgs = JSON.parse(p.images); } catch {}
      if (imgs.length === 0) return null;
      const cols = Math.min(Math.max(parseInt(p.columns) || 3, 1), 6);
      const ratios: Record<string, string> = { square: "1/1", landscape: "16/9", portrait: "3/4", auto: "auto" };
      const ratio = ratios[p.ratio] || "1/1";
      return (
        <div
          className="gallery grid my-6"
          style={{
            gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`,
            gap: `${parseInt(p.gap) || 12}px`,
          }}
        >
          {imgs.map((im, i) => (
            <figure key={i} className="gallery-item m-0">
              {/* Through the optimiser, at the size one grid cell really is.
                  Usually the most image-heavy block on a page, and it sent
                  every original — a 12-photo gallery on a phone downloaded
                  12 full uploads where 12 small WebPs would do. */}
              <ContentImage
                src={String(im.src ?? "")}
                {...imageAttrs(im.src)}
                alt={altFor(im.alt, im.caption)}
                lazy={media.lazy}
                quality={media.quality}
                sizes={sizesFor(imageSizes.get(String(im.src))?.width, { pct: 100 / cols })}
                className="w-full h-full object-cover bms-gal-img"
                style={{ aspectRatio: ratio, borderRadius: parseInt(p.radius) && parseInt(p.radius) !== 10 ? `${parseInt(p.radius)}px` : undefined }}
              />
              {p.captions === "true" && im.caption && (
                <figcaption className="text-xs opacity-60 mt-1.5">{im.caption}</figcaption>
              )}
            </figure>
          ))}
        </div>
      );
    }

    case "icon": {
      const size = parseInt(p.size) || 40;
      const shaped = p.shape && p.shape !== "none";
      const glyph = (
        <span
          className={`icon-block-mark${shaped ? " is-shaped" : ""}`}
          style={{
            fontSize: `${size}px`,
            lineHeight: 1,
            color: p.color || undefined,
            backgroundColor: shaped ? p.bg || "rgba(0,0,0,.06)" : undefined,
            borderRadius: p.shape === "circle" ? "999px" : p.shape === "square" ? ".5rem" : undefined,
            padding: shaped ? `${Math.round(size * 0.4)}px` : undefined,
            display: "inline-flex",
          }}
          aria-hidden={p.label ? undefined : "true"}
          role={p.label ? "img" : undefined}
          aria-label={p.label || undefined}
        >
          <Icon value={p.icon} fallback="★" />
        </span>
      );
      const align = p.align === "center" ? "text-center" : p.align === "right" ? "text-right" : "";
      return (
        <div className={`icon-block my-4 ${align}`}>
          {p.url ? <a href={p.url} className="inline-flex">{glyph}</a> : glyph}
        </div>
      );
    }

    case "socialIcons": {
      let items: { network: string; url: string }[] = [];
      try { items = JSON.parse(p.items); } catch {}
      items = items.filter((it) => it.url);
      if (items.length === 0) return null;
      const size = parseInt(p.size) || 20;
      const align = p.align === "center" ? "justify-center" : p.align === "right" ? "justify-end" : "";
      return (
        <div className={`social-icons flex flex-wrap items-center my-5 ${align}`} style={parseInt(p.gap) && parseInt(p.gap) !== 10 ? { gap: `${parseInt(p.gap)}px` } : undefined}>
          {items.map((it, i) => {
            const net = socialNetwork(it.network);
            const filled = p.style === "filled";
            return (
              <a
                key={i}
                href={socialHref(it.network, it.url)}
                {...newTabProps(true)}
                aria-label={net.label}
                className={`social-icon is-${p.style || "plain"}`}
                style={{
                  width: `${size * 2}px`,
                  height: `${size * 2}px`,
                  fontSize: `${size}px`,
                  color: filled ? "#fff" : p.color || net.color,
                  backgroundColor: filled ? p.color || net.color : undefined,
                  borderColor: p.style === "outline" ? p.color || net.color : undefined,
                }}
              >
                <span aria-hidden="true">{net.glyph}</span>
              </a>
            );
          })}
        </div>
      );
    }

    case "slider": {
      let slides: AnyBlock[] = [];
      try { slides = JSON.parse(p.slides || "[]"); } catch {}
      slides = slides.filter((s) => s && (s.image || s.title || s.text));
      if (slides.length === 0) return null;
      const per = (v: string, d: number) => Math.min(6, Math.max(1, parseInt(v) || d));
      return (
        <SliderFE
          // Strings only: this is a client component, and a function prop
          // (`t.slideOf`) cannot cross from the server — React refuses it and
          // the page fails to render. The "2 of 5" labels are built here.
          labels={{ carousel: t.carousel, slide: t.slide, prev: t.prevSlide, next: t.nextSlide, slideOf: slides.map((_, i) => t.slideOf(i + 1, slides.length)), pause: t.pauseSlides, play: t.playSlides }}
          id={String(block.id ?? "slider")}
          slides={slides}
          options={{
            perView: { desktop: per(p.perDesktop, 1), tablet: per(p.perTablet, 1), mobile: per(p.perMobile, 1) },
            gap: Math.max(0, parseInt(p.gap) || 0),
            autoplay: p.autoplay !== "false",
            interval: parseInt(p.interval) || 5000,
            pauseOnHover: p.pauseOnHover !== "false",
            loop: p.loop !== "false",
            arrows: p.arrows !== "false",
            dots: p.dots !== "false",
            captions: p.captions !== "false",
            overlay: p.overlay !== "false",
            ratio: /^\d+\/\d+$|^auto$/.test(p.ratio || "") ? p.ratio : "16/9",
            radius: Math.max(0, parseInt(p.radius) || 0),
          }}
        />
      );
    }

    case "modal": {
      const video = p.video ? facadeTarget(p.video)?.embed ?? null : null;
      return (
        <ModalFE
          closeLabel={t.close}
          id={String(block.id ?? "modal")}
          trigger={(["button", "image", "text", "none"].includes(p.trigger) ? p.trigger : "button") as "button"}
          triggerLabel={p.triggerLabel || ""}
          triggerImage={p.triggerImage || ""}
          triggerAlign={p.triggerAlign || "left"}
          title={p.title || ""}
          text={p.text || ""}
          image={p.image || ""}
          videoEmbed={video}
          buttonLabel={p.buttonLabel || ""}
          buttonUrl={p.buttonUrl || ""}
          width={(["sm", "md", "lg", "xl"].includes(p.width) ? p.width : "md") as "md"}
          autoOpen={p.autoOpen === "true"}
          delay={parseInt(p.delay) || 0}
          exitIntent={p.exitIntent === "true"}
          oncePerVisitor={p.oncePerVisitor !== "false"}
          closeOnBackdrop={p.closeOnBackdrop !== "false"}
        />
      );
    }

    case "lottie": {
      if (!p.src) return null;
      return (
        <LottieFE
          src={p.src}
          trigger={(["autoplay", "hover", "click", "scroll", "inview"].includes(p.trigger) ? p.trigger : "autoplay") as "autoplay"}
          loop={p.loop !== "false"}
          speed={parseFloat(p.speed) || 1}
          width={parseInt(p.width) || 0}
          align={p.align || "center"}
          label={p.label || ""}
        />
      );
    }

    case "downloadBox": {
      const box = resolveDownloadBox(p);
      if (!box.title && !box.button.url) return null;
      let schema: Record<string, unknown> | null = null;
      if (box.schema && businessSettings) {
        const base = siteUrl(businessSettings);
        const absolute = (u: string) => absoluteUrl(u, base);
        const rating = /^\d(\.\d)?$/.test(box.raw.rating) ? box.raw.rating : "";
        schema = appInfoSchema(
          resolveAppInfo({
            name: box.title, developer: box.raw.developer, version: box.raw.version, size: box.raw.size,
            requires: box.raw.requires, os: box.os, category: inferCategory(`${box.title} ${box.subtitle} ${box.features.join(" ")}`), updated: box.raw.updated, downloadUrl: box.button.url,
            icon: box.icon, ratingValue: rating, ratingCount: rating ? box.raw.ratingCount || "" : "", showSchema: "1",
          }),
          "",
          absolute,
          documentUrl ? blockSchemaId(documentUrl, "download", block.id) : undefined
        );
      }
      return (
        <>
          <DownloadBoxView box={box} />
          {schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />}
        </>
      );
    }

    case "timeline": {
      let items: AnyBlock[] = [];
      try { items = JSON.parse(p.items || "[]"); } catch {}
      items = items.filter((it) => it && (it.title || it.text || it.date));
      if (items.length === 0) return null;
      const layout = ["left", "alternate", "right"].includes(p.layout) ? p.layout : "left";
      const line = p.lineColor || "rgba(0,0,0,.12)";
      const markerBg = p.markerColor || "var(--color-primary,#0ea5e9)";
      // Always <h3> skipped a level on a page with no <h2> above it, which
      // accessibility audits flag. The author picks; H3 stays the default so
      // existing timelines are unchanged. Styled by class, not by tag.
      const TlTitle = (["h2", "h3", "h4", "p"].includes(p.titleTag) ? p.titleTag : "h3") as "h2" | "h3" | "h4" | "p";
      return (
        <ol className={`bms-timeline bms-timeline-${layout} my-8`} style={{ ["--tl-line" as string]: line, ["--tl-marker" as string]: markerBg }}>
          {items.map((it, i) => (
            <li
              key={i}
              className={`bms-tl-item ${p.animate === "true" ? "bx-an bx-an-fade-up" : ""}`}
              style={p.animate === "true" ? ({ ["--bx-an-delay" as string]: `${Math.min(i, 6) * 90}ms` } as React.CSSProperties) : undefined}
            >
              <span className="bms-tl-marker" aria-hidden="true">
                {p.marker === "dot" ? "" : p.marker === "icon" ? (it.icon || "•") : i + 1}
              </span>
              <div className="bms-tl-body">
                {p.showDates !== "false" && it.date && <p className="bms-tl-date">{it.date}</p>}
                {it.title && <TlTitle className="bms-tl-title">{it.title}</TlTitle>}
                {it.text && <p className="bms-tl-text">{it.text}</p>}
              </div>
            </li>
          ))}
        </ol>
      );
    }

    case "authorBio": {
      if (!authorContext) return null;
      return <AuthorBioFE props={p} author={authorContext} scopeBase={authorBioScope(block)} />;
    }

    case "businessInfo": {
      const bs = businessSettings;
      if (!bs || !localEnabled(bs)) return null;
      const parts = new Set(String(p.show ?? "address,phone,email,hours").split(",").filter(Boolean));
      const lines = addressLines(bs);
      const hours = parseHours(bs.local_hours);
      const map = parts.has("map") ? mapEmbedUrl(bs) : null;
      const cols = p.layout === "columns";
      return (
        <div className="business-info my-6" itemScope itemType="https://schema.org/LocalBusiness">
          {p.title && <h3 className="text-xl font-bold mb-3">{p.title}</h3>}
          <div className={cols ? "grid gap-6 sm:grid-cols-2" : "space-y-4"}>
            <div className="space-y-3 text-sm">
              <p className="font-semibold" itemProp="name">{bs.local_name || bs.site_name}</p>
              {parts.has("address") && lines.length > 0 && (
                <address className="not-italic leading-relaxed opacity-80" itemProp="address">
                  {lines.map((l, i) => <span key={i} className="block">{l}</span>)}
                </address>
              )}
              {parts.has("phone") && bs.local_phone && (
                <p><a href={`tel:${bs.local_phone.replace(/[^+\d]/g, "")}`} className="underline" itemProp="telephone">{bs.local_phone}</a></p>
              )}
              {parts.has("email") && bs.local_email && (
                <p><a href={`mailto:${bs.local_email}`} className="underline" itemProp="email">{bs.local_email}</a></p>
              )}
              {parts.has("hours") && (
                <table className="text-sm">
                  <tbody>
                    {DAYS.map((d) => (
                      <tr key={d}>
                        <td className="pe-4 py-0.5 font-medium">{dayName(d, t.lang)}</td>
                        <td className="py-0.5 opacity-80">{hours[d].closed ? t.closedLabel : `${hours[d].open} – ${hours[d].close}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {map && (
              <div className="rounded-xl overflow-hidden" style={{ height: `${parseInt(p.mapHeight) || 260}px` }}>
                <iframe src={map} className="w-full h-full border-0" loading={media.lazyIframes ? "lazy" : undefined} title={t.map} />
              </div>
            )}
          </div>
        </div>
      );
    }

    case "starRating": {
      const max = Math.min(Math.max(parseInt(p.max) || 5, 1), 10);
      const value = Math.min(Math.max(parseFloat(p.value) || 0, 0), max);
      const align = p.align === "center" ? "justify-center" : p.align === "right" ? "justify-end" : "";
      return (
        <div
          className={`star-rating flex items-center gap-2 my-4 ${align}`}
          role="img"
          aria-label={`${value} out of ${max}`}
        >
          <span className="star-rating-track" style={parseInt(p.size) && parseInt(p.size) !== 22 ? { fontSize: `${parseInt(p.size)}px` } : undefined} aria-hidden="true">
            <span className="star-rating-base">{"★".repeat(max)}</span>
            <span className="star-rating-fill" style={{ width: `${(value / max) * 100}%`, color: p.color && p.color !== "#f59e0b" ? p.color : undefined }}>
              {"★".repeat(max)}
            </span>
          </span>
          {p.label && <span className="text-sm opacity-70">{p.label}</span>}
        </div>
      );
    }

    case "pricingTable": {
      let plans: {
        name: string; price: string; period?: string; features?: string;
        cta?: string; url?: string; featured?: boolean;
      }[] = [];
      try { plans = JSON.parse(p.plans); } catch {}
      if (plans.length === 0) return null;
      const cols = Math.min(Math.max(parseInt(p.columns) || plans.length, 1), 4);
      return (
        <div
          className="pricing-table grid gap-5 my-8"
          style={{ ["--pt-cols" as string]: String(cols) }}
        >
          {plans.map((plan, i) => (
            <div key={i} className={`pricing-plan${plan.featured ? " is-featured" : ""}`}>
              <p className="pricing-name font-semibold text-sm uppercase tracking-wide opacity-60">{plan.name}</p>
              <p className="pricing-price text-3xl font-bold mt-2">
                {plan.price}
                {plan.period && <span className="text-sm font-normal opacity-60">{plan.period}</span>}
              </p>
              {plan.features && (
                <ul className="pricing-features text-sm mt-4 space-y-1.5">
                  {plan.features.split("\n").filter(Boolean).map((f, fi) => (
                    <li key={fi} className="flex gap-2">
                      <span aria-hidden="true" className="opacity-50">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
              {plan.cta && (
                <a href={plan.url || "#"} className={`${plan.featured ? "btn" : "btn-outline"} mt-5 w-full text-center`}>
                  {plan.cta}
                </a>
              )}
            </div>
          ))}
        </div>
      );
    }

    case "teamMember": {
      let links: { network: string; url: string }[] = [];
      try { links = JSON.parse(p.links); } catch {}
      const radius = p.shape === "circle" ? "999px" : p.shape === "rounded" ? "1rem" : "0";
      const side = p.layout === "side";
      const align = p.align === "left" ? "text-left" : p.align === "right" ? "text-right" : "text-center";
      return (
        <div className={`team-member my-6 ${side ? "flex items-center gap-5" : align}`}>
          {p.photo && (
            // Shown at 112–128px: that size (and 2x), not the original.
            <ContentImage
              src={String(p.photo)}
              width={256}
              height={256}
              alt={p.name || ""}
              lazy={media.lazy}
              quality={media.quality}
              sizes="128px"
              className={`team-photo object-cover ${side ? "w-28 h-28 shrink-0" : "w-32 h-32 mx-auto"}`}
              style={{ borderRadius: radius, marginInline: side ? undefined : p.align === "center" ? "auto" : "0" }}
            />
          )}
          <div className={side ? "min-w-0" : "mt-3"}>
            {p.name && <p className="team-name font-semibold text-lg">{p.name}</p>}
            {p.role && <p className="team-role text-sm opacity-60">{p.role}</p>}
            {p.bio && <p className="team-bio text-sm opacity-75 mt-2 leading-relaxed">{p.bio}</p>}
            {links.filter((l) => l.url).length > 0 && (
              <div className={`team-links flex gap-3 mt-3 ${!side && p.align === "center" ? "justify-center" : ""}`}>
                {links.filter((l) => l.url).map((l, i) => {
                  const net = socialNetwork(l.network);
                  return (
                    <a
                      key={i}
                      href={socialHref(l.network, l.url)}
                      {...newTabProps(true)}
                      aria-label={net.label}
                      className="opacity-60 hover:opacity-100 transition-opacity"
                      style={{ color: net.color }}
                    >
                      <span aria-hidden="true">{net.glyph}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    }

    case "showMore":
      if (!p.text) return null;
      return (
        <ShowMoreFE
          text={p.text}
          height={parseInt(p.height) || 160}
          moreLabel={p.moreLabel || "Show more"}
          lessLabel={p.lessLabel || "Show less"}
          fade={p.fade !== "false"}
        />
      );

    case "htmlEmbed": {
      if (!p.html) return null;
      // Author-supplied markup, same trust level as the Custom Code settings.
      // Shortcodes inside it were expanded in the pre-pass.
      const embedHtml = videoFacade
        ? facadeIframes(pluginHtml.get(String(block.id ?? "")) ?? p.html)
        : (pluginHtml.get(String(block.id ?? "")) ?? p.html);
      return (
        <div
          className="html-embed my-6"
          // Lets ScriptRunner run its scripts after a client-side navigation.
          data-bms-html={htmlSig(embedHtml)}
          dangerouslySetInnerHTML={{ __html: embedHtml }}
        />
      );
    }

    case "imageCompare":
      if (!p.before || !p.after) return null;
      return (
        <ImageCompareFE
          before={p.before}
          after={p.after}
          beforeLabel={p.beforeLabel || ""}
          afterLabel={p.afterLabel || ""}
          label={uiText(documentLanguage).compareImages}
          start={Math.min(Math.max(parseInt(p.start) || 50, 0), 100)}
          radius={parseInt(p.radius) || 10}
        />
      );

    case "contactForm": {
      const fields = parseFields(p.fields);
      return (
        <div className="bms-cform-wrap" style={parseInt(p.width) && parseInt(p.width) !== 640 ? { maxWidth: `${parseInt(p.width)}px` } : undefined}>
          <ContactFormFE
            formId={String(block.id ?? "")}
            formName={p.formName || "Contact"}
            fields={fields}
            submitLabel={p.submitLabel || t.sendMessage}
            // Strings, never `t` itself — see reasons.txt 6A.
            messages={{ required: t.fieldRequired, invalidEmail: t.invalidEmail }}
            successMessage={p.successMessage || ""}
            // The browser navigates here with `location.href =`, which React
            // cannot vet the way it vets an `href` — a `javascript:` value
            // ran for every visitor who submitted the form.
            redirectUrl={safeHref(p.redirectUrl)}
            align={p.align || "left"}
          />
        </div>
      );
    }

    case "postGrid":
      return (
        <PostGridFE
          heading={p.heading || ""}
          count={parseInt(p.count) || 3}
          columns={parseInt(p.columns) || 3}
          categoryId={parseInt(p.categoryId) || null}
          orderBy={p.orderBy || "recent"}
          showImage={p.showImage !== "false"}
          showDate={p.showDate !== "false"}
          showExcerpt={p.showExcerpt !== "false"}
          language={documentLanguage}
        />
      );

    case "iconList":
      // Layout, icon treatment, typography, links and the CSS they generate all
      // come out of `resolveIconList`, the same call the canvas makes.
      return <IconListView props={p} scopeBase={iconListScope(block)} pageSymbols={iconSymbols} />;

    case "tableOfContents":
      return <TableOfContentsFE props={p} headings={documentHeadings} scopeBase={tocScope(block)} toggleLabel={t.toggleToc} />;

    case "splitContent": {
      // Half the column beside the text on wider screens; optimised.
      const imgEl = p.image ? (
        <ContentImage
          src={String(p.image)}
          alt={p.heading || ""}
          lazy={media.lazy}
          quality={media.quality}
          {...imageAttrs(p.image)}
          sizes={sizesFor(imageSizes.get(String(p.image))?.width, { pct: 50 })}
          className="w-full rounded-xl object-cover"
        />
      ) : null;
      const textEl = (
        <div className="flex flex-col justify-center">
          {p.heading && <h3 className="text-2xl font-bold mb-3">{p.heading}</h3>}
          {p.text && <p className="text-sm leading-relaxed opacity-70">{p.text}</p>}
          {p.buttonText && p.buttonUrl && (
            <a href={p.buttonUrl} className="bms-cta-btn mt-4 inline-block px-5 py-2.5 rounded-xl font-semibold text-sm text-white self-start">
              {p.buttonText}
            </a>
          )}
        </div>
      );
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center my-8">
          {p.imagePosition === "left" ? <>{imgEl}{textEl}</> : <>{textEl}{imgEl}</>}
        </div>
      );
    }

    case "textAdvanced": {
      // Same two helpers the canvas uses — this block used to rebuild both
      // style objects by hand here, which is how the editor and the published
      // page drifted (per-side borders and heading sizes existed in neither).
      // The overrides-only variants: the defaults are in the stylesheet as
      // `.bmsta` / `.bmsta-<tag>`, so an element carries inline only what the
      // author changed. See textAdvanced.ts for the measurement behind that.
      const wrap = textAdvancedWrapOverrides(p as Record<string, string>);
      const ts = textAdvancedTextOverrides(p as Record<string, string>);
      const Tag = (p.tag || "p") as keyof React.JSX.IntrinsicElements;
      // Formatted like a paragraph (bold, links, colours) — the published page
      // used to print `textContent`, so a link typed inside the box showed in
      // the editor and vanished live (a live site, 2026-10-07). A whole-block
      // link keeps the plain text: an anchor cannot hold another anchor.
      const text = p.linkUrl ? textContent : rich;
      const linked = p.linkUrl
        ? <a href={p.linkUrl} {...newTabProps(p.linkTarget === "_blank")}>{text}</a>
        : text;
      const icon = p.iconChar
        ? <span style={{ fontSize: p.iconSize ? `${p.iconSize}px` : undefined, color: p.iconColor || undefined }}>{p.iconChar}</span>
        : null;
      // A heading gets the same anchor a Heading block does, so the Table of
      // Contents can link to it.
      const anchor = TA_HEADING_LEVEL[String(p.tag)] && textContent ? anchorFor(block.id, textContent) : undefined;
      // The author's overrides as hashed classes rather than inline styles:
      // one rule per distinct look, however many headings share it.
      const wrapCls = styleClass(wrap as Record<string, unknown>, "ta");
      const textCls = styleClass(ts as Record<string, unknown>, "ta");
      return (
        <div className={[TA_WRAP_CLASS, wrapCls?.className, "my-2 flex items-baseline gap-2"].filter(Boolean).join(" ")}>
          <BlockStyle css={[wrapCls?.css, textCls?.css].filter(Boolean).join("")} />
          {p.iconPos !== "right" && icon}
          <Tag id={anchor} className={[taTextClass(String(p.tag || "p")), textCls?.className, "flex-1"].filter(Boolean).join(" ")}>{linked}</Tag>
          {p.iconPos === "right" && icon}
        </div>
      );
    }

    case "imageAdvanced": {
      if (!p.src) return null;
      // Constants live on `.bmsia*` in the stylesheet; alignment is a class.
      const wrap: React.CSSProperties = {
        backgroundColor: p.bgColor || undefined,
        paddingTop: p.paddingTop ? `${p.paddingTop}px` : undefined,
        paddingRight: p.paddingRight ? `${p.paddingRight}px` : undefined,
        paddingBottom: p.paddingBottom ? `${p.paddingBottom}px` : undefined,
        paddingLeft: p.paddingLeft ? `${p.paddingLeft}px` : undefined,
        marginTop: p.marginTop ? `${p.marginTop}px` : undefined,
        marginBottom: p.marginBottom ? `${p.marginBottom}px` : undefined,
      };
      const figure: React.CSSProperties = {
        width: p.width ? `${p.width}${p.widthUnit || "%"}` : undefined,
        border: p.borderWidth ? `${p.borderWidth}px ${p.borderStyle || "solid"} ${p.borderColor || "#e2e8f0"}` : undefined,
        borderRadius: p.borderRadius ? `${p.borderRadius}px` : undefined,
        boxShadow: p.boxShadow === "true" ? `${p.shadowX || 0}px ${p.shadowY || 8}px ${p.shadowBlur || 24}px ${p.shadowSpread || 0}px ${p.shadowColor || "#00000026"}` : undefined,
      };
      const filterMap: Record<string, (a: string) => string> = {
        grayscale: (a) => `grayscale(${a || 100}%)`, sepia: (a) => `sepia(${a || 100}%)`,
        blur: (a) => `blur(${a || 2}px)`, brightness: (a) => `brightness(${a || 110}%)`,
        contrast: (a) => `contrast(${a || 110}%)`, saturate: (a) => `saturate(${a || 150}%)`,
        invert: (a) => `invert(${a || 100}%)`,
      };
      const img: React.CSSProperties = {
        height: p.height ? `${p.height}px` : undefined,
        objectFit: p.objectFit && p.objectFit !== "cover" ? (p.objectFit as React.CSSProperties["objectFit"]) : undefined,
        filter: p.filter && p.filter !== "none" && filterMap[p.filter] ? filterMap[p.filter](p.filterAmount) : undefined,
      };
      const hoverClass = p.hoverEffect === "zoom" ? "img-adv-zoom" : p.hoverEffect === "lift" ? "img-adv-lift" : "";
      const imgEl = (
        <ContentImage
          src={String(p.src)}
          alt={altFor(p.alt, p.caption)}
          style={img}
          // The block's own Loading choice wins over the automatic pick:
          // "priority" is the main image, "eager" is simply never lazy.
          priority={p.loadMode === "priority" || isHeroImage(block)}
          lazy={p.loadMode === "eager" ? false : media.lazy}
          quality={media.quality}
          {...imageAttrs(p.src)}
          sizes={sizesFor(
            imageSizes.get(String(p.src))?.width,
            p.width ? ((p.widthUnit || "%") === "px" ? { px: parseFloat(p.width) } : (p.widthUnit || "%") === "%" ? { pct: parseFloat(p.width) } : undefined) : undefined
          )}
        />
      );
      return (
        <div style={wrap} className={["bmsia", `bmsia-${p.align === "center" ? "c" : p.align === "right" ? "r" : "l"}`, "my-4", p.cssClass || ""].filter(Boolean).join(" ")}>
          <figure style={figure} className={["bmsia-fig", hoverClass].filter(Boolean).join(" ")}>
            <div className="bmsia-box">
              {p.linkUrl ? <a href={p.linkUrl} {...newTabProps(p.linkTarget === "_blank")}>{imgEl}</a> : imgEl}
              {p.overlayColor && <div style={{ position: "absolute", inset: 0, backgroundColor: p.overlayColor, opacity: (parseInt(p.overlayOpacity) || 30) / 100, pointerEvents: "none" }} />}
            </div>
            {p.caption && <figcaption className="text-center text-sm text-slate-500 mt-2">{p.caption}</figcaption>}
          </figure>
        </div>
      );
    }

    case "rowLayout": {
      const row = resolveRow(p);
      const rowClass = `row-${String(block.id).replace(/[^a-zA-Z0-9]/g, "")}`;

      // The grid itself is class-driven rather than inline: the column template
      // changes at two breakpoints, and inline styles cannot carry a media query.
      // A breakpoint only gets a rule when its template differs from the one
      // already in force below it: a single-column row is one column at every
      // width, and a two-column row is the same at 640 and 1024.
      const rules = [
        `.${rowClass}{display:grid;grid-template-columns:${row.mobileTemplate};column-gap:${row.gap}px;row-gap:${row.rowGap}px;align-items:${row.alignItems}}`,
        row.tabletTemplate !== row.mobileTemplate
          ? `@media(min-width:640px){.${rowClass}{grid-template-columns:${row.tabletTemplate}}}`
          : "",
        row.template !== row.tabletTemplate
          ? `@media(min-width:1024px){.${rowClass}{grid-template-columns:${row.template}}}`
          : "",
      ];
      if (row.reverseOnMobile) {
        const orders = row.columns
          .map((_, i) => `.${rowClass}>*:nth-child(${i + 1}){order:${row.count - i}}`)
          .join("");
        rules.push(`@media(max-width:639px){${orders}}`);
      }
      // Link colouring and the author's own CSS both target descendants, so
      // they have to be rules rather than inline styles.
      const shellClass = `${rowClass}-shell`;
      rules.push(rowLinkCss(p, shellClass), rowCustomCss(p, shellClass));
      // A responsive background lives in the row's CSS, not the inline style:
      // an inline `background` would beat the media-query image below.
      const bgv = p.bgType === "image" && typeof p.bgImage === "string" ? bgVariants(p.bgImage) : null;
      let inlineBackground = row.background;
      if (bgv && row.background) {
        inlineBackground = undefined;
        const withUrl = (u: string) => row.background!.replace(/url\("[^"]*"\)/, `url("${u}")`);
        rules.push(
          `.${shellClass}{background:${withUrl(bgv.d)}}`,
          `@media(max-width:1279px){.${shellClass}{background-image:url("${bgv.t}")}}`,
          `@media(max-width:767px){.${shellClass}{background-image:url("${bgv.m}")}}`
        );
      }

      const Tag = row.tag as "div";

      // The 24px default gap is a convenience for rows sitting in a run of
      // text, but it is applied to the row itself while the Box margin control
      // writes to the wrapper around it. That made the gap unremovable: setting
      // margin to 0 changed the wrapper and left this untouched, so a
      // full-width coloured row always had a white band above and below it.
      // An explicit margin now replaces the default rather than fighting it.
      const ownMargin = Object.keys(boxMargin(parseBox(p.bx))).length > 0;

      return (
        <Tag
          id={row.anchor}
          className={[ownMargin ? "" : "my-6", shellClass, row.extraClass].filter(Boolean).join(" ")}
          style={{
            // A z-index only bites on a positioned element, so asking for one
            // is itself a reason to stop being static.
            position: row.isLayered || row.zIndex !== undefined ? "relative" : undefined,
            overflow: row.isLayered ? "hidden" : undefined,
            zIndex: row.zIndex,
            background: inlineBackground,
            color: row.color,
            padding: row.padding,
            minHeight: row.minHeight,
            maxHeight: row.maxHeight,
            border: row.border,
            borderRadius: row.borderRadius,
            boxShadow: row.boxShadow,
          }}
        >
          <BlockStyle css={rules.filter(Boolean).join("")} />
          {row.overlay && <RowOverlay {...row.overlay} />}
          <RowDivider {...row.top} />
          <RowDivider {...row.bottom} />
          {/* `.bms-row-in` carries position and z-index; only a set max width is inline. */}
          <div
            className="bms-row-in"
            style={row.maxWidth ? { maxWidth: row.maxWidth, marginInline: "auto" } : undefined}
          >
            <div className={rowClass}>
              {row.columns.map((c, i) => {
                // Each column reads its own Section settings through the same
                // resolver the editor uses, so the canvas cannot drift from here.
                const scope = `${rowClass}-sec${i}`;
                const sec = resolveSection(c, scope);
                const SecTag = sec.tag as "div";
                // Children see this column's share of the width while they
                // render, so an image inside asks for a fitting candidate.
                const outer = columnShare;
                const outerColumn = column;
                const dShare = templateShares(row.template)[i] ?? 1 / row.count;
                const tShare = templateShares(row.tabletTemplate)[i % Math.max(1, templateShares(row.tabletTemplate).length)] ?? 1;
                const mShare = templateShares(row.mobileTemplate)[i % Math.max(1, templateShares(row.mobileTemplate).length)] ?? 1;
                columnShare = { m: outer.m * mShare, t: outer.t * tShare, d: outer.d * dShare };
                // A row with its own pixel width is the desktop width its
                // images sit in, not the document's content column. Measured
                // against the 800px column, a 60% column of a 1320px row asked
                // for a 480px picture and the browser stretched it to ~750px.
                const ownPx = /^\d+(?:\.\d+)?px$/.test(String(row.maxWidth ?? "")) ? parseFloat(String(row.maxWidth)) : 0;
                if (ownPx > 0) {
                  column = { ...column, px: ownPx, fluid: false };
                  columnShare = { ...columnShare, d: dShare };
                }
                let inner: React.ReactNode[] | null;
                try {
                  inner = Array.isArray(c.blocks) && c.blocks.length > 0 ? wrapListItems(c.blocks, t) : null;
                } finally {
                  columnShare = outer;
                  column = outerColumn;
                }
                return (
                  <SecTag
                    key={i}
                    id={sec.anchor}
                    className={[
                      "min-w-0",
                      "bms-col",
                      scope,
                      sectionHiddenClass(sec),
                      sec.anim ? `bx-an bx-an-${sec.anim.name}` : "",
                      sec.extraClass,
                    ].filter(Boolean).join(" ")}
                    data-bx-an-replay={sec.anim?.replay ? "1" : undefined}
                    style={{
                      // The flex defaults every column shares live on `.bms-col`
                      // in the stylesheet; the resolver still returns them for
                      // the editor canvas, so they are stripped here, not there.
                      ...withoutDefaults(sec.style as React.CSSProperties, SECTION_DEFAULTS),
                      ...(sec.anim?.vars ?? {}),
                      alignSelf: c.valign
                        ? c.valign === "middle" ? "center" : c.valign === "bottom" ? "end" : "start"
                        : undefined,
                    }}
                  >
                    <BlockStyle css={sec.css} />
                    {sec.overlay && (
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: sec.overlay.background,
                          opacity: sec.overlay.opacity,
                          mixBlendMode: sec.overlay.blend as React.CSSProperties["mixBlendMode"],
                          pointerEvents: "none",
                        }}
                      />
                    )}
                    {/* An overlay link swallows the whole section, which is why
                        Kadence warns that nothing inside stays clickable. */}
                    {sec.link ? (
                      <a
                        href={sec.link.href}
                        title={sec.link.title}
                        className="relative block no-underline text-inherit bms-col-in"
                      >
                        {inner}
                      </a>
                    ) : (
                      <div className="relative w-full bms-col-in">{inner}</div>
                    )}
                  </SecTag>
                );
              })}
            </div>
          </div>
        </Tag>
      );
    }

    default:
      return textContent ? <p className="mb-4">{textContent}</p> : null;
  }
}

const slugify = headingSlug;

/**
 * What `resolveSection` puts on every column and the stylesheet's `.bms-col`
 * rule now says once. Sixteen columns on one measured page each carried these
 * four declarations inline.
 */
const SECTION_DEFAULTS = { display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "flex-start" } as const;

/**
 * A block together with the blocks nested under it.
 *
 * Tab in the editor nests a block under the one above it — a sub-bullet, an
 * indented paragraph — and BlockNote stores that as `children`. Nothing here
 * rendered `children`, so every sub-bullet and indented block was on the
 * editor canvas and missing from the live page, silently.
 *
 * A list item takes its nested blocks inside its own `<li>`, which is what
 * makes a sub-list valid HTML and indents it; anything else gets them in an
 * indented group after it, the way the editor draws them.
 */
function withChildren(block: AnyBlock, t: UiText, depth: number): React.ReactNode {
  const node = renderBlock(block, t);
  const kids = Array.isArray(block.children) ? (block.children as AnyBlock[]) : [];
  if (kids.length === 0 || depth >= MAX_WALK_DEPTH) return node;
  const nested = wrapListItems(kids, t, depth + 1);
  if (React.isValidElement(node) && node.type === "li") {
    const el = node as React.ReactElement<{ children?: React.ReactNode }>;
    return React.cloneElement(el, undefined, el.props.children, <div className="bms-nested mt-1">{nested}</div>);
  }
  return (
    <>
      {node}
      <div className="bms-nested ms-6">{nested}</div>
    </>
  );
}

function wrapListItems(blocks: AnyBlock[], t: UiText, depth = 0): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === "bulletListItem") {
      const items: React.ReactNode[] = [];
      while (i < blocks.length && blocks[i].type === "bulletListItem") {
        items.push(<React.Fragment key={blocks[i].id}>{withChildren(blocks[i], t, depth)}</React.Fragment>);
        i++;
      }
      result.push(<ul key={`ul-${i}`} className="list-disc list-inside mb-4 space-y-1">{items}</ul>);
    } else if (block.type === "numberedListItem") {
      const items: React.ReactNode[] = [];
      while (i < blocks.length && blocks[i].type === "numberedListItem") {
        items.push(<React.Fragment key={blocks[i].id}>{withChildren(blocks[i], t, depth)}</React.Fragment>);
        i++;
      }
      result.push(<ol key={`ol-${i}`} className="list-decimal list-inside mb-4 space-y-1">{items}</ol>);
    } else if (block.type === "checkListItem") {
      // Checklist items were bare <li>s with no list around them — invalid
      // markup, and a screen reader never announced a list.
      const items: React.ReactNode[] = [];
      while (i < blocks.length && blocks[i].type === "checkListItem") {
        items.push(<React.Fragment key={blocks[i].id}>{withChildren(blocks[i], t, depth)}</React.Fragment>);
        i++;
      }
      result.push(<ul key={`cl-${i}`} className="bms-checklist list-none ps-0 mb-4 space-y-1">{items}</ul>);
    } else {
      result.push(<React.Fragment key={block.id}>{withChildren(block, t, depth)}</React.Fragment>);
      i++;
    }
  }
  return result;
}

/**
 * Drops the blocks this visitor is not meant to see.
 *
 * Done as a prepass rather than a check inside `renderBlock` so the renderer's
 * signature stays put: the flag would otherwise have to be threaded through
 * every recursive call for the handful of rows that use it.
 */
function filterForViewer(blocks: AnyBlock[], loggedIn: boolean, depth = 0): AnyBlock[] {
  if (depth > MAX_WALK_DEPTH) return [];
  const out: AnyBlock[] = [];
  for (const block of blocks) {
    const props = (block?.props ?? {}) as AnyBlock;
    if (rowHiddenForViewer(props, loggedIn)) continue;
    if (block?.type === "rowLayout" && props.cols) {
      // A hidden row inside a column has to go too, and columns carry their
      // blocks as JSON rather than as children.
      const cols = parseAllColumns(props.cols).map((c) => ({
        ...c,
        blocks: filterForViewer(c.blocks ?? [], loggedIn, depth + 1),
      }));
      out.push({ ...block, props: { ...props, cols: serializeColumns(cols) } });
      continue;
    }
    // Nested blocks render now (see withChildren), so they are filtered too.
    if (Array.isArray(block?.children) && block.children.length) {
      out.push({ ...block, children: filterForViewer(block.children as AnyBlock[], loggedIn, depth + 1) });
      continue;
    }
    out.push(block);
  }
  return out;
}

interface BlockRendererProps {
  blocks: AnyBlock[];
  /** The content column this document renders in, for image `sizes`. Defaults to an 800 px column. */
  column?: ContentColumn;
  /**
   * The document's title. Accepted for the callers that pass it, no longer
   * used: images used to fall back to it for alt text, and that was the wrong
   * default (see altFor).
   */
  title?: string;
  /**
   * The document's absolute URL. Gives the schema nodes blocks emit (an app,
   * a download, a FAQ) their `@id` — see lib/blockSchema — so the page's own
   * node can point at them. Header and footer Elements pass nothing: a node
   * repeated on every page belongs to none of them.
   */
  pageUrl?: string;
  /** The document's language, for plugins; the site language when absent. */
  language?: string;
  /** The document's own Direction setting, for plugins. */
  direction?: string | null;
  /** Set only on an author page — what the Author Bio block reads. */
  author?: AuthorLike | null;
  /**
   * Whether these blocks start in the first viewport, so their first image is
   * worth fetching ahead of everything else. True for a document and the
   * header Elements; a footer Element passes false, or its background would
   * be preloaded on every page and never seen without a scroll.
   */
  aboveFold?: boolean;
}

export default async function BlockRenderer(props: BlockRendererProps) {
  try {
    return await renderBlocks(props);
  } catch (err) {
    console.error("[BlockRenderer]", err);
    return null;
  }
}

async function renderBlocks({ blocks, language, direction, author, pageUrl, aboveFold = true, column: col }: BlockRendererProps) {
  // `content` is a JSON column, so "an array of blocks" is a convention rather
  // than a guarantee — a bad import or a hand-edited row can hold an object.
  // The old guard let one straight through: `{}` is truthy and `{}.length` is
  // not 0, so it reached `for...of` and threw "is not iterable". That kills the
  // whole page, and for an Element it kills *every* page, since Elements render
  // into the header and footer of all of them.
  if (!Array.isArray(blocks) || blocks.length === 0) return null;

  // Resolved before the tree is built so every `<img>` can declare its size.
  // Without `width`/`height` the browser cannot reserve space and the page
  // jumps as each image arrives — Cumulative Layout Shift, one of the three
  // Core Web Vitals.
  // ── Everything asynchronous first, into locals ────────────────────────────
  //
  // The renderer keeps the document's context in module-level variables (see
  // the top of this file), which is only sound if nothing can run between
  // setting them and building the tree. They used to be set *between* these
  // awaits — and React renders sibling server components concurrently, so the
  // header/footer Elements (ElementSlot) and the page body, or two requests,
  // overwrote each other's: an Element reset the body's column width and
  // image sizes mid-render, and a page could pick up another page's author
  // box or schema `@id`. All awaits happen here; the assignments below are
  // one synchronous block that runs straight into the tree build.
  const sizes = await lookupImageSizes(collectImageSrcs(blocks));
  const settings = await getSiteSettings();
  const lang = language || siteLang(settings);
  // Plugins, resolved up front. Cheap when there are none: the walk only
  // touches the database for a block that actually carries a shortcode.
  const plugins = await resolvePluginBlocks(blocks, { lang, dir: documentDir(lang, settings, direction) });

  // `auth()` reads cookies, which opts the page out of static rendering — so
  // it only runs when a row or a condition actually asks who is looking.
  let visible = blocks;
  const needsViewer = usesViewerVisibility(blocks);
  const needsConditions = usesConditions(blocks);

  if (needsViewer || needsConditions) {
    const session = await auth();
    const loggedIn = !!session?.user;
    if (needsViewer) visible = filterForViewer(visible, loggedIn);
    if (needsConditions) {
      visible = filterByConditions(visible, {
        loggedIn,
        role: (session?.user as { role?: string } | undefined)?.role,
        now: new Date(),
        // Settings -> Timezone, so "show after 09:00" is nine o'clock where
        // the site is rather than where the server happens to run.
        timeZone: settings.site_timezone || undefined,
      });
    }
  }

  if (visible.length === 0) return null;

  // ── No awaits below this line ─────────────────────────────────────────────
  imageSizes = sizes;
  columnShare = { m: 1, t: 1, d: 1 };
  column = col ?? { px: 800, fluid: false, gutter: 96 };
  iconSymbols = new Set<string>();
  pluginHtml = plugins;
  siteTz = settings.site_timezone || undefined;
  videoFacade = settings.perf_video_facade !== "false";
  businessSettings = settings;
  authorContext = author ?? null;
  documentUrl = (pageUrl ?? "").trim();
  documentLanguage = lang;
  linkPolicy = externalLinkPolicy(settings, siteUrl(settings));
  // Third-party hosts this content will reach for — open those connections
  // while the HTML is still arriving. React hoists <link> into <head>.
  preconnects =
    settings.perf_preconnect !== "false"
      ? preconnectHosts(blocks, siteUrl(settings), { headScripts: settings.script_head, scriptsDelayed: settings.scripts_delay === "true", videoFacade })
      : [];

  // The theme's own words inside a block — the slider's controls, a modal's
  // close button, a map's frame title. Author text is never touched.
  const t = uiText(lang);

  // Headings are collected from what this viewer actually gets, not from the
  // stored content. Collected from `blocks` it listed headings inside rows
  // that Conditional Display or a logged-in-only rule had removed, so the
  // Table of Contents carried links to anchors that were never rendered —
  // three of them on the live homepage, each scrolling nowhere.
  documentHeadings = collectHeadings(visible);
  documentAnchors = assignAnchors(documentHeadings);
  // From the blocks that will actually render, so a row hidden for this
  // viewer does not have its background fetched for nobody.
  {
    const speed = speedSettings(businessSettings ?? {});
    media = {
      lazy: on(speed.media_lazy),
      lazyIframes: on(speed.media_lazy_iframes),
      blur: on(speed.media_blur_placeholder),
      quality: intIn(speed.image_quality, 50, 90, 75),
    };
    heroScan = intIn(speed.media_eager_count, 0, 10, 3);
    keepEmptyParagraphs = speed.render_empty_paragraphs === "keep";
  }
  // An author who marked an image "Main image" has made the choice the scan
  // would guess at; two high-priority fetches would only compete. Tested on
  // the serialised tree because Row Layout columns hold their blocks as JSON
  // strings, where the quotes arrive escaped once per level.
  const chosenHero = /loadMode\\*"\s*:\s*\\*"priority/.test(JSON.stringify(visible));
  hero = aboveFold && !chosenHero ? findHero(visible) : null;
  return (
    <div className="prose-content">
      {preconnects.map((href) => (
        // No `crossorigin`: images and iframes are fetched without CORS, and a
        // connection opened in CORS mode cannot be reused for them. Only a
        // font or fetch() host wants the CORS connection.
        <link key={href} rel="preconnect" href={href} {...(/font/i.test(href) ? { crossOrigin: "anonymous" as const } : {})} />
      ))}
      {/* A row background is plain CSS, so this is the only way to name it
          early. React hoists it into <head> beside the preconnects. An image
          block needs no link here: `priority` on ContentImage emits one. */}
      {hero?.kind === "row" && (() => {
        const v = bgVariants(hero.src);
        // One preload per breakpoint, on the same media queries the row's CSS
        // uses. A single `imagesrcset` preload chose by viewport × DPR while
        // the CSS chose by viewport alone, so a 3x phone preloaded the 1200
        // file and then fetched the 828 one the CSS asked for — two downloads
        // for one background on the very devices the preload was for.
        return v
          ? <>
              <link rel="preload" as="image" href={v.m} media="(max-width:767px)" fetchPriority="high" />
              <link rel="preload" as="image" href={v.t} media="(min-width:768px) and (max-width:1279px)" fetchPriority="high" />
              <link rel="preload" as="image" href={v.d} media="(min-width:1280px)" fetchPriority="high" />
            </>
          : <link rel="preload" as="image" href={hero.src} fetchPriority="high" />;
      })()}
      {pruneUndefined(wrapListItems(visible, t))}
      {/* One observer for the page, mounted only when something animates. */}
      {usesScrollAnimation(visible) && <ScrollAnimations />}
    </div>
  );
}

/** True when any block in the tree asks for a scroll animation. */
function usesScrollAnimation(blocks: AnyBlock[], depth = 0): boolean {
  if (depth > MAX_WALK_DEPTH) return false;
  for (const b of blocks ?? []) {
    const raw = b?.props?.bx;
    if (typeof raw === "string" && raw.includes('"an"')) return true;
    if (b?.type === "timeline" && b?.props?.animate === "true") return true;
    if (typeof b?.props?.cols === "string" && b.props.cols.includes('"an"')) return true;
    if (Array.isArray(b?.children) && usesScrollAnimation(b.children, depth + 1)) return true;
  }
  return false;
}

/**
 * Drops blocks whose Conditional Display rules exclude this viewer — including
 * the ones nested inside Row Layout columns, which are not part of the
 * document's own block list.
 */
function filterByConditions(blocks: AnyBlock[], ctx: ViewerContext, depth = 0): AnyBlock[] {
  if (depth > MAX_WALK_DEPTH) return [];
  const out: AnyBlock[] = [];
  for (const block of blocks ?? []) {
    const props = (block?.props ?? {}) as Record<string, unknown>;
    if (!shouldDisplay(parseConditions(parseBox(props.bx).cd), ctx)) continue;

    if (block?.type === "rowLayout" && typeof props.cols === "string") {
      const cols = parseColumns(props.cols, parseInt(String(props.columns) || "2", 10) || 2);
      // A Section carries its own rules. One that fails is emptied rather than
      // spliced out: the row's column template is positional, so removing a
      // column would silently re-flow every other one.
      const kept = cols.map((c) => {
        const rules = parseConditions((c as Record<string, unknown>).cd);
        if (!shouldDisplay(rules, ctx)) return { ...c, blocks: [], hideD: "true", hideT: "true", hideM: "true" };
        return { ...c, blocks: filterByConditions(c.blocks ?? [], ctx, depth + 1) };
      });
      out.push({ ...block, props: { ...props, cols: JSON.stringify(kept) } });
      continue;
    }

    // An Accordion pane is not a block, but it carries the same rules — and a
    // hidden answer must never reach the browser, so it is dropped here rather
    // than hidden with CSS.
    if (block?.type === "accordion" && typeof props.items === "string") {
      const kept = parsePanes(props.items).filter((pane) =>
        shouldDisplay(parseConditions(pane.cd), ctx)
      );
      out.push({ ...block, props: { ...props, items: serializePanes(kept) } });
      continue;
    }

    out.push(
      Array.isArray(block?.children) && block.children.length > 0
        ? { ...block, children: filterByConditions(block.children, ctx) }
        : block
    );
  }
  return out;
}

/**
 * Every image URL a document references, including nested blocks.
 *
 * Walks props generically rather than naming each block type: the image, the
 * gallery, the info box and the image-compare block all store a URL under a
 * differently named prop, and a list of names would go stale the next time a
 * block gains one.
 */
/**
 * How deep the pre-passes below will walk a document.
 *
 * They run *before* the per-block `try/catch` in `renderBlock`, so a
 * `RangeError: Maximum call stack size exceeded` in any of them takes the
 * whole page with it — and for an Element, every page. Measured: the image
 * walk blows the stack at about 5,000 levels of nesting. Nothing built in the
 * editor comes close (a few nested rows is a handful of levels), but content
 * also arrives by import and from plugins, and `contentPolicy` already caps
 * its own walk for the same reason. Two lines against losing the page.
 *
 * The collectors stop looking at the cap; the visibility filters drop what is
 * past it, because a filter that runs out of room must not start showing
 * blocks it was meant to hide.
 */
const MAX_WALK_DEPTH = 64;

function collectImageSrcs(blocks: AnyBlock[]): string[] {
  const out: string[] = [];
  const IMAGE_KEYS = /^(src|image|imageUrl|url|before|after|thumbnail|avatar|logo)$/i;

  const walk = (value: unknown, key?: string, depth = 0) => {
    if (depth > MAX_WALK_DEPTH) return;
    if (typeof value === "string") {
      // Only values that look like an image path, so a heading's text or a
      // link's href is not queried.
      if (key && IMAGE_KEYS.test(key) && /^(\/|https?:)/.test(value)) out.push(value);
      // Containers keep their children as a JSON *string* prop — a Row
      // Layout's columns, tabs, modals, split content. Without this the walk
      // stopped at the string and every image inside a row went unmeasured:
      // on the first live site that was all 17 of them, each rendered with
      // the 1200×675 default — wrong aspect ratio, wrong srcset, and a
      // `w=3840` fallback — while the media library knew the real sizes.
      const t = value.trimStart();
      if ((t.startsWith("[") || t.startsWith("{")) && t.length > 2) {
        try {
          walk(JSON.parse(value), undefined, depth + 1);
        } catch {
          // Text that merely starts with a bracket.
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v, key, depth + 1));
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, k, depth + 1);
    }
  };

  walk(blocks);
  return out;
}
