// Call Bar — a bar fixed to the bottom of the screen with a call button, and
// optionally a second button. On a phone it is always one thumb away, which is
// the point of a site whose job is to make the phone ring.
//
// Pure CSS: `position:fixed`, shown on phones only or on every screen, and the
// page is given room at the bottom so the bar never covers the footer's last
// line. With no number of its own it uses the one in SEO → Local SEO; with no
// number anywhere and no second button it draws nothing.
// On the canvas it sits in the flow, so it can be selected and edited.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import { safeHref } from "@/lib/blockStyle";
import { clampInt, cssColor, telHref, type ViewProps } from "./blockKit";

export const CALL_BAR_DEFAULTS = {
  phone: "",
  label: "Call now",
  showNumber: "true",
  text: "",
  btn2Label: "",
  btn2Url: "",
  show: "mobile",
  bg: "#0b2545",
  copyColor: "#ffffff",
  btnBg: "#f5a623",
  btnColor: "#0b2545",
  btn2Color: "#ffffff",
  radius: "10",
} as const;

const BAR = 72;

/** The handset, drawn inline in the button's own colour. It used to be the 📞
 *  emoji: colourful on some phones, a different glyph on each, and a system
 *  emoji font to load before the text settled (PageSpeed: layout shift). */
function PhoneIcon() {
  return (
    <svg className="bmscall-ico" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z" />
    </svg>
  );
}

const CSS = [
  `.bmscall{display:none;align-items:center;justify-content:center;gap:10px;box-sizing:border-box;min-height:${BAR}px;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));background:var(--cb-bg);box-shadow:0 -6px 24px -12px rgba(0,0,0,.45)}`,
  `.bmscall.is-fixed{position:fixed;inset-inline:0;bottom:0;z-index:60}`,
  `.bmscall.is-fixed.on-all,.bmscall.is-canvas{display:flex}`,
  `@media(max-width:767px){.bmscall.is-fixed.on-mobile{display:flex}body:has(.bmscall.is-fixed.on-mobile){padding-bottom:${BAR}px}}`,
  `body:has(.bmscall.is-fixed.on-all){padding-bottom:${BAR}px}`,
  // The bar stays in view over the open phone menu (a call is one tap away), so the
  // menu scrolls its last links clear of it.
  `@media(max-width:767px){body:has(.bmscall.is-fixed.on-mobile) .offcanvas{padding-bottom:calc(${BAR}px + 1.5rem)}}`,
  `body:has(.bmscall.is-fixed.on-all) .offcanvas{padding-bottom:calc(${BAR}px + 1.5rem)}`,
  `.bmscall.is-canvas{flex-wrap:wrap;margin:1rem 0;border-radius:12px}`,
  `.bmscall.is-canvas .bmscall-text{flex:1 0 100%;text-align:center}`,
  `.bmscall .bmscall-text{display:none;margin:0;font-size:.95rem;font-weight:600;line-height:1.3;color:var(--cb-tc)}`,
  `@media(min-width:640px){.bmscall .bmscall-text{display:block;margin-inline-end:8px}}`,
  `.bmscall .bmscall-btn{display:inline-flex;flex:1 1 0;align-items:center;justify-content:center;gap:8px;max-width:340px;min-height:48px;padding:10px 16px;border:2px solid var(--cb-bb);border-radius:var(--cb-r);background:var(--cb-bb);color:var(--cb-bc);font-size:1rem;font-weight:800;line-height:1.2;text-decoration:none;white-space:nowrap}`,
  `.bmscall .bmscall-ico{flex:0 0 20px;width:20px;height:20px}`,
  `.bmscall .bmscall-btn.is-2{background:transparent;border-color:var(--cb-b2);color:var(--cb-b2)}`,
  `.bmscall .bmscall-btn:focus-visible{outline:3px solid var(--cb-tc);outline-offset:2px}`,
  `.bmscall-note{margin:.25rem 0 1rem;font-size:11px;color:#94a3b8;text-align:center}`,
  `@media print{.bmscall.is-fixed{display:none!important}}`,
].join("");

export default function CallBarView({ props, canvas = false, linkProps, sitePhone = "" }: ViewProps & { sitePhone?: string }) {
  const D = CALL_BAR_DEFAULTS;
  const number = String(props.phone ?? "").trim() || sitePhone.trim();
  const tel = telHref(number);
  const label = String(props.label ?? D.label).trim() || D.label;
  const text = String(props.text ?? "").trim();
  const label2 = String(props.btn2Label ?? "").trim();
  const href2 = label2 ? safeHref(props.btn2Url ?? "") : "";
  if (!canvas && !tel && !href2) return null;

  const vars = {
    "--cb-bg": cssColor(props.bg, D.bg),
    "--cb-tc": cssColor(props.copyColor, D.copyColor),
    "--cb-bb": cssColor(props.btnBg, D.btnBg),
    "--cb-bc": cssColor(props.btnColor, D.btnColor),
    "--cb-b2": cssColor(props.btn2Color, D.btn2Color),
    "--cb-r": `${clampInt(props.radius, 10, 0, 40)}px`,
  } as React.CSSProperties;
  const words = props.showNumber !== "false" && number ? `${label}: ${number}` : label;

  if (canvas) {
    return (
      <>
        <BlockStyle css={CSS} hoist={false} />
        <div className="bmscall is-canvas" style={vars}>
          {text && <p className="bmscall-text">{text}</p>}
          <span className="bmscall-btn"><PhoneIcon /> {tel ? words : `${label} (add a phone number)`}</span>
          {label2 && <span className="bmscall-btn is-2">{label2}</span>}
        </div>
        <p className="bmscall-note">Call Bar: on the published page this sticks to the bottom of the screen{props.show === "all" ? "" : " on phones"}.</p>
      </>
    );
  }

  return (
    <>
      <BlockStyle css={CSS} />
      {/* A region of its own, so a screen-reader user can jump to it and it is not read as part of the article. */}
      <aside className={`bmscall is-fixed ${props.show === "all" ? "on-all" : "on-mobile"}`} style={vars} aria-label={label}>
        {text && <p className="bmscall-text">{text}</p>}
        {tel && <a className="bmscall-btn" href={tel}><PhoneIcon /> {words}</a>}
        {href2 && <a className="bmscall-btn is-2" href={href2} {...(linkProps ? linkProps(href2) : {})}>{label2}</a>}
      </aside>
    </>
  );
}
