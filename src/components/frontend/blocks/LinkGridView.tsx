// Link Grid — many links in columns under a heading: the towns a business
// serves, a list of services, a set of guides. Typed one per line as
// "Name | address"; a line with no address is shown as plain text.
//
// A real list of real links, so each one passes its page's name to search
// engines; the heading above says what the list is.
// Hookless and script-free; shared by the page and the canvas.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import Icon from "@/components/shared/Icon";
import { safeHref } from "@/lib/blockStyle";
import { Txt, clampInt, cssColor, editableCss, pick, px, type ViewProps } from "./blockKit";

export const MAX_LINKS = 150;

export const LINK_GRID_DEFAULTS = {
  heading: "Areas we serve",
  intro: "",
  links: "First town | /first-town\nSecond town | /second-town\nThird town | /third-town",
  icon: "📍",
  look: "plain",
  columns: "4",
  columnsTablet: "3",
  columnsMobile: "2",
  gap: "12",
  align: "start",
  headingTag: "h2",
  headingColor: "#0f172a",
  introColor: "#475569",
  linkColor: "#0b6fb8",
  copyColor: "#334155",
  itemBg: "#f4f8fb",
  borderColor: "#e2e8f0",
  radius: "10",
  headingSize: "",
  textSize: "",
} as const;

export const LINK_GRID_LOOKS = ["plain", "pills", "boxes"] as const;
export const LINK_GRID_HEADING_TAGS = ["h2", "h3", "h4", "p", "div"] as const;

/** "Name | address" lines as pairs; the address is optional. */
export function parseLinkLines(raw: string | undefined): { label: string; url: string }[] {
  return String(raw ?? "")
    .split(/\r?\n/)
    .map((line) => {
      const at = line.lastIndexOf("|");
      return at < 0 ? { label: line.trim(), url: "" } : { label: line.slice(0, at).trim(), url: line.slice(at + 1).trim() };
    })
    .filter((l) => l.label)
    .slice(0, MAX_LINKS);
}

const CSS = [
  `.bmslg{margin:2rem 0}`,
  `.bmslg-head{display:flex;flex-direction:column;gap:10px;margin:0 0 22px;text-align:var(--lk-al)}`,
  `.bmslg .bmslg-head .bmslg-heading{display:block;margin:0;font-weight:800;line-height:1.2;color:var(--lk-hc);font-size:var(--lk-hs,clamp(1.5rem,3vw,2.1rem))}`,
  `.bmslg .bmslg-head .bmslg-intro{display:block;margin:0;font-size:1.05rem;line-height:1.6;color:var(--lk-ic);white-space:pre-line}`,
  `.bmslg .bmslg-list{display:grid;gap:var(--lk-g);margin:0;padding:0;list-style:none}`,
  `.bmslg .bmslg-list .bmslg-item{display:flex;min-width:0;margin:0;padding:0;list-style:none}`,
  `.bmslg .bmslg-list .bmslg-link{display:flex;flex:1;align-items:center;gap:8px;min-width:0;min-height:44px;font-size:var(--lk-xs,1rem);font-weight:600;line-height:1.35;color:var(--lk-tc);text-decoration:none;overflow-wrap:anywhere}`,
  `.bmslg .bmslg-list a.bmslg-link{color:var(--lk-lc)}`,
  `.bmslg .bmslg-list a.bmslg-link:hover{text-decoration:underline;text-underline-offset:3px}`,
  `.bmslg .bmslg-list a.bmslg-link:focus-visible{outline:3px solid var(--lk-lc);outline-offset:2px;border-radius:var(--lk-r)}`,
  `.bmslg.is-pills .bmslg-link,.bmslg.is-boxes .bmslg-link{padding:8px 14px;border:1px solid var(--lk-bc);background:var(--lk-ib)}`,
  `.bmslg.is-pills .bmslg-link{border-radius:999px}`,
  `.bmslg.is-boxes .bmslg-link{border-radius:var(--lk-r)}`,
  `.bmslg .bmslg-icon{flex-shrink:0;line-height:1}`,
  editableCss(".bmslg"),
].join("");

function columnsCss(d: number, t: number, m: number): string {
  const cls = `.bmslg .bmslg-list.c-${d}-${t}-${m}`;
  return `${cls}{grid-template-columns:repeat(${m},minmax(0,1fr))}` +
    `@media(min-width:640px){${cls}{grid-template-columns:repeat(${t},minmax(0,1fr))}}` +
    `@media(min-width:1024px){${cls}{grid-template-columns:repeat(${d},minmax(0,1fr))}}`;
}

export default function LinkGridView({ props, canvas = false, onEdit, linkProps }: ViewProps) {
  const D = LINK_GRID_DEFAULTS;
  const edit = !!onEdit;
  const links = parseLinkLines(props.links ?? D.links);
  const heading = String(props.heading ?? D.heading).trim();
  const intro = String(props.intro ?? D.intro).trim();
  if (!edit && links.length === 0) return null;

  const cols = clampInt(props.columns, 4, 1, 6);
  const colsT = clampInt(props.columnsTablet, 3, 1, 4);
  const colsM = clampInt(props.columnsMobile, 2, 1, 3);
  const Heading = pick(props.headingTag, LINK_GRID_HEADING_TAGS, "h2");
  const look = pick(props.look, LINK_GRID_LOOKS, "plain");
  const icon = String(props.icon ?? D.icon).trim();
  const vars = {
    "--lk-g": `${clampInt(props.gap, 12, 0, 60)}px`,
    "--lk-r": `${clampInt(props.radius, 10, 0, 40)}px`,
    "--lk-hc": cssColor(props.headingColor, D.headingColor),
    "--lk-ic": cssColor(props.introColor, D.introColor),
    "--lk-lc": cssColor(props.linkColor, D.linkColor),
    "--lk-tc": cssColor(props.copyColor, D.copyColor),
    "--lk-ib": cssColor(props.itemBg, D.itemBg),
    "--lk-bc": cssColor(props.borderColor, D.borderColor),
    "--lk-al": props.align === "center" ? "center" : "start",
    ...px("--lk-hs", props.headingSize, 12, 72),
    ...px("--lk-xs", props.textSize, 10, 32),
  } as React.CSSProperties;
  const List = canvas ? "div" : "ul";
  const Item = canvas ? "div" : "li";

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <BlockStyle css={columnsCss(cols, colsT, colsM)} hoist={!canvas} />
      <section className={`bmslg is-${look}`} style={vars}>
        {(edit || heading || intro) && (
          <div className="bmslg-head">
            <Txt edit={edit} tag={Heading} className="bmslg-heading" value={heading} placeholder="Heading (optional)" onCommit={(v) => onEdit?.("heading", v)} />
            <Txt edit={edit} tag="p" className="bmslg-intro" value={intro} placeholder="Intro line (optional)" multiline onCommit={(v) => onEdit?.("intro", v)} />
          </div>
        )}
        <List className={`bmslg-list c-${cols}-${colsT}-${colsM}`} {...(canvas ? {} : { role: "list" })}>
          {links.map((l, i) => {
            const href = !canvas && l.url ? safeHref(l.url) : "";
            const inner = <>{icon && <span className="bmslg-icon" aria-hidden="true"><Icon value={icon} /></span>}{l.label}</>;
            return (
              <Item key={i} className="bmslg-item">
                {href ? <a className="bmslg-link" href={href} {...(linkProps ? linkProps(href) : {})}>{inner}</a> : <span className="bmslg-link">{inner}</span>}
              </Item>
            );
          })}
        </List>
      </section>
    </>
  );
}
