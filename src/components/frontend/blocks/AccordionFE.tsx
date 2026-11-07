"use client";

import type React from "react";

// The accordion, used by both the published page and the editor canvas.
//
// One component rather than a static twin for the canvas: everything visual
// comes out of `resolveAccordion`, so a second renderer would be a second place
// for the styling to drift. The canvas passes `inert`, which freezes the open
// state and turns each title into an editable label.

import { useEffect, useRef, useState } from "react";
import { resolveAccordion } from "@/lib/accordion";
import { accordionBaseCss } from "@/lib/blockCss";
import type { PropRec } from "@/lib/blockStyle";
import BlockStyle from "@/components/shared/BlockStyle";

export default function AccordionFE({
  props,
  scopeBase,
  inert = false,
  onEditTitle,
  onFocusPane,
  titleIcons,
}: {
  props: PropRec;
  scopeBase: string;
  inert?: boolean;
  onEditTitle?: (index: number, title: string) => void;
  onFocusPane?: (index: number) => void;
  /**
   * Each pane's title icon, already rendered, indexed like `panes`.
   *
   * This is a client component, and an icon may be a Lucide SVG — whose
   * lookup table is the whole library. Rendering the icons in the caller
   * (the server for the page, the editor for the preview) keeps that table
   * out of the public bundle. Absent, the raw value is shown as text.
   */
  titleIcons?: React.ReactNode[];
}) {
  const acc = resolveAccordion(props, scopeBase);

  // Which panes are open. Seeded from the resolved config, and re-seeded when
  // that changes — otherwise editing "Initial Open Accordion" in the panel would
  // not move the open pane until a reload.
  const seed = () => new Set(acc.panes.flatMap((p, i) => (p.open ? [i] : [])));
  const [open, setOpen] = useState<Set<number>>(seed);
  const openKey = acc.panes.map((p) => (p.open ? "1" : "0")).join("");
  useEffect(() => setOpen(seed), [openKey, acc.panes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Closed panes are `hidden="until-found"`: find-in-page and search engines
  // still see the text, and a match opens the pane (`beforematch`). React
  // writes `hidden` as a bare attribute, so the value is set here, after
  // hydration; the server HTML has plain `hidden`, which is only the
  // pre-JavaScript state.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (inert || !root.current) return;
    const bodies = Array.from(root.current.querySelectorAll<HTMLElement>(":scope > .bmsacc-pane > .bmsacc-body[hidden]"));
    const onMatch = (e: Event) => {
      const body = e.currentTarget as HTMLElement;
      const i = Number(body.dataset.pane);
      if (Number.isFinite(i)) setOpen((prev) => new Set(acc.closeOthers ? [i] : [...prev, i]));
    };
    for (const b of bodies) {
      b.setAttribute("hidden", "until-found");
      b.addEventListener("beforematch", onMatch);
    }
    return () => bodies.forEach((b) => b.removeEventListener("beforematch", onMatch));
  }, [open, inert, acc.closeOthers]);

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(acc.closeOthers ? [] : prev);
      if (prev.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  if (acc.panes.length === 0) {
    return inert ? (
      <div className="p-3 text-sm italic text-slate-400">Accordion — click to add panes</div>
    ) : null;
  }

  const Tag = acc.titleTag as "div";
  const sheet = inert ? accordionBaseCss() + acc.css : acc.css;

  return (
    <div
      ref={root}
      className={[
        acc.wrapClass,
        acc.icon.spin ? "is-spin" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      id={acc.anchor}
      // Read by the public site's React-free accordion (astro/src/scripts/vanilla.ts).
      data-close-others={acc.closeOthers ? "" : undefined}
      data-ico-open={acc.icon.open}
      data-ico-closed={acc.icon.closed}
    >
      <BlockStyle css={sheet} hoist={!inert} />
      {acc.panes.map((pane, i) => {
        const isOpen = open.has(i);
        const bodyId = `${scopeBase}-body-${i}`;
        const trigger = (
          <span className="bmsacc-ico" aria-hidden="true">
            {isOpen ? acc.icon.open : acc.icon.closed}
          </span>
        );
        return (
          <div
            key={i}
            id={pane.anchor}
            className={["bmsacc-pane", isOpen ? "is-open" : "", pane.scope].filter(Boolean).join(" ")}
          >
            {/* The heading level is the author's choice, so the button lives
                inside it — a heading that *is* a button is not announced as a
                heading by every screen reader. */}
            <Tag className="bmsacc-title-wrap">
              <button
                type="button"
                className="bmsacc-title"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                aria-label={pane.ariaLabel}
                onClick={() => !inert && toggle(i)}
              >
                {acc.showIcon && acc.iconSide === "left" && trigger}
                {pane.titleIcon && pane.titleIconSide === "left" && (
                  <span className="bmsacc-title-ico" aria-hidden="true" style={pane.titleIconColor ? { color: pane.titleIconColor } : undefined}>{titleIcons?.[i] ?? pane.titleIcon}</span>
                )}
                {pane.iconOnly ? null : onEditTitle ? (
                  <span
                    className="bmsacc-label"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => onEditTitle(i, e.currentTarget.textContent ?? "")}
                    onFocus={() => onFocusPane?.(i)}
                    // The title is inside a button inside BlockNote; both would
                    // otherwise act on every keystroke.
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).blur();
                      }
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.preventDefault()}
                  >
                    {pane.title}
                  </span>
                ) : (
                  <span className="bmsacc-label">{pane.title || `Pane ${i + 1}`}</span>
                )}
                {/* With the label hidden the row still needs something to take
                    the slack, or the trigger sits against the title icon. */}
                {pane.iconOnly && <span className="bmsacc-label" aria-hidden="true" />}
                {pane.titleIcon && pane.titleIconSide === "right" && (
                  <span className="bmsacc-title-ico" aria-hidden="true" style={pane.titleIconColor ? { color: pane.titleIconColor } : undefined}>{titleIcons?.[i] ?? pane.titleIcon}</span>
                )}
                {acc.showIcon && acc.iconSide === "right" && trigger}
              </button>
            </Tag>
            {/* Every panel stays in the DOM so crawlers see all content, not
                just the open one. */}
            <div id={bodyId} hidden={!isOpen} data-pane={i} className="bmsacc-body">
              {pane.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
