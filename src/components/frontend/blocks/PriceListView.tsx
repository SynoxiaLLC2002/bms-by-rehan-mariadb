// Price List — a menu of services or items with a price each: the name, an
// optional line of detail, and the price at the end of a dotted line. Not the
// Pricing Table (side-by-side plans): this is the list a salon, a garage or a
// café prints.
// Hookless and script-free; names, details and prices are typed in place on
// the canvas.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import { Txt, clampInt, cssColor, editableCss, parseList, pick, px, type ViewProps } from "./blockKit";

export interface PriceItem {
  name?: string;
  note?: string;
  price?: string;
}

export const MAX_PRICE_ITEMS = 60;

export const PRICE_LIST_DEFAULTS = {
  heading: "Prices",
  items: JSON.stringify([
    { name: "First service", note: "What it includes", price: "$40" },
    { name: "Second service", note: "", price: "$65" },
    { name: "Third service", note: "", price: "From $90" },
  ] satisfies PriceItem[]),
  footnote: "",
  headingTag: "h2",
  leader: "true",
  bg: "#ffffff",
  borderColor: "#e2e8f0",
  headingColor: "#0f172a",
  nameColor: "#0f172a",
  noteColor: "#64748b",
  priceColor: "#0b6fb8",
  radius: "14",
  padding: "24",
  headingSize: "",
  textSize: "",
} as const;

export const PRICE_HEADING_TAGS = ["h2", "h3", "h4", "p", "div"] as const;

export const parsePriceItems = (raw: unknown) => parseList<PriceItem>(raw, MAX_PRICE_ITEMS);

const CSS = [
  `.bmspl{margin:2rem 0;padding:var(--pl-p);border:1px solid var(--pl-bc);border-radius:var(--pl-r);background:var(--pl-bg)}`,
  `.bmspl .bmspl-heading{display:block;margin:0 0 16px;font-weight:800;line-height:1.2;color:var(--pl-hc);font-size:var(--pl-hs,clamp(1.35rem,2.6vw,1.75rem))}`,
  `.bmspl .bmspl-list{display:flex;flex-direction:column;margin:0;padding:0;list-style:none}`,
  `.bmspl .bmspl-list .bmspl-item{margin:0;padding:12px 0;list-style:none;border-top:1px solid var(--pl-bc)}`,
  `.bmspl .bmspl-list .bmspl-item:first-child{border-top:0;padding-top:0}`,
  `.bmspl .bmspl-row{display:flex;align-items:baseline;gap:10px}`,
  `.bmspl .bmspl-item .bmspl-name{min-width:0;font-size:var(--pl-xs,1.05rem);font-weight:700;line-height:1.35;color:var(--pl-nc)}`,
  `.bmspl .bmspl-dots{flex:1;min-width:16px;border-bottom:2px dotted var(--pl-bc);transform:translateY(-4px)}`,
  `.bmspl:not(.has-leader) .bmspl-dots{border-bottom-color:transparent}`,
  `.bmspl .bmspl-item .bmspl-price{flex-shrink:0;font-size:var(--pl-xs,1.05rem);font-weight:800;line-height:1.35;color:var(--pl-pc);white-space:nowrap}`,
  `.bmspl .bmspl-item .bmspl-note{display:block;margin:4px 0 0;font-size:.925rem;line-height:1.5;color:var(--pl-oc);white-space:pre-line}`,
  `.bmspl .bmspl-foot{display:block;margin:14px 0 0;font-size:.875rem;line-height:1.5;color:var(--pl-oc)}`,
  editableCss(".bmspl"),
].join("");

export default function PriceListView({ props, canvas = false, onEdit }: ViewProps) {
  const D = PRICE_LIST_DEFAULTS;
  const edit = !!onEdit;
  const all = parsePriceItems(props.items ?? D.items);
  const items = edit ? all : all.filter((it) => (it.name ?? "").trim());
  if (!edit && items.length === 0) return null;

  const heading = String(props.heading ?? D.heading).trim();
  const footnote = String(props.footnote ?? "").trim();
  const Heading = pick(props.headingTag, PRICE_HEADING_TAGS, "h2");
  const vars = {
    "--pl-bg": cssColor(props.bg, D.bg),
    "--pl-bc": cssColor(props.borderColor, D.borderColor),
    "--pl-hc": cssColor(props.headingColor, D.headingColor),
    "--pl-nc": cssColor(props.nameColor, D.nameColor),
    "--pl-oc": cssColor(props.noteColor, D.noteColor),
    "--pl-pc": cssColor(props.priceColor, D.priceColor),
    "--pl-r": `${clampInt(props.radius, 14, 0, 40)}px`,
    "--pl-p": `${clampInt(props.padding, 24, 0, 60)}px`,
    ...px("--pl-hs", props.headingSize, 12, 72),
    ...px("--pl-xs", props.textSize, 10, 32),
  } as React.CSSProperties;

  const patch = (i: number, field: keyof PriceItem) => (value: string) => {
    const next = [...all];
    next[i] = { ...next[i], [field]: value };
    onEdit?.("items", JSON.stringify(next));
  };
  const List = canvas ? "div" : "ul";
  const Item = canvas ? "div" : "li";

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <section className={`bmspl${props.leader !== "false" ? " has-leader" : ""}`} style={vars}>
        <Txt edit={edit} tag={Heading} className="bmspl-heading" value={heading} placeholder="Heading (optional)" onCommit={(v) => onEdit?.("heading", v)} />
        <List className="bmspl-list" {...(canvas ? {} : { role: "list" })}>
          {items.map((it, i) => (
            <Item key={i} className="bmspl-item">
              <div className="bmspl-row">
                <Txt edit={edit} tag="span" className="bmspl-name" value={(it.name ?? "").trim()} placeholder="Name" onCommit={patch(i, "name")} />
                <span className="bmspl-dots" aria-hidden="true" />
                <Txt edit={edit} tag="span" className="bmspl-price" value={(it.price ?? "").trim()} placeholder="Price" onCommit={patch(i, "price")} />
              </div>
              <Txt edit={edit} tag="span" className="bmspl-note" value={(it.note ?? "").trim()} placeholder="Detail (optional)" multiline onCommit={patch(i, "note")} />
            </Item>
          ))}
        </List>
        <Txt edit={edit} tag="p" className="bmspl-foot" value={footnote} placeholder="Small print (optional): tax, call-out fee…" onCommit={(v) => onEdit?.("footnote", v)} />
      </section>
    </>
  );
}
