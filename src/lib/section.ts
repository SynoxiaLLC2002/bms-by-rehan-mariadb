// The Section model — a Row Layout column's own settings.
//
// Kadence treats a column as a block in its own right ("Section") with a full
// General / Style / Advanced panel, rather than a handful of styles tucked into
// the row's sidebar. This is that model.
//
// Everything lives in the column's JSON inside the row's `cols` prop, so adding
// a field costs no schema migration — the same reason `cols` is JSON at all.
//
// `resolveSection` is the single reading of those settings, shared by the editor
// canvas and the published page so the two cannot drift. Anything that needs a
// descendant selector, a hover state or a breakpoint comes back as a CSS string
// instead of an inline style, because none of those survive `style={}`.

import { MQ_MOBILE, MQ_TABLET, shorthand } from "./responsive";
import { cssValue, withoutStyleClose } from "./blockStyle";

export { cssValue };

type AnyRec = Record<string, any>;


const px = (v: unknown): string => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? `${n}px` : "";
};

/* ── Vocabularies ─────────────────────────────────────────────────────────── */

export const SECTION_TAGS = ["div", "section", "article", "aside", "header", "footer", "main"];

export const FLEX_DIRECTIONS = [
  { id: "column", label: "↓", title: "Vertical" },
  { id: "row", label: "→", title: "Horizontal" },
  { id: "column-reverse", label: "↑", title: "Vertical reversed" },
  { id: "row-reverse", label: "←", title: "Horizontal reversed" },
];

export const FLEX_ALIGN = [
  { id: "flex-start", title: "Start" },
  { id: "center", title: "Centre" },
  { id: "flex-end", title: "End" },
  { id: "stretch", title: "Stretch" },
];

export const FLEX_JUSTIFY = [
  { id: "flex-start", title: "Top" },
  { id: "center", title: "Middle" },
  { id: "flex-end", title: "Bottom" },
  { id: "space-between", title: "Space between" },
  { id: "space-around", title: "Space around" },
  { id: "space-evenly", title: "Space evenly" },
];

export const TEXT_ALIGN = [
  { id: "left", title: "Left" },
  { id: "center", title: "Centre" },
  { id: "right", title: "Right" },
];

export const GAP_PRESETS: Record<string, number> = { none: 0, sm: 8, md: 16, lg: 32 };

export const BLEND_MODES = [
  "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light", "difference",
  "exclusion", "hue", "saturation", "color", "luminosity",
];

export const BACKDROP_FILTERS = [
  "none", "blur", "brightness", "contrast", "grayscale", "invert", "opacity", "saturate", "sepia",
];

/** Default amount per backdrop filter, so a freshly picked one is visible. */
const BACKDROP_DEFAULTS: Record<string, { amount: number; unit: string }> = {
  blur: { amount: 6, unit: "px" },
  brightness: { amount: 110, unit: "%" },
  contrast: { amount: 110, unit: "%" },
  grayscale: { amount: 100, unit: "%" },
  invert: { amount: 100, unit: "%" },
  opacity: { amount: 60, unit: "%" },
  saturate: { amount: 150, unit: "%" },
  sepia: { amount: 100, unit: "%" },
};

export function backdropCss(kind?: string, amount?: string): string {
  if (!kind || kind === "none") return "";
  const def = BACKDROP_DEFAULTS[kind];
  if (!def) return "";
  const n = parseInt(String(amount ?? ""), 10);
  const value = Number.isFinite(n) ? n : def.amount;
  return `${kind}(${value}${def.unit})`;
}

/* ── Backgrounds ──────────────────────────────────────────────────────────── */

function gradient(type: string | undefined, from: string, to: string, angle: string | undefined): string {
  const a = parseInt(String(angle ?? ""), 10);
  const deg = Number.isFinite(a) ? a : 160;
  return type === "radial"
    ? `radial-gradient(circle at center, ${from}, ${to})`
    : `linear-gradient(${deg}deg, ${from}, ${to})`;
}

/**
 * One background layer — colour, gradient or image.
 *
 * `prefix` lets the same reader build the normal and the hover layer from the
 * same field names, so the two can never drift apart.
 */
export function sectionBackground(c: AnyRec, prefix = ""): string {
  const k = (name: string) => (prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name);
  const type = c[k("bgType")] || "color";

  if (type === "gradient") {
    const from = cssValue(c[k("bgGradFrom")]);
    const to = cssValue(c[k("bgGradTo")]);
    if (from && to) return gradient(c[k("bgGradType")], from, to, c[k("bgGradAngle")]);
  }

  const image = cssValue(c[k("bgImage")]);
  if (image) {
    const size = cssValue(c[k("bgSize")]) || "cover";
    const pos = cssValue(c[k("bgPos")]) || "center center";
    const repeat = cssValue(c[k("bgRepeat")]) || "no-repeat";
    const attach = cssValue(c[k("bgAttach")]) || "scroll";
    const under = cssValue(c[k("bg")]);
    // The colour stays behind the image so a transparent PNG still sits on it.
    return `${under ? `${under} ` : ""}url("${image.replace(/"/g, "")}") ${pos}/${size} ${repeat} ${attach}`;
  }

  return cssValue(c[k("bg")]);
}

/** The overlay layer that sits above the background but below the content. */
export function sectionOverlay(c: AnyRec): { background: string; opacity: number; blend: string } | null {
  const type = c.ovType;
  if (!type || type === "none") return null;

  let background = "";
  if (type === "gradient") {
    const from = cssValue(c.ovGradFrom);
    const to = cssValue(c.ovGradTo);
    if (from && to) background = gradient(c.ovGradType, from, to, c.ovGradAngle);
  } else if (type === "image") {
    const image = cssValue(c.ovImage);
    if (image) background = `url("${image.replace(/"/g, "")}") center/cover no-repeat`;
  } else {
    background = cssValue(c.ovColor);
  }
  if (!background) return null;

  const raw = parseInt(String(c.ovOpacity ?? ""), 10);
  const opacity = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) / 100 : 0.3;
  const blend = BLEND_MODES.includes(c.ovBlend) ? c.ovBlend : "normal";
  return { background, opacity, blend };
}

/* ── Box ──────────────────────────────────────────────────────────────────── */

function sides(c: AnyRec, prefix: string, suffix = ""): string {
  const parts = ["T", "R", "B", "L"].map((s) => px(c[`${prefix}${s}${suffix}`]) || "0");
  return parts.some((p) => p !== "0") ? shorthand(parts) : "";
}

function sectionBorder(c: AnyRec, colorKey = "bdColor"): string {
  const width = px(c.bdWidth);
  if (!width || width === "0px") return "";
  const style = cssValue(c.bdStyle) || "solid";
  const color = cssValue(c[colorKey]) || "#e2e8f0";
  return `${width} ${style} ${color}`;
}

function sectionRadius(c: AnyRec): string {
  const corners = ["radTL", "radTR", "radBR", "radBL"].map((k) => px(c[k]) || "0");
  if (corners.some((v) => v !== "0")) return shorthand(corners);
  return px(c.radius);
}

function sectionShadow(c: AnyRec, prefix = ""): string {
  const k = (n: string) => (prefix ? `${prefix}${n[0].toUpperCase()}${n.slice(1)}` : n);
  if (c[k("shadow")] !== "true") return "";
  const x = px(c[k("shX")]) || "0px";
  const y = px(c[k("shY")]) || "8px";
  const blur = px(c[k("shBlur")]) || "24px";
  const spread = px(c[k("shSpread")]) || "0px";
  const color = cssValue(c[k("shColor")]) || "rgba(15,23,42,.15)";
  return `${x} ${y} ${blur} ${spread} ${color}`;
}

/* ── Resolved section ─────────────────────────────────────────────────────── */

export interface ResolvedSection {
  tag: string;
  anchor?: string;
  extraClass?: string;
  /** Inline styles that need no breakpoint, hover state or descendant. */
  style: Record<string, string | number | undefined>;
  /** Generated rules — hover, breakpoints, link colours, author CSS. */
  css: string;
  overlay: { background: string; opacity: number; blend: string } | null;
  /** Set when the whole section is a link. */
  link?: { href: string; title?: string };
  /** True when the section must be a positioning / clipping context. */
  isLayered: boolean;
  hidden: { d: boolean; t: boolean; m: boolean };
  /** Scroll animation, shared with the block-wide `bx` implementation. */
  anim: { name: string; replay: boolean; vars: Record<string, string> } | null;
  /** Raw Conditional Display rules, evaluated by the caller that knows the viewer. */
  conditions?: string;
}

/**
 * Reads one column's settings.
 *
 * `scope` is the class the generated rules hang off — the caller owns it, so the
 * editor and the page can each name their own element without this file caring.
 */
export function resolveSection(col: AnyRec | undefined, scope: string): ResolvedSection {
  const c = col ?? {};
  const rules: string[] = [];

  const overlay = sectionOverlay(c);
  const backdrop = backdropCss(c.backdrop, c.backdropAmount);
  const background = sectionBackground(c);
  const padding = sides(c, "pad") || (px(c.pad) ? `${px(c.pad)}` : "");
  const margin = sides(c, "mar");
  const radius = sectionRadius(c);
  const border = sectionBorder(c);
  const shadow = sectionShadow(c);
  const minHeight = px(c.minHeight);
  const maxWidth = px(c.maxWidth);
  const zRaw = parseInt(String(c.zIndex ?? ""), 10);
  const zIndex = Number.isFinite(zRaw) && c.zIndex !== "" ? zRaw : undefined;
  const sticky = c.sticky === "true";

  const style: ResolvedSection["style"] = {
    display: "flex",
    flexDirection: cssValue(c.dir) || "column",
    alignItems: cssValue(c.align) || "stretch",
    justifyContent: cssValue(c.valignFlex) || "flex-start",
    gap: c.vgap ? `${GAP_PRESETS[c.vgap] ?? (parseInt(c.vgapCustom ?? "", 10) || 0)}px` : undefined,
    textAlign: cssValue(c.textAlign) || undefined,
    background: background || undefined,
    backdropFilter: backdrop || undefined,
    WebkitBackdropFilter: backdrop || undefined,
    color: c.textColor && c.textColor !== "default" ? cssValue(c.textColor) || undefined : undefined,
    padding: padding || undefined,
    margin: margin || undefined,
    border: border || undefined,
    borderRadius: radius || undefined,
    boxShadow: shadow || undefined,
    minHeight: minHeight || undefined,
    maxWidth: maxWidth || undefined,
    zIndex,
  };

  const isLayered = !!overlay || !!radius || sticky || zIndex !== undefined;
  if (sticky) {
    style.position = "sticky";
    style.top = px(c.stickyOffset) || "0px";
  } else if (isLayered) {
    style.position = "relative";
  }
  if (overlay) style.overflow = "hidden";

  /* Hover — a state, so it cannot be an inline style. */
  const hoverDecls: string[] = [];
  const hoverBg = sectionBackground(c, "hover");
  if (hoverBg) hoverDecls.push(`background:${hoverBg}`);
  const hoverBorder = cssValue(c.bdColorHover);
  if (hoverBorder && border) hoverDecls.push(`border-color:${hoverBorder}`);
  const hoverText = cssValue(c.textColorHover);
  if (hoverText) hoverDecls.push(`color:${hoverText}`);
  const hoverShadow = sectionShadow(c, "hover");
  if (hoverShadow) hoverDecls.push(`box-shadow:${hoverShadow}`);
  if (hoverDecls.length) {
    rules.push(`.${scope}{transition:background .25s,border-color .25s,color .25s,box-shadow .25s}`);
    rules.push(`.${scope}:hover{${hoverDecls.join(";")}}`);
  }

  /* Link colours — descendants, so also rules. */
  const link = cssValue(c.linkColor);
  const linkHover = cssValue(c.linkHoverColor);
  if (link) rules.push(`.${scope} a{color:${link}}`);
  if (linkHover) rules.push(`.${scope} a:hover{color:${linkHover}}`);

  /* Breakpoints. Only the values that actually differ are emitted.
   *
   * A property with a tablet or mobile value cannot stay inline: an inline
   * `padding:150px 0` beats any `@media … .scope{padding:0}` rule, whatever
   * the order, so the override never applied and a hero kept its desktop
   * padding on phones. The desktop value of such a property moves out of
   * `style` into a `.scope{}` rule of its own, ahead of the media rules, where
   * equal specificity lets the later breakpoint win. */
  const responsive: [string, string][] = [
    [MQ_TABLET, "T"],
    [MQ_MOBILE, "M"],
  ];
  const breakpointDecls: [string, string[]][] = [];
  const overridden = new Set<keyof typeof style>();
  for (const [mq, suffix] of responsive) {
    const decls: string[] = [];
    const dir = cssValue(c[`dir${suffix}`]);
    if (dir) { decls.push(`flex-direction:${dir}`); overridden.add("flexDirection"); }
    const align = cssValue(c[`align${suffix}`]);
    if (align) { decls.push(`align-items:${align}`); overridden.add("alignItems"); }
    const justify = cssValue(c[`valignFlex${suffix}`]);
    if (justify) { decls.push(`justify-content:${justify}`); overridden.add("justifyContent"); }
    const ta = cssValue(c[`textAlign${suffix}`]);
    if (ta) { decls.push(`text-align:${ta}`); overridden.add("textAlign"); }
    const pad = sides(c, "pad", suffix);
    if (pad) { decls.push(`padding:${pad}`); overridden.add("padding"); }
    const mar = sides(c, "mar", suffix);
    if (mar) { decls.push(`margin:${mar}`); overridden.add("margin"); }
    const mh = px(c[`minHeight${suffix}`]);
    if (mh) { decls.push(`min-height:${mh}`); overridden.add("minHeight"); }
    const mw = px(c[`maxWidth${suffix}`]);
    if (mw) { decls.push(`max-width:${mw}`); overridden.add("maxWidth"); }
    if (decls.length) breakpointDecls.push([mq, decls]);
  }
  if (overridden.size) {
    const base: string[] = [];
    for (const key of overridden) {
      const v = style[key];
      if (v !== undefined && v !== "") base.push(`${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`);
      delete style[key];
    }
    if (base.length) rules.push(`.${scope}{${base.join(";")}}`);
  }
  for (const [mq, decls] of breakpointDecls) rules.push(`${mq}{.${scope}{${decls.join(";")}}}`);

  /* Author CSS, with `selector` standing for this section. */
  const raw = typeof c.customCss === "string" ? c.customCss.trim() : "";
  if (raw) rules.push(withoutStyleClose(raw).replace(/selector/g, `.${scope}`));

  const href = cssValue(c.linkUrl);

  return {
    tag: SECTION_TAGS.includes(c.htmlTag) ? c.htmlTag : "div",
    anchor: cssValue(c.anchor) || undefined,
    extraClass:
      typeof c.cssClass === "string" ? c.cssClass.replace(/[^\w\s-]/g, "").trim() || undefined : undefined,
    style,
    css: rules.join(""),
    overlay,
    link: href ? { href, title: cssValue(c.linkTitle) || undefined } : undefined,
    isLayered,
    hidden: { d: c.hideD === "true", t: c.hideT === "true", m: c.hideM === "true" },
    anim: anim(c),
    conditions: typeof c.cd === "string" && c.cd.trim() ? c.cd : undefined,
  };
}

/**
 * Scroll animation for a section.
 *
 * Deliberately the same class names the block-wide `bx` animations use, so one
 * observer and one stylesheet cover both — a section is just another element
 * with `.bx-an` on it.
 */
function anim(c: AnyRec): ResolvedSection["anim"] {
  const name = cssValue(c.an);
  if (!name) return null;
  const vars: Record<string, string> = {};
  const dur = parseInt(String(c.anD ?? ""), 10);
  const delay = parseInt(String(c.anL ?? ""), 10);
  if (Number.isFinite(dur) && dur > 0) vars["--bx-an-dur"] = `${dur}ms`;
  if (Number.isFinite(delay) && delay > 0) vars["--bx-an-delay"] = `${delay}ms`;
  return { name, replay: c.anR === "1", vars };
}

/** The visibility classes, which reuse the block-box stylesheet's rules. */
export function sectionHiddenClass(s: ResolvedSection): string {
  return [s.hidden.d && "bx-hd", s.hidden.t && "bx-ht", s.hidden.m && "bx-hm"]
    .filter(Boolean)
    .join(" ");
}
