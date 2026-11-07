// Steps Grid — 1 to 25 numbered steps in a grid: a number, a title, a line of
// text and an optional link each. Two looks: "joined" cells that share their
// borders (a process at a glance) and separate "cards" with gaps (a set of
// guides). Steps per row for each screen size, the gaps, the padding, the
// HTML tag of every part, the numbering and every colour are block settings.
//
// Hookless, so the published page and the editor canvas draw the same thing.
// The canvas passes `onEditStep`, which makes each title and description
// typeable in place; the page never passes it, so nothing about the published
// markup changes and no handler crosses the server boundary.
//
// Colours and sizes are inline custom properties; the structure is one static
// rule set, and the column counts one small rule per distinct combination —
// hoisted and de-duplicated by BlockStyle.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import { safeHref } from "@/lib/blockStyle";
import { Editable } from "@/components/shared/CanvasEditable";

type Props = Record<string, string | undefined>;

export interface Step {
  title?: string;
  text?: string;
  /** Used when the numbering is "custom". */
  number?: string;
  url?: string;
}

export const MAX_STEPS = 25;

export const STEPS_GRID_DEFAULTS = {
  steps: JSON.stringify([
    { title: "Prepare the file", text: "Review the category and conditions, then collect the documents for your case.", number: "", url: "" },
    { title: "Apply", text: "Apply at the office serving your area and follow its official instructions.", number: "", url: "" },
    { title: "Assessment", text: "Details, documents and circumstances are reviewed before a decision.", number: "", url: "" },
    { title: "Check and follow up", text: "Check your status, then file a complaint or appeal only if needed.", number: "", url: "" },
  ] satisfies Step[]),
  layout: "joined",
  columns: "4",
  columnsTablet: "2",
  columnsMobile: "1",
  /** Space between cards, side by side and row to row (Separate cards). */
  colGap: "20",
  rowGap: "20",
  /** Space inside each step. */
  itemPadding: "24",
  numbering: "padded",
  numberPrefix: "",
  start: "1",
  numberStyle: "badge",
  numberTag: "span",
  titleTag: "h3",
  textTag: "p",
  titleSize: "",
  textSize: "",
  align: "start",
  /** Older name for the card gap; still read when colGap/rowGap are unset. */
  gap: "20",
  radius: "14",
  cardBg: "#ffffff",
  borderColor: "#e2e8f0",
  numberColor: "#c2410c",
  numberBg: "#fff7ed",
  titleColor: "#0f172a",
  textColor: "#475569",
  hoverLift: "true",
} as const;

export const STEP_TITLE_TAGS = ["h2", "h3", "h4", "h5", "h6", "p", "div", "span"] as const;
export const STEP_TEXT_TAGS = ["p", "div", "span"] as const;
export const STEP_NUMBER_TAGS = ["span", "div", "strong"] as const;

export function parseSteps(raw: unknown): Step[] {
  let rows: unknown = [];
  try {
    rows = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
  } catch {
    rows = [];
  }
  return (Array.isArray(rows) ? rows : [])
    .filter((r): r is Step => !!r && typeof r === "object")
    .slice(0, MAX_STEPS);
}

// Two classes on every rule: editor and theme styles for lists, headings and
// paragraphs (`li { padding: 0 }`, `h3 { color: … }`) otherwise outrank a
// single class and the block's own settings do nothing.
const CSS = [
  `.bmssg{display:grid;margin:1.5rem 0;padding:0;list-style:none;text-align:var(--sg-al)}`,
  `.bmssg.is-joined{gap:0;border:1px solid var(--sg-bd);border-radius:var(--sg-r);overflow:hidden;background:var(--sg-bg)}`,
  `.bmssg.is-cards{column-gap:var(--sg-cg);row-gap:var(--sg-rg)}`,
  `.bmssg .bmssg-item{position:relative;display:flex;flex-direction:column;align-items:var(--sg-ai);gap:.6rem;margin:0;padding:var(--sg-pad);background:var(--sg-bg);min-width:0;list-style:none}`,
  `.bmssg .bmssg-item::marker{content:none}`,
  `.bmssg.is-joined .bmssg-item{box-shadow:1px 1px 0 0 var(--sg-bd)}`,
  `.bmssg.is-cards .bmssg-item{border:1px solid var(--sg-bd);border-radius:var(--sg-r);transition:transform .18s ease,box-shadow .18s ease}`,
  `.bmssg.is-cards.is-lift .bmssg-item:hover{transform:translateY(-3px);box-shadow:0 12px 28px -16px rgba(15,23,42,.35)}`,
  `.bmssg .bmssg-num{margin:0;font-weight:800;font-size:.85rem;line-height:1;letter-spacing:.02em;color:var(--sg-nc);font-variant-numeric:tabular-nums}`,
  `.bmssg .bmssg-num.is-badge{display:inline-flex;align-items:center;justify-content:center;min-width:2rem;padding:.4rem .5rem;border-radius:.4rem;background:var(--sg-nb)}`,
  `.bmssg .bmssg-item .bmssg-title{display:block;margin:.2rem 0 0;font-weight:800;line-height:1.3;color:var(--sg-tc);font-size:var(--sg-ts,1.15rem)}`,
  `.bmssg .bmssg-title a{color:inherit;text-decoration:none}`,
  `.bmssg .bmssg-title a::after{content:"";position:absolute;inset:0}`,
  `.bmssg .bmssg-title a:hover{text-decoration:underline}`,
  `.bmssg .bmssg-item .bmssg-text{display:block;margin:0;font-size:var(--sg-xs,.95rem);line-height:1.6;color:var(--sg-xc);white-space:pre-line}`,
  // Canvas only: typing in place.
  `.bmssg [contenteditable]{outline:none;min-width:2ch}`,
  `.bmssg [contenteditable]:focus{outline:2px solid var(--color-primary,#0ea5e9);outline-offset:2px;border-radius:2px}`,
  `.bmssg [contenteditable]:empty::before{content:attr(data-ph);opacity:.4}`,
].join("");

const clampInt = (v: string | undefined, def: number, min: number, max: number) => {
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
const pick = <T extends string>(v: string | undefined, allowed: readonly T[], def: T): T =>
  (allowed as readonly string[]).includes(String(v)) ? (v as T) : def;

/** The columns rule for one combination, e.g. 4 / 2 / 1. */
function columnsCss(d: number, t: number, m: number): string {
  const cls = `.bmssg.c-${d}-${t}-${m}`;
  return `${cls}{grid-template-columns:repeat(${m},minmax(0,1fr))}` +
    `@media(min-width:640px){${cls}{grid-template-columns:repeat(${t},minmax(0,1fr))}}` +
    `@media(min-width:1024px){${cls}{grid-template-columns:repeat(${d},minmax(0,1fr))}}`;
}

export default function StepsGridView({
  props,
  canvas = false,
  onEditStep,
  linkProps,
}: {
  props: Props;
  canvas?: boolean;
  /** The site's external-link policy (nofollow / new tab) for outside links — the page passes it. */
  linkProps?: (href: string) => { target?: string; rel?: string };

  /** Canvas only: write one field of one step. */
  onEditStep?: (index: number, field: "title" | "text", value: string) => void;
}) {
  const D = STEPS_GRID_DEFAULTS;
  const all = parseSteps(props.steps ?? D.steps);
  // The page skips empty steps; the canvas keeps them, so a new one can be typed into.
  const steps = onEditStep ? all : all.filter((s) => (s.title || s.text || "").trim());
  if (steps.length === 0) {
    return canvas ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">Steps Grid — add steps in the block settings.</div> : null;
  }

  const cols = clampInt(props.columns, 4, 1, 6);
  const colsT = clampInt(props.columnsTablet, 2, 1, 6);
  const colsM = clampInt(props.columnsMobile, 1, 1, 4);
  const layout = props.layout === "cards" ? "cards" : "joined";
  const numbering = pick(props.numbering, ["padded", "plain", "custom", "none"] as const, "padded");
  const start = clampInt(props.start, 1, 0, 999);
  const prefix = String(props.numberPrefix ?? "");
  const TitleTag = pick(props.titleTag, STEP_TITLE_TAGS, "h3");
  const TextTag = pick(props.textTag, STEP_TEXT_TAGS, "p");
  const NumberTag = pick(props.numberTag, STEP_NUMBER_TAGS, "span");
  const center = props.align === "center";
  const titleSize = clampInt(props.titleSize, 0, 0, 80);
  const textSize = clampInt(props.textSize, 0, 0, 40);
  const legacyGap = clampInt(props.gap, 20, 0, 120);

  const label = (s: Step, i: number) => {
    if (numbering === "none") return "";
    if (numbering === "custom") return String(s.number ?? "").trim();
    const n = start + i;
    return prefix + (numbering === "padded" ? String(n).padStart(2, "0") : String(n));
  };

  const vars = {
    "--sg-bd": color(props.borderColor, D.borderColor),
    "--sg-bg": color(props.cardBg, D.cardBg),
    "--sg-nc": color(props.numberColor, D.numberColor),
    "--sg-nb": color(props.numberBg, D.numberBg),
    "--sg-tc": color(props.titleColor, D.titleColor),
    "--sg-xc": color(props.textColor, D.textColor),
    "--sg-r": `${clampInt(props.radius, 14, 0, 40)}px`,
    "--sg-cg": `${clampInt(props.colGap, legacyGap, 0, 120)}px`,
    "--sg-rg": `${clampInt(props.rowGap, legacyGap, 0, 120)}px`,
    "--sg-pad": `${clampInt(props.itemPadding, 24, 0, 80)}px`,
    "--sg-al": center ? "center" : "start",
    "--sg-ai": center ? "center" : "flex-start",
    ...(titleSize ? { "--sg-ts": `${titleSize}px` } : {}),
    ...(textSize ? { "--sg-xs": `${textSize}px` } : {}),
  } as React.CSSProperties;

  const lift = layout === "cards" && (props.hoverLift ?? D.hoverLift) === "true";
  // A real list on the page (a screen reader announces "list, 4 items"); plain
  // boxes on the canvas, where the editor's own list styling would strip the
  // padding and borders from <ol>/<li>.
  const List = canvas ? "div" : "ol";
  const Item = canvas ? "div" : "li";

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <BlockStyle css={columnsCss(cols, colsT, colsM)} hoist={!canvas} />
      <List
        className={`bmssg is-${layout} c-${cols}-${colsT}-${colsM}${lift ? " is-lift" : ""}`}
        style={vars}
        // With its numbers hidden by CSS, Safari's VoiceOver drops the list role.
        {...(canvas ? {} : { role: "list" })}
      >
        {steps.map((s, i) => {
          const num = label(s, i);
          const href = s.url ? safeHref(String(s.url)) : "";
          const title = (s.title ?? "").trim();
          const text = (s.text ?? "").trim();
          return (
            <Item key={i} className="bmssg-item">
              {num && <NumberTag className={`bmssg-num${props.numberStyle === "text" ? "" : " is-badge"}`}>{num}</NumberTag>}
              {onEditStep ? (
                <>
                  <Editable className="bmssg-title" tag={TitleTag} value={title} placeholder="Step title" onCommit={(v) => onEditStep(i, "title", v)} />
                  <Editable className="bmssg-text" tag={TextTag} value={text} placeholder="Describe this step" multiline onCommit={(v) => onEditStep(i, "text", v)} />
                </>
              ) : (
                <>
                  {title && (
                    <TitleTag className="bmssg-title">
                      {href && !canvas ? <a href={href} {...(linkProps ? linkProps(href) : {})}>{title}</a> : title}
                    </TitleTag>
                  )}
                  {text && <TextTag className="bmssg-text">{text}</TextTag>}
                </>
              )}
            </Item>
          );
        })}
      </List>
    </>
  );
}
