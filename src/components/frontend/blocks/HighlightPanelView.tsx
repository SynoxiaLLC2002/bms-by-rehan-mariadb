// Highlight Panel — a coloured panel with a large heading, an optional intro
// line, and 1–12 points in columns (a title and a line of text each, with an
// optional icon and link). For "before you believe X, check these three
// things" sections. Columns per screen size, gaps, padding, the HTML tag of
// every part and every colour are block settings.
//
// Hookless, so the published page and the editor canvas draw the same thing.
// The canvas passes `onEdit`, which makes the heading, the intro and each
// point's title and text typeable in place; the page never passes it.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import Icon from "@/components/shared/Icon";
import { safeHref } from "@/lib/blockStyle";
import { Editable } from "@/components/shared/CanvasEditable";

type Props = Record<string, string | undefined>;

export interface PanelPoint {
  title?: string;
  text?: string;
  /** An emoji or symbol shown above the title. */
  icon?: string;
  url?: string;
  /** The link's words for this point; empty uses the block's "Link text". */
  linkText?: string;
}

export const MAX_POINTS = 12;

export const HIGHLIGHT_PANEL_DEFAULTS = {
  heading: "Before believing a payment or increase story",
  intro: "",
  points: JSON.stringify([
    { title: "Find the source", text: "The story should clearly name who made the decision or statement.", icon: "", url: "" },
    { title: "Check the date", text: "An old story may be reposted as new. Check both the publication date and the decision date.", icon: "", url: "" },
    { title: "Protect your details", text: "Status checks belong on the official portal. Never send your ID number to a news site or social page.", icon: "", url: "" },
  ] satisfies PanelPoint[]),
  columns: "3",
  columnsTablet: "2",
  columnsMobile: "1",
  colGap: "32",
  rowGap: "28",
  padding: "48",
  paddingMobile: "24",
  radius: "24",
  align: "start",
  headingTag: "h2",
  introTag: "p",
  titleTag: "strong",
  textTag: "p",
  headingSize: "",
  titleSize: "",
  textSize: "",
  bg: "#0b3d2e",
  headingColor: "#ffffff",
  introColor: "#d1e7df",
  titleColor: "#ffffff",
  textColor: "#d1e7df",
  iconColor: "#fbbf24",
  linkColor: "#fbbf24",
  divider: "false",
  linkLabel: "Learn more",
  dividerColor: "#ffffff33",
} as const;

export const PANEL_HEADING_TAGS = ["h2", "h3", "h4", "p", "div"] as const;
export const PANEL_INTRO_TAGS = ["p", "div"] as const;
export const PANEL_TITLE_TAGS = ["strong", "h3", "h4", "h5", "p", "div", "span"] as const;
export const PANEL_TEXT_TAGS = ["p", "div", "span"] as const;

export function parsePoints(raw: unknown): PanelPoint[] {
  let rows: unknown = [];
  try {
    rows = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
  } catch {
    rows = [];
  }
  return (Array.isArray(rows) ? rows : [])
    .filter((r): r is PanelPoint => !!r && typeof r === "object")
    .slice(0, MAX_POINTS);
}

// Two or three classes on every text rule: theme and editor styles for
// headings and paragraphs otherwise outrank a single class, and the colour
// settings do nothing (the title-colour bug of the Iframe block).
const CSS = [
  `.bmshp{margin:2rem 0;padding:var(--hp-pad);border-radius:var(--hp-r);background:var(--hp-bg);text-align:var(--hp-al)}`,
  `.bmshp .bmshp-heading{display:block;margin:0;font-weight:800;line-height:1.15;color:var(--hp-hc);font-size:var(--hp-hs,clamp(1.6rem,3.4vw,2.6rem))}`,
  `.bmshp .bmshp-intro{display:block;margin:.9rem 0 0;font-size:1.05rem;line-height:1.6;color:var(--hp-ic);white-space:pre-line}`,
  `.bmshp .bmshp-points{display:grid;column-gap:var(--hp-cg);row-gap:var(--hp-rg);margin:2.25rem 0 0;padding:0;list-style:none}`,
  `.bmshp .bmshp-point{position:relative;display:flex;flex-direction:column;align-items:var(--hp-ai);gap:.45rem;margin:0;min-width:0;list-style:none}`,
  `.bmshp.has-divider .bmshp-point{padding-top:1rem;border-top:1px solid var(--hp-dc)}`,
  `.bmshp .bmshp-icon{font-size:1.6rem;line-height:1;color:var(--hp-icon)}`,
  `.bmshp .bmshp-point .bmshp-title{display:block;margin:0;font-weight:800;line-height:1.3;color:var(--hp-tc);font-size:var(--hp-ts,1.15rem)}`,
  `.bmshp .bmshp-point .bmshp-text{display:block;margin:0;line-height:1.6;color:var(--hp-xc);font-size:var(--hp-xs,.975rem);white-space:pre-line}`,
  `.bmshp .bmshp-link{margin-top:.25rem;font-weight:700;font-size:.9rem;color:var(--hp-lc);text-decoration:underline;text-underline-offset:3px}`,
  `.bmshp .bmshp-link:hover{opacity:.85;color:var(--hp-lc)}`,
  `@media(max-width:639px){.bmshp{padding:var(--hp-padm)}}`,
  // Canvas only: typing in place.
  `.bmshp [contenteditable]{outline:none;min-width:2ch}`,
  `.bmshp [contenteditable]:focus{outline:2px dashed currentColor;outline-offset:3px;border-radius:2px}`,
  `.bmshp [contenteditable]:empty::before{content:attr(data-ph);opacity:.5}`,
].join("");

const clampInt = (v: string | undefined, def: number, min: number, max: number) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
};
/** A colour setting, or the default. Colour syntax only — no url(), no ; or braces. */
const color = (v: string | undefined, def: string) => {
  const s = String(v ?? "").trim();
  // "default" is what the editor hands over for an unset prop named textColor (BlockNote owns that name).
  if (!s || s === "default" || s.length > 80) return def;
  if (/url\s*\(|expression|[;{}<>"'\\]/i.test(s)) return def;
  return /^[#a-z0-9(),.%\s/+-]+$/i.test(s) ? s : def;
};
const pick = <T extends string>(v: string | undefined, allowed: readonly T[], def: T): T =>
  (allowed as readonly string[]).includes(String(v)) ? (v as T) : def;

function columnsCss(d: number, t: number, m: number): string {
  const cls = `.bmshp .bmshp-points.c-${d}-${t}-${m}`;
  return `${cls}{grid-template-columns:repeat(${m},minmax(0,1fr))}` +
    `@media(min-width:640px){${cls}{grid-template-columns:repeat(${t},minmax(0,1fr))}}` +
    `@media(min-width:1024px){${cls}{grid-template-columns:repeat(${d},minmax(0,1fr))}}`;
}

export default function HighlightPanelView({
  props,
  canvas = false,
  onEdit,
  linkProps,
}: {
  props: Props;
  canvas?: boolean;
  /** The site's external-link policy (nofollow / new tab) for outside links — the page passes it. */
  linkProps?: (href: string) => { target?: string; rel?: string };

  /** Canvas only: write the heading/intro (by key) or one field of one point. */
  onEdit?: (change: { key: "heading" | "intro"; value: string } | { index: number; field: "title" | "text"; value: string }) => void;
}) {
  const D = HIGHLIGHT_PANEL_DEFAULTS;
  const edit = !!onEdit;
  const all = parsePoints(props.points ?? D.points);
  const points = edit ? all : all.filter((p) => (p.title || p.text || "").trim());
  const heading = String(props.heading ?? D.heading).trim();
  const intro = String(props.intro ?? D.intro).trim();
  if (!edit && !heading && !intro && points.length === 0) return null;

  const cols = clampInt(props.columns, 3, 1, 6);
  const colsT = clampInt(props.columnsTablet, 2, 1, 4);
  const colsM = clampInt(props.columnsMobile, 1, 1, 2);
  const HeadingTag = pick(props.headingTag, PANEL_HEADING_TAGS, "h2");
  const IntroTag = pick(props.introTag, PANEL_INTRO_TAGS, "p");
  const TitleTag = pick(props.titleTag, PANEL_TITLE_TAGS, "strong");
  const TextTag = pick(props.textTag, PANEL_TEXT_TAGS, "p");
  const center = props.align === "center";
  const hs = clampInt(props.headingSize, 0, 0, 96);
  const ts = clampInt(props.titleSize, 0, 0, 60);
  const xs = clampInt(props.textSize, 0, 0, 40);

  const vars = {
    "--hp-bg": color(props.bg, D.bg),
    "--hp-hc": color(props.headingColor, D.headingColor),
    "--hp-ic": color(props.introColor, D.introColor),
    "--hp-tc": color(props.titleColor, D.titleColor),
    "--hp-xc": color(props.textColor, D.textColor),
    "--hp-icon": color(props.iconColor, D.iconColor),
    "--hp-lc": color(props.linkColor, D.linkColor),
    "--hp-dc": color(props.dividerColor, D.dividerColor),
    "--hp-pad": `${clampInt(props.padding, 48, 0, 160)}px`,
    "--hp-padm": `${clampInt(props.paddingMobile, 24, 0, 120)}px`,
    "--hp-r": `${clampInt(props.radius, 24, 0, 60)}px`,
    "--hp-cg": `${clampInt(props.colGap, 32, 0, 120)}px`,
    "--hp-rg": `${clampInt(props.rowGap, 28, 0, 120)}px`,
    "--hp-al": center ? "center" : "start",
    "--hp-ai": center ? "center" : "flex-start",
    ...(hs ? { "--hp-hs": `${hs}px` } : {}),
    ...(ts ? { "--hp-ts": `${ts}px` } : {}),
    ...(xs ? { "--hp-xs": `${xs}px` } : {}),
  } as React.CSSProperties;

  const List = canvas ? "div" : "ul";
  const Item = canvas ? "div" : "li";

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <BlockStyle css={columnsCss(cols, colsT, colsM)} hoist={!canvas} />
      <section className={`bmshp${props.divider === "true" ? " has-divider" : ""}`} style={vars}>
        {edit ? (
          <>
            <Editable className="bmshp-heading" tag={HeadingTag} value={heading} placeholder="Heading" onCommit={(v) => v !== heading && onEdit!({ key: "heading", value: v })} />
            <Editable className="bmshp-intro" tag={IntroTag} value={intro} placeholder="Intro line (optional)" multiline onCommit={(v) => v !== intro && onEdit!({ key: "intro", value: v })} />
          </>
        ) : (
          <>
            {heading && <HeadingTag className="bmshp-heading">{heading}</HeadingTag>}
            {intro && <IntroTag className="bmshp-intro">{intro}</IntroTag>}
          </>
        )}
        {points.length > 0 && (
          // role="list": with its bullets hidden by CSS, Safari's VoiceOver
          // stops announcing a <ul> as a list at all.
          <List className={`bmshp-points c-${cols}-${colsT}-${colsM}`} {...(canvas ? {} : { role: "list" })}>
            {points.map((pt, i) => {
              const title = (pt.title ?? "").trim();
              const text = (pt.text ?? "").trim();
              const icon = (pt.icon ?? "").trim();
              const href = pt.url ? safeHref(String(pt.url)) : "";
              return (
                <Item key={i} className="bmshp-point">
                  {icon && <span className="bmshp-icon" aria-hidden="true"><Icon value={icon} /></span>}
                  {edit ? (
                    <>
                      <Editable className="bmshp-title" tag={TitleTag} value={title} placeholder="Point title" onCommit={(v) => v !== title && onEdit!({ index: i, field: "title", value: v })} />
                      <Editable className="bmshp-text" tag={TextTag} value={text} placeholder="Point text" multiline onCommit={(v) => v !== text && onEdit!({ index: i, field: "text", value: v })} />
                    </>
                  ) : (
                    <>
                      {title && <TitleTag className="bmshp-title">{title}</TitleTag>}
                      {text && <TextTag className="bmshp-text">{text}</TextTag>}
                    </>
                  )}
                  {href && !canvas && (() => {
                    const words = (pt.linkText ?? "").trim() || String(props.linkLabel || D.linkLabel);
                    // Several identical "Learn more" links read as the same
                    // link to screen readers and search audits; the accessible
                    // name carries the point's title.
                    return (
                      <a className="bmshp-link" href={href} {...(linkProps ? linkProps(href) : {})} {...(title && !words.includes(title) ? { "aria-label": `${words}: ${title}` } : {})}>
                        {words}
                      </a>
                    );
                  })()}
                </Item>
              );
            })}
          </List>
        )}
      </section>
    </>
  );
}
