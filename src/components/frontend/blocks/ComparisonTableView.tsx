// Comparison Table — options side by side: the first column names what is
// being compared, the others are the options. A cell typed as "yes" or "no"
// is drawn as a tick or a cross (and read out as "Yes" / "No"); anything else
// is shown as written. One column can be marked as the recommended one.
//
// A real <table> with a caption and scoped headers, so search engines and
// screen readers read it as data. On a narrow screen it scrolls sideways
// inside its own box rather than widening the page.
// Hookless and script-free; on the canvas every cell is typed in place.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import { Txt, clampInt, cssColor, editableCss, srOnlyCss, px, type ViewProps } from "./blockKit";

export const MAX_COMPARE_COLS = 6;
export const MAX_COMPARE_ROWS = 40;

export const COMPARISON_TABLE_DEFAULTS = {
  caption: "",
  cols: JSON.stringify(["Feature", "Option A", "Option B"]),
  rows: JSON.stringify([
    ["Free to use", "yes", "no"],
    ["Works offline", "yes", "yes"],
    ["Price", "Free", "$5 a month"],
  ]),
  highlight: "0",
  stripes: "true",
  headBg: "#0b2545",
  headColor: "#ffffff",
  highlightBg: "#fff7e6",
  borderColor: "#e2e8f0",
  copyColor: "#1f2937",
  yesColor: "#15803d",
  noColor: "#b91c1c",
  yesLabel: "Yes",
  noLabel: "No",
  radius: "12",
  textSize: "",
} as const;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : x == null ? "" : String(x))) : []);

/** The table as headers and rows, every row as wide as the header. */
export function parseComparison(colsRaw: unknown, rowsRaw: unknown): { cols: string[]; rows: string[][] } {
  let c: unknown = [];
  let r: unknown = [];
  try { c = typeof colsRaw === "string" ? JSON.parse(colsRaw || "[]") : colsRaw; } catch { c = []; }
  try { r = typeof rowsRaw === "string" ? JSON.parse(rowsRaw || "[]") : rowsRaw; } catch { r = []; }
  const cols = strings(c).slice(0, MAX_COMPARE_COLS);
  while (cols.length < 2) cols.push("");
  const rows = (Array.isArray(r) ? r : []).slice(0, MAX_COMPARE_ROWS).map((row) => {
    const cells = strings(row).slice(0, cols.length);
    while (cells.length < cols.length) cells.push("");
    return cells;
  });
  return { cols, rows };
}

const YES = /^(yes|y|true|✓|✔)$/i;
const NO = /^(no|n|false|✗|✕|x)$/i;

const CSS = [
  `.bmscmp{margin:2rem 0}`,
  `.bmscmp-scroll{position:relative;overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--cm-bc);border-radius:var(--cm-r)}`,
  `.bmscmp .bmscmp-scroll .bmscmp-table{width:100%;min-width:480px;margin:0;border-collapse:collapse;border:0;font-size:var(--cm-xs,.975rem);line-height:1.45;color:var(--cm-tc)}`,
  `.bmscmp .bmscmp-table caption{padding:12px 16px;font-size:.95rem;font-weight:600;text-align:start;color:var(--cm-tc);caption-side:top}`,
  `.bmscmp .bmscmp-scroll .bmscmp-table th,.bmscmp .bmscmp-scroll .bmscmp-table td{padding:12px 16px;border:0;border-bottom:1px solid var(--cm-bc);text-align:center;vertical-align:middle;background:transparent;color:inherit}`,
  `.bmscmp .bmscmp-scroll .bmscmp-table tbody tr:last-child>*{border-bottom:0}`,
  `.bmscmp .bmscmp-scroll .bmscmp-table thead th{background:var(--cm-hb);color:var(--cm-hc);font-weight:700}`,
  `.bmscmp .bmscmp-scroll .bmscmp-table tr>:first-child{text-align:start;font-weight:600}`,
  `.bmscmp.has-stripes .bmscmp-scroll .bmscmp-table tbody tr:nth-child(even)>*{background:color-mix(in srgb,var(--cm-bc) 35%,transparent)}`,
  `.bmscmp .bmscmp-scroll .bmscmp-table tbody .is-hl{background:var(--cm-hl)}`,
  `.bmscmp.has-stripes .bmscmp-scroll .bmscmp-table tbody tr:nth-child(even)>.is-hl{background:var(--cm-hl)}`,
  `.bmscmp .bmscmp-mark{font-size:1.15rem;font-weight:800;line-height:1}`,
  `.bmscmp .bmscmp-mark.is-yes{color:var(--cm-yc)}`,
  `.bmscmp .bmscmp-mark.is-no{color:var(--cm-nc)}`,
  srOnlyCss(".bmscmp-sr"),
  editableCss(".bmscmp"),
].join("");

export default function ComparisonTableView({ props, canvas = false, onEdit }: ViewProps) {
  const D = COMPARISON_TABLE_DEFAULTS;
  const edit = !!onEdit;
  const { cols, rows: all } = parseComparison(props.cols ?? D.cols, props.rows ?? D.rows);
  const rows = edit ? all : all.filter((r) => r.some((c) => c.trim()));
  if (!edit && rows.length === 0) return null;

  const caption = String(props.caption ?? "").trim();
  const hl = clampInt(props.highlight, 0, 0, cols.length - 1);
  const yes = String(props.yesLabel || D.yesLabel);
  const no = String(props.noLabel || D.noLabel);
  const vars = {
    "--cm-hb": cssColor(props.headBg, D.headBg),
    "--cm-hc": cssColor(props.headColor, D.headColor),
    "--cm-hl": cssColor(props.highlightBg, D.highlightBg),
    "--cm-bc": cssColor(props.borderColor, D.borderColor),
    "--cm-tc": cssColor(props.copyColor, D.copyColor),
    "--cm-yc": cssColor(props.yesColor, D.yesColor),
    "--cm-nc": cssColor(props.noColor, D.noColor),
    "--cm-r": `${clampInt(props.radius, 12, 0, 40)}px`,
    ...px("--cm-xs", props.textSize, 10, 32),
  } as React.CSSProperties;

  const setCol = (i: number) => (v: string) => onEdit?.("cols", JSON.stringify(cols.map((c, ci) => (ci === i ? v : c))));
  const setCell = (ri: number, ci: number) => (v: string) =>
    onEdit?.("rows", JSON.stringify(all.map((row, r) => (r === ri ? row.map((c, k) => (k === ci ? v : c)) : row))));

  const cell = (value: string) => {
    const v = value.trim();
    if (YES.test(v)) return <><span className="bmscmp-mark is-yes" aria-hidden="true">✓</span><span className="bmscmp-sr">{yes}</span></>;
    if (NO.test(v)) return <><span className="bmscmp-mark is-no" aria-hidden="true">✕</span><span className="bmscmp-sr">{no}</span></>;
    return v;
  };

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <div className={`bmscmp${props.stripes !== "false" ? " has-stripes" : ""}`} style={vars}>
        {/* Focusable, so a keyboard user can scroll a table wider than the screen. */}
        <div className="bmscmp-scroll" {...(canvas ? {} : { tabIndex: 0, role: "region", "aria-label": caption || cols[0] || "Comparison" })}>
          <table className="bmscmp-table">
            {caption && <caption>{caption}</caption>}
            <thead>
              <tr>
                {cols.map((c, i) => (
                  <th key={i} scope="col">
                    {edit ? <Txt edit tag="span" className="bmscmp-cell" value={c} placeholder={i === 0 ? "What is compared" : `Option ${i}`} onCommit={setCol(i)} /> : c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((c, ci) => {
                    const cls = hl > 0 && ci === hl ? "is-hl" : undefined;
                    const inner = edit ? <Txt edit tag="span" className="bmscmp-cell" value={c} placeholder={ci === 0 ? "Feature" : "yes / no / text"} onCommit={setCell(ri, ci)} /> : cell(c);
                    return ci === 0 ? <th key={ci} scope="row" className={cls}>{inner}</th> : <td key={ci} className={cls}>{inner}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
