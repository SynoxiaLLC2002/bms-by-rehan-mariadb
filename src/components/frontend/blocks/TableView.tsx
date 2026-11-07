// The rendered form of an advanced table block.
//
// Hookless on purpose, so the same component serves the published page (a
// Server Component) and the editor canvas (a client one) — the arrangement
// `ButtonGroup` and `IconListView` use, for the same reason: shared markup
// cannot drift from shared CSS.
//
// The canvas passes `onEditCell`, which turns every cell into a contentEditable
// span. The page never passes it, so the published markup is unchanged and no
// handler is ever serialised across the server boundary.

import React from "react";
import { resolveTable } from "@/lib/table";
import { editableCanvasCss, tableBaseCss } from "@/lib/blockCss";
import { safeHref, type PropRec } from "@/lib/blockStyle";
import BlockStyle from "@/components/shared/BlockStyle";

/** A cell's `[text](/url)` becomes a link on the page; an unsafe URL stays plain text. */
function cellContent(value: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(value); m; m = re.exec(value)) {
    const href = safeHref(m[2]);
    if (!href) continue;
    if (m.index > last) parts.push(value.slice(last, m.index));
    const external = /^https?:/i.test(href);
    parts.push(<a key={m.index} href={href} {...(external ? { rel: "noopener" } : {})}>{m[1]}</a>);
    last = m.index + m[0].length;
  }
  if (!parts.length) return value;
  if (last < value.length) parts.push(value.slice(last));
  return parts;
}

function Cell({
  tag: Tag,
  value,
  row,
  col,
  onEditCell,
  onFocusCell,
}: {
  tag: "th" | "td";
  value: string;
  row: number;
  col: number;
  onEditCell?: (row: number, col: number, value: string) => void;
  onFocusCell?: (row: number, col: number) => void;
}) {
  // A header cell says what it heads: the column below it. Without `scope`
  // a screen reader has to guess, and validators (WCAG H63) flag the cell.
  const scope = Tag === "th" ? { scope: "col" as const } : {};
  // Trimmed on the page: a cell edited on the canvas keeps the newline the
  // author's Enter left behind, and it went out as `<th>Label\n</th>`.
  if (!onEditCell) return <Tag {...scope}>{cellContent(value.trim())}</Tag>;

  return (
    <Tag {...scope}>
      <span
        className="bmstbl-cell"
        contentEditable
        suppressContentEditableWarning
        // Commit on blur rather than per keystroke: writing to the block on each
        // character re-renders the node and drops the caret.
        onBlur={(e) => onEditCell(row, col, e.currentTarget.textContent ?? "")}
        onFocus={() => onFocusCell?.(row, col)}
        // BlockNote owns the keyboard for the block, so Enter would split the
        // whole table rather than end the edit.
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLElement).blur();
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {value}
      </span>
    </Tag>
  );
}

export default function TableView({
  props,
  scopeBase,
  /** The canvas renders the same markup but must not be interactive. */
  inert = false,
  onEditCell,
  onFocusCell,
}: {
  props: PropRec;
  scopeBase: string;
  inert?: boolean;
  onEditCell?: (row: number, col: number, value: string) => void;
  onFocusCell?: (row: number, col: number) => void;
}) {
  const { rows, hasHead, hasFoot, wrapClass, tableClass, css, anchor, caption } = resolveTable(
    props,
    scopeBase
  );

  // On the page the base look is already in the site stylesheet. In the editor
  // canvas nothing is, so it ships with the block — first, so the block's own
  // rules still win at equal specificity.
  const sheet = inert ? tableBaseCss() + editableCanvasCss() + css : css;

  if (rows.length === 0) {
    return inert ? (
      <div className="p-3 text-sm italic text-slate-400">Table — click to add rows</div>
    ) : null;
  }

  // Slice the grid into its three sections once, so the JSX below reads as the
  // table it produces.
  const headRows = hasHead ? rows.slice(0, 1) : [];
  const footRows = hasFoot && rows.length > (hasHead ? 1 : 0) ? rows.slice(-1) : [];
  const bodyRows = rows.slice(headRows.length, rows.length - footRows.length);
  const bodyOffset = headRows.length;
  const footOffset = rows.length - footRows.length;

  return (
    <div className={wrapClass} id={anchor}>
      <BlockStyle css={sheet} hoist={!inert} />
      {/* The scroller is the wrapper's child, not the block itself, so a wide
          table scrolls inside the column instead of widening the page. */}
      <div className="bmstbl-scroll">
        <table className={tableClass}>
          {caption && <caption className="bmstbl-caption">{caption}</caption>}
          {headRows.length > 0 && (
            <thead>
              {headRows.map((row, r) => (
                <tr key={`h${r}`}>
                  {row.map((cell, c) => (
                    <Cell
                      key={c}
                      tag="th"
                      value={cell}
                      row={r}
                      col={c}
                      onEditCell={onEditCell}
                      onFocusCell={onFocusCell}
                    />
                  ))}
                </tr>
              ))}
            </thead>
          )}
          <tbody>
            {bodyRows.map((row, r) => (
              <tr key={`b${r}`}>
                {row.map((cell, c) => (
                  <Cell
                    key={c}
                    tag="td"
                    value={cell}
                    row={r + bodyOffset}
                    col={c}
                    onEditCell={onEditCell}
                    onFocusCell={onFocusCell}
                  />
                ))}
              </tr>
            ))}
          </tbody>
          {footRows.length > 0 && (
            <tfoot>
              {footRows.map((row, r) => (
                <tr key={`f${r}`}>
                  {row.map((cell, c) => (
                    <Cell
                      key={c}
                      tag="td"
                      value={cell}
                      row={r + footOffset}
                      col={c}
                      onEditCell={onEditCell}
                      onFocusCell={onFocusCell}
                    />
                  ))}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
