// Pros & Cons — two lists side by side, ticks on one and crosses on the other,
// for reviews and comparisons. Each list is typed one point per line.
// The marks are decoration; the column titles say which list is which, so a
// screen reader hears "Pros, list of four" rather than four ticks.
// Hookless and script-free; shared by the page and the canvas.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import { Txt, clampInt, cssColor, editableCss, linesOf, pick, px, type ViewProps } from "./blockKit";

export const MAX_POINTS_EACH = 20;

export const PROS_CONS_DEFAULTS = {
  prosTitle: "Pros",
  consTitle: "Cons",
  pros: "Easy to set up\nWorks on every device\nFree to start",
  cons: "Needs an account\nNo offline mode",
  titleTag: "h3",
  prosColor: "#15803d",
  consColor: "#b91c1c",
  prosBg: "#f0fdf4",
  consBg: "#fef2f2",
  copyColor: "#1f2937",
  radius: "14",
  padding: "22",
  titleSize: "",
  textSize: "",
} as const;

export const PROS_TITLE_TAGS = ["h2", "h3", "h4", "strong", "p", "div"] as const;

const CSS = [
  `.bmspc{display:grid;gap:16px;margin:2rem 0}`,
  `@media(min-width:640px){.bmspc{grid-template-columns:repeat(2,minmax(0,1fr))}}`,
  `.bmspc-col{min-width:0;padding:var(--pc-p);border-radius:var(--pc-r);background:var(--pc-b);border:1px solid color-mix(in srgb,var(--pc-c) 22%,transparent)}`,
  `.bmspc .bmspc-col .bmspc-title{display:block;margin:0 0 12px;font-size:var(--pc-ts,1.1rem);font-weight:800;line-height:1.3;color:var(--pc-c)}`,
  `.bmspc .bmspc-col .bmspc-list{display:flex;flex-direction:column;gap:9px;margin:0;padding:0;list-style:none}`,
  `.bmspc .bmspc-col .bmspc-list .bmspc-point{position:relative;margin:0;padding:0;padding-inline-start:1.75em;list-style:none;font-size:var(--pc-xs,1rem);line-height:1.5;color:var(--pc-tc)}`,
  `.bmspc .bmspc-col .bmspc-list .bmspc-point::before{position:absolute;inset-inline-start:0;top:0;font-weight:800;color:var(--pc-c)}`,
  `.bmspc .bmspc-col.is-pros .bmspc-point::before{content:"\\2713"}`,
  `.bmspc .bmspc-col.is-cons .bmspc-point::before{content:"\\2715"}`,
  editableCss(".bmspc"),
].join("");

export default function ProsConsView({ props, canvas = false, onEdit }: ViewProps) {
  const D = PROS_CONS_DEFAULTS;
  const edit = !!onEdit;
  const pros = linesOf(props.pros ?? D.pros, MAX_POINTS_EACH);
  const cons = linesOf(props.cons ?? D.cons, MAX_POINTS_EACH);
  if (!edit && pros.length === 0 && cons.length === 0) return null;

  const Title = pick(props.titleTag, PROS_TITLE_TAGS, "h3");
  const tc = cssColor(props.copyColor, D.copyColor);
  const pad = `${clampInt(props.padding, 22, 8, 60)}px`;
  const r = `${clampInt(props.radius, 14, 0, 40)}px`;
  const List = canvas ? "div" : "ul";
  const Item = canvas ? "div" : "li";

  const column = (key: "pros" | "cons", points: string[]) => {
    const good = key === "pros";
    if (!edit && points.length === 0) return null;
    const title = String(props[`${key}Title`] ?? D[`${key}Title`]).trim();
    const vars = {
      "--pc-c": cssColor(props[`${key}Color`], D[`${key}Color`]),
      "--pc-b": cssColor(props[`${key}Bg`], D[`${key}Bg`]),
      "--pc-tc": tc,
      "--pc-p": pad,
      "--pc-r": r,
      ...px("--pc-ts", props.titleSize, 10, 48),
      ...px("--pc-xs", props.textSize, 10, 32),
    } as React.CSSProperties;
    return (
      <div className={`bmspc-col is-${key}`} style={vars}>
        <Txt edit={edit} tag={Title} className="bmspc-title" value={title} placeholder={good ? "Pros" : "Cons"} onCommit={(v) => onEdit?.(`${key}Title`, v)} />
        <List className="bmspc-list" {...(canvas ? {} : { role: "list" })}>
          {points.map((pt, i) => <Item key={i} className="bmspc-point">{pt}</Item>)}
        </List>
      </div>
    );
  };

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <div className="bmspc">
        {column("pros", pros)}
        {column("cons", cons)}
      </div>
    </>
  );
}
