"use client";

import { useState } from "react";

/**
 * Long text collapsed behind a button.
 *
 * The full text is always in the DOM — only its height is clipped — so search
 * engines index the whole thing whether or not anyone expands it.
 */
export default function ShowMoreFE({
  text, height, moreLabel, lessLabel, fade,
}: {
  text: string; height: number; moreLabel: string; lessLabel: string; fade: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="showmore my-5">
      <div
        className={`showmore-body relative overflow-hidden${!open && fade ? " is-faded" : ""}`}
        style={{ maxHeight: open ? "none" : `${height}px` }}
      >
        <p className="whitespace-pre-line">{text}</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="showmore-btn mt-3 text-sm font-medium"
      >
        {open ? lessLabel : moreLabel} <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
    </div>
  );
}
