"use client";

import { useState } from "react";
import ContentImage from "@/components/frontend/ContentImage";

/**
 * Before/after slider.
 *
 * Driven by a range input rather than pointer maths: it is keyboard accessible
 * for free, and the browser handles touch and drag for us.
 */
export default function ImageCompareFE({
  before, after, beforeLabel, afterLabel, start, radius, label,
}: {
  before: string; after: string; beforeLabel: string; afterLabel: string; start: number; radius: number;
  /** The slider's name in the page's language, when the author set no labels. */
  label: string;
}) {
  const [pos, setPos] = useState(start);
  return (
    <figure className="imgcmp my-6" style={{ borderRadius: `${radius}px` }}>
      {/* Left-to-right whatever the page: on an Arabic or Urdu page the range
          input runs from the right while the clip and the line are measured
          from the left, so the divider moved against the finger and never
          met the edge of the revealed image. */}
      <div dir="ltr" className="imgcmp-frame relative overflow-hidden" style={{ borderRadius: `${radius}px` }}>
        {/* Both images optimised, at the column's width. */}
        <ContentImage src={after} alt={afterLabel} className="block w-full" />
        <div className="imgcmp-clip absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
          <ContentImage src={before} alt={beforeLabel} className="block h-full max-w-none object-cover" style={{ width: `${1e4 / Math.max(pos, 1)}%` }} />
        </div>
        <span className="imgcmp-line absolute inset-y-0" style={{ left: `${pos}%` }} aria-hidden="true" />
        {beforeLabel && <span className="imgcmp-tag is-before">{beforeLabel}</span>}
        {afterLabel && <span className="imgcmp-tag is-after">{afterLabel}</span>}
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(parseInt(e.target.value))}
          aria-label={beforeLabel && afterLabel ? `${beforeLabel} / ${afterLabel}` : label}
          className="imgcmp-range absolute inset-0 w-full opacity-0 cursor-ew-resize"
        />
      </div>
    </figure>
  );
}
