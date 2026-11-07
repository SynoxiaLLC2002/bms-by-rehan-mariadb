// Share Buttons — links that open a network's own share page for this page:
// Facebook, X, WhatsApp, LinkedIn, Telegram, Pinterest, Reddit and email.
//
// Plain links. No network's script is loaded, so nothing tracks the visitor
// and nothing is added to the page's weight until they choose to share; that
// is the whole difference from the networks' own "share widgets".
// Each opens in a new tab with rel="noopener noreferrer nofollow".
// The page's address comes from the renderer; where there is none (a block in
// a header or footer Element) the block draws nothing.

import React from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import { Txt, clampInt, cssColor, editableCss, pick, type ViewProps } from "./blockKit";

export const SHARE_NETWORKS = [
  { id: "facebook", label: "Facebook", color: "#1877f2", glyph: "f", href: (u: string) => `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  { id: "x", label: "X", color: "#000000", glyph: "𝕏", href: (u: string, t: string) => `https://twitter.com/intent/tweet?url=${u}${t ? `&text=${t}` : ""}` },
  { id: "whatsapp", label: "WhatsApp", color: "#128c7e", glyph: "W", href: (u: string, t: string) => `https://wa.me/?text=${t ? `${t}%20` : ""}${u}` },
  { id: "linkedin", label: "LinkedIn", color: "#0a66c2", glyph: "in", href: (u: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
  { id: "telegram", label: "Telegram", color: "#1d8dc7", glyph: "T", href: (u: string, t: string) => `https://t.me/share/url?url=${u}${t ? `&text=${t}` : ""}` },
  { id: "pinterest", label: "Pinterest", color: "#bd081c", glyph: "P", href: (u: string, t: string) => `https://pinterest.com/pin/create/button/?url=${u}${t ? `&description=${t}` : ""}` },
  { id: "reddit", label: "Reddit", color: "#d93a00", glyph: "R", href: (u: string, t: string) => `https://www.reddit.com/submit?url=${u}${t ? `&title=${t}` : ""}` },
  { id: "email", label: "Email", color: "#475569", glyph: "@", href: (u: string, t: string) => `mailto:?${t ? `subject=${t}&` : ""}body=${u}` },
] as const;

export const SHARE_BUTTONS_DEFAULTS = {
  label: "Share this",
  show: "facebook,x,whatsapp,email",
  look: "solid",
  names: "true",
  align: "start",
  shareWord: "Share on",
  labelColor: "#475569",
  radius: "10",
  size: "40",
} as const;

export const SHARE_LOOKS = ["solid", "outline", "plain"] as const;

const CSS = [
  `.bmsshare{display:flex;flex-wrap:wrap;align-items:center;justify-content:var(--sh-jc);gap:10px;margin:2rem 0}`,
  `.bmsshare .bmsshare-label{display:block;margin:0;margin-inline-end:4px;font-size:.9rem;font-weight:700;line-height:1.3;color:var(--sh-lc)}`,
  `.bmsshare .bmsshare-list{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}`,
  `.bmsshare .bmsshare-list .bmsshare-item{margin:0;padding:0;list-style:none}`,
  `.bmsshare .bmsshare-list .bmsshare-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-width:var(--sh-s);min-height:var(--sh-s);padding:0 12px;border:2px solid var(--sh-c);border-radius:var(--sh-r);background:var(--sh-c);color:#fff;font-size:.9rem;font-weight:700;line-height:1;text-decoration:none}`,
  `.bmsshare.is-outline .bmsshare-btn{background:transparent;color:var(--sh-c)}`,
  `.bmsshare.is-plain .bmsshare-btn{border-color:transparent;background:transparent;color:var(--sh-c)}`,
  `.bmsshare .bmsshare-list .bmsshare-btn:hover{opacity:.88}`,
  `.bmsshare .bmsshare-list .bmsshare-btn:focus-visible{outline:3px solid var(--sh-c);outline-offset:2px}`,
  `.bmsshare .bmsshare-glyph{font-size:1rem;font-weight:800}`,
  editableCss(".bmsshare"),
].join("");

export default function ShareButtonsView({ props, canvas = false, onEdit, pageUrl = "", pageTitle = "" }: ViewProps & { pageUrl?: string; pageTitle?: string }) {
  const D = SHARE_BUTTONS_DEFAULTS;
  const edit = !!onEdit;
  const chosen = String(props.show ?? D.show).split(",").map((s) => s.trim());
  const networks = SHARE_NETWORKS.filter((n) => chosen.includes(n.id));
  // Only a real web address is shared; anything else and the block stays out.
  const url = /^https?:\/\//i.test(pageUrl) ? pageUrl : "";
  if (networks.length === 0 || (!canvas && !url)) return null;

  const label = String(props.label ?? D.label).trim();
  const look = pick(props.look, SHARE_LOOKS, "solid");
  const names = props.names !== "false";
  const word = String(props.shareWord || D.shareWord).trim();
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(pageTitle.trim().slice(0, 200));
  const vars = {
    "--sh-lc": cssColor(props.labelColor, D.labelColor),
    "--sh-r": `${clampInt(props.radius, 10, 0, 40)}px`,
    "--sh-s": `${clampInt(props.size, 40, 32, 64)}px`,
    "--sh-jc": props.align === "center" ? "center" : "flex-start",
  } as React.CSSProperties;
  const List = canvas ? "div" : "ul";
  const Item = canvas ? "div" : "li";

  return (
    <>
      <BlockStyle css={CSS} hoist={!canvas} />
      <div className={`bmsshare is-${look}`} style={vars}>
        <Txt edit={edit} tag="p" className="bmsshare-label" value={label} placeholder="Share this (optional)" onCommit={(v) => onEdit?.("label", v)} />
        <List className="bmsshare-list" {...(canvas ? {} : { role: "list" })}>
          {networks.map((n) => {
            const inner = <><span className="bmsshare-glyph" aria-hidden="true">{n.glyph}</span>{names && <span>{n.label}</span>}</>;
            const style = { "--sh-c": n.color } as React.CSSProperties;
            return (
              <Item key={n.id} className="bmsshare-item">
                {canvas ? (
                  <span className="bmsshare-btn" style={style}>{inner}</span>
                ) : (
                  <a className="bmsshare-btn" style={style} href={n.href(u, t)} aria-label={`${word} ${n.label}`}
                    {...(n.id === "email" ? {} : { target: "_blank", rel: "noopener noreferrer nofollow" })}>
                    {inner}
                  </a>
                )}
              </Item>
            );
          })}
        </List>
      </div>
    </>
  );
}
