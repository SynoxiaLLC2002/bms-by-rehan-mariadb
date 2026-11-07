// Fact Sheet — the details of a thing as label and value pairs: a product's
// specifications, a property's particulars, a company's key facts. Typed one
// per line as "Label | Value".
//
// A <dl>: the element made for name-and-value pairs, which is how search
// engines and screen readers tell "Weight: 2 kg" from two loose words.
// One column or two. Hookless and script-free.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import { Txt, clampInt, cssColor, editableCss, pick, px, type ViewProps } from "./blockKit";

export const MAX_FACTS = 60;

export const FACT_SHEET_DEFAULTS = {
  heading: "Details",
  rows: "Size | 24 MB\nVersion | 2.1.0\nUpdated | October 2026\nPrice | Free",
  columns: "1",
  headingTag: "h2",
  stripes: "true",
  bg: "#ffffff",
  stripeBg: "#f4f8fb",
  borderColor: "#e2e8f0",
  headingColor: "#0f172a",
  labelColor: "#475569",
  valueColor: "#0f172a",
  radius: "12",
  headingSize: "",
  textSize: "",
} as const;

export const FACT_HEADING_TAGS = ["h2", "h3", "h4", "p", "div"] as const;

/** "Label | Value" lines as pairs; a line without a bar is a label with no value and is dropped. */
export function parseFacts(raw: string | undefined): { label: string; value: string }[] {
  return String(raw ?? "")
    .split(/\r?\n/)
    .map((line) => {
      const at = line.indexOf("|");
      return at < 0 ? { label: line.trim(), value: "" } : { label: line.slice(0, at).trim(), value: line.slice(at + 1).trim() };
    })
    .filter((f) => f.label && f.value)
    .slice(0, MAX_FACTS);
}

const CSS = [
  `.bmsfs{margin:2rem 0}`,
  `.bmsfs .bmsfs-heading{display:block;margin:0 0 14px;font-weight:800;line-height:1.2;color:var(--fs-hc);font-size:var(--fs-hs,clamp(1.35rem,2.6vw,1.75rem))}`,
  `.bmsfs .bmsfs-list{display:grid;margin:0;padding:0;overflow:hidden;border:1px solid var(--fs-bc);border-radius:var(--fs-r);background:var(--fs-bg)}`,
  `@media(min-width:768px){.bmsfs.is-2 .bmsfs-list{grid-template-columns:repeat(2,minmax(0,1fr))}}`,
  `.bmsfs .bmsfs-list .bmsfs-row{display:flex;align-items:baseline;justify-content:space-between;gap:16px;min-width:0;margin:0;padding:11px 16px;border-bottom:1px solid var(--fs-bc);font-size:var(--fs-xs,.975rem);line-height:1.45}`,
  `.bmsfs.is-1 .bmsfs-list .bmsfs-row:last-child{border-bottom:0}`,
  `.bmsfs.is-1.has-stripes .bmsfs-row:nth-child(even){background:var(--fs-sb)}`,
  `.bmsfs .bmsfs-row .bmsfs-label{margin:0;padding:0;font-weight:500;color:var(--fs-lc)}`,
  `.bmsfs .bmsfs-row .bmsfs-value{margin:0;padding:0;font-weight:700;text-align:end;color:var(--fs-vc);overflow-wrap:anywhere}`,
  editableCss(".bmsfs"),
].join("");

export default function FactSheetView({ props, canvas = false, onEdit }: ViewProps) {
  const D = FACT_SHEET_DEFAULTS;
  const edit = !!onEdit;
  const facts = parseFacts(props.rows ?? D.rows);
  if (!edit && facts.length === 0) return null;

  const heading = String(props.heading ?? D.heading).trim();
  const Heading = pick(props.headingTag, FACT_HEADING_TAGS, "h2");
  const two = props.columns === "2";
  const vars = {
    "--fs-bg": cssColor(props.bg, D.bg),
    "--fs-sb": cssColor(props.stripeBg, D.stripeBg),
    "--fs-bc": cssColor(props.borderColor, D.borderColor),
    "--fs-hc": cssColor(props.headingColor, D.headingColor),
    "--fs-lc": cssColor(props.labelColor, D.labelColor),
    "--fs-vc": cssColor(props.valueColor, D.valueColor),
    "--fs-r": `${clampInt(props.radius, 12, 0, 40)}px`,
    ...px("--fs-hs", props.headingSize, 12, 72),
    ...px("--fs-xs", props.textSize, 10, 32),
  } as React.CSSProperties;

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <section className={`bmsfs ${two ? "is-2" : "is-1"}${props.stripes !== "false" ? " has-stripes" : ""}`} style={vars}>
        <Txt edit={edit} tag={Heading} className="bmsfs-heading" value={heading} placeholder="Heading (optional)" onCommit={(v) => onEdit?.("heading", v)} />
        {/* Each pair in a <div>, the one wrapper a <dl> allows around a dt and its dd. */}
        <dl className="bmsfs-list">
          {facts.map((f, i) => (
            <div key={i} className="bmsfs-row">
              <dt className="bmsfs-label">{f.label}</dt>
              <dd className="bmsfs-value">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
