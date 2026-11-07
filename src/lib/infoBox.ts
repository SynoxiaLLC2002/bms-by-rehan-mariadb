// The Advanced Info Box model — one resolver read by the editor canvas and the
// published page, the same contract `resolveRow` / `resolveSection` /
// `resolveButtons` / `resolveIconList` / `resolveAccordion` keep.
//
// Kadence's Info Box is a single block with four parts — media, title, text and
// a "Learn More" — and a link that may wrap any of them. All four live on the
// block's own props here rather than in an `items` array, because unlike the
// Icon List and the Accordion there is exactly one of each: the parts are named
// slots, not a repeater, so a flat prop per slot is the honest shape.
//
// The pre-Advanced `{icon,title,text,variant}` props are all still read, so
// every info box saved before this block grew up renders unchanged — `variant`
// keeps supplying the base palette when the author has set no colours of their
// own.

import {
  authorCss,
  blockScope,
  cssValue,
  gradient,
  rawAt,
  safeClass,
  safeHref,
  scalarAt,
  sidesAt,
  stateKey,
  type PropRec,
} from "./blockStyle";
import { MQ_MOBILE, MQ_TABLET, type Device } from "./responsive";
import { linkRel } from "./linkRel";

/* ── Option tables, shared with the panel ─────────────────────────────────── */

/** Where the media sits relative to the title and text. */
export const IB_MEDIA_ALIGN: { id: string; title: string }[] = [
  { id: "top", title: "Top" },
  { id: "left", title: "Left" },
  { id: "right", title: "Right" },
];

/** How media beside the text lines up against it. Ignored when media is on top. */
export const IB_MEDIA_VALIGN: { id: string; title: string }[] = [
  { id: "top", title: "Top" },
  { id: "middle", title: "Middle" },
  { id: "bottom", title: "Bottom" },
];

export const IB_MEDIA_TYPES: { id: string; title: string }[] = [
  { id: "icon", title: "Icon" },
  { id: "image", title: "Image" },
  { id: "number", title: "Number" },
  { id: "none", title: "None" },
];

/**
 * Icon hover animations.
 *
 * Every one is a transform released on hover of the *box*, not of the icon —
 * an info box is one target, and an animation that only fires when the pointer
 * happens to cross the glyph reads as a bug. The two that need a sequence get a
 * keyframe in the base stylesheet; the rest are a single transform.
 */
export const IB_ICON_ANIMS: { id: string; title: string }[] = [
  { id: "", title: "None" },
  { id: "flip", title: "Flip" },
  { id: "pulse", title: "Pulse" },
  { id: "bounce", title: "Bounce" },
  { id: "rotate", title: "Rotate" },
  { id: "grow", title: "Grow" },
  { id: "shrink", title: "Shrink" },
  { id: "slide", title: "Slide Up" },
];

/** Kadence warns that `div` is not a heading; the panel repeats that warning. */
export const IB_TITLE_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "div"];

/** What the block's link wraps. */
export const IB_LINK_CONTENT: { id: string; title: string }[] = [
  { id: "box", title: "Entire Box" },
  { id: "learn", title: "Learn More" },
  { id: "none", title: "None" },
];

export const IB_REL_FLAGS: { id: string; title: string }[] = [
  { id: "nofollow", title: "nofollow" },
  { id: "sponsored", title: "sponsored" },
  { id: "ugc", title: "ugc" },
];

export const IB_ALIGN: { id: string; title: string }[] = [
  { id: "left", title: "Left" },
  { id: "center", title: "Center" },
  { id: "right", title: "Right" },
];

export const IB_LETTER_CASE: { id: string; title: string }[] = [
  { id: "uppercase", title: "AB" },
  { id: "lowercase", title: "ab" },
  { id: "capitalize", title: "Aa" },
];

/** The legacy palette, kept as a quick base look and as old content's meaning. */
export const IB_VARIANTS: { id: string; title: string }[] = [
  { id: "", title: "None" },
  { id: "info", title: "Info" },
  { id: "success", title: "Success" },
  { id: "warning", title: "Warning" },
  { id: "error", title: "Error" },
];

/**
 * The pre-Advanced block stored a variant *name* in `icon` and then rendered it
 * verbatim, so an untouched info box showed the literal word "info". Mapping
 * the four names to glyphs fixes those pages on the way through rather than
 * needing a migration — no author ever meant the word.
 */
const LEGACY_ICON_WORDS: Record<string, string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  error: "✕",
};

/**
 * The six quick layouts.
 *
 * Each is a patch of ordinary props rather than a mode the resolver knows
 * about, so applying one leaves every control still meaning what it meant —
 * a preset is a starting point an author can then take apart, which is the
 * whole reason Kadence puts them at the top of the panel.
 *
 * Two of them hang the media *over* the container's top edge. That is not a
 * mode either: it is a negative media margin plus an opaque frame background,
 * so the author can drag it back inside with the ordinary Media Margin control.
 *
 * `contPad` is the card's *inner* padding, which is not what `bx` offers: `bx`
 * pads the wrapper around the whole block, so its padding lands outside the
 * border. The two are different boxes, the way the Accordion's title padding is
 * different from its block padding. A bordered box with no inner padding reads
 * as broken, so every preset here sets one.
 */
export interface InfoBoxPreset {
  id: string;
  title: string;
  /** Rough sketch for the panel's thumbnail: where media and text sit. */
  sketch: {
    media: "top" | "left";
    align: "left" | "center";
    shape: "none" | "square" | "circle";
    /** The media hangs over the container's top edge. */
    badge: boolean;
    learn: boolean;
  };
  props: PropRec;
}

const SKY = "#0ea5e9";
const LINE = "#e2e8f0";

export const IB_PRESETS: InfoBoxPreset[] = [
  {
    id: "badgeLeft",
    title: "Outlined badge on the top edge, text left",
    sketch: { media: "top", align: "left", shape: "square", badge: true, learn: false },
    props: {
      mediaAlign: "top",
      textAlign: '{"d":"left"}',
      iconSize: '{"d":"22"}',
      iconBg: "#ffffff",
      iconColor: SKY,
      iconBorder: '{"d":"2"}',
      iconBorderColor: SKY,
      iconRadius: '{"d":"8"}',
      iconPad: '{"d":["9","9","9","9"],"lk":1}',
      // Up and over the border: the frame is 44px tall, so pulling it by the
      // top padding plus half its height centres it on the border line.
      mediaMar: '{"d":["-60","0","0","0"]}',
      contPad: '{"d":["38","26","26","26"]}',
      bd: '{"d":["1","1","1","1"],"lk":1}',
      bdColor: SKY,
      rad: '{"d":["10","10","10","10"],"lk":1}',
    },
  },
  {
    id: "badgeCenter",
    title: "Round badge on the top edge, centred",
    sketch: { media: "top", align: "center", shape: "circle", badge: true, learn: false },
    props: {
      mediaAlign: "top",
      textAlign: '{"d":"center"}',
      iconSize: '{"d":"26"}',
      iconBg: "#ffffff",
      iconColor: SKY,
      iconBorder: '{"d":"2"}',
      iconBorderColor: SKY,
      iconRadius: '{"d":"999"}',
      iconPad: '{"d":["12","12","12","12"],"lk":1}',
      mediaMar: '{"d":["-71","0","0","0"]}',
      contPad: '{"d":["44","26","28","26"]}',
      bd: '{"d":["1","1","1","1"],"lk":1}',
      bdColor: SKY,
      rad: '{"d":["12","12","12","12"],"lk":1}',
    },
  },
  {
    id: "stackedCenter",
    title: "Filled icon above, centred, with a button",
    sketch: { media: "top", align: "center", shape: "circle", badge: false, learn: true },
    props: {
      mediaAlign: "top",
      textAlign: '{"d":"center"}',
      iconSize: '{"d":"26"}',
      iconBg: SKY,
      iconColor: "#ffffff",
      iconRadius: '{"d":"999"}',
      iconPad: '{"d":["14","14","14","14"],"lk":1}',
      contPad: '{"d":["30","26","30","26"]}',
      bd: '{"d":["1","1","1","1"],"lk":1}',
      bdColor: LINE,
      rad: '{"d":["12","12","12","12"],"lk":1}',
      showLearn: "1",
      learnBg: SKY,
      learnColor: "#ffffff",
      learnPad: '{"d":["10","18","10","18"]}',
      learnRad: '{"d":["8","8","8","8"],"lk":1}',
    },
  },
  {
    id: "stackedLeft",
    title: "Plain icon above, text left",
    sketch: { media: "top", align: "left", shape: "none", badge: false, learn: false },
    props: {
      mediaAlign: "top",
      textAlign: '{"d":"left"}',
      iconSize: '{"d":"34"}',
      iconColor: SKY,
      contPad: '{"d":["26","26","26","26"]}',
      bd: '{"d":["1","1","1","1"],"lk":1}',
      bdColor: LINE,
      rad: '{"d":["12","12","12","12"],"lk":1}',
    },
  },
  {
    id: "beside",
    title: "Icon beside the text, top aligned",
    sketch: { media: "left", align: "left", shape: "none", badge: false, learn: false },
    props: {
      mediaAlign: "left",
      mediaVAlign: "top",
      textAlign: '{"d":"left"}',
      iconSize: '{"d":"30"}',
      iconColor: SKY,
      contPad: '{"d":["24","26","24","26"]}',
      bd: '{"d":["1","1","1","1"],"lk":1}',
      bdColor: LINE,
      rad: '{"d":["12","12","12","12"],"lk":1}',
    },
  },
  {
    id: "besideMiddle",
    title: "Filled icon beside the text, middle aligned",
    sketch: { media: "left", align: "left", shape: "circle", badge: false, learn: false },
    props: {
      mediaAlign: "left",
      mediaVAlign: "middle",
      textAlign: '{"d":"left"}',
      iconSize: '{"d":"22"}',
      iconBg: SKY,
      iconColor: "#ffffff",
      iconRadius: '{"d":"999"}',
      iconPad: '{"d":["12","12","12","12"],"lk":1}',
      contPad: '{"d":["24","26","24","26"]}',
      bd: '{"d":["1","1","1","1"],"lk":1}',
      bdColor: LINE,
      rad: '{"d":["12","12","12","12"],"lk":1}',
    },
  },
];

/**
 * Every prop a preset may set, so applying one *clears* what the last one left
 * behind. Without this, switching from the round badge to the plain stack would
 * keep the negative margin that hung it over the border, and the icon would
 * float outside a box that no longer expects it.
 *
 * `variant` is in the list because the legacy palette carries its own padding
 * on the inner box, which would double up with the padding a preset seeds.
 */
const PRESET_KEYS: string[] = Array.from(
  new Set(["variant", ...IB_PRESETS.flatMap((preset) => Object.keys(preset.props))])
);

/**
 * The full prop patch for a preset — its own values over a blank slate.
 *
 * Returned rather than applied so the panel can write it in a single update:
 * one write means one undo step, which is what an author expects from a preset.
 */
export function presetPatch(id: string): PropRec | null {
  const preset = IB_PRESETS.find((x) => x.id === id);
  if (!preset) return null;
  const props: PropRec = {};
  for (const key of PRESET_KEYS) props[key] = "";
  return { ...props, ...preset.props, preset: id };
}

/* ── Resolved shape ───────────────────────────────────────────────────────── */

export interface ResolvedInfoBox {
  /** Every class the outer element carries, scope included. */
  boxClass: string;
  css: string;
  anchor?: string;

  /** The link, already stripped of unsafe schemes. */
  href: string;
  target: string;
  rel?: string;
  linkTitle?: string;
  /** "box" wraps everything, "learn" only the Learn More, "none" links nothing. */
  linkContent: "box" | "learn" | "none";

  mediaType: "icon" | "image" | "number" | "none";
  icon: string;
  /** The accessible name for a glyph that is not purely decorative. */
  iconTitle?: string;
  image: string;
  imageAlt: string;
  number: string;

  showTitle: boolean;
  title: string;
  titleTag: string;

  showText: boolean;
  text: string;

  showLearn: boolean;
  learnMore: string;
  learnIcon?: string;
  learnIconSide: "left" | "right";
  /** The link icon's own colour; unset, it takes the link's. */
  learnIconColor?: string;
}

export const infoBoxScope = (block: { id?: unknown; props?: unknown }) => blockScope("bmsib", block);

/** Every device that carries its own value, so a rule is only emitted when asked for. */
const DEVICE_RULES: [string, Device][] = [
  [MQ_TABLET, "t"],
  [MQ_MOBILE, "m"],
];

/** Turns a text alignment into the cross-axis alignment a stacked box needs. */
const FLEX_FOR_ALIGN: Record<string, string> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

const FLEX_FOR_VALIGN: Record<string, string> = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
};

/**
 * A box-shadow from its five parts, or "" when the author has not enabled one.
 *
 * `none` rather than "" when a state disables it, so a hover state can switch
 * the shadow *off* — which an empty declaration cannot express.
 */
function shadowAt(p: PropRec, prefix: string): string {
  const k = (n: string) => stateKey(prefix, n);
  if (p[k("shadow")] !== "1") return "";
  const num = (raw: string | undefined, fallback: string) => {
    const v = String(raw ?? "").trim();
    return v === "" ? fallback : `${parseFloat(v) || 0}px`;
  };
  const color = cssValue(p[k("shColor")]) || "rgba(15,23,42,.15)";
  return `${num(p[k("shX")], "0px")} ${num(p[k("shY")], "6px")} ${num(p[k("shBlur")], "18px")} ${num(
    p[k("shSpread")],
    "0px"
  )} ${color}`;
}

/** The background declaration for a state, colour or gradient. */
function backgroundAt(p: PropRec, prefix: string): string {
  const k = (n: string) => stateKey(prefix, n);
  if (p[k("bgType")] === "gradient") {
    return gradient(
      p[k("bgGradType")],
      cssValue(p[k("bgGradFrom")]),
      cssValue(p[k("bgGradTo")]),
      p[k("bgGradAngle")]
    );
  }
  return cssValue(p[k("bg")]);
}

/**
 * Reads an info box block.
 *
 * `scopeBase` is owned by the caller — the editor names it after the preview
 * node and the page after the rendered one — so this file never has to know
 * which side it is running on.
 */
export function resolveInfoBox(p: PropRec, scopeBase: string): ResolvedInfoBox {
  const rules: string[] = [];
  const sel = `.${scopeBase}`;
  const wrap = `${sel} .bmsib-wrap`;
  // Hover reads off the whole box rather than the hovered part: an info box is
  // one target, and a title that only recolours when the pointer crosses the
  // glyph itself reads as a bug rather than a state.
  const hoverWrap = `${sel}:hover .bmsib-wrap,${sel}:focus-within .bmsib-wrap`;

  const mediaAlign = IB_MEDIA_ALIGN.some((a) => a.id === p.mediaAlign) ? p.mediaAlign : "top";
  const mediaVAlign = IB_MEDIA_VALIGN.some((a) => a.id === p.mediaVAlign) ? p.mediaVAlign : "top";
  const mediaType = (IB_MEDIA_TYPES.some((m) => m.id === p.mediaType) ? p.mediaType : "icon") as
    | "icon"
    | "image"
    | "number"
    | "none";

  /* ── Alignment, per breakpoint ─────────────────────────────────────────── */

  // Only the devices the author actually set get a rule; the cascade covers the
  // rest, and the emitted sheet stays small.
  const alignAt = (d: Device): string[] => {
    const decls: string[] = [];
    const align = cssValue(rawAt(p.textAlign, d));
    if (align && FLEX_FOR_ALIGN[align]) {
      decls.push(`text-align:${align}`);
      // Stacked media follows the text; media beside the text has its own
      // control, so it must not be dragged around by the alignment.
      if (mediaAlign === "top") decls.push(`align-items:${FLEX_FOR_ALIGN[align]}`);
    }
    return decls;
  };

  const a0 = alignAt("d");
  if (mediaAlign !== "top") a0.push(`align-items:${FLEX_FOR_VALIGN[mediaVAlign]}`);
  if (a0.length) rules.push(`${wrap}{${a0.join(";")}}`);
  for (const [mq, dev] of DEVICE_RULES) {
    const decls = alignAt(dev);
    if (decls.length) rules.push(`${mq}{${wrap}{${decls.join(";")}}}`);
  }

  /* ── Container, normal and hover ───────────────────────────────────────── */

  for (const state of ["", "h"] as const) {
    const k = (n: string) => stateKey(state, n);
    const decls: string[] = [];

    const bg = backgroundAt(p, state);
    if (bg) decls.push(`background:${bg}`);

    const bdColor = cssValue(p[k("bdColor")]);
    const bd = sidesAt(p[k("bd")], "d");
    if (bd) {
      decls.push(`border-width:${bd}`, `border-style:${cssValue(p.bdStyle) || "solid"}`);
      decls.push(`border-color:${bdColor || "currentColor"}`);
    } else if (bdColor) {
      decls.push(`border-color:${bdColor}`);
    }

    const rad = sidesAt(p[k("rad")], "d");
    if (rad) decls.push(`border-radius:${rad}`);

    const shadow = shadowAt(p, state);
    if (shadow) decls.push(`box-shadow:${shadow}`);
    // A hover state with a shadow set on neither side still has to be able to
    // remove the resting one.
    else if (state === "h" && p.hShadowOff === "1") decls.push("box-shadow:none");

    if (state === "") {
      // The card's own padding. `bx` pads the wrapper *around* the block, which
      // lands outside this border — the two are different boxes.
      const pad = sidesAt(p.contPad, "d");
      if (pad) decls.push(`padding:${pad}`);
      const mw = scalarAt(p.maxWidth, "d");
      // Centred, the way the Accordion's own Max Width behaves — a narrowed box
      // pinned to the left of its column reads as a mistake rather than a choice.
      if (mw) decls.push(`max-width:${mw}`, "margin-inline:auto");
      if (p.fullHeight === "1") decls.push("height:100%");
    }

    if (decls.length) rules.push(`${state === "" ? wrap : hoverWrap}{${decls.join(";")}}`);
  }

  // Breakpoint-only container values: padding, border, radius and max width are
  // the four a narrow screen genuinely wants to change.
  for (const [mq, dev] of DEVICE_RULES) {
    const decls: string[] = [];
    const pad = sidesAt(p.contPad, dev);
    if (pad) decls.push(`padding:${pad}`);
    const bd = sidesAt(p.bd, dev);
    if (bd) decls.push(`border-width:${bd}`);
    const rad = sidesAt(p.rad, dev);
    if (rad) decls.push(`border-radius:${rad}`);
    const mw = scalarAt(p.maxWidth, dev);
    if (mw) decls.push(`max-width:${mw}`, "margin-inline:auto");
    if (decls.length) rules.push(`${mq}{${wrap}{${decls.join(";")}}}`);
  }

  /* ── Media ─────────────────────────────────────────────────────────────── */

  const mediaDecls: string[] = [];
  const mediaMar = sidesAt(p.mediaMar, "d");
  if (mediaMar) mediaDecls.push(`margin:${mediaMar}`);
  const mediaPad = sidesAt(p.mediaPad, "d");
  if (mediaPad) mediaDecls.push(`padding:${mediaPad}`);
  if (mediaDecls.length) rules.push(`${sel} .bmsib-media{${mediaDecls.join(";")}}`);

  for (const [mq, dev] of DEVICE_RULES) {
    const decls: string[] = [];
    const mar = sidesAt(p.mediaMar, dev);
    if (mar) decls.push(`margin:${mar}`);
    const pad = sidesAt(p.mediaPad, dev);
    if (pad) decls.push(`padding:${pad}`);
    if (decls.length) rules.push(`${mq}{${sel} .bmsib-media{${decls.join(";")}}}`);
  }

  // The glyph, the number and the image frame share one element, so one set of
  // frame controls serves all three rather than three that drift apart.
  const frame = `${sel} .bmsib-ico`;
  for (const state of ["", "h"] as const) {
    const k = (n: string) => stateKey(state, n);
    const decls: string[] = [];

    const color = cssValue(p[k("iconColor")]);
    if (color) decls.push(`color:${color}`);
    const bg = cssValue(p[k("iconBg")]);
    if (bg) decls.push(`background:${bg}`);

    const bw = rawAt(p.iconBorder, "d");
    const bc = cssValue(p[k("iconBorderColor")]);
    if (state === "" && bw) {
      decls.push(`border-width:${parseFloat(bw) || 0}px`, "border-style:solid");
      decls.push(`border-color:${bc || "currentColor"}`);
    } else if (bc) {
      decls.push(`border-color:${bc}`);
    }

    if (state === "") {
      const size = scalarAt(p.iconSize, "d");
      if (size) decls.push(`font-size:${size}`);
      const radius = scalarAt(p.iconRadius, "d");
      if (radius) decls.push(`border-radius:${radius}`);
      const pad = sidesAt(p.iconPad, "d");
      if (pad) decls.push(`padding:${pad}`);
    }

    if (decls.length) {
      rules.push(`${state === "" ? frame : `${sel}:hover .bmsib-ico,${sel}:focus-within .bmsib-ico`}{${decls.join(";")}}`);
    }
  }

  for (const [mq, dev] of DEVICE_RULES) {
    const decls: string[] = [];
    const size = scalarAt(p.iconSize, dev);
    if (size) decls.push(`font-size:${size}`);
    const radius = scalarAt(p.iconRadius, dev);
    if (radius) decls.push(`border-radius:${radius}`);
    const pad = sidesAt(p.iconPad, dev);
    if (pad) decls.push(`padding:${pad}`);
    const bw = rawAt(p.iconBorder, dev);
    if (bw) decls.push(`border-width:${parseFloat(bw) || 0}px`);
    if (decls.length) rules.push(`${mq}{${frame}{${decls.join(";")}}}`);
  }

  // An image is sized by width rather than font size, so it gets its own rule.
  const imgW = scalarAt(p.imageW, "d");
  if (imgW) rules.push(`${sel} .bmsib-img{width:${imgW}}`);
  for (const [mq, dev] of DEVICE_RULES) {
    const w = scalarAt(p.imageW, dev);
    if (w) rules.push(`${mq}{${sel} .bmsib-img{width:${w}}}`);
  }

  /* ── Title and text ────────────────────────────────────────────────────── */

  /** One emitter for the two typographic parts — they carry the same controls. */
  const typo = (part: "title" | "text", cls: string) => {
    const key = (n: string) => `${part}${n[0].toUpperCase()}${n.slice(1)}`;
    const partSel = `${sel} ${cls}`;

    const decls: string[] = [];
    const color = cssValue(p[key("color")]);
    if (color) decls.push(`color:${color}`);
    const fs = scalarAt(p[key("fs")], "d");
    if (fs) decls.push(`font-size:${fs}`);
    const lh = cssValue(p[key("lh")]);
    if (lh) decls.push(`line-height:${lh}`);
    const ls = scalarAt(p[key("ls")], "d");
    if (ls) decls.push(`letter-spacing:${ls}`);
    const ff = cssValue(p[key("ff")]);
    if (ff) decls.push(`font-family:${ff}`);
    const fw = cssValue(p[key("fw")]);
    if (fw) decls.push(`font-weight:${fw}`);
    const tt = cssValue(p[key("tt")]);
    if (tt) decls.push(`text-transform:${tt}`);
    const pad = sidesAt(p[key("pad")], "d");
    if (pad) decls.push(`padding:${pad}`);
    const mar = sidesAt(p[key("mar")], "d");
    if (mar) decls.push(`margin:${mar}`);
    const minH = scalarAt(p[key("minH")], "d");
    if (minH) decls.push(`min-height:${minH}`);
    if (decls.length) rules.push(`${partSel}{${decls.join(";")}}`);

    // Colour is the only part that changes on hover — resizing text under the
    // pointer moves the page the reader is aiming at.
    const hover = cssValue(p[stateKey("h", key("color"))]);
    if (hover) rules.push(`${sel}:hover ${cls},${sel}:focus-within ${cls}{color:${hover}}`);

    for (const [mq, dev] of DEVICE_RULES) {
      const d: string[] = [];
      const s = scalarAt(p[key("fs")], dev);
      if (s) d.push(`font-size:${s}`);
      const t = scalarAt(p[key("ls")], dev);
      if (t) d.push(`letter-spacing:${t}`);
      const pd = sidesAt(p[key("pad")], dev);
      if (pd) d.push(`padding:${pd}`);
      const mr = sidesAt(p[key("mar")], dev);
      if (mr) d.push(`margin:${mr}`);
      const mh = scalarAt(p[key("minH")], dev);
      if (mh) d.push(`min-height:${mh}`);
      if (d.length) rules.push(`${mq}{${partSel}{${d.join(";")}}}`);
    }
  };

  typo("title", ".bmsib-title");
  typo("text", ".bmsib-text");

  /* ── Learn More ────────────────────────────────────────────────────────── */

  const learn = `${sel} .bmsib-learn`;
  for (const state of ["", "h"] as const) {
    const k = (n: string) => stateKey(state, n);
    const decls: string[] = [];

    const color = cssValue(p[k("learnColor")]);
    if (color) decls.push(`color:${color}`);
    const bg = cssValue(p[k("learnBg")]);
    if (bg) decls.push(`background:${bg}`);
    const bdColor = cssValue(p[k("learnBdColor")]);
    const bd = sidesAt(p[k("learnBd")], "d");
    if (bd) {
      decls.push(`border-width:${bd}`, "border-style:solid");
      decls.push(`border-color:${bdColor || "currentColor"}`);
    } else if (bdColor) {
      decls.push(`border-color:${bdColor}`);
    }

    if (state === "") {
      const rad = sidesAt(p.learnRad, "d");
      if (rad) decls.push(`border-radius:${rad}`);
      const pad = sidesAt(p.learnPad, "d");
      if (pad) decls.push(`padding:${pad}`);
      const mar = sidesAt(p.learnMar, "d");
      if (mar) decls.push(`margin:${mar}`);
      const fs = scalarAt(p.learnFs, "d");
      if (fs) decls.push(`font-size:${fs}`);
      const lh = cssValue(p.learnLh);
      if (lh) decls.push(`line-height:${lh}`);
      const ls = scalarAt(p.learnLs, "d");
      if (ls) decls.push(`letter-spacing:${ls}`);
      const ff = cssValue(p.learnFf);
      if (ff) decls.push(`font-family:${ff}`);
      const fw = cssValue(p.learnFw);
      if (fw) decls.push(`font-weight:${fw}`);
      const tt = cssValue(p.learnTt);
      if (tt) decls.push(`text-transform:${tt}`);
    }

    if (decls.length) {
      rules.push(`${state === "" ? learn : `${sel}:hover .bmsib-learn,${sel}:focus-within .bmsib-learn`}{${decls.join(";")}}`);
    }
  }

  for (const [mq, dev] of DEVICE_RULES) {
    const decls: string[] = [];
    const fs = scalarAt(p.learnFs, dev);
    if (fs) decls.push(`font-size:${fs}`);
    const pad = sidesAt(p.learnPad, dev);
    if (pad) decls.push(`padding:${pad}`);
    const mar = sidesAt(p.learnMar, dev);
    if (mar) decls.push(`margin:${mar}`);
    const bd = sidesAt(p.learnBd, dev);
    if (bd) decls.push(`border-width:${bd}`);
    const rad = sidesAt(p.learnRad, dev);
    if (rad) decls.push(`border-radius:${rad}`);
    if (decls.length) rules.push(`${mq}{${learn}{${decls.join(";")}}}`);
  }

  /* ── Author CSS, last so it wins ───────────────────────────────────────── */

  const custom = authorCss(p.customCss, sel);
  if (custom) rules.push(custom);

  /* ── The resolved values the markup needs ──────────────────────────────── */

  const linkContent = (IB_LINK_CONTENT.some((l) => l.id === p.linkContent) ? p.linkContent : "box") as
    | "box"
    | "learn"
    | "none";

  const target = p.linkTarget === "_blank" ? "_blank" : "_self";
  const relFlags = String(p.linkRel ?? "")
    .split(/[\s,]+/)
    .filter((x) => IB_REL_FLAGS.some((f) => f.id === x));
  if (target === "_blank") relFlags.push(...linkRel({ newTab: true })!.split(" "));

  const anim = IB_ICON_ANIMS.some((a) => a.id === p.iconAnim && a.id) ? `is-anim-${p.iconAnim}` : "";
  const variant = IB_VARIANTS.some((v) => v.id === p.variant && v.id) ? `is-${p.variant}` : "";
  const titleTag = IB_TITLE_TAGS.includes(String(p.titleTag)) ? String(p.titleTag) : "h3";

  return {
    boxClass: [
      "bmsib",
      scopeBase,
      `is-media-${mediaAlign}`,
      variant,
      anim,
      safeClass(p.cssClass),
    ]
      .filter(Boolean)
      .join(" "),
    css: rules.join(""),
    anchor: cssValue(p.anchor) || undefined,

    href: safeHref(p.link),
    target,
    rel: relFlags.length ? Array.from(new Set(relFlags)).join(" ") : undefined,
    linkTitle: typeof p.linkTitle === "string" && p.linkTitle.trim() ? p.linkTitle.trim() : undefined,
    linkContent,

    mediaType,
    icon: LEGACY_ICON_WORDS[String(p.icon ?? "")] || cssValue(p.icon) || "ℹ",
    iconTitle: typeof p.iconTitle === "string" && p.iconTitle.trim() ? p.iconTitle.trim() : undefined,
    image: safeHref(p.image),
    imageAlt: typeof p.imageAlt === "string" ? p.imageAlt : "",
    number: typeof p.number === "string" ? p.number : "",

    showTitle: p.showTitle !== "",
    title: typeof p.title === "string" ? p.title : "",
    titleTag,

    showText: p.showText !== "",
    text: typeof p.text === "string" ? p.text : "",

    showLearn: p.showLearn === "1",
    learnMore: (typeof p.learnMore === "string" && p.learnMore.trim()) || "Learn More",
    learnIcon: cssValue(p.learnIcon) || undefined,
    learnIconSide: p.learnIconSide === "left" ? "left" : "right",
    learnIconColor: cssValue(p.learnIconColor) || undefined,
  };
}
