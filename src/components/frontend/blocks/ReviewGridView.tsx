// Review Grid — several customer reviews side by side: the words, who said
// them, where it was said, and a star rating. For reviews the business really
// received; the block starts empty for that reason and draws nothing until a
// review has words in it.
//
// Each review is a <figure> with a <blockquote>, and the stars carry a spoken
// "Rated 5 out of 5". It adds no review schema: search engines ignore (and can
// penalise) star markup a business publishes about itself.
// Hookless and script-free; shared by the page and the canvas.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import { Txt, clampInt, cssColor, editableCss, parseList, pick, px, srOnlyCss, type ViewProps } from "./blockKit";

export interface GridReview {
  quote?: string;
  name?: string;
  /** Town, job or date: one short line under the name. */
  detail?: string;
  /** 1–5; empty or 0 shows no stars. */
  rating?: string | number;
  /** Where it was left: Google, Facebook… */
  source?: string;
}

export const MAX_REVIEWS = 12;

export const REVIEW_GRID_DEFAULTS = {
  heading: "What customers say",
  reviews: JSON.stringify([{ quote: "", name: "", detail: "", rating: "5", source: "" }] satisfies GridReview[]),
  columns: "3",
  columnsTablet: "2",
  columnsMobile: "1",
  gap: "20",
  align: "start",
  headingTag: "h2",
  ratedLabel: "Rated {n} out of 5",
  cardBg: "#ffffff",
  borderColor: "#e2e8f0",
  headingColor: "#0f172a",
  quoteColor: "#1f2937",
  nameColor: "#0f172a",
  mutedColor: "#64748b",
  starColor: "#f59e0b",
  shadow: "true",
  radius: "14",
  padding: "22",
  headingSize: "",
  textSize: "",
} as const;

export const REVIEW_HEADING_TAGS = ["h2", "h3", "h4", "p", "div"] as const;

export const parseReviews = (raw: unknown) => parseList<GridReview>(raw, MAX_REVIEWS);

const CSS = [
  `.bmsrv{margin:2rem 0}`,
  `.bmsrv .bmsrv-heading{display:block;margin:0 0 24px;font-weight:800;line-height:1.2;text-align:var(--rv-al);color:var(--rv-hc);font-size:var(--rv-hs,clamp(1.5rem,3vw,2.1rem))}`,
  `.bmsrv-list{display:grid;gap:var(--rv-g)}`,
  `.bmsrv .bmsrv-list .bmsrv-card{display:flex;flex-direction:column;gap:12px;min-width:0;margin:0;padding:var(--rv-p);border:1px solid var(--rv-bc);border-radius:var(--rv-r);background:var(--rv-cb)}`,
  `.bmsrv.has-shadow .bmsrv-card{box-shadow:0 1px 2px rgba(15,23,42,.06),0 8px 24px -12px rgba(15,23,42,.18)}`,
  `.bmsrv .bmsrv-stars{font-size:1.05rem;letter-spacing:2px;line-height:1;color:var(--rv-sc)}`,
  `.bmsrv .bmsrv-card .bmsrv-quote{flex:1;margin:0;padding:0;border:0;background:transparent;font-style:normal;quotes:none}`,
  `.bmsrv .bmsrv-card .bmsrv-quote .bmsrv-words{display:block;margin:0;font-size:var(--rv-xs,1rem);line-height:1.6;color:var(--rv-qc);white-space:pre-line}`,
  `.bmsrv .bmsrv-card .bmsrv-by{display:flex;flex-direction:column;gap:2px;margin:0;font-size:.9rem;line-height:1.4;color:var(--rv-mc)}`,
  `.bmsrv .bmsrv-card .bmsrv-by .bmsrv-name{font-size:.975rem;font-weight:700;font-style:normal;color:var(--rv-nc)}`,
  `.bmsrv-empty{padding:18px;border:1px dashed #cbd5e1;border-radius:10px;font-size:12px;color:#94a3b8;text-align:center}`,
  srOnlyCss(".bmsrv-sr"),
  editableCss(".bmsrv"),
].join("");

function columnsCss(d: number, t: number, m: number): string {
  const cls = `.bmsrv .bmsrv-list.c-${d}-${t}-${m}`;
  return `${cls}{grid-template-columns:repeat(${m},minmax(0,1fr))}` +
    `@media(min-width:640px){${cls}{grid-template-columns:repeat(${t},minmax(0,1fr))}}` +
    `@media(min-width:1024px){${cls}{grid-template-columns:repeat(${d},minmax(0,1fr))}}`;
}

export default function ReviewGridView({ props, canvas = false, onEdit }: ViewProps) {
  const D = REVIEW_GRID_DEFAULTS;
  const edit = !!onEdit;
  const reviews = parseReviews(props.reviews ?? D.reviews).filter((r) => (r.quote ?? "").trim());
  if (!canvas && reviews.length === 0) return null;

  const heading = String(props.heading ?? D.heading).trim();
  const cols = clampInt(props.columns, 3, 1, 4);
  const colsT = clampInt(props.columnsTablet, 2, 1, 3);
  const colsM = clampInt(props.columnsMobile, 1, 1, 2);
  const Heading = pick(props.headingTag, REVIEW_HEADING_TAGS, "h2");
  const rated = String(props.ratedLabel || D.ratedLabel);
  const vars = {
    "--rv-g": `${clampInt(props.gap, 20, 0, 60)}px`,
    "--rv-r": `${clampInt(props.radius, 14, 0, 40)}px`,
    "--rv-p": `${clampInt(props.padding, 22, 8, 60)}px`,
    "--rv-cb": cssColor(props.cardBg, D.cardBg),
    "--rv-bc": cssColor(props.borderColor, D.borderColor),
    "--rv-hc": cssColor(props.headingColor, D.headingColor),
    "--rv-qc": cssColor(props.quoteColor, D.quoteColor),
    "--rv-nc": cssColor(props.nameColor, D.nameColor),
    "--rv-mc": cssColor(props.mutedColor, D.mutedColor),
    "--rv-sc": cssColor(props.starColor, D.starColor),
    "--rv-al": props.align === "center" ? "center" : "start",
    ...px("--rv-hs", props.headingSize, 12, 72),
    ...px("--rv-xs", props.textSize, 10, 32),
  } as React.CSSProperties;

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <BlockStyle css={columnsCss(cols, colsT, colsM)} hoist={!canvas} />
      <section className={`bmsrv${props.shadow !== "false" ? " has-shadow" : ""}`} style={vars}>
        <Txt edit={edit} tag={Heading} className="bmsrv-heading" value={heading} placeholder="Heading (optional)" onCommit={(v) => onEdit?.("heading", v)} />
        {reviews.length === 0 ? (
          <div className="bmsrv-empty">Add your customers&rsquo; reviews in the block settings →</div>
        ) : (
          <div className={`bmsrv-list c-${cols}-${colsT}-${colsM}`}>
            {reviews.map((r, i) => {
              const stars = clampInt(String(r.rating ?? ""), 0, 0, 5);
              const name = (r.name ?? "").trim();
              const detail = [r.detail, r.source].map((x) => (x ?? "").trim()).filter(Boolean).join(" · ");
              return (
                <figure key={i} className="bmsrv-card">
                  {stars > 0 && (
                    <div className="bmsrv-stars">
                      <span aria-hidden="true">{"★".repeat(stars)}{"☆".repeat(5 - stars)}</span>
                      <span className="bmsrv-sr">{rated.replace("{n}", String(stars))}</span>
                    </div>
                  )}
                  <blockquote className="bmsrv-quote"><p className="bmsrv-words">{(r.quote ?? "").trim()}</p></blockquote>
                  {(name || detail) && (
                    <figcaption className="bmsrv-by">
                      {name && <cite className="bmsrv-name">{name}</cite>}
                      {detail && <span>{detail}</span>}
                    </figcaption>
                  )}
                </figure>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
