// Rich text from the editor, rendered for the published page.
//
// The page used to print a paragraph's plain text only — bold, italic, links,
// alignment and colours were all set in the editor and silently dropped on
// the site. This renders BlockNote's inline content faithfully, and resolves
// colours from either the editor's named palette or a hex value.

import React from "react";
import { DEFAULT_LINK_POLICY, externalLinkProps, type ExternalLinkPolicy } from "./linkRel";

type AnyNode = Record<string, any>;

/** BlockNote's palette, exactly as its stylesheet paints it. */
const TEXT: Record<string, string> = {
  gray: "#9b9a97", brown: "#64473a", red: "#e03e3e", orange: "#d9730d", yellow: "#dfab01",
  green: "#4d6461", blue: "#0b6e99", purple: "#6940a5", pink: "#ad1a72",
};
const BG: Record<string, string> = {
  gray: "#ebeced", brown: "#e9e5e3", red: "#fbe4e4", orange: "#f6e9d9", yellow: "#fbf3db",
  green: "#ddedea", blue: "#ddebf1", purple: "#eae4f2", pink: "#f4dfeb",
};

/** A named or hex/rgb colour as CSS, or undefined for "default"/garbage. */
export function resolveColor(value: unknown, kind: "text" | "background"): string | undefined {
  if (typeof value !== "string" || !value || value === "default") return undefined;
  const named = (kind === "text" ? TEXT : BG)[value];
  if (named) return named;
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v) || /^rgba?\([\d\s.,%]+\)$/i.test(v) || /^hsla?\([\d\s.,%deg]+\)$/i.test(v)) return v;
  return undefined;
}

function safeHref(href: unknown): string | undefined {
  if (typeof href !== "string") return undefined;
  const v = href.trim();
  if (!v) return undefined;
  if (v.startsWith("/") || v.startsWith("#") || v.startsWith("?")) return v;
  try {
    const u = new URL(v);
    return ["http:", "https:", "mailto:", "tel:"].includes(u.protocol) ? v : undefined;
  } catch {
    // A bare domain an author typed without a scheme.
    return /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v) ? `https://${v}` : undefined;
  }
}

function Text({ node }: { node: AnyNode }) {
  const s = (node.styles ?? {}) as Record<string, unknown>;
  const text = String(node.text ?? "");
  // Line breaks typed with Shift+Enter arrive as "\n".
  let out: React.ReactNode = text.includes("\n")
    ? text.split("\n").flatMap((part, i) => (i === 0 ? [part] : [<br key={`br${i}`} />, part]))
    : text;
  if (s.code) out = <code>{out}</code>;
  if (s.bold) out = <strong>{out}</strong>;
  if (s.italic) out = <em>{out}</em>;
  if (s.underline) out = <u>{out}</u>;
  if (s.strike) out = <s>{out}</s>;
  const color = resolveColor(s.textColor, "text");
  const bg = resolveColor(s.backgroundColor, "background");
  if (color || bg) out = <span style={{ color, backgroundColor: bg, borderRadius: bg ? "3px" : undefined, padding: bg ? "0 .15em" : undefined }}>{out}</span>;
  return <>{out}</>;
}

/**
 * Inline content (text runs and links) as React nodes.
 *
 * `policy` decides `rel`/`target` for links that leave the site — the
 * BlockNote link dialog has no rel control, so it is a site-wide choice
 * (SEO → Titles & Meta → Links). The default keeps the old behaviour: new
 * tab, followed.
 */
export function renderInline(content: unknown, policy: ExternalLinkPolicy = DEFAULT_LINK_POLICY): React.ReactNode {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  return content.map((node: AnyNode, i) => {
    if (!node || typeof node !== "object") return null;
    if (node.type === "link") {
      const href = safeHref(node.href);
      const inner = renderInline(node.content, policy);
      if (!href) return <React.Fragment key={i}>{inner}</React.Fragment>;
      return (
        <a key={i} href={href} {...externalLinkProps(href, policy)}>
          {inner}
        </a>
      );
    }
    if (node.type === "text") return <Text key={i} node={node} />;
    // Unknown inline types (mentions, custom): their text, if any.
    if (typeof node.text === "string") return <React.Fragment key={i}>{node.text}</React.Fragment>;
    return null;
  });
}

/** Alignment and block-level colours from a text block's props. */
export function textBlockStyle(p: Record<string, unknown>): React.CSSProperties | undefined {
  const style: React.CSSProperties = {};
  const align = p.textAlignment;
  if (align === "center" || align === "right" || align === "justify") style.textAlign = align;
  const color = resolveColor(p.textColor, "text");
  const bg = resolveColor(p.backgroundColor, "background");
  if (color) style.color = color;
  if (bg) {
    style.backgroundColor = bg;
    style.padding = "0.35em 0.6em";
    style.borderRadius = "6px";
  }
  return Object.keys(style).length ? style : undefined;
}
