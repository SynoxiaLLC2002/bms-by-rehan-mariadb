"use client";

// The Table of Contents, used by both the published page and the editor
// canvas — same arrangement as `AccordionFE`: everything visual comes out of
// `resolveToc`, so a second renderer would be a second place for the styling
// to drift. The canvas passes `inert`, which freezes the collapsed state and
// turns off scrollspy (there is nothing to scroll to inside the panel).

import { useEffect, useState } from "react";
import { resolveToc, type TocHeading } from "@/lib/tableOfContents";
import { tocBaseCss } from "@/lib/blockCss";
import type { PropRec } from "@/lib/blockStyle";
import BlockStyle from "@/components/shared/BlockStyle";

export default function TableOfContentsFE({
  props,
  headings,
  scopeBase,
  inert = false,
  toggleLabel,
}: {
  props: PropRec;
  /** The show/hide button's accessible name, in the page's language. */
  toggleLabel?: string;
  headings: TocHeading[];
  scopeBase: string;
  inert?: boolean;
}) {
  const toc = resolveToc(props, headings, scopeBase);
  const [open, setOpen] = useState(!toc.startCollapsed);
  useEffect(() => setOpen(!toc.startCollapsed), [toc.startCollapsed]);

  // Scrollspy: which entry's heading is nearest the top of the viewport.
  // Only wired on the real page — the canvas has no live headings to watch,
  // and toggling classes there would fight the block's own selection outline.
  const [activeHref, setActiveHref] = useState<string | null>(null);
  useEffect(() => {
    if (inert || !toc.highlightActive || toc.entries.length === 0) return;
    const els = toc.entries
      .map((e) => document.getElementById(e.href.slice(1)))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (records) => {
        // The heading whose top has most recently crossed the band wins —
        // scanning every record for the one nearest the top of the viewport
        // avoids the "everything is visible at once on a short page" case
        // picking an arbitrary entry.
        const visible = records.filter((r) => r.isIntersecting);
        if (!visible.length) return;
        const top = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        setActiveHref(`#${top.target.id}`);
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inert, toc.highlightActive, toc.entries.map((e) => e.href).join(",")]);

  if (toc.entries.length === 0) {
    return inert ? (
      <div className="p-3 text-sm italic text-slate-400">Table of Contents — no headings on this page yet</div>
    ) : null;
  }

  const sheet = inert ? tocBaseCss() + toc.css : toc.css;
  const toggle = () => !inert && setOpen((v) => !v);
  const icon = toc.collapsible && toc.showIcon && (
    <span className="bmstoc-ico" aria-hidden="true">
      {open ? toc.icon.open : toc.icon.closed}
    </span>
  );

  // A link scrolls with the browser's own jump by default; smooth scroll is
  // opt-in per block, so it never fights a global anchor behaviour the rest
  // of the site may already rely on.
  const onLinkClick = toc.smoothScroll
    ? (e: React.MouseEvent<HTMLAnchorElement>) => {
        const id = e.currentTarget.getAttribute("href")?.slice(1);
        const target = id && document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        history.pushState(null, "", `#${id}`);
      }
    : undefined;

  return (
    // A landmark, not a div: screen readers list it among the page's
    // navigation regions, named by its title.
    <nav
      className={[toc.wrapClass, open ? "is-open" : "", toc.icon.spin ? "is-spin" : ""].filter(Boolean).join(" ")}
      id={toc.anchor}
      aria-label={toc.title || "Table of contents"}
    >
      <BlockStyle css={sheet} hoist={!inert} />
      {toc.showTitle && toc.title && (
        toc.collapsible ? (
          toc.titleToggle ? (
            <button type="button" className="bmstoc-title" aria-expanded={open} aria-controls={`${scopeBase}-body`} onClick={toggle}>
              <span>{toc.title}</span>
              {icon}
            </button>
          ) : (
            <div className="bmstoc-title">
              <span>{toc.title}</span>
              {toc.showIcon && (
                <button type="button" className="bmstoc-ico-btn" aria-expanded={open} aria-controls={`${scopeBase}-body`} aria-label={toggleLabel} onClick={toggle}>
                  {icon}
                </button>
              )}
            </div>
          )
        ) : (
          <div className="bmstoc-title">
            <span>{toc.title}</span>
          </div>
        )
      )}
      <div id={`${scopeBase}-body`} hidden={toc.collapsible && !open} className="bmstoc-body">
        <ul className="bmstoc-list">
          {/* Depth as a class: `.bmstoc-d2` sets the variable the indent rule
              reads. Sixty-five items on one measured page each carried it as
              an inline style, for three distinct values. */}
          {toc.entries.map((entry, i) => (
            <li key={i} className={`bmstoc-item bmstoc-d${Math.min(Math.max(entry.depth, 0), 5)}`}>
              <a
                href={entry.href}
                className={["bmstoc-link", activeHref === entry.href ? "is-active" : ""].filter(Boolean).join(" ")}
                onClick={onLinkClick}
              >
                {entry.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
