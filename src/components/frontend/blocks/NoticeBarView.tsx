// Notice Bar — one line of news across the content: an offer, a holiday
// closure, a new version. An icon, the text, and an optional link.
// It sits where it is placed (put it in a header Element to show it on every
// page) and has no close button, so it needs no script and never shifts the
// page after it has loaded. Hookless; shared by the page and the canvas.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import { safeHref } from "@/lib/blockStyle";
import { Txt, clampInt, cssColor, editableCss, px, type ViewProps } from "./blockKit";

export const NOTICE_BAR_DEFAULTS = {
  icon: "📣",
  text: "Write your announcement here.",
  linkLabel: "",
  url: "",
  align: "center",
  bg: "#fef3c7",
  copyColor: "#78350f",
  linkColor: "#78350f",
  radius: "10",
  padding: "12",
  textSize: "",
} as const;

const CSS = [
  `.bmsnote{display:flex;flex-wrap:wrap;align-items:center;justify-content:var(--nb-jc);gap:6px 12px;margin:1.5rem 0;padding:var(--nb-p) 16px;border-radius:var(--nb-r);background:var(--nb-bg);color:var(--nb-tc)}`,
  `.bmsnote .bmsnote-icon{font-size:1.1rem;line-height:1}`,
  `.bmsnote .bmsnote-text{display:block;margin:0;font-size:var(--nb-xs,.975rem);font-weight:600;line-height:1.45;color:var(--nb-tc)}`,
  `.bmsnote .bmsnote-link{font-size:var(--nb-xs,.975rem);font-weight:800;line-height:1.45;color:var(--nb-lc);text-decoration:underline;text-underline-offset:3px;white-space:nowrap}`,
  `.bmsnote .bmsnote-link:hover{opacity:.85;color:var(--nb-lc)}`,
  editableCss(".bmsnote"),
].join("");

export default function NoticeBarView({ props, canvas = false, onEdit, linkProps }: ViewProps) {
  const D = NOTICE_BAR_DEFAULTS;
  const edit = !!onEdit;
  const text = String(props.text ?? D.text).trim();
  if (!edit && !text) return null;

  const icon = String(props.icon ?? D.icon).trim();
  const label = String(props.linkLabel ?? "").trim();
  const href = label ? safeHref(props.url ?? "") : "";
  const vars = {
    "--nb-bg": cssColor(props.bg, D.bg),
    "--nb-tc": cssColor(props.copyColor, D.copyColor),
    "--nb-lc": cssColor(props.linkColor, D.linkColor),
    "--nb-r": `${clampInt(props.radius, 10, 0, 40)}px`,
    "--nb-p": `${clampInt(props.padding, 12, 4, 40)}px`,
    "--nb-jc": props.align === "start" ? "flex-start" : "center",
    ...px("--nb-xs", props.textSize, 10, 32),
  } as React.CSSProperties;

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <div className="bmsnote" style={vars} {...(canvas ? {} : { role: "note" })}>
        {icon && <span className="bmsnote-icon" aria-hidden="true">{icon}</span>}
        <Txt edit={edit} tag="p" className="bmsnote-text" value={text} placeholder="Announcement" onCommit={(v) => onEdit?.("text", v)} />
        {label && (canvas ? <span className="bmsnote-link">{label}</span> : href ? <a className="bmsnote-link" href={href} {...(linkProps ? linkProps(href) : {})}>{label}</a> : null)}
      </div>
    </>
  );
}
