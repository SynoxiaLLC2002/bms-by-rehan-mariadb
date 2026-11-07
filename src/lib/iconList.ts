// The Advanced Icon List model — one resolver read by the editor canvas and the
// published page, the same contract `resolveRow` / `resolveSection` /
// `resolveButtons` keep.
//
// Kadence splits this into an "Icon List" parent and "Icon List Item" children.
// BlockNote has no nesting outside Row Layout's column editors, so one block is
// the whole list: the items live in the `items` prop and the list's own layout
// and styling live on the block props. Each item may override the list's icon
// and colours, which is what the child blocks were for.

import {
  authorCss,
  blockScope,
  cssColor,
  cssValue,
  gradient,
  rawAt,
  safeClass,
  safeHref,
  scalarAt,
  sidesAt,
  type PropRec,
} from "./blockStyle";
import { MQ_MOBILE, MQ_TABLET, type Device } from "./responsive";
import { linkRel } from "./linkRel";

export type IconListItem = Record<string, string>;

/* ── Option tables, shared with the panel ─────────────────────────────────── */

export const IL_ICON_ALIGN: { id: string; title: string }[] = [
  { id: "start", title: "Top" },
  { id: "center", title: "Middle" },
  { id: "end", title: "Bottom" },
];

/**
 * Icon treatments.
 *
 * Kadence calls the second one "Stacked". The two outlined variants are what
 * make its "Line Width" control mean something here: our icons are text glyphs,
 * not SVG, so there is no stroke to widen — but there is a frame around them,
 * and widening that is the same intent.
 */
export const IL_ICON_STYLE: { id: string; title: string }[] = [
  { id: "default", title: "Default" },
  { id: "stacked", title: "Stacked" },
  { id: "outline", title: "Outline" },
  { id: "square", title: "Square" },
  { id: "squareOutline", title: "Square Outline" },
];

/** The styles whose frame the Line Width control actually draws. */
export const IL_OUTLINED = new Set(["outline", "squareOutline"]);

export const IL_LETTER_CASE: { id: string; title: string }[] = [
  { id: "uppercase", title: "AB" },
  { id: "lowercase", title: "ab" },
  { id: "capitalize", title: "Aa" },
];

export const IL_UNDERLINE: { id: string; title: string }[] = [
  { id: "underline", title: "Underline" },
  { id: "none", title: "None" },
];

/* ── Resolved shapes ──────────────────────────────────────────────────────── */

/** One run of the label — `mark` is the highlighted half. */
export interface TextSegment {
  text: string;
  mark: boolean;
  /**
   * Set when this run is a link written as `[label](url)`.
   *
   * The item already had an `href`, but it wrapped the *whole* row. A download
   * list wants the link on one word — "the form is available **here**" — and so
   * does ordinary internal linking, which is what this adds. An item-level
   * `href` still works and still wraps everything; the two compose, with the
   * inner link winning inside its own run because it is the nearer anchor.
   */
  href?: string;
}

export interface ResolvedIconListItem {
  /** Per-item class, present only when the item overrides something. */
  scope?: string;
  icon: string;
  /** The label split into plain and highlighted runs. */
  segments: TextSegment[];
  /** The label with the highlight markers removed, for List View and titles. */
  text: string;
  /** The label exactly as stored — what the canvas puts in its editable span. */
  rawText: string;
  href: string;
  target: string;
  rel?: string;
  showIcon: boolean;
  iconTitle?: string;
  /** Set when the item picks a treatment other than the list's. */
  styleClass?: string;
}

/**
 * Splits a label on `==highlight==` and `[label](url)`.
 *
 * Kadence highlights a selection inside a rich-text list item, and links one.
 * Our item label is a plain string, so both use the marker Markdown already
 * uses — they survive a round trip through the input, and an author who types
 * neither gets exactly one plain run and no extra elements at all.
 *
 * Markers may nest either way round: `[==Download==](/f.pdf)` and
 * `==[Download](/f.pdf)==` both produce one highlighted link.
 */
const HIGHLIGHT_RE = /==([^=]+)==/g;
// Allows one level of nested brackets in the URL, so a link to something
// like `/docs/spec_(draft).pdf` survives -- stopping at the first `)`
// truncated the URL and left the stray bracket sitting in the sentence.
const LINK_RE = /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

export function parseHighlight(raw: unknown): TextSegment[] {
  const text = typeof raw === "string" ? raw : "";
  if (!text) return [];

  // Links first, so a link's own label can then be scanned for highlights.
  const linked: TextSegment[] = [];
  if (text.includes("](")) {
    let last = 0;
    let m: RegExpExecArray | null;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(text))) {
      if (m.index > last) linked.push({ text: text.slice(last, m.index), mark: false });
      // An unsafe scheme yields no href, and the label degrades to plain text
      // rather than vanishing -- losing the words would lose the sentence.
      const href = safeHref(m[2]);
      linked.push(href ? { text: m[1], mark: false, href } : { text: m[1], mark: false });
      last = m.index + m[0].length;
    }
    if (last < text.length) linked.push({ text: text.slice(last), mark: false });
  } else {
    linked.push({ text, mark: false });
  }

  // Then highlights, within each run, so the two markers compose.
  const out: TextSegment[] = [];
  for (const run of linked) {
    if (!run.text.includes("==")) {
      if (run.text) out.push(run);
      continue;
    }
    let last = 0;
    let m: RegExpExecArray | null;
    HIGHLIGHT_RE.lastIndex = 0;
    while ((m = HIGHLIGHT_RE.exec(run.text))) {
      if (m.index > last) out.push({ ...run, text: run.text.slice(last, m.index), mark: false });
      out.push({ ...run, text: m[1], mark: true });
      last = m.index + m[0].length;
    }
    if (last < run.text.length) out.push({ ...run, text: run.text.slice(last), mark: false });
  }
  return out;
}

export interface ResolvedIconList {
  items: ResolvedIconListItem[];
  listClass: string;
  css: string;
  anchor?: string;
}

/**
 * Parses the `items` prop.
 *
 * Accepts the pre-Advanced `{icon,text}` shape unchanged — it is a subset of the
 * new one, so old content needs no migration and no database change.
 */
export function parseItems(raw: unknown): IconListItem[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x) => x && typeof x === "object") as IconListItem[];
  } catch {
    return [];
  }
}

export function serializeItems(list: IconListItem[]): string {
  const clean = list.map((it) => {
    const out: IconListItem = {};
    for (const [k, v] of Object.entries(it)) if (v !== "" && v !== undefined && v !== null) out[k] = v;
    return out;
  });
  return JSON.stringify(clean);
}

/**
 * A new item, carrying no icon of its own.
 *
 * Deliberately not stamped with the current default: an item with no `icon`
 * follows the list's Default Icon, so changing that later updates every row the
 * author never overrode — which is what a default is for.
 */
export function blankItem(): IconListItem {
  return { text: "" };
}

export const iconListScope = (block: { id?: unknown; props?: unknown }) => blockScope("bmsil", block);

/**
 * Reads an icon list block.
 *
 * `scopeBase` is owned by the caller — the editor names it after the preview
 * node and the page after the rendered one — so this file never has to know
 * which side it is running on.
 */
export function resolveIconList(p: PropRec, scopeBase: string): ResolvedIconList {
  const rules: string[] = [];
  const sel = `.${scopeBase}`;
  const items = parseItems(p.items);

  const style = p.iconStyle || "default";
  const outlined = IL_OUTLINED.has(style);

  /* ── List layout, per breakpoint ───────────────────────────────────────── */

  const layoutAt = (d: Device): string[] => {
    const decls: string[] = [];
    const cols = rawAt(p.cols, d);
    if (cols) {
      const n = Math.max(1, Math.min(6, parseInt(cols, 10) || 1));
      decls.push(`grid-template-columns:repeat(${n},minmax(0,1fr))`);
    }
    const colGap = scalarAt(p.colGap, d);
    if (colGap) decls.push(`column-gap:${colGap}`);
    const vGap = scalarAt(p.vGap, d);
    if (vGap) decls.push(`row-gap:${vGap}`);
    return decls;
  };

  const d0 = layoutAt("d");
  if (d0.length) rules.push(`${sel}{${d0.join(";")}}`);
  for (const [mq, dev] of [[MQ_TABLET, "t"], [MQ_MOBILE, "m"]] as [string, Device][]) {
    const decls = layoutAt(dev);
    if (decls.length) rules.push(`${mq}{${sel}{${decls.join(";")}}}`);
  }

  /* ── The row: icon alignment and the icon-to-label gap ─────────────────── */

  const rowD: string[] = [];
  const align = cssValue(p.iconAlign);
  if (align && IL_ICON_ALIGN.some((a) => a.id === align)) rowD.push(`align-items:${align}`);
  const hGap = scalarAt(p.hGap, "d");
  if (hGap) rowD.push(`gap:${hGap}`);
  if (rowD.length) rules.push(`${sel} .bmsil-item{${rowD.join(";")}}`);

  for (const [mq, dev] of [[MQ_TABLET, "t"], [MQ_MOBILE, "m"]] as [string, Device][]) {
    const g = scalarAt(p.hGap, dev);
    if (g) rules.push(`${mq}{${sel} .bmsil-item{gap:${g}}}`);
  }

  /* ── Icon ──────────────────────────────────────────────────────────────── */

  const icoD: string[] = [];
  const iconSize = scalarAt(p.iconSize, "d");
  if (iconSize) icoD.push(`font-size:${iconSize}`);
  const iconColor = cssValue(p.iconColor);
  if (iconColor) icoD.push(`color:${iconColor}`);

  // The two shaped styles need a background; the two outlined ones need a
  // border whose width is the Line Width control.
  const iconBg = cssValue(p.iconBg);
  if (style === "stacked" || style === "square") {
    icoD.push(`background:${iconBg || "var(--color-primary,#0ea5e9)"}`);
    if (!iconColor) icoD.push("color:#fff");
  }
  if (outlined) {
    const lw = rawAt(p.lineWidth, "d");
    icoD.push(`border-width:${lw ? `${parseFloat(lw) || 0}px` : "2px"}`);
    icoD.push("border-style:solid");
    icoD.push(`border-color:${cssValue(p.iconBorderColor) || "currentColor"}`);
  }
  if (icoD.length) rules.push(`${sel} .bmsil-ico{${icoD.join(";")}}`);

  for (const [mq, dev] of [[MQ_TABLET, "t"], [MQ_MOBILE, "m"]] as [string, Device][]) {
    const decls: string[] = [];
    const s = scalarAt(p.iconSize, dev);
    if (s) decls.push(`font-size:${s}`);
    if (outlined) {
      const lw = rawAt(p.lineWidth, dev);
      if (lw) decls.push(`border-width:${parseFloat(lw) || 0}px`);
    }
    if (decls.length) rules.push(`${mq}{${sel} .bmsil-ico{${decls.join(";")}}}`);
  }

  /* ── Text ──────────────────────────────────────────────────────────────── */

  const txD: string[] = [];
  const textColor = cssColor(p.textColor);
  if (textColor) txD.push(`color:${textColor}`);
  const fs = scalarAt(p.fs, "d");
  if (fs) txD.push(`font-size:${fs}`);
  const lh = cssValue(p.lh);
  if (lh) txD.push(`line-height:${lh}`);
  const ls = scalarAt(p.ls, "d");
  if (ls) txD.push(`letter-spacing:${ls}`);
  const ff = cssValue(p.ff);
  if (ff) txD.push(`font-family:${ff}`);
  const fw = cssValue(p.fw);
  if (fw) txD.push(`font-weight:${fw}`);
  const tt = cssValue(p.tt);
  if (tt) txD.push(`text-transform:${tt}`);
  if (txD.length) rules.push(`${sel} .bmsil-txt{${txD.join(";")}}`);

  for (const [mq, dev] of [[MQ_TABLET, "t"], [MQ_MOBILE, "m"]] as [string, Device][]) {
    const decls: string[] = [];
    const s = scalarAt(p.fs, dev);
    if (s) decls.push(`font-size:${s}`);
    const t = scalarAt(p.ls, dev);
    if (t) decls.push(`letter-spacing:${t}`);
    if (decls.length) rules.push(`${mq}{${sel} .bmsil-txt{${decls.join(";")}}}`);
  }

  /* ── Links — descendants and a state, so they must be rules ────────────── */

  const linkColor = cssValue(p.linkColor);
  if (linkColor) rules.push(`${sel} a{color:${linkColor}}`);
  const linkHover = cssValue(p.linkHoverColor);
  if (linkHover) rules.push(`${sel} a:hover,${sel} a:focus-visible{color:${linkHover}}`);
  const underline = cssValue(p.underline);
  if (underline === "underline" || underline === "none") {
    rules.push(`${sel} a{text-decoration:${underline}}`);
  }

  /* ── Per-item overrides ────────────────────────────────────────────────── */

  const resolved: ResolvedIconListItem[] = items.map((it, i) => {
    const scope = `${scopeBase}-i${i}`;
    // Qualified by the list, so an item rule (three classes) out-specifies the
    // base treatment rules `.bmsil .bmsil-ico.is-*` rather than losing to them.
    const isel = `${sel} .${scope}`;
    let used = false;
    /** Emits a rule and remembers that this item needs its own class. */
    const push = (rule: string) => {
      rules.push(rule);
      used = true;
    };

    /* Icon: colour, size, line width — each falls back to the list. */
    const ico: string[] = [];
    const c = cssValue(it.iconColor);
    if (c) ico.push(`color:${c}`);
    const isz = scalarAt(it.iconSize, "d");
    if (isz) ico.push(`font-size:${isz}`);
    const itemOutlined = IL_OUTLINED.has(it.iconStyle || (it.iconStyle === "" ? style : style));
    const ilw = rawAt(it.lineWidth, "d");
    if (ilw && itemOutlined) ico.push(`border-width:${parseFloat(ilw) || 0}px`);
    if (ico.length) push(`${isel} .bmsil-ico{${ico.join(";")}}`);

    for (const [mq, dev] of [[MQ_TABLET, "t"], [MQ_MOBILE, "m"]] as [string, Device][]) {
      const decls: string[] = [];
      const sz = scalarAt(it.iconSize, dev);
      if (sz) decls.push(`font-size:${sz}`);
      const lw = rawAt(it.lineWidth, dev);
      if (lw && itemOutlined) decls.push(`border-width:${parseFloat(lw) || 0}px`);
      if (decls.length) push(`${mq}{${isel} .bmsil-ico{${decls.join(";")}}}`);
    }

    const tc = cssColor(it.textColor);
    if (tc) push(`${isel} .bmsil-txt{color:${tc}}`);

    /* Highlight — the `==marked==` run inside this item's label. */
    const hl: string[] = [];
    // Kadence's rule, kept because the two genuinely cannot coexist: a text
    // gradient is painted by clipping a background to the glyphs, which is the
    // same property a background colour would need.
    const textGrad = it.hlTextGrad === "1";
    const bgGrad = !textGrad && it.hlBgGrad === "1";
    if (textGrad) {
      hl.push(
        `background-image:${gradient(it.hlTextGradType, cssValue(it.hlTextGradFrom), cssValue(it.hlTextGradTo), it.hlTextGradAngle)}`,
        "-webkit-background-clip:text",
        "background-clip:text",
        "color:transparent"
      );
    } else {
      const hc = cssValue(it.hlColor);
      if (hc) hl.push(`color:${hc}`);
      if (bgGrad) {
        hl.push(
          `background:${gradient(it.hlBgGradType, cssValue(it.hlBgGradFrom), cssValue(it.hlBgGradTo), it.hlBgGradAngle)}`
        );
      } else {
        const hb = cssValue(it.hlBg);
        if (hb) hl.push(`background:${hb}`);
      }
    }
    const hbd = sidesAt(it.hlBd, "d");
    if (hbd) {
      hl.push(`border-width:${hbd}`, `border-style:${cssValue(it.hlBdStyle) || "solid"}`);
      hl.push(`border-color:${cssValue(it.hlBdColor) || "currentColor"}`);
    }
    const hrad = sidesAt(it.hlRad, "d");
    if (hrad) hl.push(`border-radius:${hrad}`);
    const hpad = sidesAt(it.hlPad, "d");
    if (hpad) hl.push(`padding:${hpad}`);
    const hfs = scalarAt(it.hlFs, "d");
    if (hfs) hl.push(`font-size:${hfs}`);
    const hlh = cssValue(it.hlLh);
    if (hlh) hl.push(`line-height:${hlh}`);
    const hls = scalarAt(it.hlLs, "d");
    if (hls) hl.push(`letter-spacing:${hls}`);
    const hff = cssValue(it.hlFf);
    if (hff) hl.push(`font-family:${hff}`);
    const hfw = cssValue(it.hlFw);
    if (hfw) hl.push(`font-weight:${hfw}`);
    const htt = cssValue(it.hlTt);
    if (htt) hl.push(`text-transform:${htt}`);
    if (hl.length) push(`${isel} .bmsil-hl{${hl.join(";")}}`);

    for (const [mq, dev] of [[MQ_TABLET, "t"], [MQ_MOBILE, "m"]] as [string, Device][]) {
      const decls: string[] = [];
      const fs2 = scalarAt(it.hlFs, dev);
      if (fs2) decls.push(`font-size:${fs2}`);
      const bd2 = sidesAt(it.hlBd, dev);
      if (bd2) decls.push(`border-width:${bd2}`);
      const rad2 = sidesAt(it.hlRad, dev);
      if (rad2) decls.push(`border-radius:${rad2}`);
      const pad2 = sidesAt(it.hlPad, dev);
      if (pad2) decls.push(`padding:${pad2}`);
      if (decls.length) push(`${mq}{${isel} .bmsil-hl{${decls.join(";")}}}`);
    }

    const itemCss = authorCss(it.customCss, isel);
    if (itemCss) push(itemCss);

    const extra = safeClass(it.cssClass);
    if (extra) used = true;

    const href = safeHref(it.link);
    const target = it.target === "_blank" ? "_blank" : "_self";
    // An item treatment other than the list's needs its own modifier class, and
    // it must beat the list's `.bmsil.is-*` rule — two classes to that rule's
    // two, but emitted later, so it wins.
    const own = it.iconStyle && it.iconStyle !== style ? `is-${it.iconStyle}` : "";
    if (own) used = true;

    const text = typeof it.text === "string" ? it.text : "";

    return {
      scope: used ? [scope, extra].filter(Boolean).join(" ") : extra || undefined,
      icon: cssValue(it.icon) || cssValue(p.icon) || "✓",
      segments: parseHighlight(text),
      // Markers stripped for List View, titles and the search index —
      // `[Download](/f.pdf)` reads as "Download", not as its own source.
      text: text.replace(LINK_RE, "$1").replace(/==([^=]+)==/g, "$1"),
      rawText: text,
      href,
      target,
      rel: linkRel({ newTab: target === "_blank" }),
      showIcon: it.hideIcon !== "1",
      iconTitle: cssValue(it.iconTitle) || undefined,
      styleClass: own || undefined,
    };
  });

  const custom = authorCss(p.customCss, sel);
  if (custom) rules.push(custom);

  return {
    items: resolved,
    listClass: ["bmsil", scopeBase, `is-${style}`, safeClass(p.cssClass)].filter(Boolean).join(" "),
    css: rules.join(""),
    anchor: cssValue(p.anchor) || undefined,
  };
}
