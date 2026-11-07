// Stats Strip — two to six figures in a row, each a big value over a short
// label ("Since 2014", "24/7", "4.9 ★"). The values are plain text the author
// types: nothing counts up, so the numbers are in the HTML and there is no
// script. Hookless; shared by the page and the canvas.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import { Txt, clampInt, cssColor, editableCss, parseList, px, type ViewProps } from "./blockKit";

export interface Stat {
  value?: string;
  label?: string;
}

export const MAX_STATS = 6;

export const STATS_STRIP_DEFAULTS = {
  items: JSON.stringify([
    { value: "10+", label: "Years of experience" },
    { value: "24/7", label: "Available" },
    { value: "100%", label: "Satisfaction promise" },
  ] satisfies Stat[]),
  bg: "#f4f8fb",
  valueColor: "#0b2545",
  labelColor: "#55708c",
  dividerColor: "#c7d5e3",
  dividers: "true",
  valueSize: "",
  padding: "32",
  radius: "16",
  labelSize: "",
} as const;

export const parseStats = (raw: unknown) => parseList<Stat>(raw, MAX_STATS);

const CSS = [
  `.bmsstat{margin:2rem 0;padding:var(--st-p) 20px;border-radius:var(--st-r);background:var(--st-bg)}`,
  `.bmsstat .bmsstat-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:24px 16px;margin:0;padding:0;list-style:none}`,
  `.bmsstat .bmsstat-list .bmsstat-item{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;margin:0;padding:0 8px;list-style:none;text-align:center}`,
  `@media(min-width:640px){.bmsstat.has-dividers .bmsstat-item+.bmsstat-item{border-inline-start:1px solid var(--st-dc)}}`,
  `.bmsstat .bmsstat-item .bmsstat-value{display:block;margin:0;font-weight:800;line-height:1.1;color:var(--st-vc);font-size:var(--st-vs,clamp(1.75rem,3.6vw,2.5rem))}`,
  `.bmsstat .bmsstat-item .bmsstat-label{display:block;margin:0;font-size:var(--st-ls,.95rem);line-height:1.4;color:var(--st-lc)}`,
  editableCss(".bmsstat"),
].join("");

export default function StatsStripView({ props, canvas = false, onEdit }: ViewProps) {
  const D = STATS_STRIP_DEFAULTS;
  const edit = !!onEdit;
  const all = parseStats(props.items ?? D.items);
  const items = edit ? all : all.filter((s) => (s.value ?? "").trim());
  if (items.length === 0) return null;

  const vs = clampInt(props.valueSize, 0, 0, 96);
  const vars = {
    "--st-bg": cssColor(props.bg, D.bg),
    "--st-vc": cssColor(props.valueColor, D.valueColor),
    "--st-lc": cssColor(props.labelColor, D.labelColor),
    "--st-dc": cssColor(props.dividerColor, D.dividerColor),
    "--st-p": `${clampInt(props.padding, 32, 0, 120)}px`,
    "--st-r": `${clampInt(props.radius, 16, 0, 60)}px`,
    ...(vs ? { "--st-vs": `${vs}px` } : {}),
    ...px("--st-ls", props.labelSize, 10, 32),
  } as React.CSSProperties;

  const patch = (i: number, field: keyof Stat) => (value: string) => {
    const next = [...all];
    next[i] = { ...next[i], [field]: value };
    onEdit?.("items", JSON.stringify(next));
  };
  const List = canvas ? "div" : "ul";
  const Item = canvas ? "div" : "li";

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <div className={`bmsstat${props.dividers !== "false" ? " has-dividers" : ""}`} style={vars}>
        <List className="bmsstat-list" {...(canvas ? {} : { role: "list" })}>
          {items.map((s, i) => (
            <Item key={i} className="bmsstat-item">
              <Txt edit={edit} tag="strong" className="bmsstat-value" value={(s.value ?? "").trim()} placeholder="Value" onCommit={patch(i, "value")} />
              <Txt edit={edit} tag="span" className="bmsstat-label" value={(s.label ?? "").trim()} placeholder="Label" onCommit={patch(i, "label")} />
            </Item>
          ))}
        </List>
      </div>
    </>
  );
}
