// The Advanced Table of Contents model — one resolver read by the editor
// canvas and the published page, the same contract `resolveAccordion` /
// `resolveTable` / `resolveIconList` keep.
//
// Headings themselves are never stored on the block — `documentHeadings` in
// BlockRenderer already walks the whole page for them, the same list the old,
// minimal version of this block read. What is new here is everything about
// how that list is filtered and presented.

import {
  authorCss,
  blockScope,
  cssValue,
  safeClass,
  scalarAt,
  sidesAt,
  type PropRec,
} from "./blockStyle";
import { ACC_ICON_STYLES, ACC_LETTER_CASE } from "./accordion";
import { MQ_MOBILE, MQ_TABLET, type Device } from "./responsive";

export { ACC_ICON_STYLES as TOC_ICON_STYLES, ACC_LETTER_CASE as TOC_LETTER_CASE };

export const TOC_LIST_STYLES: { id: string; title: string }[] = [
  { id: "underline", title: "Underline" },
  { id: "none", title: "None" },
];

/**
 * `anchor` is the id the renderer actually put on the heading. Two headings
 * with the same words produce the same slug, so the renderer numbers the
 * repeats and passes the result here rather than letting both sides slugify
 * independently and disagree.
 */
export type TocHeading = { level: number; text: string; anchor?: string };

export interface TocEntry {
  text: string;
  href: string;
  /** Depth relative to the shallowest heading on the page, 0-based. */
  depth: number;
}

export interface ResolvedToc {
  entries: TocEntry[];
  title: string;
  showTitle: boolean;
  wrapClass: string;
  css: string;
  anchor?: string;
  collapsible: boolean;
  startCollapsed: boolean;
  titleToggle: boolean;
  showIcon: boolean;
  icon: { closed: string; open: string; spin: boolean };
  smoothScroll: boolean;
  highlightActive: boolean;
}

export const tocScope = (block: { id?: unknown; props?: unknown }) => blockScope("bmstoc", block);

/** `p.levels` is a string of the digits 1-6 present, e.g. "123456" or "23". */
export function parseLevels(raw: unknown): Set<number> {
  const s = typeof raw === "string" ? raw : "123456";
  const set = new Set<number>();
  for (const ch of s) {
    const n = Number(ch);
    if (n >= 1 && n <= 6) set.add(n);
  }
  return set.size ? set : new Set([1, 2, 3, 4, 5, 6]);
}

/**
 * A heading's anchor id from its text. Exported because the renderer stamps
 * the id and the contents block links to it: one function, so they cannot
 * disagree (they were two identical copies, kept in step by a comment). The
 * old `[^\w\s-]` stripped every non-Latin letter, so on an Arabic page every
 * link became `#-` while the headings carried their real ids.
 */
export const headingSlug = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/(^-|-$)/g, "");
const slugify = headingSlug;

/**
 * Reads a Table of Contents block against the page's actual headings.
 *
 * `scopeBase` is owned by the caller, same as every other advanced block.
 */
export function resolveToc(p: PropRec, headings: TocHeading[], scopeBase: string): ResolvedToc {
  const rules: string[] = [];
  const sel = `.${scopeBase}`;
  const levels = parseLevels(p.levels);
  // A page's single H1 is its title, and a contents list whose first entry
  // links to the heading the reader is already looking at is noise (every
  // block was created with H1 ticked, so every TOC did it). Several H1s mean
  // the document uses H1 for its sections, and then they are entries.
  const soleTitle = headings.filter((h) => h.level === 1).length === 1;
  const filtered = headings.filter((h) => levels.has(h.level) && !(soleTitle && h.level === 1));
  const top = filtered.length ? Math.min(...filtered.map((h) => h.level)) : 1;
  const entries: TocEntry[] = filtered.map((h) => ({
    text: h.text,
    href: `#${h.anchor || slugify(h.text)}`,
    depth: h.level - top,
  }));

  /* ── Container ─────────────────────────────────────────────────────────── */

  const box: string[] = [];
  const bg = cssValue(p.bg);
  if (bg) box.push(`background:${bg}`);
  const bd = sidesAt(p.bd, "d");
  if (bd) {
    box.push(`border-width:${bd}`, `border-style:${cssValue(p.bdStyle) || "solid"}`);
    box.push(`border-color:${cssValue(p.bdColor) || "rgba(100,116,139,.24)"}`);
  }
  const rad = sidesAt(p.rad, "d");
  if (rad) box.push(`border-radius:${rad}`);
  const shadow = cssValue(p.shadow);
  if (shadow) box.push(`box-shadow:${shadow}`);
  const pad = sidesAt(p.pad, "d");
  if (pad) box.push(`padding:${pad}`);
  const margin = sidesAt(p.margin, "d");
  if (margin) box.push(`margin:${margin}`);
  const maxWidth = scalarAt(p.maxWidth, "d");
  if (maxWidth) box.push(`max-width:${maxWidth}`);
  if (box.length) rules.push(`${sel}{${box.join(";")}}`);

  for (const [mq, dev] of [[MQ_TABLET, "t"], [MQ_MOBILE, "m"]] as [string, Device][]) {
    const decls: string[] = [];
    const p2 = sidesAt(p.pad, dev);
    if (p2) decls.push(`padding:${p2}`);
    const m2 = sidesAt(p.margin, dev);
    if (m2) decls.push(`margin:${m2}`);
    const mw2 = scalarAt(p.maxWidth, dev);
    if (mw2) decls.push(`max-width:${mw2}`);
    if (decls.length) rules.push(`${mq}{${sel}{${decls.join(";")}}}`);
  }

  /* ── Title ─────────────────────────────────────────────────────────────── */

  const title: string[] = [];
  const titleColor = cssValue(p.titleColor);
  if (titleColor) title.push(`color:${titleColor}`);
  const titleBg = cssValue(p.titleBg);
  if (titleBg) title.push(`background:${titleBg}`);
  const tFs = scalarAt(p.tFs, "d");
  if (tFs) title.push(`font-size:${tFs}`);
  const tLh = cssValue(p.tLh);
  if (tLh) title.push(`line-height:${tLh}`);
  const tLs = scalarAt(p.tLs, "d");
  if (tLs) title.push(`letter-spacing:${tLs}`);
  const tFf = cssValue(p.tFf);
  if (tFf) title.push(`font-family:${tFf}`);
  const tFw = cssValue(p.tFw);
  if (tFw) title.push(`font-weight:${tFw}`);
  const tTt = cssValue(p.tTt);
  if (tTt) title.push(`text-transform:${tTt}`);
  const tPad = sidesAt(p.tPad, "d");
  if (tPad) title.push(`padding:${tPad}`);
  const tBd = sidesAt(p.tBd, "d");
  if (tBd) {
    title.push(`border-width:${tBd}`, `border-style:${cssValue(p.tBdStyle) || "solid"}`);
    title.push(`border-color:${cssValue(p.tBdColor) || "rgba(100,116,139,.24)"}`);
  }
  const tRad = sidesAt(p.tRad, "d");
  if (tRad) title.push(`border-radius:${tRad}`);
  const tMargin = sidesAt(p.tMargin, "d");
  if (tMargin) title.push(`margin:${tMargin}`);
  if (title.length) rules.push(`${sel} .bmstoc-title{${title.join(";")}}`);

  const iconColor = cssValue(p.iconColor);
  if (iconColor) rules.push(`${sel} .bmstoc-ico{color:${iconColor}}`);

  /* ── List ──────────────────────────────────────────────────────────────── */

  const listWrap: string[] = [];
  const listGap = scalarAt(p.listGap, "d");
  if (listGap) listWrap.push(`gap:${listGap}`);
  const listMargin = sidesAt(p.listMargin, "d");
  if (listMargin) listWrap.push(`margin:${listMargin}`);
  if (listWrap.length) rules.push(`${sel} .bmstoc-list{${listWrap.join(";")}}`);

  const item: string[] = [];
  const listColor = cssValue(p.listColor);
  if (listColor) item.push(`color:${listColor}`);
  const lFs = scalarAt(p.lFs, "d");
  if (lFs) item.push(`font-size:${lFs}`);
  const lLh = cssValue(p.lLh);
  if (lLh) item.push(`line-height:${lLh}`);
  const lLs = scalarAt(p.lLs, "d");
  if (lLs) item.push(`letter-spacing:${lLs}`);
  const lFf = cssValue(p.lFf);
  if (lFf) item.push(`font-family:${lFf}`);
  const lFw = cssValue(p.lFw);
  if (lFw) item.push(`font-weight:${lFw}`);
  const lTt = cssValue(p.lTt);
  if (lTt) item.push(`text-transform:${lTt}`);
  if (item.length) rules.push(`${sel} .bmstoc-link{${item.join(";")}}`);

  const listStyle = TOC_LIST_STYLES.some((s) => s.id === p.listStyle) ? p.listStyle : "underline";
  const activeColor = cssValue(p.activeColor);
  if (activeColor) rules.push(`${sel} .bmstoc-link.is-active{color:${activeColor}}`);

  for (const [mq, dev] of [[MQ_TABLET, "t"], [MQ_MOBILE, "m"]] as [string, Device][]) {
    const decls: string[] = [];
    const fs2 = scalarAt(p.lFs, dev);
    if (fs2) decls.push(`font-size:${fs2}`);
    if (decls.length) rules.push(`${mq}{${sel} .bmstoc-link{${decls.join(";")}}}`);
  }

  const custom = authorCss(p.customCss, sel);
  if (custom) rules.push(custom);

  const iconDef = ACC_ICON_STYLES.find((s) => s.id === p.iconStyle) ?? ACC_ICON_STYLES[0];

  return {
    entries,
    title: typeof p.title === "string" ? p.title : "",
    showTitle: p.showTitle !== "0",
    wrapClass: [
      "bmstoc",
      scopeBase,
      `is-${listStyle}`,
      p.collapsible === "1" ? "is-collapsible" : "",
      p.showNumbers !== "false" ? "is-numbered" : "",
      safeClass(p.cssClass),
    ]
      .filter(Boolean)
      .join(" "),
    css: rules.join(""),
    anchor: cssValue(p.anchor) || undefined,
    collapsible: p.collapsible === "1",
    startCollapsed: p.startCollapsed === "1",
    titleToggle: p.titleToggle !== "0",
    showIcon: p.showIcon !== "0",
    icon: { closed: iconDef.closed, open: iconDef.open, spin: !!iconDef.spin },
    smoothScroll: p.smoothScroll !== "0",
    highlightActive: p.highlightActive === "1",
  };
}
