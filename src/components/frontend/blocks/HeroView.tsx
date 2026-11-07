// Hero — the top of a landing or service page: a small label, the heading, a
// line or two of text, ticks, one or two buttons and a photo. Three layouts:
// text beside the photo, text over the photo, or no photo at all.
//
// The photo is a real <img>, not a CSS background: the browser finds it while
// the HTML is still arriving, it gets a srcset from the optimiser, and it has
// alt text. As the first block of a page it is loaded first (BlockRenderer's
// hero scan). Hookless and script-free; shared by the page and the canvas.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import { Btn, Txt, clampInt, cssColor, editableCss, linesOf, pick, plainImg, safeSrc, px, type ViewProps } from "./blockKit";

export const HERO_DEFAULTS = {
  layout: "split",
  imageSide: "right",
  eyebrow: "",
  heading: "Say what you do in one clear line",
  text: "A sentence or two on who this is for and what they get.",
  ticks: "",
  btn1Label: "Get started",
  btn1Url: "",
  btn2Label: "",
  btn2Url: "",
  image: "",
  imageAlt: "",
  headingTag: "h2",
  align: "start",
  bg: "#0b2545",
  bg2: "",
  overlay: "60",
  headingColor: "#ffffff",
  copyColor: "#dbe5f1",
  eyebrowColor: "#f5a623",
  tickColor: "#f5a623",
  btnBg: "#f5a623",
  btnColor: "#0b2545",
  btn2Color: "#ffffff",
  headingSize: "",
  minHeight: "0",
  padding: "72",
  paddingMobile: "40",
  radius: "0",
  imageRadius: "16",
  btnRadius: "10",
  innerWidth: "1152",
  flush: "false",
  textSize: "",
} as const;

export const HERO_LAYOUTS = ["split", "cover", "plain"] as const;
export const HERO_HEADING_TAGS = ["h1", "h2", "h3", "p", "div"] as const;
export const MAX_TICKS = 6;

const CSS = [
  `.bmshero{position:relative;overflow:hidden;display:flex;align-items:center;container-type:inline-size;margin:2rem 0;padding:var(--he-p) 24px;min-height:var(--he-mh);border-radius:var(--he-r);background:var(--he-bg)}`,
  `.bmshero-in{position:relative;z-index:1;display:grid;gap:40px;align-items:center;width:100%;max-width:var(--he-iw);margin:0 auto}`,
  `.bmshero.is-flush{margin:0}`,
  // By the block's own width, not the screen's: in a narrow article column the photo goes under the text.
  `@container (min-width:760px){.bmshero.is-split.has-img .bmshero-in{grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr)}.bmshero.img-left .bmshero-media{order:-1}}`,
  `.bmshero-copy{display:flex;flex-direction:column;align-items:var(--he-ai);gap:16px;min-width:0;text-align:var(--he-al)}`,
  `.bmshero .bmshero-copy .bmshero-eyebrow{display:block;margin:0;font-size:.8rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;line-height:1.3;color:var(--he-ec)}`,
  `.bmshero .bmshero-copy .bmshero-heading{display:block;margin:0;font-weight:800;line-height:1.1;letter-spacing:-.01em;color:var(--he-hc);font-size:var(--he-hs,clamp(2rem,4.6vw,3.25rem))}`,
  `.bmshero .bmshero-copy .bmshero-text{display:block;margin:0;max-width:60ch;font-size:var(--he-xs,1.125rem);line-height:1.6;color:var(--he-tc);white-space:pre-line}`,
  `.bmshero .bmshero-ticks{display:flex;flex-wrap:wrap;justify-content:var(--he-ai);gap:8px 20px;margin:0;padding:0;list-style:none}`,
  `.bmshero .bmshero-ticks .bmshero-tick{display:flex;align-items:center;gap:8px;margin:0;padding:0;list-style:none;font-size:.95rem;font-weight:600;line-height:1.4;color:var(--he-tc)}`,
  `.bmshero .bmshero-ticks .bmshero-tick::before{content:"\\2713";font-weight:800;color:var(--he-kc)}`,
  `.bmshero-btns{display:flex;flex-wrap:wrap;justify-content:var(--he-ai);gap:12px;margin-top:8px}`,
  `.bmshero-btns:empty{display:none}`,
  `.bmshero .bmshero-btns .bmshero-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 24px;border:2px solid var(--he-bb);border-radius:var(--he-br);background:var(--he-bb);color:var(--he-bc);font-size:1rem;font-weight:700;line-height:1.2;text-decoration:none}`,
  `.bmshero .bmshero-btns .bmshero-btn.is-2{background:transparent;border-color:var(--he-b2);color:var(--he-b2)}`,
  `.bmshero .bmshero-btns .bmshero-btn:hover{opacity:.9}`,
  `.bmshero .bmshero-btns .bmshero-btn:focus-visible{outline:3px solid var(--he-b2);outline-offset:3px}`,
  `.bmshero-media img{display:block;width:100%;height:auto;margin:0;border-radius:var(--he-ir);object-fit:cover}`,
  `.bmshero-cover{position:absolute;inset:0}`,
  `.bmshero-cover img{position:absolute;inset:0;width:100%;height:100%;margin:0;object-fit:cover}`,
  `.bmshero-cover::after{content:"";position:absolute;inset:0;background:var(--he-bg);opacity:var(--he-ov)}`,
  `@media(max-width:639px){.bmshero{padding:var(--he-pm) 16px}}`,
  editableCss(".bmshero"),
].join("");

export default function HeroView({ props, canvas = false, onEdit, linkProps, img = plainImg, priority = false }: ViewProps & { priority?: boolean }) {
  const D = HERO_DEFAULTS;
  const edit = !!onEdit;
  const eyebrow = String(props.eyebrow ?? D.eyebrow).trim();
  const heading = String(props.heading ?? D.heading).trim();
  const text = String(props.text ?? D.text).trim();
  const ticks = linesOf(props.ticks, MAX_TICKS);
  const src = safeSrc(props.image);
  const layout = pick(props.layout, HERO_LAYOUTS, "split");
  const showImg = !!src && layout !== "plain";
  if (!edit && !heading && !text && !showImg) return null;

  const Heading = pick(props.headingTag, HERO_HEADING_TAGS, "h2");
  const center = props.align === "center";
  const bg = cssColor(props.bg, D.bg);
  const bg2 = cssColor(props.bg2, "");
  const hs = clampInt(props.headingSize, 0, 0, 96);
  const alt = String(props.imageAlt ?? "").trim();

  const vars = {
    // The gradient is the section's own background; the overlay on a cover photo stays the solid colour.
    "--he-bg": bg,
    ...(bg2 && !(layout === "cover" && showImg) ? { background: `linear-gradient(135deg,${bg},${bg2})` } : {}),
    "--he-ov": String(clampInt(props.overlay, 60, 0, 95) / 100),
    "--he-hc": cssColor(props.headingColor, D.headingColor),
    "--he-tc": cssColor(props.copyColor, D.copyColor),
    "--he-ec": cssColor(props.eyebrowColor, D.eyebrowColor),
    "--he-kc": cssColor(props.tickColor, D.tickColor),
    "--he-bb": cssColor(props.btnBg, D.btnBg),
    "--he-bc": cssColor(props.btnColor, D.btnColor),
    "--he-b2": cssColor(props.btn2Color, D.btn2Color),
    "--he-p": `${clampInt(props.padding, 72, 0, 240)}px`,
    "--he-pm": `${clampInt(props.paddingMobile, 40, 0, 160)}px`,
    "--he-mh": `${clampInt(props.minHeight, 0, 0, 1000)}px`,
    "--he-r": `${clampInt(props.radius, 0, 0, 60)}px`,
    "--he-ir": `${clampInt(props.imageRadius, 16, 0, 60)}px`,
    "--he-br": `${clampInt(props.btnRadius, 10, 0, 60)}px`,
    "--he-iw": `${clampInt(props.innerWidth, 1152, 320, 1920)}px`,
    "--he-al": center ? "center" : "start",
    "--he-ai": center ? "center" : "flex-start",
    ...(hs ? { "--he-hs": `${hs}px` } : {}),
    ...px("--he-xs", props.textSize, 10, 40),
  } as React.CSSProperties;

  const cls = `bmshero is-${layout}${showImg ? " has-img" : ""}${props.imageSide === "left" ? " img-left" : ""}${props.flush === "true" ? " is-flush" : ""}`;
  const set = (key: string) => (v: string) => onEdit?.(key, v);

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <section className={cls} style={vars}>
        {showImg && layout === "cover" && <div className="bmshero-cover">{img(src, alt, { sizes: "100vw", priority })}</div>}
        <div className="bmshero-in">
          <div className="bmshero-copy">
            <Txt edit={edit} tag="p" className="bmshero-eyebrow" value={eyebrow} placeholder="Small label (optional)" onCommit={set("eyebrow")} />
            <Txt edit={edit} tag={Heading} className="bmshero-heading" value={heading} placeholder="Heading" onCommit={set("heading")} />
            <Txt edit={edit} tag="p" className="bmshero-text" value={text} placeholder="Text" multiline onCommit={set("text")} />
            {ticks.length > 0 &&
              (canvas ? (
                <div className="bmshero-ticks">{ticks.map((t, i) => <div key={i} className="bmshero-tick">{t}</div>)}</div>
              ) : (
                <ul className="bmshero-ticks" role="list">{ticks.map((t, i) => <li key={i} className="bmshero-tick">{t}</li>)}</ul>
              ))}
            <div className="bmshero-btns">
              <Btn className="bmshero-btn" label={String(props.btn1Label ?? D.btn1Label)} url={props.btn1Url} canvas={canvas} linkProps={linkProps} />
              <Btn className="bmshero-btn is-2" label={String(props.btn2Label ?? "")} url={props.btn2Url} canvas={canvas} linkProps={linkProps} />
            </div>
          </div>
          {showImg && layout === "split" && <div className="bmshero-media">{img(src, alt, { sizes: "(max-width: 899px) 100vw, 520px", priority })}</div>}
        </div>
      </section>
    </>
  );
}
