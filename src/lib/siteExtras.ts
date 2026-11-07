// Small site-wide reading helpers from the Customizer: scroll-to-top button,
// reading progress bar, reading time, and load-more / infinite archives.
//
// Pure (no Node imports): the CSS builders are shared by the server stylesheet
// and the customizer preview. The interactive halves are client components
// in components/frontend/SiteExtras.tsx.

import { archiveText } from "./archiveText";

type S = Record<string, string>;

function cssColor(v: string | undefined, fallback: string): string {
  const x = (v ?? "").trim();
  if (!x) return fallback;
  return /^#[0-9a-f]{3,8}$/i.test(x) || /^rgba?\([\d\s.,%]+\)$/i.test(x) || /^var\(--[\w-]+\)$/.test(x) ? x : fallback;
}

function px(v: string | undefined, fallback: number, min: number, max: number): number {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

// ── Reading time ─────────────────────────────────────────────────────────────

/** Minutes to read `text`, at least 1. */
export function readingMinutes(text: string | null | undefined, wpm: string | undefined): number {
  const rate = px(wpm, 220, 60, 1000);
  return Math.max(1, Math.round(countWords(text) / rate));
}

/**
 * A label the Customizer can set, falling back to this language's wording.
 *
 * "Set" has to mean *changed*: the Customizer publishes every setting it holds,
 * including the ones nobody touched, so "min read" and "Load more" are already
 * in the database of any site that has ever pressed Publish. Treating those two
 * as a deliberate choice would mean no site ever saw its own language. A value
 * that still reads as the English default therefore counts as unset.
 */
function chosenLabel(value: string | undefined, englishDefault: string, translated: string): string {
  const v = (value ?? "").trim();
  return v && v !== englishDefault ? v : translated;
}

/** The archive's "Load more" button, in the listing's language unless set. */
export function loadMoreLabel(s: S, language: string): string {
  return chosenLabel(s.archive_loadmore_label, "Load more", archiveText(language).loadMore);
}

/** "4 min read", or null when the setting is off for this place. */
export function readingTimeLabel(s: S, text: string | null | undefined, where: "post" | "card", language = "en"): string | null {
  return readingTimeFromWords(s, countWords(text), where, language);
}

/** Scripts written without spaces between words. */
const UNSPACED = /[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * The word count of a string — the reading time and the Article markup's
 * `wordCount` both use this.
 *
 * Splitting on spaces counted a Thai, Chinese or Japanese paragraph as one
 * or two "words". Text in those scripts goes through `Intl.Segmenter`, which
 * knows their word boundaries; everything else is split on spaces exactly as
 * before, so no other language's numbers move.
 */
export function countWords(text: string | null | undefined): number {
  const t = (text ?? "").trim();
  if (!t) return 0;
  if (UNSPACED.test(t) && typeof Intl !== "undefined" && typeof (Intl as { Segmenter?: unknown }).Segmenter === "function") {
    let n = 0;
    for (const seg of new Intl.Segmenter(undefined, { granularity: "word" }).segment(t)) if (seg.isWordLike) n++;
    return n;
  }
  return t.split(/\s+/).filter(Boolean).length;
}

/**
 * The same label, from a count the caller already has.
 *
 * The archive asks Postgres for each post's word count, so the body text never
 * leaves the database — and then had to hand `readingTimeLabel` something to
 * count, so it built a throwaway string of that many "x ": six kilobytes for a
 * 3,000-word post, a dozen per listing, all allocated to be split apart again.
 */
export function readingTimeFromWords(s: S, words: number, where: "post" | "card", language = "en"): string | null {
  if (where === "post" && s.reading_time_post === "false") return null;
  if (where === "card" && s.reading_time_cards !== "true") return null;
  const rate = px(s.reading_time_wpm, 220, 60, 1000);
  const n = Math.max(1, Math.round(Math.max(0, words) / rate));
  const label = chosenLabel(s.reading_time_label, "min read", archiveText(language).minRead);
  return `${n} ${label}`;
}

// ── Scroll to top ────────────────────────────────────────────────────────────

export function scrollTopEnabled(s: S): boolean {
  return s.scroll_top_enabled === "true";
}

export function scrollTopCss(s: S): string {
  if (!scrollTopEnabled(s)) return "";
  const size = px(s.scroll_top_size, 44, 28, 80);
  const side = s.scroll_top_position === "left" ? "left" : "right";
  const bottom = px(s.scroll_top_bottom, 24, 0, 200);
  const radius = s.scroll_top_shape === "square" ? "4px" : s.scroll_top_shape === "rounded" ? "12px" : "50%";
  const bg = cssColor(s.scroll_top_bg, "var(--color-primary,#0ea5e9)");
  const fg = cssColor(s.scroll_top_color, "#fff");
  return [
    `.bms-top{position:fixed;${side}:${bottom}px;bottom:${bottom}px;z-index:60;width:${size}px;height:${size}px;border-radius:${radius};background:${bg};color:${fg};border:0;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.18);cursor:pointer;opacity:0;visibility:hidden;transform:translateY(12px);transition:opacity .25s,transform .25s,visibility .25s}`,
    `.bms-top.is-shown{opacity:1;visibility:visible;transform:none}`,
    `.bms-top:hover{filter:brightness(1.08)}`,
    `.bms-top:focus-visible{outline:3px solid #60a5fa;outline-offset:2px}`,
    `.bms-top svg{width:45%;height:45%}`,
    s.scroll_top_mobile === "false" ? `@media(max-width:767px){.bms-top{display:none}}` : "",
  ].join("\n");
}

// ── Reading progress ─────────────────────────────────────────────────────────

/** Whether the bar shows on this kind of page. */
export function progressEnabled(s: S, pageType: string): boolean {
  if (s.reading_progress_enabled !== "true") return false;
  if (pageType === "post") return true;
  return s.reading_progress_pages === "true" && pageType === "page";
}

export function progressCss(s: S): string {
  if (s.reading_progress_enabled !== "true") return "";
  const h = px(s.reading_progress_height, 3, 1, 12);
  const color = cssColor(s.reading_progress_color, "var(--color-primary,#0ea5e9)");
  const pos = s.reading_progress_position === "bottom" ? "bottom:0" : "top:0";
  return `.bms-progress{position:fixed;left:0;${pos};height:${h}px;width:100%;z-index:70;pointer-events:none;background:transparent}.bms-progress>span{display:block;height:100%;width:100%;background:${color};transform-origin:0 50%;transform:scaleX(0);will-change:transform}[dir=rtl] .bms-progress>span{transform-origin:100% 50%}`;
}

// ── Space between blocks ─────────────────────────────────────────────────────

/**
 * A small default gap between consecutive blocks, so two blocks with no margin
 * of their own (a button under an image, two custom blocks) never touch.
 *
 * Zero specificity (`:where`) on purpose: any block that sets its own margin —
 * the prose paragraph spacing, a block's Spacing → Margin control, a utility
 * class — wins outright, and adjacent margins still collapse to the larger, so
 * this only ever fills a gap that would otherwise be nothing.
 */
export function blockGapCss(s: S): string {
  const raw = (s.content_block_gap ?? "").trim();
  const n = raw === "" ? 16 : Math.min(120, Math.max(0, parseInt(raw, 10) || 0));
  const m = (s.content_block_gap_mobile ?? "").trim();
  const nm = m === "" ? null : Math.min(120, Math.max(0, parseInt(m, 10) || 0));
  return [
    `:where(.prose-content,.bms-col)>:where(*+*){margin-top:${n}px}`,
    nm !== null ? `@media(max-width:767px){:where(.prose-content,.bms-col)>:where(*+*){margin-top:${nm}px}}` : "",
  ].join("");
}

// ── Archive pagination ───────────────────────────────────────────────────────

export type PaginationStyle = "numbers" | "loadmore" | "infinite";

export function paginationStyle(s: S): PaginationStyle {
  return s.archive_pagination === "loadmore" || s.archive_pagination === "infinite" ? s.archive_pagination : "numbers";
}

export const LOAD_MORE_CSS = `.bms-loadmore{display:flex;justify-content:center;margin-top:3rem}.bms-loadmore button{padding:.7rem 1.6rem;border-radius:.6rem;font-weight:600;font-size:.9rem;color:var(--color-primary-fg,#fff);background:var(--color-primary,#0ea5e9);border:0;cursor:pointer}.bms-loadmore button[disabled]{opacity:.6;cursor:progress}.bms-loadmore-sentinel{height:1px}`;

// ── Timeline block ───────────────────────────────────────────────────────────

export const TIMELINE_CSS = `.bms-timeline{list-style:none;padding:0;position:relative}
.bms-tl-item{position:relative;padding:0 0 1.75rem 3.25rem}
.bms-tl-item:last-child{padding-bottom:0}
.bms-timeline::before{content:"";position:absolute;top:.25rem;bottom:.25rem;left:1rem;width:2px;background:var(--tl-line);transform:translateX(-50%)}
.bms-tl-marker{position:absolute;left:1rem;top:0;transform:translateX(-50%);width:2rem;height:2rem;border-radius:50%;background:var(--tl-marker);color:#fff;font-size:.8rem;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 4px var(--color-bg,#fff)}
.bms-tl-marker:empty{width:.9rem;height:.9rem;top:.35rem}
.bms-tl-date{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.55;margin:0 0 .15rem}
.bms-tl-title{font-size:1.05rem;font-weight:700;margin:0 0 .25rem;line-height:1.35}
.bms-tl-text{margin:0;opacity:.8;line-height:1.6}
.bms-timeline-right::before,.bms-timeline-right .bms-tl-marker{left:auto;right:1rem;transform:translateX(50%)}
.bms-timeline-right .bms-tl-item{padding:0 3.25rem 1.75rem 0;text-align:end}
@media(min-width:768px){
.bms-timeline-alternate::before{left:50%}
.bms-timeline-alternate .bms-tl-item{width:50%;padding:0 2.75rem 2rem 0;text-align:end}
.bms-timeline-alternate .bms-tl-item .bms-tl-marker{left:auto;right:0;transform:translateX(50%)}
.bms-timeline-alternate .bms-tl-item:nth-child(even){margin-left:50%;padding:0 0 2rem 2.75rem;text-align:start}
.bms-timeline-alternate .bms-tl-item:nth-child(even) .bms-tl-marker{left:0;right:auto;transform:translateX(-50%)}
}
/* Right-to-left. Measured before this existed: on an Arabic page the spine and
   every marker stayed 16px from the *left* edge with the text padded away from
   it, because left, margin-left and translateX(-50%) do not flip. These
   mirror the three layouts; transform has no logical form, so the sign is
   flipped by hand. Verified in both directions — the LTR geometry is unchanged. */
[dir=rtl] .bms-tl-item{padding:0 3.25rem 1.75rem 0}
[dir=rtl] .bms-timeline::before,[dir=rtl] .bms-tl-marker{left:auto;right:1rem;transform:translateX(50%)}
[dir=rtl] .bms-timeline-right .bms-tl-item{padding:0 0 1.75rem 3.25rem}
[dir=rtl] .bms-timeline-right::before,[dir=rtl] .bms-timeline-right .bms-tl-marker{right:auto;left:1rem;transform:translateX(-50%)}
@media(min-width:768px){
[dir=rtl] .bms-timeline-alternate::before{left:auto;right:50%;transform:translateX(50%)}
[dir=rtl] .bms-timeline-alternate .bms-tl-item{padding:0 0 2rem 2.75rem}
[dir=rtl] .bms-timeline-alternate .bms-tl-item .bms-tl-marker{right:auto;left:0;transform:translateX(-50%)}
[dir=rtl] .bms-timeline-alternate .bms-tl-item:nth-child(even){margin-left:0;margin-right:50%;padding:0 2.75rem 2rem 0}
[dir=rtl] .bms-timeline-alternate .bms-tl-item:nth-child(even) .bms-tl-marker{left:auto;right:0;transform:translateX(50%)}
}`;
