// Iframe Embed Advanced — an embedded page inside a card: a coloured header
// with a title and a badge, a notice strip, the embedded page itself, and a
// footer with a line of text and a button (usually "open it directly", for
// when the other site refuses to be embedded).
//
// Hookless on purpose, so the same component draws the published page (a
// Server Component) and the editor canvas (a client one) — the arrangement
// InfoBoxView and TableView use — and the two cannot drift apart.
//
// Every part is optional and every colour, text and link is a block setting.
// Colours go in as inline custom properties; the structure is one static rule
// set, hoisted and de-duplicated by BlockStyle, so ten of these on a page
// cost one stylesheet.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import { safeHref } from "@/lib/blockStyle";
import { Editable } from "@/components/shared/CanvasEditable";

type Props = Record<string, string | undefined>;

/** Every setting and its default — the editor's propSchema is built from this. */
export const IFRAME_EMBED_DEFAULTS = {
  // Embed
  url: "",
  frameTitle: "",
  height: "600",
  heightMobile: "520",
  lazy: "true",
  allowFullscreen: "true",
  frameBg: "#e5e7eb",
  // Header
  showHeader: "true",
  heading: "Check your status",
  headingTag: "h2",
  footerTag: "p",
  headingSize: "",
  headerBg: "#0b3d2e",
  headerText: "#ffffff",
  showBadge: "true",
  badge: "Official service",
  badgeBg: "transparent",
  badgeText: "#ffffff",
  badgeBorder: "#ffffff66",
  // Notice
  showNotice: "true",
  noticeIcon: "⚠",
  notice: "Enter your details only inside the official window. If it does not load here, use the button below to open it directly.",
  noticeBg: "#fdf0e0",
  noticeText: "#9a3412",
  // Footer
  showFooter: "true",
  footerText: "Portal not loading inside the page? Open it directly in a new window.",
  footerBg: "#ffffff",
  footerTextColor: "#475569",
  footerAlign: "split",
  showButton: "true",
  buttonLabel: "Open official portal",
  buttonUrl: "",
  buttonNewTab: "true",
  buttonBg: "#0b3d2e",
  buttonText: "#ffffff",
  buttonRadius: "10",
  // Card
  radius: "18",
  borderColor: "#e2e8f0",
  shadow: "true",
} as const;

export type IframeEmbedProps = { [K in keyof typeof IFRAME_EMBED_DEFAULTS]: string };

const CSS = [
  `.bmsife{overflow:hidden;border:1px solid var(--ife-bd);border-radius:var(--ife-r);background:var(--ife-fbg);margin:1.5rem 0}`,
  `.bmsife.is-shadow{box-shadow:0 12px 32px -14px rgba(15,23,42,.28)}`,
  `.bmsife-head{display:flex;align-items:center;justify-content:space-between;gap:.75rem 1rem;flex-wrap:wrap;padding:1.25rem 1.5rem;background:var(--ife-hbg);color:var(--ife-htx)}`,
  // The title's colour is set here directly, and with three classes: a
  // theme or editor heading rule (h2 { color: … }, or a canvas rule on
  // headings inside blocks) otherwise wins over "inherit" and the Title
  // colour setting did nothing.
  `.bmsife .bmsife-head .bmsife-title{margin:0;font-weight:800;line-height:1.2;color:var(--ife-htx);font-size:var(--ife-hs,clamp(1.25rem,2.4vw,1.75rem))}`,
  `.bmsife-badge{font-size:.8rem;font-weight:600;line-height:1.3;padding:.35rem .8rem;border-radius:999px;border:1px solid var(--ife-bbd);background:var(--ife-bbg);color:var(--ife-btx);white-space:nowrap}`,
  `.bmsife-note{display:flex;align-items:flex-start;gap:.6rem;padding:.85rem 1.5rem;font-size:.875rem;line-height:1.55;background:var(--ife-nbg);color:var(--ife-ntx)}`,
  `.bmsife-note-ico{flex:none;line-height:1.4}`,
  `.bmsife-frame{display:block;width:100%;height:var(--ife-h);border:0;background:var(--ife-fbg)}`,
  `.bmsife-empty{display:flex;align-items:center;justify-content:center;height:var(--ife-h);padding:1rem;text-align:center;font-size:.875rem;color:#64748b;background:var(--ife-fbg)}`,
  `.bmsife-foot{display:flex;align-items:center;justify-content:space-between;gap:.75rem 1rem;flex-wrap:wrap;padding:1rem 1.5rem;font-size:.875rem;line-height:1.5;background:var(--ife-ftbg);color:var(--ife-fttx)}`,
  `.bmsife-foot.is-center{flex-direction:column;justify-content:center;text-align:center}`,
  `.bmsife .bmsife-foot .bmsife-foot-text{display:block;margin:0;flex:1 1 16rem;color:var(--ife-fttx)}`,
  `.bmsife .bmsife-note .bmsife-note-text{color:var(--ife-ntx);white-space:pre-line}`,
  `.bmsife-foot.is-center .bmsife-foot-text{flex:none}`,
  // Canvas only: typing in place.
  `.bmsife [contenteditable]{outline:none;min-width:2ch}`,
  `.bmsife [contenteditable]:focus{outline:2px dashed currentColor;outline-offset:3px;border-radius:2px}`,
  `.bmsife [contenteditable]:empty::before{content:attr(data-ph);opacity:.5}`,
  `.bmsife-btn{display:inline-flex;align-items:center;justify-content:center;padding:.7rem 1.25rem;font-weight:700;text-decoration:none;white-space:nowrap;border-radius:var(--ife-brr);background:var(--ife-btbg);color:var(--ife-bttx);transition:filter .15s}`,
  `.bmsife-btn:hover{filter:brightness(1.12);color:var(--ife-bttx)}`,
  `@media(max-width:640px){.bmsife-frame,.bmsife-empty{height:var(--ife-hm,var(--ife-h))}.bmsife-head,.bmsife-note,.bmsife-foot{padding-inline:1rem}.bmsife-btn{width:100%}}`,
].join("");

const on = (v: string | undefined, def: string) => (v ?? def) === "true";
const px = (v: string | undefined, def: number, min: number, max: number) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
};
/**
 * A colour setting, or the default. Only colour syntax is accepted — a hex,
 * a name, or rgb()/hsl()/color-mix()-style functions of numbers — because the
 * value is written into a style: `url(…)` would load an outside file (a
 * tracking pixel) and `;` or braces would break out of the property.
 */
const color = (v: string | undefined, def: string) => {
  const s = String(v ?? "").trim();
  if (!s || s.length > 80) return def;
  if (/url\s*\(|expression|[;{}<>"'\\]/i.test(s)) return def;
  return /^[#a-z0-9(),.%\s/+-]+$/i.test(s) ? s : def;
};
/** Only http(s) pages can be embedded or linked to. */
const webUrl = (v: string | undefined) => {
  const s = safeHref(String(v ?? "").trim());
  return /^https?:\/\//i.test(s) || s.startsWith("/") ? s : "";
};

export const IFE_HEADING_TAGS = ["h2", "h3", "h4", "h5", "h6", "p", "div", "span"] as const;
export const IFE_FOOTER_TAGS = ["p", "div", "span"] as const;

export default function IframeEmbedView({
  props,
  canvas = false,
  onEdit,
}: {
  props: Props;
  /** The editor canvas: the embed shows, but clicks go to the block, not the page inside. */
  canvas?: boolean;
  /** Canvas only: type the title, badge, notice, footer text and button label in place. */
  onEdit?: (patch: Record<string, string>) => void;
}) {
  const d = IFRAME_EMBED_DEFAULTS;
  const p = (k: keyof typeof d) => props[k] ?? d[k];

  const src = webUrl(props.url);
  const buttonHref = webUrl(props.buttonUrl) || src;
  const newTab = on(props.buttonNewTab, d.buttonNewTab);
  const HeadingTag = ((IFE_HEADING_TAGS as readonly string[]).includes(String(props.headingTag)) ? props.headingTag : "h2") as (typeof IFE_HEADING_TAGS)[number];
  const FooterTag = ((IFE_FOOTER_TAGS as readonly string[]).includes(String(props.footerTag)) ? props.footerTag : "p") as (typeof IFE_FOOTER_TAGS)[number];
  const edit = !!onEdit;
  /** A text part: typeable on the canvas, plain on the page. */
  const part = (key: string, className: string, tag: string, value: string, placeholder: string, multiline = false) =>
    onEdit ? (
      <Editable className={className} tag={tag} value={value} placeholder={placeholder} multiline={multiline} onCommit={(v) => v !== value && onEdit({ [key]: v })} />
    ) : (
      React.createElement(tag, { className }, value)
    );
  const heading = String(p("heading")).trim();
  const badge = String(p("badge")).trim();
  const notice = String(p("notice")).trim();
  const footerText = String(p("footerText")).trim();
  const buttonLabel = String(p("buttonLabel")).trim();
  const headingSize = px(props.headingSize, 0, 0, 80);

  const vars = {
    "--ife-r": `${px(props.radius, 18, 0, 60)}px`,
    "--ife-bd": color(props.borderColor, d.borderColor),
    "--ife-hbg": color(props.headerBg, d.headerBg),
    "--ife-htx": color(props.headerText, d.headerText),
    "--ife-bbg": color(props.badgeBg, d.badgeBg),
    "--ife-btx": color(props.badgeText, d.badgeText),
    "--ife-bbd": color(props.badgeBorder, d.badgeBorder),
    "--ife-nbg": color(props.noticeBg, d.noticeBg),
    "--ife-ntx": color(props.noticeText, d.noticeText),
    "--ife-fbg": color(props.frameBg, d.frameBg),
    "--ife-ftbg": color(props.footerBg, d.footerBg),
    "--ife-fttx": color(props.footerTextColor, d.footerTextColor),
    "--ife-btbg": color(props.buttonBg, d.buttonBg),
    "--ife-bttx": color(props.buttonText, d.buttonText),
    "--ife-brr": `${px(props.buttonRadius, 10, 0, 60)}px`,
    "--ife-h": `${px(props.height, 600, 120, 2400)}px`,
    "--ife-hm": `${px(props.heightMobile, px(props.height, 600, 120, 2400), 120, 2400)}px`,
    ...(headingSize ? { "--ife-hs": `${headingSize}px` } : {}),
  } as React.CSSProperties;

  // On the canvas a part stays visible while empty (it shows its placeholder),
  // so it can be clicked and typed into; the page leaves empty parts out.
  const showButton = on(props.showButton, d.showButton) && (edit || (!!buttonLabel && !!buttonHref));
  const showBadge = on(props.showBadge, d.showBadge) && (edit || !!badge);

  return (
    <div className={`bmsife${on(props.shadow, d.shadow) ? " is-shadow" : ""}`} style={vars}>
      <BlockStyle css={CSS} hoist={!canvas} />

      {on(props.showHeader, d.showHeader) && (edit || heading || showBadge) && (
        <div className="bmsife-head">
          {(edit || heading) && part("heading", "bmsife-title", HeadingTag, heading, "Title")}
          {showBadge && part("badge", "bmsife-badge", "span", badge, "Badge")}
        </div>
      )}

      {on(props.showNotice, d.showNotice) && (edit || notice) && (
        <div className="bmsife-note" role="note">
          {String(p("noticeIcon")).trim() && <span className="bmsife-note-ico" aria-hidden="true">{String(p("noticeIcon")).trim()}</span>}
          {part("notice", "bmsife-note-text", "span", notice, "Notice text", true)}
        </div>
      )}

      {src ? (
        <iframe
          className="bmsife-frame"
          src={src}
          title={String(props.frameTitle || heading || "Embedded page")}
          loading={on(props.lazy, d.lazy) ? "lazy" : undefined}
          allowFullScreen={on(props.allowFullscreen, d.allowFullscreen)}
          referrerPolicy="strict-origin-when-cross-origin"
          style={canvas ? { pointerEvents: "none" } : undefined}
        />
      ) : canvas ? (
        <div className="bmsife-empty">Add the address of the page to embed in the block settings.</div>
      ) : null}

      {on(props.showFooter, d.showFooter) && (edit || footerText || showButton) && (
        <div className={`bmsife-foot${props.footerAlign === "center" ? " is-center" : ""}`}>
          {(edit || footerText) && part("footerText", "bmsife-foot-text", FooterTag, footerText, "Footer text", true)}
          {showButton && (
            edit ? (
              // On the canvas the button is a label to type into, not a link.
              <span className="bmsife-btn">{part("buttonLabel", "bmsife-btn-label", "span", buttonLabel, "Button label")}</span>
            ) : (
              <a
                className="bmsife-btn"
                href={buttonHref}
                {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                onClick={canvas ? (e) => e.preventDefault() : undefined}
              >
                {buttonLabel}
              </a>
            )
          )}
        </div>
      )}
    </div>
  );
}
