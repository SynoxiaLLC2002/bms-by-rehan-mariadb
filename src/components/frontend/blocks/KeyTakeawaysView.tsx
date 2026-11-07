// Key Takeaways — the article in a few lines, in a box near the top: a title
// and a short list, typed one point per line. What a reader in a hurry (and a
// search engine building a summary) reads first.
// Hookless and script-free; shared by the page and the canvas.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import { Txt, clampInt, cssColor, editableCss, linesOf, pick, px, type ViewProps } from "./blockKit";

export const MAX_TAKEAWAYS = 12;

export const KEY_TAKEAWAYS_DEFAULTS = {
  title: "Key takeaways",
  points: "The first thing a reader should remember\nThe second thing\nThe third thing",
  icon: "💡",
  marker: "tick",
  titleTag: "h2",
  bg: "#f4f8fb",
  accent: "#0b6fb8",
  titleColor: "#0f172a",
  copyColor: "#1f2937",
  radius: "14",
  padding: "24",
  bar: "true",
  titleSize: "",
  textSize: "",
} as const;

export const TAKEAWAY_TITLE_TAGS = ["h2", "h3", "h4", "strong", "p", "div"] as const;
export const TAKEAWAY_MARKERS = ["tick", "dot", "number"] as const;

const CSS = [
  `.bmskt{margin:2rem 0;padding:var(--kt-p);border-radius:var(--kt-r);background:var(--kt-bg)}`,
  `.bmskt.has-bar{border-inline-start:5px solid var(--kt-ac)}`,
  `.bmskt-top{display:flex;align-items:center;gap:10px;margin:0 0 12px}`,
  `.bmskt .bmskt-icon{font-size:1.3rem;line-height:1}`,
  `.bmskt .bmskt-top .bmskt-title{display:block;margin:0;font-weight:800;line-height:1.25;color:var(--kt-tc);font-size:var(--kt-ts,1.2rem)}`,
  `.bmskt .bmskt-list{display:flex;flex-direction:column;gap:9px;margin:0;padding:0;list-style:none;counter-reset:bmskt}`,
  `.bmskt .bmskt-list .bmskt-point{position:relative;margin:0;padding:0;padding-inline-start:1.9em;list-style:none;font-size:var(--kt-xs,1rem);line-height:1.55;color:var(--kt-xc);counter-increment:bmskt}`,
  `.bmskt .bmskt-list .bmskt-point::before{position:absolute;inset-inline-start:0;top:0;font-weight:800;color:var(--kt-ac)}`,
  `.bmskt.m-tick .bmskt-point::before{content:"\\2713"}`,
  `.bmskt.m-dot .bmskt-point::before{content:"\\2022";font-size:1.3em;line-height:1.15}`,
  `.bmskt.m-number .bmskt-point::before{content:counter(bmskt) "."}`,
  editableCss(".bmskt"),
].join("");

export default function KeyTakeawaysView({ props, canvas = false, onEdit }: ViewProps) {
  const D = KEY_TAKEAWAYS_DEFAULTS;
  const edit = !!onEdit;
  const points = linesOf(props.points ?? D.points, MAX_TAKEAWAYS);
  if (!edit && points.length === 0) return null;

  const title = String(props.title ?? D.title).trim();
  const icon = String(props.icon ?? D.icon).trim();
  const Title = pick(props.titleTag, TAKEAWAY_TITLE_TAGS, "h2");
  const marker = pick(props.marker, TAKEAWAY_MARKERS, "tick");
  const vars = {
    "--kt-bg": cssColor(props.bg, D.bg),
    "--kt-ac": cssColor(props.accent, D.accent),
    "--kt-tc": cssColor(props.titleColor, D.titleColor),
    "--kt-xc": cssColor(props.copyColor, D.copyColor),
    "--kt-r": `${clampInt(props.radius, 14, 0, 40)}px`,
    "--kt-p": `${clampInt(props.padding, 24, 8, 60)}px`,
    ...px("--kt-ts", props.titleSize, 10, 48),
    ...px("--kt-xs", props.textSize, 10, 32),
  } as React.CSSProperties;
  // A numbered list is an <ol>: the order is part of what it says.
  const List = canvas ? "div" : marker === "number" ? "ol" : "ul";
  const Item = canvas ? "div" : "li";

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <section className={`bmskt m-${marker}${props.bar !== "false" ? " has-bar" : ""}`} style={vars}>
        {(edit || title) && (
          <div className="bmskt-top">
            {icon && <span className="bmskt-icon" aria-hidden="true">{icon}</span>}
            <Txt edit={edit} tag={Title} className="bmskt-title" value={title} placeholder="Key takeaways" onCommit={(v) => onEdit?.("title", v)} />
          </div>
        )}
        <List className="bmskt-list" {...(canvas ? {} : { role: "list" })}>
          {points.map((pt, i) => <Item key={i} className="bmskt-point">{pt}</Item>)}
        </List>
      </section>
    </>
  );
}
