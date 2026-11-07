// Logo Strip — a row of logos under a short line ("Trusted by", "As seen in").
// Static, wrapping, optionally greyed until hovered. Every logo is lazy-loaded
// at the small size it is shown, and each needs alt text: a logo is a name.
// Hookless and script-free; shared by the page and the canvas.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import { safeHref } from "@/lib/blockStyle";
import { Txt, clampInt, cssColor, editableCss, parseList, plainImg, safeSrc, type ViewProps } from "./blockKit";

export interface StripLogo {
  src?: string;
  alt?: string;
  url?: string;
}

export const MAX_LOGOS = 16;

export const LOGO_STRIP_DEFAULTS = {
  heading: "Trusted by",
  logos: "[]",
  height: "40",
  gap: "40",
  gray: "true",
  align: "center",
  headingColor: "#64748b",
} as const;

export const parseLogos = (raw: unknown) => parseList<StripLogo>(raw, MAX_LOGOS);

const CSS = [
  `.bmslogo{margin:2rem 0;text-align:var(--lg-al)}`,
  `.bmslogo .bmslogo-heading{display:block;margin:0 0 18px;font-size:.8rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;line-height:1.4;color:var(--lg-hc)}`,
  `.bmslogo .bmslogo-list{display:flex;flex-wrap:wrap;align-items:center;justify-content:var(--lg-jc);gap:20px var(--lg-g);margin:0;padding:0;list-style:none}`,
  `.bmslogo .bmslogo-list .bmslogo-item{display:flex;align-items:center;margin:0;padding:0;list-style:none}`,
  `.bmslogo .bmslogo-item a{display:flex;align-items:center}`,
  `.bmslogo .bmslogo-item img{display:block;width:auto;max-width:180px;height:var(--lg-h);margin:0;object-fit:contain}`,
  `.bmslogo.is-gray .bmslogo-item img{filter:grayscale(1);opacity:.7;transition:filter .2s,opacity .2s}`,
  `.bmslogo.is-gray .bmslogo-item:hover img,.bmslogo.is-gray .bmslogo-item a:focus-visible img{filter:none;opacity:1}`,
  `.bmslogo-empty{padding:18px;border:1px dashed #cbd5e1;border-radius:10px;font-size:12px;color:#94a3b8;text-align:center}`,
  editableCss(".bmslogo"),
].join("");

export default function LogoStripView({ props, canvas = false, onEdit, linkProps, img = plainImg }: ViewProps) {
  const D = LOGO_STRIP_DEFAULTS;
  const edit = !!onEdit;
  const logos = parseLogos(props.logos ?? D.logos).filter((l) => safeSrc(l.src));
  if (!canvas && logos.length === 0) return null;

  const heading = String(props.heading ?? D.heading).trim();
  const h = clampInt(props.height, 40, 16, 120);
  const center = props.align !== "start";
  const vars = {
    "--lg-h": `${h}px`,
    "--lg-g": `${clampInt(props.gap, 40, 8, 120)}px`,
    "--lg-hc": cssColor(props.headingColor, D.headingColor),
    "--lg-al": center ? "center" : "start",
    "--lg-jc": center ? "center" : "flex-start",
  } as React.CSSProperties;
  const List = canvas ? "div" : "ul";
  const Item = canvas ? "div" : "li";

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <div className={`bmslogo${props.gray !== "false" ? " is-gray" : ""}`} style={vars}>
        <Txt edit={edit} tag="p" className="bmslogo-heading" value={heading} placeholder="Line above the logos (optional)" onCommit={(v) => onEdit?.("heading", v)} />
        {logos.length === 0 ? (
          <div className="bmslogo-empty">Add logos in the block settings →</div>
        ) : (
          <List className="bmslogo-list" {...(canvas ? {} : { role: "list" })}>
            {logos.map((l, i) => {
              const picture = img(safeSrc(l.src), String(l.alt ?? "").trim(), { sizes: "180px" });
              const href = !canvas && l.url ? safeHref(String(l.url)) : "";
              return (
                <Item key={i} className="bmslogo-item">
                  {href ? <a href={href} {...(linkProps ? linkProps(href) : {})}>{picture}</a> : picture}
                </Item>
              );
            })}
          </List>
        )}
      </div>
    </>
  );
}
