// An editable label on the editor canvas: a block's own text typed in place.
//
// Used by blocks whose published markup is drawn by a hookless view component
// (Info Box, Iframe Embed Advanced, Steps Grid). The canvas passes a commit
// callback and gets contentEditable text; the page never renders this, so no
// handler ever crosses the server boundary and the published markup is plain.

import React from "react";

export function Editable({
  className,
  tag,
  value,
  placeholder,
  multiline = false,
  onCommit,
}: {
  className: string;
  tag: string;
  value: string;
  placeholder: string;
  /** Enter inserts a line break rather than committing. */
  multiline?: boolean;
  onCommit: (next: string) => void;
}) {
  return React.createElement(
    tag,
    {
      className,
      contentEditable: true,
      suppressContentEditableWarning: true,
      "data-ph": placeholder,
      // Commit on blur rather than on every keystroke: writing to the block on
      // each character would re-render the node and drop the caret.
      //
      // `innerText` rather than `textContent` so a body typed across several
      // lines keeps its breaks — the prop is one string, and `pre-line` in the
      // block's stylesheet renders them.
      onBlur: (e: React.FocusEvent<HTMLElement>) =>
        onCommit(multiline ? (e.currentTarget.innerText ?? "") : (e.currentTarget.textContent ?? "")),
      // BlockNote owns the keyboard for the block, so every key handled here
      // has to be stopped before it reaches the outer editor and splits it.
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        e.stopPropagation();
        if (!multiline && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      },
      onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
      // A click inside a box whose link wraps everything must not navigate.
      onClick: (e: React.MouseEvent) => e.preventDefault(),
    },
    value
  );
}
