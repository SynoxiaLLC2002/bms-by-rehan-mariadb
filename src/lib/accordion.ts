// The Advanced Accordion model — one resolver read by the editor canvas and the
// published page, the same contract `resolveRow` / `resolveSection` /
// `resolveButtons` / `resolveIconList` keep.
//
// Kadence makes every pane a child block. One block holds the whole accordion
// here, so the panes live in `items` and the accordion's own layout and styling
// live on the block props — the arrangement the Icon List already uses.

import {
  authorCss,
  blockScope,
  cssValue,
  rawAt,
  safeClass,
  scalarAt,
  sidesAt,
  stateKey,
  type PropRec,
} from "./blockStyle";
import { MQ_MOBILE, MQ_TABLET, type Device } from "./responsive";

export type AccordionPane = Record<string, string>;

/* ── Option tables, shared with the panel ─────────────────────────────────── */

/**
 * Trigger glyphs, as a collapsed/expanded pair.
 *
 * A pair rather than one glyph plus a rotation: "plus becomes minus" and "plus
 * becomes times" are different marks, not different angles, and Kadence offers
 * both. `spin` says whether the closed glyph should also turn on the way open,
 * which is what makes the chevron and caret read correctly.
 */
export const ACC_ICON_STYLES: {
  id: string;
  title: string;
  closed: string;
  open: string;
  spin?: boolean;
}[] = [
  { id: "plus", title: "Plus / Minus", closed: "+", open: "−" },
  { id: "plusTimes", title: "Plus / Times", closed: "+", open: "✕" },
  { id: "chevron", title: "Chevron", closed: "⌄", open: "⌄", spin: true },
  { id: "caret", title: "Caret", closed: "▼", open: "▼", spin: true },
  { id: "arrow", title: "Arrow", closed: "›", open: "›", spin: true },
  { id: "circlePlus", title: "Circled Plus", closed: "⊕", open: "⊖" },
];

export const ACC_ICON_SIDES: { id: string; title: string }[] = [
  { id: "left", title: "Left" },
  { id: "right", title: "Right" },
];

/** Kadence warns that `div` is not a heading; the panel repeats that warning. */
export const ACC_TITLE_TAGS = ["div", "h2", "h3", "h4", "h5", "h6"];

export const ACC_LETTER_CASE: { id: string; title: string }[] = [
  { id: "uppercase", title: "AB" },
  { id: "lowercase", title: "ab" },
  { id: "capitalize", title: "Aa" },
];

export const ACC_STATES = ["normal", "hover", "active"] as const;
export type AccState = (typeof ACC_STATES)[number];

/** "" for normal, "h" for hover, "a" for active — the prop-key prefixes. */
export const ACC_STATE_PREFIX: Record<AccState, string> = {
  normal: "",
  hover: "h",
  active: "a",
};

/* ── Resolved shapes ──────────────────────────────────────────────────────── */

export interface ResolvedPane {
  title: string;
  content: string;
  /** Open when the page first renders. */
  open: boolean;
  /** Per-pane class, present only when the pane overrides something. */
  scope?: string;
  anchor?: string;
  /** A decorative glyph in the title, separate from the open/close trigger. */
  titleIcon?: string;
  titleIconSide: "left" | "right";
  /** The title icon's own colour; unset, it takes the title's. */
  titleIconColor?: string;
  /** Show only the icon — the label is dropped from the title. */
  iconOnly: boolean;
  /** The trigger's accessible name, required once the label is gone. */
  ariaLabel?: string;
}

export interface ResolvedAccordion {
  panes: ResolvedPane[];
  wrapClass: string;
  css: string;
  anchor?: string;
  titleTag: string;
  iconSide: "left" | "right";
  showIcon: boolean;
  /** Collapsed and expanded glyphs, and whether the glyph turns. */
  icon: { closed: string; open: string; spin: boolean };
  /** Only one pane may be open at a time. */
  closeOthers: boolean;
  faqSchema: boolean;
}

export function parsePanes(raw: unknown): AccordionPane[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x) => x && typeof x === "object") as AccordionPane[];
  } catch {
    return [];
  }
}

export function serializePanes(list: AccordionPane[]): string {
  const clean = list.map((it) => {
    const out: AccordionPane = {};
    for (const [k, v] of Object.entries(it)) if (v !== "" && v !== undefined && v !== null) out[k] = v;
    return out;
  });
  return JSON.stringify(clean);
}

export function blankPane(n: number): AccordionPane {
  return { title: `Accordion Pane ${n}`, content: "" };
}

export const accordionScope = (block: { id?: unknown; props?: unknown }) => blockScope("bmsacc", block);

/**
 * FAQ structured data for this accordion.
 *
 * Returned as a value rather than a string of markup so the caller decides how
 * to embed it — and so the `<` escaping that stops a `</script>` breakout
 * happens in exactly one place, at the point of embedding.
 */
export function faqSchemaFor(panes: ResolvedPane[], id?: string): object | null {
  const entries = panes.filter((p) => p.title.trim() && p.content.trim());
  if (entries.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    // Named (see lib/blockSchema) so it is one node of the page's graph
    // rather than a floating claim.
    ...(id ? { "@id": id } : {}),
    mainEntity: entries.map((p) => ({
      "@type": "Question",
      name: p.title,
      acceptedAnswer: { "@type": "Answer", text: p.content },
    })),
  };
}


/**
 * Reads an accordion block.
 *
 * `scopeBase` is owned by the caller — the editor names it after the preview
 * node and the page after the rendered one — so this file never has to know
 * which side it is running on.
 */
export function resolveAccordion(p: PropRec, scopeBase: string): ResolvedAccordion {
  const rules: string[] = [];
  const sel = `.${scopeBase}`;
  const raw = parsePanes(p.items);

  /* ── Which pane starts open ────────────────────────────────────────────── */

  const startCollapsed = p.startCollapsed === "1";
  const initial = parseInt(String(p.initialOpen ?? ""), 10);
  const openIndex = startCollapsed ? -1 : Number.isFinite(initial) ? initial : 0;

  const panes: ResolvedPane[] = raw.map((it, i) => {
    const scope = `${scopeBase}-p${i}`;
    let used = false;

    const custom = authorCss(it.customCss, `${sel} .${scope}`);
    if (custom) {
      rules.push(custom);
      used = true;
    }
    const extra = safeClass(it.cssClass);
    if (extra) used = true;

    const iconOnly = it.iconOnly === "1";
    const title = typeof it.title === "string" ? it.title : "";
    return {
      title,
      content: typeof it.content === "string" ? it.content : "",
      open: i === openIndex,
      scope: used ? [scope, extra].filter(Boolean).join(" ") : undefined,
      anchor: cssValue(it.anchor) || undefined,
      titleIcon: cssValue(it.titleIcon) || undefined,
      titleIconSide: it.titleIconSide === "right" ? "right" : "left",
      titleIconColor: cssValue(it.titleIconColor) || undefined,
      iconOnly,
      // With the label hidden there is nothing left to announce, so the title
      // stands in until the author writes a better one.
      ariaLabel: cssValue(it.ariaLabel) || (iconOnly ? title : undefined) || undefined,
    };
  });

  /* ── Layout ────────────────────────────────────────────────────────────── */

  const layoutAt = (d: Device): string[] => {
    const decls: string[] = [];
    const cols = rawAt(p.cols, d);
    if (cols) {
      const n = Math.max(1, Math.min(3, parseInt(cols, 10) || 1));
      decls.push(`grid-template-columns:repeat(${n},minmax(0,1fr))`);
    }
    const gap = scalarAt(p.gap, d);
    if (gap) decls.push(`gap:${gap}`);
    const mw = scalarAt(p.maxWidth, d);
    if (mw) decls.push(`max-width:${mw}`, "margin-inline:auto");
    return decls;
  };

  const l0 = layoutAt("d");
  if (l0.length) rules.push(`${sel}{${l0.join(";")}}`);
  for (const [mq, dev] of [[MQ_TABLET, "t"], [MQ_MOBILE, "m"]] as [string, Device][]) {
    const decls = layoutAt(dev);
    if (decls.length) rules.push(`${mq}{${sel}{${decls.join(";")}}}`);
  }

  /* ── Pane title, per state ─────────────────────────────────────────────── */

  // `.is-open` rather than a pseudo-class for active: an accordion's "active" is
  // a state the component owns, not one the browser knows about.
  const stateSel: Record<AccState, string> = {
    normal: `${sel} .bmsacc-title`,
    hover: `${sel} .bmsacc-title:hover,${sel} .bmsacc-title:focus-visible`,
    active: `${sel} .bmsacc-pane.is-open > .bmsacc-title`,
  };

  for (const state of ACC_STATES) {
    const k = (n: string) => stateKey(ACC_STATE_PREFIX[state], n);
    const decls: string[] = [];

    const color = cssValue(p[k("titleColor")]);
    if (color) decls.push(`color:${color}`);
    const bg = cssValue(p[k("titleBg")]);
    if (bg) decls.push(`background:${bg}`);
    const bdColor = cssValue(p[k("tBdColor")]);
    if (bdColor) decls.push(`border-color:${bdColor}`);
    const bd = sidesAt(p[k("tBd")], "d");
    if (bd) decls.push(`border-width:${bd}`, `border-style:${cssValue(p.tBdStyle) || "solid"}`);
    const rad = sidesAt(p[k("tRad")], "d");
    if (rad) decls.push(`border-radius:${rad}`);

    // Typography and padding are not per-state — a title that resizes on hover
    // would move the page under the pointer.
    if (state === "normal") {
      const pad = sidesAt(p.tPad, "d");
      if (pad) decls.push(`padding:${pad}`);
      const fs = scalarAt(p.fs, "d");
      if (fs) decls.push(`font-size:${fs}`);
      const lh = cssValue(p.lh);
      if (lh) decls.push(`line-height:${lh}`);
      const ls = scalarAt(p.ls, "d");
      if (ls) decls.push(`letter-spacing:${ls}`);
      const ff = cssValue(p.ff);
      if (ff) decls.push(`font-family:${ff}`);
      const fw = cssValue(p.fw);
      if (fw) decls.push(`font-weight:${fw}`);
      const tt = cssValue(p.tt);
      if (tt) decls.push(`text-transform:${tt}`);
    }

    if (decls.length) rules.push(`${stateSel[state]}{${decls.join(";")}}`);

    const iconColor = cssValue(p[k("iconColor")]);
    if (iconColor) {
      const isel =
        state === "active"
          ? `${sel} .bmsacc-pane.is-open > .bmsacc-title .bmsacc-ico`
          : state === "hover"
            ? `${sel} .bmsacc-title:hover .bmsacc-ico`
            : `${sel} .bmsacc-title .bmsacc-ico`;
      rules.push(`${isel}{color:${iconColor}}`);
    }
  }

  for (const [mq, dev] of [[MQ_TABLET, "t"], [MQ_MOBILE, "m"]] as [string, Device][]) {
    const decls: string[] = [];
    const pad = sidesAt(p.tPad, dev);
    if (pad) decls.push(`padding:${pad}`);
    const fs = scalarAt(p.fs, dev);
    if (fs) decls.push(`font-size:${fs}`);
    const ls = scalarAt(p.ls, dev);
    if (ls) decls.push(`letter-spacing:${ls}`);
    const bd = sidesAt(p.tBd, dev);
    if (bd) decls.push(`border-width:${bd}`);
    const rad = sidesAt(p.tRad, dev);
    if (rad) decls.push(`border-radius:${rad}`);
    if (decls.length) rules.push(`${mq}{${sel} .bmsacc-title{${decls.join(";")}}}`);
  }

  /* ── Inner content ─────────────────────────────────────────────────────── */

  const body: string[] = [];
  const cText = cssValue(p.cText);
  if (cText) body.push(`color:${cText}`);
  const cBg = cssValue(p.cBg);
  if (cBg) body.push(`background:${cBg}`);
  const cPad = sidesAt(p.cPad, "d");
  if (cPad) body.push(`padding:${cPad}`);
  const cBd = sidesAt(p.cBd, "d");
  if (cBd) {
    body.push(`border-width:${cBd}`, `border-style:${cssValue(p.cBdStyle) || "solid"}`);
    body.push(`border-color:${cssValue(p.cBdColor) || "currentColor"}`);
  }
  const cRad = sidesAt(p.cRad, "d");
  if (cRad) body.push(`border-radius:${cRad}`);
  const minH = scalarAt(p.minHeight, "d");
  if (minH) body.push(`min-height:${minH}`);
  if (body.length) rules.push(`${sel} .bmsacc-body{${body.join(";")}}`);

  const cLink = cssValue(p.cLink);
  if (cLink) rules.push(`${sel} .bmsacc-body a{color:${cLink}}`);
  const cLinkHover = cssValue(p.cLinkHover);
  if (cLinkHover) rules.push(`${sel} .bmsacc-body a:hover{color:${cLinkHover}}`);

  for (const [mq, dev] of [[MQ_TABLET, "t"], [MQ_MOBILE, "m"]] as [string, Device][]) {
    const decls: string[] = [];
    const pad = sidesAt(p.cPad, dev);
    if (pad) decls.push(`padding:${pad}`);
    const bd = sidesAt(p.cBd, dev);
    if (bd) decls.push(`border-width:${bd}`);
    const rad = sidesAt(p.cRad, dev);
    if (rad) decls.push(`border-radius:${rad}`);
    const mh = scalarAt(p.minHeight, dev);
    if (mh) decls.push(`min-height:${mh}`);
    if (decls.length) rules.push(`${mq}{${sel} .bmsacc-body{${decls.join(";")}}}`);
  }

  const custom = authorCss(p.customCss, sel);
  if (custom) rules.push(custom);

  const iconDef =
    ACC_ICON_STYLES.find((s) => s.id === p.iconStyle) ?? ACC_ICON_STYLES[0];
  const tag = ACC_TITLE_TAGS.includes(p.titleTag) ? p.titleTag : "div";

  return {
    panes,
    wrapClass: ["bmsacc", scopeBase, safeClass(p.cssClass)].filter(Boolean).join(" "),
    css: rules.join(""),
    anchor: cssValue(p.anchor) || undefined,
    titleTag: tag,
    iconSide: p.iconSide === "left" ? "left" : "right",
    showIcon: p.showIcon !== "0",
    icon: { closed: iconDef.closed, open: iconDef.open, spin: !!iconDef.spin },
    closeOthers: p.closeOthers !== "0",
    faqSchema: p.faqSchema === "1",
  };
}
