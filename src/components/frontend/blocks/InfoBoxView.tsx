// The rendered form of an info box block.
//
// Hookless on purpose, so the same component serves the published page (a
// Server Component) and the editor canvas (a client one) — the arrangement
// `ButtonGroup`, `IconListView` and `TableView` use, for the same reason:
// shared markup cannot drift from shared CSS.
//
// The canvas passes `onEditTitle` / `onEditText`, which turn the two labels
// into contentEditable spans. The page never passes them, so nothing about the
// published markup changes and no handler is ever serialised across the server
// boundary.

import React from "react";
import { resolveInfoBox } from "@/lib/infoBox";
import { editableCanvasCss, infoBoxBaseCss } from "@/lib/blockCss";
import type { PropRec } from "@/lib/blockStyle";
import Icon from "@/components/shared/Icon";
import BlockStyle from "@/components/shared/BlockStyle";
import ContentImage from "@/components/frontend/ContentImage";
import { Editable } from "@/components/shared/CanvasEditable";

export default function InfoBoxView({
  props,
  scopeBase,
  /** The canvas renders the same markup but must not navigate on click. */
  inert = false,
  onEditTitle,
  onEditText,
  onEditLearn,
}: {
  props: PropRec;
  scopeBase: string;
  inert?: boolean;
  onEditTitle?: (title: string) => void;
  onEditText?: (text: string) => void;
  onEditLearn?: (label: string) => void;
}) {
  const box = resolveInfoBox(props, scopeBase);

  // On the page the base look is already in the site stylesheet. In the editor
  // canvas nothing is, so it ships with the block — first, so the block's own
  // rules still win at equal specificity.
  const sheet = inert ? infoBoxBaseCss() + editableCanvasCss() + box.css : box.css;

  /* ── Media ─────────────────────────────────────────────────────────────── */

  let media: React.ReactNode = null;
  if (box.mediaType === "icon" && box.icon) {
    // The glyph is decoration beside its own title — read aloud it is the
    // emoji's name, which is never what the author meant. A title, when set, is
    // the text that stands in for it.
    media = (
      <span className="bmsib-ico" aria-hidden={box.iconTitle ? undefined : true}>
        <Icon value={box.icon} />
        {box.iconTitle && <span className="sr-only">{box.iconTitle}</span>}
      </span>
    );
  } else if (box.mediaType === "image" && box.image) {
    media = (
      <span className="bmsib-ico">
        {/* Optimised. Sized to the block's own image width when that is
            set in pixels, else to a box in a column. */}
        <ContentImage
          className="bmsib-img"
          src={box.image}
          alt={box.imageAlt}
          sizes={/^\d+px$/.test(String(props.imageW ?? "").trim()) ? String(props.imageW).trim() : "(max-width: 768px) calc(100vw - 32px), 400px"}
        />
      </span>
    );
  } else if (box.mediaType === "number" && box.number) {
    media = (
      <span className="bmsib-ico" aria-hidden={box.iconTitle ? undefined : true}>
        <span aria-hidden={box.iconTitle ? "true" : undefined}>{box.number}</span>
        {box.iconTitle && <span className="sr-only">{box.iconTitle}</span>}
      </span>
    );
  }

  /* ── Title and text ────────────────────────────────────────────────────── */

  const title = box.showTitle
    ? onEditTitle
      ? (
        <Editable
          className="bmsib-title"
          tag={box.titleTag}
          value={box.title}
          placeholder="Info box title"
          onCommit={onEditTitle}
        />
      )
      : box.title
        ? React.createElement(box.titleTag, { className: "bmsib-title" }, box.title)
        : null
    : null;

  const text = box.showText
    ? onEditText
      ? (
        <Editable
          className="bmsib-text"
          tag="p"
          value={box.text}
          placeholder="Describe it here…"
          multiline
          onCommit={onEditText}
        />
      )
      : box.text
        ? <p className="bmsib-text">{box.text}</p>
        : null
    : null;

  /* ── Learn More ────────────────────────────────────────────────────────── */

  const learnLabel = onEditLearn ? (
    <Editable
      className="bmsib-learn-label"
      tag="span"
      value={box.learnMore}
      placeholder="Learn More"
      onCommit={onEditLearn}
    />
  ) : (
    <span className="bmsib-learn-label">{box.learnMore}</span>
  );

  const learnInner = (
    <>
      {box.learnIcon && box.learnIconSide === "left" && (
        <span className="bmsib-learn-ico" aria-hidden="true" style={box.learnIconColor ? { color: box.learnIconColor } : undefined}><Icon value={box.learnIcon} /></span>
      )}
      {learnLabel}
      {box.learnIcon && box.learnIconSide === "right" && (
        <span className="bmsib-learn-ico" aria-hidden="true" style={box.learnIconColor ? { color: box.learnIconColor } : undefined}><Icon value={box.learnIcon} /></span>
      )}
    </>
  );

  // Only one element may carry the link: an anchor inside an anchor is invalid
  // markup, so when the whole box is the link the Learn More is plain text that
  // the box's own anchor already covers.
  const linkOnLearn = box.linkContent === "learn" && !!box.href && !inert;
  const learn = box.showLearn
    ? linkOnLearn
      ? (
        <a
          className="bmsib-learn"
          href={box.href}
          target={box.target === "_blank" ? "_blank" : undefined}
          rel={box.rel}
          title={box.linkTitle}
        >
          {learnInner}
        </a>
      )
      : <span className="bmsib-learn">{learnInner}</span>
    : null;

  const body = (
    <>
      {media && <div className="bmsib-media">{media}</div>}
      <div className="bmsib-body">
        {title}
        {text}
        {learn}
      </div>
    </>
  );

  const linkOnBox = box.linkContent === "box" && !!box.href && !inert;

  return (
    <div className={box.boxClass} id={box.anchor}>
      <BlockStyle css={sheet} hoist={!inert} />
      {linkOnBox ? (
        <a
          className="bmsib-wrap"
          href={box.href}
          target={box.target === "_blank" ? "_blank" : undefined}
          rel={box.rel}
          title={box.linkTitle}
        >
          {body}
        </a>
      ) : (
        <div className="bmsib-wrap">{body}</div>
      )}
    </div>
  );
}
