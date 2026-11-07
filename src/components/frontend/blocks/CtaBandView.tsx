// CTA Band — a coloured strip that closes a section: a heading, a line of
// text and one or two buttons, centred or with the buttons to the side.
// A button's address may be a page, or tel:+15551234567 for a call button.
// Hookless and script-free; shared by the page and the canvas.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import { Btn, Txt, clampInt, cssColor, editableCss, pick, px, type ViewProps } from "./blockKit";

export const CTA_BAND_DEFAULTS = {
  layout: "center",
  heading: "Ready when you are",
  text: "Tell us what you need and we will get straight back to you.",
  btn1Label: "Get in touch",
  btn1Url: "/contact",
  btn2Label: "",
  btn2Url: "",
  headingTag: "h2",
  bg: "#0b2545",
  bg2: "",
  headingColor: "#ffffff",
  copyColor: "#dbe5f1",
  btnBg: "#f5a623",
  btnColor: "#0b2545",
  btn2Color: "#ffffff",
  headingSize: "",
  padding: "56",
  paddingMobile: "36",
  radius: "16",
  btnRadius: "10",
  innerWidth: "1152",
  flush: "false",
  textSize: "",
} as const;

export const CTA_HEADING_TAGS = ["h2", "h3", "h4", "p", "div"] as const;

const CSS = [
  `.bmscta{container-type:inline-size;margin:2rem 0;padding:var(--ct-p) 24px;border-radius:var(--ct-r);background:var(--ct-bg)}`,
  `.bmscta-in{display:flex;flex-direction:column;align-items:center;gap:24px;max-width:var(--ct-iw);margin:0 auto;text-align:center}`,
  `.bmscta-copy{display:flex;flex-direction:column;gap:10px;min-width:0}`,
  `.bmscta .bmscta-copy .bmscta-heading{display:block;margin:0;font-weight:800;line-height:1.15;color:var(--ct-hc);font-size:var(--ct-hs,clamp(1.5rem,3.2vw,2.25rem))}`,
  `.bmscta .bmscta-copy .bmscta-text{display:block;margin:0;font-size:var(--ct-xs,1.05rem);line-height:1.6;color:var(--ct-tc);white-space:pre-line}`,
  `.bmscta-btns{display:flex;flex-wrap:wrap;justify-content:center;gap:12px}`,
  `.bmscta-btns:empty{display:none}`,
  `.bmscta .bmscta-btns .bmscta-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 24px;border:2px solid var(--ct-bb);border-radius:var(--ct-br);background:var(--ct-bb);color:var(--ct-bc);font-size:1rem;font-weight:700;line-height:1.2;text-decoration:none;white-space:nowrap}`,
  `.bmscta .bmscta-btns .bmscta-btn.is-2{background:transparent;border-color:var(--ct-b2);color:var(--ct-b2)}`,
  `.bmscta .bmscta-btns .bmscta-btn:hover{opacity:.9}`,
  `.bmscta .bmscta-btns .bmscta-btn:focus-visible{outline:3px solid var(--ct-b2);outline-offset:3px}`,
  `.bmscta.is-flush{margin:0}`,
  `@container (min-width:700px){.bmscta.is-split .bmscta-in{flex-direction:row;justify-content:space-between;text-align:start}.bmscta.is-split .bmscta-btns{flex-shrink:0;justify-content:flex-end}}`,
  `@media(max-width:639px){.bmscta{padding:var(--ct-pm) 16px}}`,
  editableCss(".bmscta"),
].join("");

export default function CtaBandView({ props, canvas = false, onEdit, linkProps }: ViewProps) {
  const D = CTA_BAND_DEFAULTS;
  const edit = !!onEdit;
  const heading = String(props.heading ?? D.heading).trim();
  const text = String(props.text ?? D.text).trim();
  if (!edit && !heading && !text) return null;

  const Heading = pick(props.headingTag, CTA_HEADING_TAGS, "h2");
  const bg = cssColor(props.bg, D.bg);
  const bg2 = cssColor(props.bg2, "");
  const hs = clampInt(props.headingSize, 0, 0, 72);
  const vars = {
    "--ct-bg": bg2 ? `linear-gradient(135deg,${bg},${bg2})` : bg,
    "--ct-hc": cssColor(props.headingColor, D.headingColor),
    "--ct-tc": cssColor(props.copyColor, D.copyColor),
    "--ct-bb": cssColor(props.btnBg, D.btnBg),
    "--ct-bc": cssColor(props.btnColor, D.btnColor),
    "--ct-b2": cssColor(props.btn2Color, D.btn2Color),
    "--ct-p": `${clampInt(props.padding, 56, 0, 200)}px`,
    "--ct-pm": `${clampInt(props.paddingMobile, 36, 0, 160)}px`,
    "--ct-r": `${clampInt(props.radius, 16, 0, 60)}px`,
    "--ct-br": `${clampInt(props.btnRadius, 10, 0, 60)}px`,
    "--ct-iw": `${clampInt(props.innerWidth, 1152, 320, 1920)}px`,
    ...(hs ? { "--ct-hs": `${hs}px` } : {}),
    ...px("--ct-xs", props.textSize, 10, 40),
  } as React.CSSProperties;

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <section className={`bmscta${props.layout === "split" ? " is-split" : ""}${props.flush === "true" ? " is-flush" : ""}`} style={vars}>
        <div className="bmscta-in">
          <div className="bmscta-copy">
            <Txt edit={edit} tag={Heading} className="bmscta-heading" value={heading} placeholder="Heading" onCommit={(v) => onEdit?.("heading", v)} />
            <Txt edit={edit} tag="p" className="bmscta-text" value={text} placeholder="Text (optional)" multiline onCommit={(v) => onEdit?.("text", v)} />
          </div>
          <div className="bmscta-btns">
            <Btn className="bmscta-btn" label={String(props.btn1Label ?? D.btn1Label)} url={props.btn1Url ?? D.btn1Url} canvas={canvas} linkProps={linkProps} />
            <Btn className="bmscta-btn is-2" label={String(props.btn2Label ?? "")} url={props.btn2Url} canvas={canvas} linkProps={linkProps} />
          </div>
        </div>
      </section>
    </>
  );
}
