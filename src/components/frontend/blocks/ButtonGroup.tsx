// The rendered form of a button block.
//
// Deliberately a plain function with no hooks, no handlers and no browser APIs,
// so the same component serves the published page (a Server Component) and the
// editor canvas (a client one). Sharing the markup as well as the resolver is
// what stops the canvas and the page drifting the way the archive layout did.

import React from "react";
import { resolveButtons, type BtnRec, type ResolvedButton } from "@/lib/button";
import { buttonBaseCss, buttonEditorCss } from "@/lib/blockCss";
import Icon from "@/components/shared/Icon";
import WaitButton from "./WaitButton";
import BlockStyle from "@/components/shared/BlockStyle";

function Inner({ b }: { b: ResolvedButton }) {
  // The glyph is always hidden from assistive tech — read aloud it is the emoji's
  // name, which is never what the author meant. The title, when there is one, is
  // the text that stands in for it.
  const icon = b.showIcon ? (
    <span className="bmsbtn-ico">
      <Icon value={b.icon} />
      {b.iconTitle && <span className="sr-only">{b.iconTitle}</span>}
    </span>
  ) : null;

  return (
    <>
      {b.iconSide === "left" && icon}
      {b.showText && <span className="bmsbtn-label">{b.text || "Button"}</span>}
      {b.iconSide === "right" && icon}
    </>
  );
}

export default function ButtonGroup({
  props,
  scopeBase,
  /** The canvas renders the same markup but must not navigate on click. */
  inert = false,
}: {
  props: BtnRec;
  scopeBase: string;
  inert?: boolean;
}) {
  const { buttons, groupClass, css } = resolveButtons(props, scopeBase);

  // On the page the base look is already in the site stylesheet. In the editor
  // canvas nothing is, so it ships with the block — first, so the block's own
  // rules still win at equal specificity.
  const sheet = inert ? buttonBaseCss() + buttonEditorCss() + css : css;

  return (
    <div className={groupClass}>
      <BlockStyle css={sheet} hoist={!inert} />
      {buttons.map((b) => {
        const inner = <Inner b={b} />;
        // An icon-only button has no accessible name from its text, so one has
        // to come from somewhere — the aria label, else the icon's title.
        const label = b.ariaLabel || (!b.showText ? b.iconTitle || b.text : undefined);

        if (b.isButton) {
          return (
            <button
              key={b.scope}
              type="button"
              id={b.anchor}
              className={b.className}
              aria-label={label}
              // `pointer-events` rather than `disabled`: disabled would repaint
              // it in the browser's grey and misrepresent what the page ships.
              style={inert ? { pointerEvents: "none" } : undefined}
            >
              {inner}
            </button>
          );
        }

        if (b.wait && !inert) {
          return (
            <WaitButton
              key={b.scope}
              id={b.anchor}
              href={b.href}
              target={b.target === "_blank" ? "_blank" : undefined}
              rel={b.rel}
              download={b.download}
              className={b.className}
              ariaLabel={label}
              wait={b.wait}
            >
              {inner}
            </WaitButton>
          );
        }

        return (
          <a
            key={b.scope}
            id={b.anchor}
            href={inert ? undefined : b.href || undefined}
            target={b.target === "_blank" ? "_blank" : undefined}
            rel={b.rel}
            download={b.download || undefined}
            className={b.className}
            aria-label={label}
            // The canvas needs the anchor to look like an anchor and behave like
            // nothing: a click there belongs to the editor's selection, not to
            // the link.
            style={inert ? { pointerEvents: "none" } : undefined}
          >
            {inner}
          </a>
        );
      })}
    </div>
  );
}
