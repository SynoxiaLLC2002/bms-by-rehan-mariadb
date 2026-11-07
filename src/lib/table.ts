// The Advanced Table model — one resolver read by the editor canvas and the
// published page, the same contract the other advanced blocks keep.
//
// A separate block from BlockNote's built-in `table` rather than an extension of
// it: a built-in has no slot in its schema for our props, which is why it is the
// one block in the panel with nothing but "edit it in the canvas". `textAdvanced`
// and `imageAdvanced` already set the precedent for an advanced twin.

import {
  authorCss,
  blockScope,
  cssValue,
  gradient,
  safeClass,
  scalarAt,
  sidesAt,
  type PropRec,
} from "./blockStyle";
import { MQ_MOBILE, MQ_TABLET, type Device } from "./responsive";

/** A table is a grid of plain strings — one row per array. */
export type TableRows = string[][];

/* ── Option tables, shared with the panel ─────────────────────────────────── */

export const TBL_STYLES: { id: string; title: string }[] = [
  { id: "default", title: "Default" },
  { id: "stripes", title: "Stripes" },
  { id: "bordered", title: "Bordered" },
  { id: "minimal", title: "Minimal" },
];

export const TBL_ALIGN: { id: string; title: string }[] = [
  { id: "left", title: "Left" },
  { id: "center", title: "Center" },
  { id: "right", title: "Right" },
];

/** Kadence's S/M/L/XL/XXL, as the px the preset writes. */
export const TBL_FONT_SIZES: [string, string][] = [
  ["12", "S"],
  ["14", "M"],
  ["16", "L"],
  ["20", "XL"],
  ["24", "XXL"],
];

/* ── Resolved shape ───────────────────────────────────────────────────────── */

export interface ResolvedTable {
  rows: TableRows;
  /** Row 0 is a header, rendered in `thead`. */
  hasHead: boolean;
  /** The last row is a footer, rendered in `tfoot`. */
  hasFoot: boolean;
  wrapClass: string;
  tableClass: string;
  css: string;
  anchor?: string;
  caption?: string;
}

export function parseRows(raw: unknown): TableRows {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    // Tolerates a ragged grid — a row short of cells is padded at render time
    // rather than rejected, so a hand-edited value can never blank the block.
    return v
      .filter(Array.isArray)
      .map((row: unknown[]) => row.map((c) => (typeof c === "string" ? c : String(c ?? ""))));
  } catch {
    return [];
  }
}

export function serializeRows(rows: TableRows): string {
  return JSON.stringify(rows);
}

/** The widest row decides the column count; short rows are padded. */
export function columnCount(rows: TableRows): number {
  return rows.reduce((n, r) => Math.max(n, r.length), 0);
}

/** A rectangular copy, so every render walks the same shape. */
export function normalizeRows(rows: TableRows): TableRows {
  const cols = columnCount(rows);
  return rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ""));
}

export const tableScope = (block: { id?: unknown; props?: unknown }) => blockScope("bmstbl", block);

/* ── Row and column edits, shared by the panel and the canvas ─────────────── */

export function addRow(rows: TableRows, at?: number): TableRows {
  const cols = Math.max(1, columnCount(rows));
  const blank = Array.from({ length: cols }, () => "");
  const next = normalizeRows(rows);
  next.splice(at ?? next.length, 0, blank);
  return next;
}

export function removeRow(rows: TableRows, at: number): TableRows {
  // Never leave an empty grid — there would be nothing to click back into.
  if (rows.length <= 1) return rows;
  return normalizeRows(rows).filter((_, i) => i !== at);
}

export function addColumn(rows: TableRows, at?: number): TableRows {
  const next = normalizeRows(rows);
  const index = at ?? columnCount(rows);
  return next.map((r) => {
    const copy = [...r];
    copy.splice(index, 0, "");
    return copy;
  });
}

export function removeColumn(rows: TableRows, at: number): TableRows {
  if (columnCount(rows) <= 1) return rows;
  return normalizeRows(rows).map((r) => r.filter((_, i) => i !== at));
}

export function setCell(rows: TableRows, r: number, c: number, value: string): TableRows {
  return normalizeRows(rows).map((row, ri) =>
    ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row
  );
}

/**
 * Reads a table block.
 *
 * `scopeBase` is owned by the caller — the editor names it after the preview
 * node and the page after the rendered one — so this file never has to know
 * which side it is running on.
 */
export function resolveTable(p: PropRec, scopeBase: string): ResolvedTable {
  const rules: string[] = [];
  const sel = `.${scopeBase}`;
  const rows = normalizeRows(parseRows(p.rows));

  /* ── The table box ─────────────────────────────────────────────────────── */

  const table: string[] = [];
  if (p.fixed !== "0") table.push("table-layout:fixed");
  const width = scalarAt(p.width, "d");
  if (width) table.push(`width:${width}`);

  const bg =
    p.bgType === "gradient"
      ? gradient(p.bgGradType, cssValue(p.bgGradFrom), cssValue(p.bgGradTo), p.bgGradAngle)
      : cssValue(p.bg);
  if (bg) table.push(`background:${bg}`);

  const color = cssValue(p.color);
  if (color) table.push(`color:${color}`);
  const fs = scalarAt(p.fs, "d");
  if (fs) table.push(`font-size:${fs}`);
  const ff = cssValue(p.ff);
  if (ff) table.push(`font-family:${ff}`);
  if (table.length) rules.push(`${sel} table{${table.join(";")}}`);

  for (const [mq, dev] of [[MQ_TABLET, "t"], [MQ_MOBILE, "m"]] as [string, Device][]) {
    const decls: string[] = [];
    const size = scalarAt(p.fs, dev);
    if (size) decls.push(`font-size:${size}`);
    const w = scalarAt(p.width, dev);
    if (w) decls.push(`width:${w}`);
    if (decls.length) rules.push(`${mq}{${sel} table{${decls.join(";")}}}`);
  }

  /* ── Cells ─────────────────────────────────────────────────────────────── */

  const cell: string[] = [];
  const pad = sidesAt(p.cellPad, "d");
  if (pad) cell.push(`padding:${pad}`);
  const bd = sidesAt(p.bd, "d");
  if (bd) {
    cell.push(`border-width:${bd}`, `border-style:${cssValue(p.bdStyle) || "solid"}`);
    cell.push(`border-color:${cssValue(p.bdColor) || "rgba(100,116,139,.28)"}`);
  }
  const align = cssValue(p.align);
  if (align && TBL_ALIGN.some((a) => a.id === align)) cell.push(`text-align:${align}`);
  if (cell.length) rules.push(`${sel} th,${sel} td{${cell.join(";")}}`);

  for (const [mq, dev] of [[MQ_TABLET, "t"], [MQ_MOBILE, "m"]] as [string, Device][]) {
    const decls: string[] = [];
    const cp = sidesAt(p.cellPad, dev);
    if (cp) decls.push(`padding:${cp}`);
    const cb = sidesAt(p.bd, dev);
    if (cb) decls.push(`border-width:${cb}`);
    if (decls.length) rules.push(`${mq}{${sel} th,${sel} td{${decls.join(";")}}}`);
  }

  /* ── Header, footer and stripes ────────────────────────────────────────── */

  const head: string[] = [];
  const headBg = cssValue(p.headBg);
  if (headBg) head.push(`background:${headBg}`);
  const headColor = cssValue(p.headColor);
  if (headColor) head.push(`color:${headColor}`);
  const headWeight = cssValue(p.headWeight);
  if (headWeight) head.push(`font-weight:${headWeight}`);
  // Through `.bmstbl-table`, to outrank the theme's own `.bmstbl .bmstbl-table th`
  // (blockCss.ts). Without it that rule's faint grey always won, so the Header
  // background option did nothing — while Header text colour, which the theme
  // does not set, still applied: white text on a header that stayed pale.
  if (head.length) rules.push(`${sel} .bmstbl-table thead th{${head.join(";")}}`);

  const footBg = cssValue(p.footBg);
  if (footBg) rules.push(`${sel} tfoot td{background:${footBg}}`);

  // The stripe colour is a rule rather than a class, so an author can change it
  // without leaving the panel.
  const stripe = cssValue(p.stripeColor);
  if (stripe) rules.push(`${sel}.is-stripes tbody tr:nth-child(even) td{background:${stripe}}`);

  const hoverBg = cssValue(p.rowHoverBg);
  if (hoverBg) rules.push(`${sel} tbody tr:hover td{background:${hoverBg}}`);

  const custom = authorCss(p.customCss, sel);
  if (custom) rules.push(custom);

  const style = TBL_STYLES.some((s) => s.id === p.style) ? p.style : "default";

  return {
    rows,
    hasHead: p.head === "1",
    hasFoot: p.foot === "1",
    wrapClass: ["bmstbl", scopeBase, `is-${style}`, safeClass(p.cssClass)].filter(Boolean).join(" "),
    tableClass: "bmstbl-table",
    css: rules.join(""),
    anchor: cssValue(p.anchor) || undefined,
    caption: typeof p.caption === "string" && p.caption.trim() ? p.caption : undefined,
  };
}
