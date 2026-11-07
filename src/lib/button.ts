// The Advanced Button model — one resolver read by the editor canvas and the
// published page, the same contract `resolveRow` / `resolveSection` keep.
//
// Kadence splits this into a "Buttons" parent and "Single Button" children.
// BlockNote has no nesting outside Row Layout's column editors, so one `button`
// block *is* the group: it holds an array of buttons in the `btns` prop and the
// group's own layout on the block props. That keeps a two-button call to action
// as one selectable thing instead of two blocks that have to be kept in step.
//
// Every per-button length is a serialised RespScalar / RespSides from
// `responsive.ts`, so the panel drives them with the existing ResponsiveSlider
// and ResponsiveBox rather than a second set of controls.

import { linkRel } from "./linkRel";
import { cssValue, gradient, hasSides, safeHref, scalarAt, sidesAt, stateKey, withoutStyleClose } from "./blockStyle";
import { MQ_MOBILE, MQ_TABLET, type Device } from "./responsive";

export type BtnRec = Record<string, string>;

/* ── Option tables, shared with the panel ─────────────────────────────────── */

export const BTN_INHERIT: { id: string; title: string }[] = [
  { id: "fill", title: "Fill" },
  { id: "outline", title: "Outline" },
  { id: "theme", title: "Theme Base" },
  { id: "theme2", title: "Theme Secondary" },
];

export const BTN_SIZES: { id: string; title: string }[] = [
  { id: "sm", title: "SM" },
  { id: "md", title: "MD" },
  { id: "lg", title: "LG" },
  { id: "xl", title: "XL" },
];

export const BTN_WIDTHS: { id: string; title: string }[] = [
  { id: "auto", title: "Auto" },
  { id: "fixed", title: "Fixed" },
  { id: "full", title: "Full" },
];

export const BTN_ICON_DISPLAY: { id: string; title: string }[] = [
  { id: "both", title: "Show Icon and Text" },
  { id: "icon", title: "Icon Only" },
  { id: "text", title: "Text Only" },
];

export const BTN_LETTER_CASE: { id: string; title: string }[] = [
  { id: "uppercase", title: "AB" },
  { id: "lowercase", title: "ab" },
  { id: "capitalize", title: "Aa" },
];

export const BTN_UNDERLINE: { id: string; title: string }[] = [
  { id: "underline", title: "Underline" },
  { id: "none", title: "None" },
];

export const BTN_REL_FLAGS: { id: string; title: string }[] = [
  { id: "nofollow", title: "nofollow" },
  { id: "sponsored", title: "sponsored" },
  { id: "ugc", title: "ugc" },
];

/* ── Small helpers ────────────────────────────────────────────────────────── */

/* ── Small helpers ────────────────────────────────────────────────────────── */
//
// `cssValue`, `withUnit`, `scalarAt`, `sidesAt`, `hasSides`, `gradient`,
// `stateKey` and `safeHref` used to be copied into this file character for
// character from blockStyle.ts, which exports every one of them. Two copies of
// a CSS sanitiser is the kind of pair where one gets a fix and the other does
// not — `sidesAt` had already been given `shorthand()` in both places by hand.
// They come from the one place now.

/** Background for one state. */
function fillFor(b: BtnRec, prefix: string): string {
  const k = (n: string) => stateKey(prefix, n);
  if (b[k("bgType")] === "gradient") {
    return gradient(
      b[k("bgGradType")],
      cssValue(b[k("bgGradFrom")]),
      cssValue(b[k("bgGradTo")]),
      b[k("bgGradAngle")]
    );
  }
  return cssValue(b[k("bg")]);
}

/**
 * Text colour for one state.
 *
 * A gradient on text needs three declarations that only work together, so it is
 * returned as a small object rather than a string the caller has to know how to
 * apply.
 */
function textFor(b: BtnRec, prefix: string): { color?: string; gradient?: string } {
  const k = (n: string) => stateKey(prefix, n);
  if (b[k("txType")] === "gradient") {
    return {
      gradient: gradient(
        b[k("txGradType")],
        cssValue(b[k("txGradFrom")]),
        cssValue(b[k("txGradTo")]),
        b[k("txGradAngle")]
      ),
    };
  }
  const c = cssValue(b[k("color")]);
  return c ? { color: c } : {};
}

function shadowFor(b: BtnRec, prefix: string): string {
  const k = (n: string) => stateKey(prefix, n);
  if (b[k("shOn")] !== "1") return "";
  const n = (key: string, fallback: string) => {
    const v = String(b[k(key)] ?? "").trim();
    return v === "" ? fallback : `${parseFloat(v) || 0}px`;
  };
  const color = cssValue(b[k("shColor")]) || "rgba(15,23,42,.25)";
  return `${n("shX", "0px")} ${n("shY", "4px")} ${n("shBlur", "12px")} ${n("shSpread", "0px")} ${color}`;
}

/* ── Resolved shapes ──────────────────────────────────────────────────────── */

export interface ResolvedButton {
  /** The class the generated rules hang off. */
  scope: string;
  text: string;
  href: string;
  target: string;
  rel?: string;
  download: boolean;
  /** "Please wait" timer before the link works; null when off. */
  wait: { seconds: number; text: string; after: "go" | "unlock"; readyText: string } | null;
  /** Render a real <button> rather than a link — Kadence's "Button Role". */
  isButton: boolean;
  ariaLabel?: string;
  anchor?: string;
  className: string;
  icon: string;
  iconSide: "left" | "right";
  showIcon: boolean;
  showText: boolean;
  iconTitle?: string;
}

export interface ResolvedButtons {
  buttons: ResolvedButton[];
  /** Group wrapper class. */
  groupClass: string;
  /** Every generated rule, group and buttons, as one string. */
  css: string;
}

const ALIGN_MAP: Record<string, string> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
  between: "space-between",
};

/** Parses the `btns` prop, falling back to the pre-Advanced single button. */
export function parseButtons(props: BtnRec): BtnRec[] {
  const raw = props.btns;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v) && v.length) return v.filter((x) => x && typeof x === "object") as BtnRec[];
    } catch {
      /* fall through to the legacy shape */
    }
  }
  // Content saved before this block grew up: one button, described by the five
  // flat props. Migrating on read means no database migration and no risk of a
  // half-converted document.
  const legacy: Record<string, string> = { primary: "theme", secondary: "theme2", outline: "outline" };
  return [
    {
      text: props.text ?? "Click me",
      url: props.url ?? "",
      target: props.target ?? "_self",
      inherit: legacy[props.style ?? "primary"] ?? "theme",
      size: "md",
      width: "auto",
    },
  ];
}

export function serializeButtons(list: BtnRec[]): string {
  // Empty keys are dropped so the stored JSON stays close to what was set.
  const clean = list.map((b) => {
    const out: BtnRec = {};
    for (const [k, v] of Object.entries(b)) if (v !== "" && v !== undefined && v !== null) out[k] = v;
    return out;
  });
  return JSON.stringify(clean);
}

export function blankButton(): BtnRec {
  return { text: "Button", url: "", target: "_self", inherit: "fill", size: "md", width: "auto" };
}

/**
 * Blocks `javascript:` and friends the same way the comment author URL does —
 * a button href is author-supplied and lands in an `<a href>` unescaped.
 */
/** True for a link that goes nowhere: empty, or just "#". */
export function isPlaceholderHref(raw: unknown): boolean {
  return typeof raw !== "string" || raw.trim() === "" || raw.trim() === "#";
}


/**
 * The class prefix a button block's rules hang off.
 *
 * Not the block id directly: blocks nested in a Row Layout column have their
 * ids stripped when the column is serialised, so every button inside a row
 * would share one scope and the last one's CSS would win. Hashing the props as
 * a fallback keeps distinct buttons distinct, and identical ones colliding is
 * harmless — they generate byte-identical rules.
 *
 * Hashing the id too rather than using it raw, because a BlockNote id can start
 * with a digit, which is not a valid class name.
 */
export function buttonScope(block: { id?: unknown; props?: unknown }): string {
  const id = typeof block.id === "string" && block.id ? block.id : "";
  const seed = id || JSON.stringify(block.props ?? {});
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `bmsbtn-${h.toString(36)}`;
}

function inheritClass(v: string | undefined): string {
  switch (v) {
    case "theme":
      return "btn";
    case "theme2":
      return "btn-2";
    case "outline":
      return "is-outline";
    default:
      return "is-fill";
  }
}

/**
 * Reads a button block.
 *
 * `scopeBase` is owned by the caller — the editor names it after the preview
 * node and the page after the rendered one — so this file never has to know
 * which side it is running on.
 */
export function resolveButtons(props: BtnRec, scopeBase: string): ResolvedButtons {
  const list = parseButtons(props);
  const rules: string[] = [];

  /* ── Group ─────────────────────────────────────────────────────────────── */

  const groupScope = `${scopeBase}-g`;

  const alignAt = (d: Device) => {
    const key = d === "d" ? "align" : d === "t" ? "alignT" : "alignM";
    const v = cssValue(props[key]);
    return v ? ALIGN_MAP[v] ?? "" : "";
  };
  const gapAt = (d: Device) => scalarAt(props.gap, d);

  const groupD: string[] = [];
  if (alignAt("d")) groupD.push(`justify-content:${alignAt("d")}`);
  if (gapAt("d")) groupD.push(`gap:${gapAt("d")}`);
  if (groupD.length) rules.push(`.${groupScope}{${groupD.join(";")}}`);

  const groupT: string[] = [];
  if (alignAt("t")) groupT.push(`justify-content:${alignAt("t")}`);
  if (gapAt("t")) groupT.push(`gap:${gapAt("t")}`);
  if (groupT.length) rules.push(`${MQ_TABLET}{.${groupScope}{${groupT.join(";")}}}`);

  const groupM: string[] = [];
  if (alignAt("m")) groupM.push(`justify-content:${alignAt("m")}`);
  if (gapAt("m")) groupM.push(`gap:${gapAt("m")}`);
  // "Stack on mobile" is the one group option with no desktop half: the buttons
  // become a column, and each stretches, which is what makes it useful at all.
  if (props.stack === "1") {
    groupM.push("flex-direction:column");
    groupM.push(`align-items:${alignAt("m") || alignAt("t") || alignAt("d") || "flex-start"}`);
  }
  if (groupM.length) rules.push(`${MQ_MOBILE}{.${groupScope}{${groupM.join(";")}}}`);

  /* ── Buttons ───────────────────────────────────────────────────────────── */

  const buttons = list.map((b, i) => {
    const scope = `${scopeBase}-${i}`;
    const sel = `.${scope}`;

    /* Normal state — everything that is neither a breakpoint nor a state. */
    const base: string[] = [];

    const fill = fillFor(b, "");
    if (fill) base.push(`background:${fill}`);

    const text = textFor(b, "");
    if (text.color) base.push(`color:${text.color}`);
    if (text.gradient) {
      base.push(
        `background-image:${text.gradient}`,
        "-webkit-background-clip:text",
        "background-clip:text",
        "color:transparent"
      );
    }

    const bdWidth = sidesAt(b.bd, "d");
    const bdColor = cssValue(b.bdColor);
    if (bdWidth) base.push(`border-width:${bdWidth}`, `border-style:${cssValue(b.bdStyle) || "solid"}`);
    if (bdColor) base.push(`border-color:${bdColor}`);

    const radius = sidesAt(b.rad, "d");
    if (radius) base.push(`border-radius:${radius}`);

    const shadow = shadowFor(b, "");
    if (shadow) base.push(`box-shadow:${shadow}`);

    const pad = sidesAt(b.pad, "d");
    if (pad) base.push(`padding:${pad}`);
    const mar = sidesAt(b.mar, "d");
    if (mar) base.push(`margin:${mar}`);

    const fs = scalarAt(b.fs, "d");
    if (fs) base.push(`font-size:${fs}`);
    const lh = cssValue(b.lh);
    if (lh) base.push(`line-height:${lh}`);
    const ls = scalarAt(b.ls, "d");
    if (ls) base.push(`letter-spacing:${ls}`);
    const ff = cssValue(b.ff);
    if (ff) base.push(`font-family:${ff}`);
    const fw = cssValue(b.fw);
    if (fw) base.push(`font-weight:${fw}`);
    const tt = cssValue(b.tt);
    if (tt) base.push(`text-transform:${tt}`);
    const td = cssValue(b.td);
    if (td) base.push(`text-decoration:${td}`);

    const width = b.width || "auto";
    if (width === "fixed") {
      const w = scalarAt(b.widthVal, "d");
      if (w) base.push(`width:${w}`);
    }

    if (base.length) rules.push(`${sel}{${base.join(";")}}`);

    /* Hover — a state, so it can never be an inline style. */
    const hover: string[] = [];
    const hFill = fillFor(b, "h");
    if (hFill) hover.push(`background:${hFill}`);
    const hText = textFor(b, "h");
    if (hText.color) hover.push(`color:${hText.color}`);
    if (hText.gradient) {
      hover.push(
        `background-image:${hText.gradient}`,
        "-webkit-background-clip:text",
        "background-clip:text",
        "color:transparent"
      );
    }
    const hBdColor = cssValue(b.hBdColor);
    if (hBdColor) hover.push(`border-color:${hBdColor}`);
    const hBdWidth = sidesAt(b.hBd, "d");
    if (hBdWidth) {
      hover.push(`border-width:${hBdWidth}`, `border-style:${cssValue(b.bdStyle) || "solid"}`);
    }
    const hRadius = sidesAt(b.hRad, "d");
    if (hRadius) hover.push(`border-radius:${hRadius}`);
    const hShadow = shadowFor(b, "h");
    if (hShadow) hover.push(`box-shadow:${hShadow}`);
    if (hover.length) rules.push(`${sel}:hover,${sel}:focus-visible{${hover.join(";")}}`);

    /* Icon — its own element, so its rules are descendants. */
    const iconDecls: string[] = [];
    const iconSize = scalarAt(b.iconSize, "d");
    if (iconSize) iconDecls.push(`font-size:${iconSize}`);
    const iconColor = cssValue(b.iconColor);
    if (iconColor) iconDecls.push(`color:${iconColor}`);
    const iconPad = sidesAt(b.iconPad, "d");
    if (iconPad) iconDecls.push(`padding:${iconPad}`);
    if (iconDecls.length) rules.push(`${sel} .bmsbtn-ico{${iconDecls.join(";")}}`);

    const hIconColor = cssValue(b.hIconColor);
    if (hIconColor) rules.push(`${sel}:hover .bmsbtn-ico{color:${hIconColor}}`);

    /* Breakpoints. Only what the author set at that width is emitted. */
    for (const [mq, device] of [[MQ_TABLET, "t"], [MQ_MOBILE, "m"]] as [string, Device][]) {
      const decls: string[] = [];
      const bw = sidesAt(b.bd, device);
      if (bw) decls.push(`border-width:${bw}`);
      const rd = sidesAt(b.rad, device);
      if (rd) decls.push(`border-radius:${rd}`);
      const pd = sidesAt(b.pad, device);
      if (pd) decls.push(`padding:${pd}`);
      const mg = sidesAt(b.mar, device);
      if (mg) decls.push(`margin:${mg}`);
      const size = scalarAt(b.fs, device);
      if (size) decls.push(`font-size:${size}`);
      const track = scalarAt(b.ls, device);
      if (track) decls.push(`letter-spacing:${track}`);
      if (width === "fixed") {
        const w = scalarAt(b.widthVal, device);
        if (w) decls.push(`width:${w}`);
      }
      if (decls.length) rules.push(`${mq}{${sel}{${decls.join(";")}}}`);

      const ico: string[] = [];
      const isz = scalarAt(b.iconSize, device);
      if (isz) ico.push(`font-size:${isz}`);
      const ipd = sidesAt(b.iconPad, device);
      if (ipd) ico.push(`padding:${ipd}`);
      if (ico.length) rules.push(`${mq}{${sel} .bmsbtn-ico{${ico.join(";")}}}`);
    }

    /* Author CSS, with `selector` standing for this button. */
    const raw = typeof b.customCss === "string" ? b.customCss.trim() : "";
    if (raw) rules.push(withoutStyleClose(raw).replace(/selector/g, sel));

    const display = b.iconDisplay || "both";
    const icon = cssValue(b.icon);
    const relFlags = (b.rel ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter((x) => BTN_REL_FLAGS.some((f) => f.id === x));
    if (b.target === "_blank") relFlags.push(...linkRel({ newTab: true })!.split(" "));

    const extraClass =
      typeof b.cssClass === "string" ? b.cssClass.replace(/[^\w\s-]/g, "").trim() : "";

    return {
      scope,
      text: typeof b.text === "string" ? b.text : "",
      // A bare "#" is the old block default, not a destination: published as
      // `href="#"` it was a link that reloads the page, on the one button a
      // download page exists for. No href at all is honest — and the editor
      // says the button has no link (ButtonSettings).
      href: isPlaceholderHref(b.url) ? "" : safeHref(b.url),
      target: b.target === "_blank" ? "_blank" : "_self",
      rel: relFlags.length ? Array.from(new Set(relFlags)).join(" ") : undefined,
      download: b.download === "1",
      wait:
        b.wait === "1" && b.role !== "1"
          ? {
              seconds: Math.min(120, Math.max(1, parseInt(b.waitSeconds ?? "", 10) || 5)),
              text: (b.waitText ?? "").trim().slice(0, 80) || "Please wait {s} seconds",
              after: b.waitAfter === "unlock" ? "unlock" : "go",
              readyText: (b.waitReady ?? "").trim().slice(0, 60),
            }
          : null,
      isButton: b.role === "1",
      ariaLabel: cssValue(b.aria) || undefined,
      anchor: cssValue(b.anchor) || undefined,
      className: [
        "bmsbtn",
        scope,
        inheritClass(b.inherit),
        `is-${b.size || "md"}`,
        width === "full" ? "is-full" : "",
        // Only claim the border shorthand when the author actually set one —
        // otherwise the theme's own border keeps working.
        hasSides(b.bd) ? "has-bd" : "",
        // Suppresses the built-in hover of the Fill / Outline presets, so an
        // author-set hover colour is not then filtered on top of.
        hover.length ? "has-hv" : "",
        display === "icon" ? "is-icon-only" : "",
        b.iconHover === "1" && icon ? "is-reveal" : "",
        extraClass,
      ]
        .filter(Boolean)
        .join(" "),
      icon,
      iconSide: b.iconPos === "right" ? "right" : "left",
      showIcon: !!icon && display !== "text",
      showText: display !== "icon",
      iconTitle: cssValue(b.iconTitle) || undefined,
    } satisfies ResolvedButton;
  });

  return {
    buttons,
    groupClass: `bmsbtns ${groupScope}`,
    css: rules.join(""),
  };
}
