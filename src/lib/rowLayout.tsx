// The Row Layout model, shared by the editor block, the settings panel and the
// published page.
//
// A row owns N columns; each column owns a nested list of BlockNote blocks plus
// its own background and padding. Columns live in one JSON prop (`cols`) rather
// than schema props, for the same reason `bx` does: the shape grows as blocks
// are added, and JSON survives that without a schema migration.

import React from "react";
import { withoutStyleClose } from "./blockStyle";

export type AnyBlock = Record<string, any>;

export interface RowColumnData {
  /** Nested block list — the column's own content. */
  blocks: AnyBlock[];
  bg?: string;
  /** Inner padding in px, all sides. */
  pad?: string;
  valign?: "top" | "middle" | "bottom";
  radius?: string;
  borderColor?: string;
  borderWidth?: string;
  /**
   * Section settings — background, flex, borders, conditions and the rest.
   *
   * Left open rather than enumerated here because `section.ts` owns that
   * vocabulary and grows it; the named fields above stay for the ones this
   * module reads directly.
   */
  [key: string]: unknown;
}

export interface RowLayoutPreset {
  id: string;
  label: string;
  /** Column widths as fr units — also drives the picker icon. */
  fr: number[];
}

/**
 * Width presets per column count.
 *
 * `equal` is always first so presetsFor(n)[0] is a safe fallback when a saved
 * preset id no longer exists — e.g. the author dropped from 3 columns to 2.
 */
export const ROW_PRESETS: Record<number, RowLayoutPreset[]> = {
  1: [{ id: "equal", label: "Full", fr: [1] }],
  2: [
    { id: "equal",        label: "50 / 50", fr: [1, 1] },
    { id: "left-golden",  label: "67 / 33", fr: [2, 1] },
    { id: "right-golden", label: "33 / 67", fr: [1, 2] },
    { id: "left-major",   label: "75 / 25", fr: [3, 1] },
    { id: "right-major",  label: "25 / 75", fr: [1, 3] },
    { id: "left-forty",   label: "40 / 60", fr: [2, 3] },
    { id: "right-forty",  label: "60 / 40", fr: [3, 2] },
  ],
  3: [
    { id: "equal",         label: "33 / 33 / 33", fr: [1, 1, 1] },
    { id: "center-wide",   label: "25 / 50 / 25", fr: [1, 2, 1] },
    { id: "center-exwide", label: "20 / 60 / 20", fr: [1, 3, 1] },
    { id: "left-half",     label: "50 / 25 / 25", fr: [2, 1, 1] },
    { id: "right-half",    label: "25 / 25 / 50", fr: [1, 1, 2] },
  ],
  4: [
    { id: "equal",      label: "25 x 4",      fr: [1, 1, 1, 1] },
    { id: "left-half",  label: "40 / 20 x 3", fr: [2, 1, 1, 1] },
    { id: "right-half", label: "20 x 3 / 40", fr: [1, 1, 1, 2] },
  ],
  5: [{ id: "equal", label: "20 x 5", fr: [1, 1, 1, 1, 1] }],
  6: [{ id: "equal", label: "16 x 6", fr: [1, 1, 1, 1, 1, 1] }],
};

export const MAX_ROW_COLUMNS = 6;

export function clampColumns(count: number): number {
  if (!Number.isFinite(count)) return 2;
  return Math.min(MAX_ROW_COLUMNS, Math.max(1, Math.round(count)));
}

export function presetsFor(count: number): RowLayoutPreset[] {
  return ROW_PRESETS[clampColumns(count)] ?? ROW_PRESETS[1];
}

export function findPreset(count: number, id: string | undefined): RowLayoutPreset {
  const list = presetsFor(count);
  return list.find((p) => p.id === id) ?? list[0];
}

/**
 * grid-template-columns for a row at desktop width.
 *
 * `minmax(0, …)` rather than a bare `fr`: a plain `fr` track refuses to shrink
 * below its content's intrinsic width, so one wide block — an image placeholder,
 * a long URL — pushed the whole row past the canvas and put a horizontal
 * scrollbar under the editor.
 */
export function rowTemplate(count: number, presetId?: string): string {
  return findPreset(count, presetId).fr.map((f) => `minmax(0, ${f}fr)`).join(" ");
}

// ── Gutters ────────────────────────────────────────────────────────────────
export const GUTTERS: { id: string; label: string; px: number }[] = [
  { id: "none", label: "None", px: 0 },
  { id: "sm",   label: "SM",   px: 8 },
  { id: "md",   label: "MD",   px: 24 },
  { id: "lg",   label: "LG",   px: 40 },
];

export function gutterPx(id: string | undefined, custom?: string): number {
  if (id === "custom") return Math.max(0, parseInt(custom || "0") || 0);
  return GUTTERS.find((g) => g.id === id)?.px ?? 24;
}

// ── Dividers ───────────────────────────────────────────────────────────────
// Every path is drawn in a 1000x100 box and stretched with
// preserveAspectRatio="none", so one path serves any divider height.

export const DIVIDER_STYLES: { id: string; label: string }[] = [
  { id: "none",      label: "None" },
  { id: "straight",  label: "Straight" },
  { id: "slant",     label: "Slant" },
  { id: "triangle",  label: "Triangle" },
  { id: "curve",     label: "Curve" },
  { id: "wave",      label: "Wave" },
  { id: "waves",     label: "Waves" },
  { id: "mountains", label: "Mountains" },
];

const DIVIDER_PATHS: Record<string, string> = {
  straight:  "M0,100 L1000,100 L1000,0 L0,0 Z",
  slant:     "M0,100 L1000,0 L1000,100 Z",
  triangle:  "M0,100 L500,0 L1000,100 Z",
  curve:     "M0,100 C250,0 750,0 1000,100 Z",
  wave:      "M0,60 C150,110 350,10 500,60 C650,110 850,10 1000,60 L1000,100 L0,100 Z",
  waves:     "M0,50 C120,95 200,5 320,50 C440,95 520,5 640,50 C760,95 840,5 1000,50 L1000,100 L0,100 Z",
  mountains: "M0,100 L260,35 L420,72 L640,18 L820,60 L1000,25 L1000,100 Z",
};

export interface RowDividerProps {
  /** Which edge of the row this divider sits on. */
  position: "top" | "bottom";
  style?: string;
  color?: string;
  height?: string;
  /** Percentage of the row's width the shape spans. */
  width?: string;
  /** Mirrors the shape horizontally. */
  flip?: boolean;
}

/**
 * One edge decoration.
 *
 * Pure and hook-free, so the published page renders it on the server and the
 * editor renders identical markup on the client.
 */
export function RowDivider({ position, style, color, height, width, flip }: RowDividerProps) {
  const path = style && style !== "none" ? DIVIDER_PATHS[style] : undefined;
  if (!path) return null;
  const h = Math.max(4, parseInt(height || "60") || 60);
  // A narrower divider stays centred, so the inset is half the leftover width
  // on each side rather than a translate that would fight the flip transform.
  const w = Math.min(100, Math.max(1, parseInt(width || "100") || 100));
  const inset = `${(100 - w) / 2}%`;

  // The paths rest on the bottom edge; a top divider is the same shape turned
  // over, which is why only scaleY differs between the two.
  const transform = [position === "top" ? "scaleY(-1)" : "", flip ? "scaleX(-1)" : ""]
    .filter(Boolean)
    .join(" ");

  const edge: React.CSSProperties = position === "top" ? { top: 0 } : { bottom: 0 };

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: inset,
        right: inset,
        ...edge,
        height: `${h}px`,
        lineHeight: 0,
        pointerEvents: "none",
        overflow: "hidden",
        transform: transform || undefined,
      }}
    >
      <svg
        viewBox="0 0 1000 100"
        preserveAspectRatio="none"
        style={{ display: "block", width: "100%", height: "100%" }}
      >
        <path d={path} fill={color || "#ffffff"} />
      </svg>
    </div>
  );
}

// ── Column parsing and migration ───────────────────────────────────────────

/** A fresh, empty column. */
export function emptyColumn(defaults?: Record<string, string> | null): RowColumnData {
  return { blocks: [], ...(defaults ?? {}) };
}

/**
 * Reads the `cols` prop into exactly `count` columns.
 *
 * Also upgrades the pre-nesting format, where a column was a single
 * `{type,text}` record instead of a block list — those rows keep rendering, and
 * become fully editable the moment they are opened.
 */
export function parseColumns(raw: unknown, count: number): RowColumnData[] {
  const n = clampColumns(count);
  const all = parseAllColumns(raw);
  const out: RowColumnData[] = [];
  for (let i = 0; i < n; i++) out.push(all[i] ?? emptyColumn());
  return out;
}

/**
 * Every stored column, however many there are.
 *
 * Dropping from three columns to two must not throw the third one's content
 * away — it stays in the JSON, hidden, and comes back if the count goes up
 * again. Only `parseColumns` clamps, because only rendering needs a fixed count.
 */
export function parseAllColumns(raw: unknown): RowColumnData[] {
  let parsed: unknown = [];
  if (typeof raw === "string" && raw.trim()) {
    try { parsed = JSON.parse(raw); } catch { parsed = []; }
  } else if (Array.isArray(raw)) {
    parsed = raw;
  }
  const arr = Array.isArray(parsed) ? parsed : [];

  return arr.map((c) => {
    if (c && typeof c === "object" && Array.isArray((c as RowColumnData).blocks)) return c as RowColumnData;
    if (c && typeof c === "object") return legacyColumn(c as AnyBlock);
    return emptyColumn();
  });
}

/** Turns one legacy {type,text,…} column into a nested block list. */
function legacyColumn(c: AnyBlock): RowColumnData {
  const align = c.align && c.align !== "left" ? { textAlignment: c.align } : {};
  const text = typeof c.text === "string" ? c.text : "";
  const inline = text ? [{ type: "text", text, styles: {} }] : [];

  if (c.type === "image" && c.src) {
    return { blocks: [{ type: "image", props: { url: c.src, caption: c.alt || "" } }] };
  }
  if (c.type === "button") {
    return {
      blocks: [{
        type: "button",
        props: { text: c.label || "Button", url: c.url || "", style: c.style || "primary", align: c.align || "left" },
      }],
    };
  }
  if (c.type === "heading") {
    const level = Math.min(3, Math.max(1, parseInt(c.level || "2") || 2));
    return { blocks: [{ type: "heading", props: { level, ...align }, content: inline }] };
  }
  return { blocks: [{ type: "paragraph", props: align, content: inline }] };
}

export function serializeColumns(cols: RowColumnData[]): string {
  return JSON.stringify(cols);
}

/**
 * The same columns with every nested block id dropped.
 *
 * A duplicated row must not carry copies of its original's block ids: List View
 * looks blocks up by id, and two blocks answering to one id would send every
 * click to whichever row was found first.
 */
export function columnsWithoutIds(cols: RowColumnData[]): RowColumnData[] {
  const strip = (blocks: AnyBlock[]): AnyBlock[] =>
    blocks.map(({ id: _id, ...rest }) => ({
      ...rest,
      ...(Array.isArray(rest.children) ? { children: strip(rest.children) } : {}),
    }));
  return cols.map((c) => ({ ...c, blocks: strip(c.blocks ?? []) }));
}

/** Every nested block in a row, in visual order — used by List View and search. */
export function rowChildBlocks(props: AnyBlock | undefined): AnyBlock[] {
  if (!props) return [];
  const cols = parseColumns(props.cols, parseInt(props.columns) || 2);
  return cols.flatMap((c) => c.blocks ?? []);
}

// ── Shared style helpers ───────────────────────────────────────────────────

export function rowAlignItems(valign: string | undefined): "start" | "center" | "end" {
  return valign === "middle" || valign === "center" ? "center" : valign === "bottom" ? "end" : "start";
}

/** Padding shorthand from the four per-side props. */
export function rowPadding(p: AnyBlock): string | undefined {
  const v = (k: string, d: string) => {
    const raw = p[k];
    return raw === undefined || raw === "" ? d : `${parseInt(raw) || 0}px`;
  };
  const top = v("padT", "0px");
  const right = v("padR", "0px");
  const bottom = v("padB", "0px");
  const left = v("padL", "0px");
  if (top === "0px" && right === "0px" && bottom === "0px" && left === "0px") return undefined;
  return `${top} ${right} ${bottom} ${left}`;
}

/** The size tag shown above a selected row, mirroring the max-width setting. */
export function maxWidthLabel(p: AnyBlock): string {
  if (p.inheritMax !== "false") return "Inherit";
  const w = parseInt(p.maxWidth || "0") || 0;
  if (!w) return "Full";
  const unit = p.maxWidthUnit || "px";
  if (unit === "%") return `${w}%`;
  if (w <= 600) return "Small";
  if (w <= 900) return "Medium";
  if (w <= 1200) return "Large";
  return "X-Large";
}

export function rowMaxWidth(p: AnyBlock): string | undefined {
  if (p.inheritMax !== "false") return undefined;
  const w = parseInt(p.maxWidth || "0") || 0;
  if (!w) return undefined;
  return `${w}${p.maxWidthUnit || "px"}`;
}

// ── Backgrounds, overlays, borders ─────────────────────────────────────────

/**
 * Strips the characters that would let a value escape the declaration it is
 * written into. Colours and lengths reach us from admin-facing inputs, and
 * several of them end up inside a generated stylesheet rather than a style
 * attribute, where a stray `;` or `}` would leak into the next rule.
 */
export function cssSafe(value: string | undefined): string {
  return typeof value === "string" ? value.replace(/[;{}<>]/g, "").trim() : "";
}

function gradientCss(type: string | undefined, angle: string | undefined, from: string | undefined, to: string | undefined): string {
  const a = Number.isFinite(parseInt(angle ?? "")) ? parseInt(angle as string) : 160;
  const f = cssSafe(from) || "#38bdf8";
  const t = cssSafe(to) || "#6366f1";
  return type === "radial"
    ? `radial-gradient(circle at 50% 50%, ${f}, ${t})`
    : `linear-gradient(${a}deg, ${f}, ${t})`;
}

/** The `background` shorthand for a row — colour, gradient or image. */
export function rowBackground(p: AnyBlock): string | undefined {
  const type = p.bgType || "color";
  if (type === "gradient") return gradientCss(p.gradType, p.gradAngle, p.gradFrom, p.gradTo);
  if (type === "image") {
    const url = cssSafe(p.bgImage);
    if (!url) return cssSafe(p.bgColor) || undefined;
    const pos = cssSafe(p.bgPos) || "center center";
    const size = cssSafe(p.bgSize) || "cover";
    const repeat = cssSafe(p.bgRepeat) || "no-repeat";
    const attach = cssSafe(p.bgAttach) || "scroll";
    // The colour stays as the bottom layer so a transparent or slow image still
    // has something behind it.
    const image = `url("${url.replace(/"/g, "")}") ${pos}/${size} ${repeat} ${attach}`;
    const base = cssSafe(p.bgColor);
    return base ? `${image}, ${base}` : image;
  }
  return cssSafe(p.bgColor) || undefined;
}

export interface RowOverlayProps {
  background: string;
  opacity: number;
  blend?: string;
}

/** The tint drawn over the background, under the row's content. */
export function rowOverlay(p: AnyBlock): RowOverlayProps | null {
  const type = p.ovType || "";
  if (!type || type === "none") return null;
  const background =
    type === "gradient"
      ? gradientCss(p.ovGradType, p.ovGradAngle, p.ovGradFrom, p.ovGradTo)
      : cssSafe(p.ovColor) || "#000000";
  const raw = parseInt(p.ovOpacity ?? "");
  const opacity = Math.min(100, Math.max(0, Number.isFinite(raw) ? raw : 30)) / 100;
  const blend = p.ovBlend && p.ovBlend !== "normal" ? cssSafe(p.ovBlend) : undefined;
  return { background, opacity, blend };
}

/**
 * One overlay layer.
 *
 * Pure and hook-free for the same reason `RowDivider` is: the published page
 * renders it on the server and the editor renders identical markup.
 */
export function RowOverlay({ background, opacity, blend }: RowOverlayProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        background,
        opacity,
        mixBlendMode: blend as React.CSSProperties["mixBlendMode"],
        pointerEvents: "none",
      }}
    />
  );
}

export function rowBorder(p: AnyBlock): string | undefined {
  const width = parseInt(p.bdWidth ?? "") || 0;
  const style = p.bdStyle || "solid";
  if (!width || style === "none") return undefined;
  return `${width}px ${cssSafe(style)} ${cssSafe(p.bdColor) || "#e2e8f0"}`;
}

/**
 * Corner radius as a four-value shorthand.
 *
 * Per-corner props win when any of them is set; otherwise the pre-corner
 * `radius` prop still applies, and a row with padding or a background falls
 * back to a soft 12px so it does not read as a bare rectangle.
 */
export function rowRadius(p: AnyBlock): string | undefined {
  const corners = ["radTL", "radTR", "radBR", "radBL"].map((k) => p[k]);
  if (corners.some((v) => v !== undefined && v !== "")) {
    return corners.map((v) => `${parseInt(v ?? "") || 0}px`).join(" ");
  }
  const legacy = parseInt(p.radius ?? "") || 0;
  if (legacy) return `${legacy}px`;
  // Deliberately square unless asked otherwise. This used to return 12px on its
  // own whenever a row had a background or padding, which meant a full-width
  // coloured band arrived with rounded corners and the only way out was typing
  // 0 into all four corner fields — a default fighting the author.
  return undefined;
}

export function rowShadow(p: AnyBlock): string | undefined {
  if (p.shadow !== "true") return undefined;
  const n = (v: string | undefined, d: number) => (v === undefined || v === "" ? d : parseInt(v) || 0);
  const color = cssSafe(p.shColor) || "rgba(15, 23, 42, 0.15)";
  return `${n(p.shX, 0)}px ${n(p.shY, 8)}px ${n(p.shBlur, 24)}px ${n(p.shSpread, 0)}px ${color}`;
}

/** Tags a row may render as. Anything else falls back to a plain div. */
export const ROW_TAGS = ["div", "section", "article", "aside", "header", "footer", "main"] as const;

export function rowTag(p: AnyBlock): string {
  return ROW_TAGS.includes(p.htmlTag) ? p.htmlTag : "div";
}

/**
 * Author-written CSS, scoped to this row.
 *
 * `selector` stands for the row's own element, the way Kadence's Custom CSS box
 * works. The closing-tag strip matters: this lands inside a `<style>`, and
 * without it a `</style>` in the box would end the element early and put the
 * rest of the CSS on the page as text.
 */
export function rowCustomCss(p: AnyBlock, scope: string): string {
  const raw = typeof p.customCss === "string" ? p.customCss.trim() : "";
  if (!raw) return "";
  return withoutStyleClose(raw).replace(/selector/g, `.${scope}`);
}

/** Link colouring, which has to be a rule because it targets descendants. */
export function rowLinkCss(p: AnyBlock, scope: string): string {
  const out: string[] = [];
  const link = cssSafe(p.linkColor);
  const hover = cssSafe(p.linkHoverColor);
  if (link) out.push(`.${scope} a{color:${link}}`);
  if (hover) out.push(`.${scope} a:hover{color:${hover}}`);
  return out.join("");
}

/** Whether a row opts out of being shown to this visitor. */
export function rowHiddenForViewer(p: AnyBlock, loggedIn: boolean): boolean {
  return loggedIn ? p.hideLoggedIn === "true" : p.hideLoggedOut === "true";
}

/** True when any block in the tree uses the logged-in / logged-out switches. */
export function usesViewerVisibility(blocks: AnyBlock[]): boolean {
  for (const b of blocks) {
    const p = b?.props ?? {};
    if (p.hideLoggedIn === "true" || p.hideLoggedOut === "true") return true;
    if (b?.type === "rowLayout" && usesViewerVisibility(rowChildBlocks(p))) return true;
    if (Array.isArray(b?.children) && usesViewerVisibility(b.children)) return true;
  }
  return false;
}

// ── Resolved row ───────────────────────────────────────────────────────────

/** Width-preset ids used before the presets were named per column count. */
const LEGACY_RATIOS: Record<string, string> = {
  equal: "equal",
  left: "left-golden",
  right: "right-golden",
  "wide-left": "left-major",
  "wide-right": "right-major",
  center: "center-wide",
};

export interface ResolvedRow {
  count: number;
  columns: RowColumnData[];
  /** grid-template-columns at desktop, tablet and mobile. */
  template: string;
  tabletTemplate: string;
  mobileTemplate: string;
  gap: number;
  rowGap: number;
  alignItems: "start" | "center" | "end";
  padding?: string;
  /** Full `background` shorthand — colour, gradient or image. */
  background?: string;
  overlay: RowOverlayProps | null;
  border?: string;
  borderRadius?: string;
  boxShadow?: string;
  color?: string;
  maxWidth?: string;
  minHeight?: string;
  maxHeight?: string;
  zIndex?: number;
  reverseOnMobile: boolean;
  top: RowDividerProps;
  bottom: RowDividerProps;
  hasDivider: boolean;
  /** Anything that needs the row to be a positioning / clipping context. */
  isLayered: boolean;
  tag: string;
  anchor?: string;
  extraClass?: string;
}

/**
 * One reading of a row's props, used by the editor and the published page so
 * the two cannot drift — and the only place that understands the pre-nesting
 * `ratio` / `gap` / `padding` props.
 */
export function resolveRow(p: AnyBlock): ResolvedRow {
  const count = clampColumns(parseInt(p.columns) || 2);
  const presetId = p.layout || LEGACY_RATIOS[p.ratio] || p.ratio || "equal";

  const gap = p.gutter
    ? gutterPx(p.gutter, p.gutterCustom)
    : p.gap !== undefined && p.gap !== ""
      ? Math.max(0, parseInt(p.gap) || 0)
      : 24;
  const rowGap = p.vGutter ? gutterPx(p.vGutter, p.vGutterCustom) : gap;

  // Legacy rows stored one padding value for all four sides.
  const legacyPad = p.padding && p.padding !== "0" ? `${parseInt(p.padding) || 0}px` : undefined;
  const padding = rowPadding(p) ?? legacyPad;

  const top: RowDividerProps = {
    position: "top",
    style: p.divTopStyle,
    color: p.divTopColor || "#ffffff",
    height: p.divTopHeight,
    width: p.divTopWidth,
    flip: p.divTopFlip === "true",
  };
  const bottom: RowDividerProps = {
    position: "bottom",
    style: p.divBotStyle,
    color: p.divBotColor || "#ffffff",
    height: p.divBotHeight,
    width: p.divBotWidth,
    flip: p.divBotFlip === "true",
  };

  const background = rowBackground(p);
  const overlay = rowOverlay(p);
  const hasDivider = (!!top.style && top.style !== "none") || (!!bottom.style && bottom.style !== "none");
  const maxHeight = parseInt(p.maxHeight ?? "") || 0;
  const zIndex = parseInt(p.zIndex ?? "");

  return {
    count,
    columns: parseColumns(p.cols, count),
    template: rowTemplate(count, presetId),
    tabletTemplate: count > 2 ? "repeat(2, minmax(0, 1fr))" : rowTemplate(count, presetId),
    mobileTemplate: p.mobileStack === "keep" ? rowTemplate(count, presetId) : "minmax(0, 1fr)",
    gap,
    rowGap,
    alignItems: rowAlignItems(p.valign),
    padding,
    background,
    overlay,
    border: rowBorder(p),
    borderRadius: rowRadius(p),
    boxShadow: rowShadow(p),
    // The colour picker's "Default" option is stored as the word itself, which
    // is not a colour: it reached the page as `color:default` on every row,
    // ten bytes the browser parsed and then threw away.
    color: p.textColor && p.textColor !== "default" ? cssSafe(p.textColor) || undefined : undefined,
    maxWidth: rowMaxWidth(p),
    minHeight: p.fullHeight === "true"
      ? "100vh"
      : p.minHeight && parseInt(p.minHeight)
        ? `${parseInt(p.minHeight)}px`
        : undefined,
    maxHeight: maxHeight ? `${maxHeight}px` : undefined,
    zIndex: Number.isFinite(zIndex) && p.zIndex !== "" ? zIndex : undefined,
    reverseOnMobile: p.mobileOrder === "reverse",
    top,
    bottom,
    hasDivider,
    isLayered: hasDivider || !!overlay || !!maxHeight,
    tag: rowTag(p),
    anchor: cssSafe(p.anchor) || undefined,
    extraClass: typeof p.cssClass === "string" ? p.cssClass.replace(/[^\w\s-]/g, "").trim() || undefined : undefined,
  };
}
