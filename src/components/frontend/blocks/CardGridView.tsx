// Card Grid — services, features or categories as cards: a photo or an icon,
// a title, a line of text and a link, 1–24 of them in columns.
//
// A card with an address is one link: the title carries it (so the link's
// words are the card's title, which is what search engines and screen readers
// want) and is stretched over the whole card, so anywhere on it can be clicked.
// Hookless and script-free; shared by the page and the canvas.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import Icon from "@/components/shared/Icon";
import { safeHref } from "@/lib/blockStyle";
import { Txt, clampInt, cssColor, editableCss, parseList, pick, plainImg, safeSrc, px, type ViewProps } from "./blockKit";

export interface GridCard {
  image?: string;
  alt?: string;
  /** An emoji or symbol, shown when the card has no photo. */
  icon?: string;
  title?: string;
  text?: string;
  url?: string;
}

export const MAX_CARDS = 24;

export const CARD_GRID_DEFAULTS = {
  heading: "",
  intro: "",
  cards: JSON.stringify([
    { image: "", alt: "", icon: "🔧", title: "First service", text: "One or two lines on what it is and who it is for.", url: "" },
    { image: "", alt: "", icon: "🛠️", title: "Second service", text: "One or two lines on what it is and who it is for.", url: "" },
    { image: "", alt: "", icon: "⚡", title: "Third service", text: "One or two lines on what it is and who it is for.", url: "" },
  ] satisfies GridCard[]),
  columns: "3",
  columnsTablet: "2",
  columnsMobile: "1",
  gap: "24",
  align: "start",
  headingTag: "h2",
  titleTag: "h3",
  ratio: "16/9",
  linkLabel: "Learn more",
  showLink: "true",
  shadow: "true",
  cardBg: "#ffffff",
  borderColor: "#e2e8f0",
  headingColor: "#0f172a",
  introColor: "#475569",
  titleColor: "#0f172a",
  copyColor: "#475569",
  iconColor: "#0b6fb8",
  linkColor: "#0b6fb8",
  radius: "14",
  padding: "22",
  headingSize: "",
  titleSize: "",
  textSize: "",
} as const;

export const CARD_HEADING_TAGS = ["h2", "h3", "h4", "p", "div"] as const;
export const CARD_TITLE_TAGS = ["h2", "h3", "h4", "h5", "strong", "p", "div"] as const;
export const CARD_RATIOS = ["16/9", "4/3", "1/1", "3/4"] as const;

export const parseCards = (raw: unknown) => parseList<GridCard>(raw, MAX_CARDS);

const CSS = [
  `.bmscg{margin:2rem 0}`,
  `.bmscg-head{display:flex;flex-direction:column;gap:10px;margin:0 0 28px;text-align:var(--cg-al)}`,
  `.bmscg .bmscg-head .bmscg-heading{display:block;margin:0;font-weight:800;line-height:1.2;color:var(--cg-hc);font-size:var(--cg-hs,clamp(1.5rem,3vw,2.1rem))}`,
  `.bmscg .bmscg-head .bmscg-intro{display:block;margin:0;font-size:1.05rem;line-height:1.6;color:var(--cg-ic);white-space:pre-line}`,
  `.bmscg .bmscg-list{display:grid;gap:var(--cg-g);margin:0;padding:0;list-style:none}`,
  `.bmscg .bmscg-list .bmscg-card{position:relative;display:flex;flex-direction:column;min-width:0;margin:0;padding:0;overflow:hidden;list-style:none;border:1px solid var(--cg-bc);border-radius:var(--cg-r);background:var(--cg-cb);text-align:var(--cg-al)}`,
  `.bmscg.has-shadow .bmscg-card{box-shadow:0 1px 2px rgba(15,23,42,.06),0 8px 24px -12px rgba(15,23,42,.18)}`,
  `.bmscg .bmscg-card:focus-within{outline:3px solid var(--cg-lc);outline-offset:2px}`,
  `.bmscg-photo{display:block;aspect-ratio:var(--cg-ar);overflow:hidden;background:var(--cg-bc)}`,
  `.bmscg-photo img{display:block;width:100%;height:100%;margin:0;object-fit:cover}`,
  `.bmscg-body{display:flex;flex:1;flex-direction:column;align-items:var(--cg-ai);gap:8px;padding:var(--cg-p)}`,
  `.bmscg .bmscg-icon{font-size:1.9rem;line-height:1;color:var(--cg-kc)}`,
  `.bmscg .bmscg-card .bmscg-title{display:block;margin:0;font-size:var(--cg-ts,1.15rem);font-weight:700;line-height:1.3;color:var(--cg-tc)}`,
  `.bmscg .bmscg-card .bmscg-title a{color:inherit;text-decoration:none;outline:none}`,
  `.bmscg .bmscg-card .bmscg-title a::after{content:"";position:absolute;inset:0}`,
  `.bmscg .bmscg-card .bmscg-text{display:block;margin:0;font-size:var(--cg-xs,.975rem);line-height:1.6;color:var(--cg-xc);white-space:pre-line}`,
  `.bmscg .bmscg-more{margin-top:auto;padding-top:6px;font-size:.9rem;font-weight:700;color:var(--cg-lc)}`,
  `.bmscg .bmscg-card:hover .bmscg-more{text-decoration:underline;text-underline-offset:3px}`,
  editableCss(".bmscg"),
].join("");

function columnsCss(d: number, t: number, m: number): string {
  const cls = `.bmscg .bmscg-list.c-${d}-${t}-${m}`;
  return `${cls}{grid-template-columns:repeat(${m},minmax(0,1fr))}` +
    `@media(min-width:640px){${cls}{grid-template-columns:repeat(${t},minmax(0,1fr))}}` +
    `@media(min-width:1024px){${cls}{grid-template-columns:repeat(${d},minmax(0,1fr))}}`;
}

export default function CardGridView({ props, canvas = false, onEdit, linkProps, img = plainImg }: ViewProps) {
  const D = CARD_GRID_DEFAULTS;
  const edit = !!onEdit;
  const all = parseCards(props.cards ?? D.cards);
  const cards = edit ? all : all.filter((c) => (c.title || c.text || "").trim() || safeSrc(c.image));
  const heading = String(props.heading ?? D.heading).trim();
  const intro = String(props.intro ?? D.intro).trim();
  if (!edit && !heading && !intro && cards.length === 0) return null;

  const cols = clampInt(props.columns, 3, 1, 6);
  const colsT = clampInt(props.columnsTablet, 2, 1, 4);
  const colsM = clampInt(props.columnsMobile, 1, 1, 2);
  const Heading = pick(props.headingTag, CARD_HEADING_TAGS, "h2");
  const Title = pick(props.titleTag, CARD_TITLE_TAGS, "h3");
  const center = props.align === "center";
  const more = String(props.linkLabel || D.linkLabel);
  const vars = {
    "--cg-g": `${clampInt(props.gap, 24, 0, 80)}px`,
    "--cg-r": `${clampInt(props.radius, 14, 0, 40)}px`,
    "--cg-p": `${clampInt(props.padding, 22, 8, 60)}px`,
    "--cg-ar": pick(props.ratio, CARD_RATIOS, "16/9"),
    "--cg-cb": cssColor(props.cardBg, D.cardBg),
    "--cg-bc": cssColor(props.borderColor, D.borderColor),
    "--cg-hc": cssColor(props.headingColor, D.headingColor),
    "--cg-ic": cssColor(props.introColor, D.introColor),
    "--cg-tc": cssColor(props.titleColor, D.titleColor),
    "--cg-xc": cssColor(props.copyColor, D.copyColor),
    "--cg-kc": cssColor(props.iconColor, D.iconColor),
    "--cg-lc": cssColor(props.linkColor, D.linkColor),
    "--cg-al": center ? "center" : "start",
    "--cg-ai": center ? "center" : "flex-start",
    ...px("--cg-hs", props.headingSize, 12, 72),
    ...px("--cg-ts", props.titleSize, 10, 48),
    ...px("--cg-xs", props.textSize, 10, 32),
  } as React.CSSProperties;

  /** Canvas: one field of one card typed in place. */
  const patch = (i: number, field: "title" | "text") => (value: string) => {
    const next = [...all];
    next[i] = { ...next[i], [field]: value };
    onEdit?.("cards", JSON.stringify(next));
  };
  // A third of the column on a desktop, half on a tablet, all of it on a phone.
  const sizes = `(max-width: 639px) ${Math.round(100 / colsM)}vw, (max-width: 1023px) ${Math.round(100 / colsT)}vw, ${Math.round(1152 / cols)}px`;
  const List = canvas ? "div" : "ul";
  const Item = canvas ? "div" : "li";

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <BlockStyle css={columnsCss(cols, colsT, colsM)} hoist={!canvas} />
      <section className={`bmscg${props.shadow !== "false" ? " has-shadow" : ""}`} style={vars}>
        {(edit || heading || intro) && (
          <div className="bmscg-head">
            <Txt edit={edit} tag={Heading} className="bmscg-heading" value={heading} placeholder="Heading (optional)" onCommit={(v) => onEdit?.("heading", v)} />
            <Txt edit={edit} tag="p" className="bmscg-intro" value={intro} placeholder="Intro line (optional)" multiline onCommit={(v) => onEdit?.("intro", v)} />
          </div>
        )}
        {cards.length > 0 && (
          <List className={`bmscg-list c-${cols}-${colsT}-${colsM}`} {...(canvas ? {} : { role: "list" })}>
            {cards.map((c, i) => {
              const title = (c.title ?? "").trim();
              const text = (c.text ?? "").trim();
              const icon = (c.icon ?? "").trim();
              const src = safeSrc(c.image);
              const href = !canvas && c.url ? safeHref(String(c.url)) : "";
              return (
                <Item key={i} className="bmscg-card">
                  {src && <span className="bmscg-photo">{img(src, String(c.alt ?? "").trim(), { sizes })}</span>}
                  <div className="bmscg-body">
                    {!src && icon && <span className="bmscg-icon" aria-hidden="true"><Icon value={icon} /></span>}
                    {edit ? (
                      <Txt edit tag={Title} className="bmscg-title" value={title} placeholder="Card title" onCommit={patch(i, "title")} />
                    ) : title ? (
                      <Title className="bmscg-title">{href ? <a href={href} {...(linkProps ? linkProps(href) : {})}>{title}</a> : title}</Title>
                    ) : null}
                    <Txt edit={edit} tag="p" className="bmscg-text" value={text} placeholder="Card text" multiline onCommit={patch(i, "text")} />
                    {/* The title is the link; this is the visible cue only, so it is not read twice. */}
                    {href && title && props.showLink !== "false" && <span className="bmscg-more" aria-hidden="true">{more} →</span>}
                  </div>
                </Item>
              );
            })}
          </List>
        )}
      </section>
    </>
  );
}
