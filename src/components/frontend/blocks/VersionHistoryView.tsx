// Version History — a changelog: each release with its number, its date and
// what changed, newest first. Releases fold away behind their own heading
// (the browser's <details>, so no script), with the newest one open; or they
// can all be shown as a plain list.
// Dates typed as 2026-10-06 are marked up as <time> for search engines.
// Hookless; shared by the page and the canvas.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import { Txt, clampInt, cssColor, editableCss, linesOf, parseList, pick, px, type ViewProps } from "./blockKit";

export interface Release {
  version?: string;
  date?: string;
  /** One change per line. */
  changes?: string;
}

export const MAX_RELEASES = 40;
const MAX_CHANGES = 40;

export const VERSION_HISTORY_DEFAULTS = {
  heading: "Version history",
  headingTag: "h2",
  versions: JSON.stringify([
    { version: "2.1.0", date: "2026-10-01", changes: "Faster start-up\nFixed a crash when opening large files" },
    { version: "2.0.0", date: "2026-08-15", changes: "New design\nDark mode" },
  ] satisfies Release[]),
  fold: "true",
  latestLabel: "Latest",
  accent: "#0b6fb8",
  borderColor: "#e2e8f0",
  headingColor: "#0f172a",
  copyColor: "#334155",
  mutedColor: "#64748b",
  radius: "12",
  headingSize: "",
  textSize: "",
} as const;

export const VERSION_HEADING_TAGS = ["h2", "h3", "h4", "p", "div"] as const;

export const parseReleases = (raw: unknown) => parseList<Release>(raw, MAX_RELEASES);

const CSS = [
  `.bmsver{margin:2rem 0}`,
  `.bmsver .bmsver-heading{display:block;margin:0 0 16px;font-weight:800;line-height:1.2;color:var(--vh-hc);font-size:var(--vh-hs,clamp(1.35rem,2.6vw,1.75rem))}`,
  `.bmsver-list{display:flex;flex-direction:column;gap:10px}`,
  `.bmsver .bmsver-item{margin:0;border:1px solid var(--vh-bc);border-radius:var(--vh-r);background:transparent;overflow:hidden}`,
  `.bmsver .bmsver-item .bmsver-top{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin:0;padding:14px 18px;list-style:none;font-size:1rem;line-height:1.3;color:var(--vh-hc)}`,
  `.bmsver .bmsver-item summary.bmsver-top{cursor:pointer}`,
  `.bmsver .bmsver-item summary.bmsver-top::-webkit-details-marker{display:none}`,
  `.bmsver .bmsver-item summary.bmsver-top::after{content:"+";margin-inline-start:auto;font-size:1.25rem;font-weight:700;line-height:1;color:var(--vh-mc)}`,
  `.bmsver .bmsver-item[open] summary.bmsver-top::after{content:"\\2212"}`,
  `.bmsver .bmsver-item summary.bmsver-top:focus-visible{outline:3px solid var(--vh-ac);outline-offset:-3px}`,
  `.bmsver .bmsver-num{font-weight:800}`,
  `.bmsver .bmsver-badge{padding:2px 9px;border-radius:999px;background:var(--vh-ac);color:#fff;font-size:.72rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase}`,
  `.bmsver .bmsver-date{font-size:.9rem;color:var(--vh-mc)}`,
  `.bmsver .bmsver-item .bmsver-changes{display:flex;flex-direction:column;gap:6px;margin:0;padding:0 18px 16px 38px;list-style:disc;color:var(--vh-tc)}`,
  `.bmsver .bmsver-item .bmsver-changes li{margin:0;padding:0;font-size:var(--vh-xs,.975rem);line-height:1.55;list-style:disc;color:var(--vh-tc)}`,
  `.bmsver .bmsver-item .bmsver-changes li::marker{color:var(--vh-ac)}`,
  editableCss(".bmsver"),
].join("");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function VersionHistoryView({ props, canvas = false, onEdit }: ViewProps) {
  const D = VERSION_HISTORY_DEFAULTS;
  const edit = !!onEdit;
  const releases = parseReleases(props.versions ?? D.versions).filter((r) => (r.version || r.changes || "").trim());
  const heading = String(props.heading ?? D.heading).trim();
  if (!edit && releases.length === 0) return null;

  const Heading = pick(props.headingTag, VERSION_HEADING_TAGS, "h2");
  const fold = props.fold !== "false";
  const latest = String(props.latestLabel ?? D.latestLabel).trim();
  const vars = {
    "--vh-ac": cssColor(props.accent, D.accent),
    "--vh-bc": cssColor(props.borderColor, D.borderColor),
    "--vh-hc": cssColor(props.headingColor, D.headingColor),
    "--vh-tc": cssColor(props.copyColor, D.copyColor),
    "--vh-mc": cssColor(props.mutedColor, D.mutedColor),
    "--vh-r": `${clampInt(props.radius, 12, 0, 40)}px`,
    ...px("--vh-hs", props.headingSize, 12, 72),
    ...px("--vh-xs", props.textSize, 10, 32),
  } as React.CSSProperties;

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <section className="bmsver" style={vars}>
        <Txt edit={edit} tag={Heading} className="bmsver-heading" value={heading} placeholder="Heading (optional)" onCommit={(v) => onEdit?.("heading", v)} />
        <div className="bmsver-list">
          {releases.map((r, i) => {
            const version = (r.version ?? "").trim();
            const date = (r.date ?? "").trim();
            const changes = linesOf(r.changes, MAX_CHANGES);
            const top = (
              <>
                {version && <span className="bmsver-num">{version}</span>}
                {i === 0 && latest && <span className="bmsver-badge">{latest}</span>}
                {date && (ISO_DATE.test(date) ? <time className="bmsver-date" dateTime={date}>{date}</time> : <span className="bmsver-date">{date}</span>)}
              </>
            );
            const list = changes.length > 0 && <ul className="bmsver-changes">{changes.map((c, k) => <li key={k}>{c}</li>)}</ul>;
            // The canvas shows every release open: a folded one could not be read while editing.
            return fold && !canvas ? (
              <details key={i} className="bmsver-item" open={i === 0}>
                <summary className="bmsver-top">{top}</summary>
                {list}
              </details>
            ) : (
              <div key={i} className="bmsver-item">
                <div className="bmsver-top">{top}</div>
                {list}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
