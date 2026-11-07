// What the hookless block views share (Hero, CTA Band, Card Grid, Stats Strip,
// Pros & Cons, Call Bar, Logo Strip, Notice Bar, Comparison Table, Version
// History): the guards every author-typed value goes through before it reaches
// a style or an attribute, and the three small pieces they all draw.
//
// A view is given `props` (strings, as the editor stores them) and nothing
// else it can trust. Numbers are clamped, colours must look like colours,
// addresses go through `safeHref` / `safeSrc`, and text is only ever rendered
// as text. None of these blocks ships any JavaScript to the visitor.

import React from "react";
import { safeHref } from "@/lib/blockStyle";
import { Editable } from "@/components/shared/CanvasEditable";

export type BlockProps = Record<string, string | undefined>;

/** Draws one image. The page passes the optimiser; the canvas uses a plain tag. */
export type ImgRender = (
  src: string,
  alt: string,
  o: { className?: string; sizes?: string; priority?: boolean },
) => React.ReactNode;

export interface ViewProps {
  props: BlockProps;
  canvas?: boolean;
  /** Canvas only: write one prop (text typed in place; lists arrive as their JSON string). */
  onEdit?: (key: string, value: string) => void;
  /** The site's external-link policy (nofollow / new tab) for outside links — the page passes it. */
  linkProps?: (href: string) => { target?: string; rel?: string };
  img?: ImgRender;
}

export const clampInt = (v: string | undefined, def: number, min: number, max: number) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
};

/** A colour setting, or the default. Colour syntax only — no url(), no ; or braces. */
export const cssColor = (v: string | undefined, def: string) => {
  const s = String(v ?? "").trim();
  if (!s || s === "default" || s.length > 80) return def;
  if (/url\s*\(|expression|[;{}<>"'\\]/i.test(s)) return def;
  return /^[#a-z0-9(),.%\s/+-]+$/i.test(s) ? s : def;
};

/** A size setting as a CSS variable in pixels; empty or out of range sets nothing, so the stylesheet's own size stands. */
export const px = (name: string, v: string | undefined, min: number, max: number): Record<string, string> => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n >= min && n <= max ? { [name]: `${n}px` } : {};
};

export const pick = <T extends string>(v: string | undefined, allowed: readonly T[], def: T): T =>
  (allowed as readonly string[]).includes(String(v)) ? (v as T) : def;

/** An image address on this site or over http(s); anything else is dropped. */
export const safeSrc = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^(\/(?!\/)|https?:\/\/)/i.test(s) ? s : "";
};

/** A JSON list prop as objects, at most `max` of them. */
export function parseList<T extends object>(raw: unknown, max: number): T[] {
  let rows: unknown = [];
  try {
    rows = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
  } catch {
    rows = [];
  }
  return (Array.isArray(rows) ? rows : []).filter((r): r is T => !!r && typeof r === "object" && !Array.isArray(r)).slice(0, max);
}

/** A one-per-line prop as trimmed, non-empty lines. */
export const linesOf = (v: string | undefined, max: number): string[] =>
  String(v ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, max);

/** A phone number as a tel: address — digits and one leading plus — or "". */
export const telHref = (v: string | undefined): string => {
  const s = String(v ?? "").trim();
  const digits = s.replace(/[^\d]/g, "");
  return digits.length >= 3 && digits.length <= 20 ? `tel:${s.startsWith("+") ? "+" : ""}${digits}` : "";
};

// eslint-disable-next-line @next/next/no-img-element
export const plainImg: ImgRender = (src, alt, o) => <img src={src} alt={alt} className={o.className} loading={o.priority ? "eager" : "lazy"} decoding="async" />;

/** Typed in place on the canvas; on the page the plain element, or nothing when empty. */
export function Txt({ edit, tag, className, value, placeholder, multiline, onCommit }: {
  edit: boolean;
  tag: string;
  className: string;
  value: string;
  placeholder: string;
  multiline?: boolean;
  onCommit?: (v: string) => void;
}) {
  if (edit) return <Editable className={className} tag={tag} value={value} placeholder={placeholder} multiline={multiline} onCommit={(v) => v !== value && onCommit?.(v)} />;
  return value ? React.createElement(tag, { className }, value) : null;
}

/** A button-shaped link. No address, no button: a dead button is worse than none. */
export function Btn({ className, label, url, canvas, linkProps }: {
  className: string;
  label: string;
  url: string | undefined;
  canvas?: boolean;
  linkProps?: ViewProps["linkProps"];
}) {
  const text = label.trim();
  if (!text) return null;
  if (canvas) return <span className={className}>{text}</span>;
  const href = safeHref(url ?? "");
  if (!href) return null;
  return <a className={className} href={href} {...(linkProps ? linkProps(href) : {})}>{text}</a>;
}

/** Canvas only: typing in place. Appended to each block's stylesheet under its own class. */
export const editableCss = (root: string) =>
  `${root} [contenteditable]{outline:none;min-width:2ch}` +
  `${root} [contenteditable]:focus{outline:2px dashed currentColor;outline-offset:3px;border-radius:2px}` +
  `${root} [contenteditable]:empty::before{content:attr(data-ph);opacity:.5}`;

/** Text for screen readers only (a tick's "Yes", a cross's "No"). */
export const srOnlyCss = (cls: string) =>
  `${cls}{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}`;
