// Per-block spacing and per-device visibility.
//
// Stored as one JSON prop (`bx`) rather than a dozen schema props, so adding a
// block doesn't mean redeclaring the same fields again. Responsive values are
// emitted as CSS custom properties and resolved by media queries in
// `blockBoxCss`, which keeps the markup static-render friendly.
//
// Spacing moved from "top and bottom, px only, per device" to a full four-sided
// unit-aware responsive value (see `responsive.ts`). The old `pt`/`pb`/`mt`/`mb`
// keys are still read, so pages authored before the change keep their spacing —
// `upgrade()` folds them into the new shape on the way out.

import {
  blockSidesRule,
  effectiveSides,
  parseSides,
  respSidesVars,
  serializeSides,
  type Device,
  type RespSides,
  type Sides,
} from "./responsive";

export interface BlockBox {
  /** Visible on desktop / tablet / mobile. Absent means visible. */
  hd?: boolean;
  ht?: boolean;
  hm?: boolean;

  /** Four-sided responsive padding / margin — serialised RespSides. */
  pad?: string;
  mar?: string;

  /** Legacy top/bottom-only px values. Read, never written. */
  pt?: string;  pb?: string;
  ptT?: string; pbT?: string;
  ptM?: string; pbM?: string;
  mt?: string;  mb?: string;
  mtT?: string; mbT?: string;
  mtM?: string; mbM?: string;

  /** Hover treatment: one of HOVER_EFFECTS. Absent means none. */
  hv?: string;

  /** Animate on scroll: one of SCROLL_ANIMATIONS. Absent means none. */
  an?: string;
  /** Duration in ms. */
  anD?: string;
  /** Delay in ms. */
  anL?: string;
  /** "1" replays the animation every time the block re-enters the viewport. */
  anR?: string;

  /** Conditional display — a serialised rule set, see `conditions.ts`. */
  cd?: string;
}

/**
 * Scroll-in animations available on any block.
 *
 * Each is a starting transform that `.bx-in` releases, rather than a keyframe
 * sequence — one transition then covers all of them, and the duration and delay
 * can be plain custom properties instead of a generated rule per block.
 */
export const SCROLL_ANIMATIONS: { id: string; label: string }[] = [
  { id: "",           label: "None" },
  { id: "fade",       label: "Fade in" },
  { id: "fade-up",    label: "Fade up" },
  { id: "fade-down",  label: "Fade down" },
  { id: "fade-left",  label: "Fade left" },
  { id: "fade-right", label: "Fade right" },
  { id: "zoom-in",    label: "Zoom in" },
  { id: "zoom-out",   label: "Zoom out" },
];

/**
 * Hover treatments available on any block.
 *
 * These live on the block wrapper rather than per block type, because the
 * wrapper is the one element every block is guaranteed to have. Colours stay
 * out of here deliberately — those are already owned by each block's own
 * settings and by Colors & Fonts.
 */
export const HOVER_EFFECTS: { id: string; label: string }[] = [
  { id: "",       label: "None" },
  { id: "lift",   label: "Lift" },
  { id: "sink",   label: "Sink" },
  { id: "grow",   label: "Grow" },
  { id: "shrink", label: "Shrink" },
  { id: "glow",   label: "Glow" },
  { id: "fade",   label: "Fade" },
];

export function parseBox(raw: unknown): BlockBox {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as BlockBox) : {};
  } catch {
    return {};
  }
}

export const hasBox = (b: BlockBox) => Object.keys(b).length > 0;

/* ── Legacy migration ─────────────────────────────────────────────────────── */

const sides = (top?: string, bottom?: string): Sides => [top ?? "", "", bottom ?? "", ""];

const anySet = (...vals: (string | undefined)[]) => vals.some((v) => v && v.trim() !== "");

/**
 * The four-sided padding for a box, reading the new key first and falling back
 * to the pre-four-side top/bottom keys so old content is untouched on disk.
 */
export function boxPadding(b: BlockBox): RespSides {
  if (b.pad) return parseSides(b.pad);
  if (!anySet(b.pt, b.pb, b.ptT, b.pbT, b.ptM, b.pbM)) return {};
  return {
    d: sides(b.pt, b.pb),
    t: sides(b.ptT, b.pbT),
    m: sides(b.ptM, b.pbM),
  };
}

export function boxMargin(b: BlockBox): RespSides {
  if (b.mar) return parseSides(b.mar);
  if (!anySet(b.mt, b.mb, b.mtT, b.mbT, b.mtM, b.mbM)) return {};
  return {
    d: sides(b.mt, b.mb),
    t: sides(b.mtT, b.mbT),
    m: sides(b.mtM, b.mbM),
  };
}

/**
 * Rewrites a box onto the new keys, dropping the legacy ones. Called by the
 * panel the first time a box is edited, so migration happens as a side effect of
 * normal use rather than needing a data backfill.
 */
export function upgradeBox(b: BlockBox): BlockBox {
  const pad = boxPadding(b);
  const mar = boxMargin(b);
  const out: BlockBox = {};

  if (b.hd) out.hd = true;
  if (b.ht) out.ht = true;
  if (b.hm) out.hm = true;
  if (b.hv) out.hv = b.hv;
  if (b.an) out.an = b.an;
  if (b.anD) out.anD = b.anD;
  if (b.anL) out.anL = b.anL;
  if (b.anR) out.anR = b.anR;
  if (b.cd) out.cd = b.cd;

  const padStr = serializeSides(pad);
  const marStr = serializeSides(mar);
  if (padStr) out.pad = padStr;
  if (marStr) out.mar = marStr;

  return out;
}

/** Class list carrying the per-device visibility flags. */
export function boxClass(b: BlockBox): string {
  const out = ["bx"];
  if (b.hd) out.push("bx-hd");
  if (b.ht) out.push("bx-ht");
  if (b.hm) out.push("bx-hm");
  if (b.hv) out.push(`bx-hv bx-hv-${b.hv}`);
  // Only the marker class ships in the HTML. The "ready" class that actually
  // hides the block is added by the observer at runtime, so a page with no JS
  // — or a crawler — never sees a block stuck at opacity 0.
  if (b.an) out.push(`bx-an bx-an-${b.an}`);
  return out.join(" ");
}

/**
 * Inline custom properties for the spacing. Only set values are emitted, so a
 * breakpoint with no value inherits the one above it through the var fallback
 * chain in `blockBoxCss`.
 */
export function boxVars(b: BlockBox): Record<string, string> {
  const out: Record<string, string> = {
    ...respSidesVars("bx-pad", boxPadding(b)),
    ...respSidesVars("bx-mar", boxMargin(b)),
  };
  if (b.an) {
    const dur = parseInt(b.anD ?? "", 10);
    const delay = parseInt(b.anL ?? "", 10);
    if (Number.isFinite(dur) && dur > 0) out["--bx-an-dur"] = `${dur}ms`;
    if (Number.isFinite(delay) && delay > 0) out["--bx-an-delay"] = `${delay}ms`;
  }
  return out;
}

/** Resolved spacing for one device — used by the editor canvas preview. */
export function boxPreviewStyle(b: BlockBox, device: Device = "d"): Record<string, string> {
  const pad = effectiveSides(boxPadding(b), device);
  const mar = effectiveSides(boxMargin(b), device);
  const padUnit = boxPadding(b).u ?? "px";
  const marUnit = boxMargin(b).u ?? "px";

  const size = (v: string, u: string) => (v.trim() === "" ? "" : /^-?[\d.]+$/.test(v.trim()) ? `${parseFloat(v)}${u}` : v);
  const out: Record<string, string> = {};
  const names = ["Top", "Right", "Bottom", "Left"];

  pad.forEach((v, i) => {
    const s = size(v, padUnit);
    if (s) out[`padding${names[i]}`] = s;
  });
  mar.forEach((v, i) => {
    const s = size(v, marUnit);
    if (s) out[`margin${names[i]}`] = s;
  });

  return out;
}

/**
 * The static stylesheet behind every block box. Tablet falls back to desktop
 * and mobile falls back to tablet, so setting only a desktop value still
 * behaves sensibly on small screens.
 */
export function blockBoxCss(): string {
  return [
    blockSidesRule(".bx", "padding", "bx-pad"),
    blockSidesRule(".bx", "margin", "bx-mar"),

    `@media(min-width:1025px){.bx-hd{display:none !important}}`,
    `@media(min-width:768px) and (max-width:1024px){.bx-ht{display:none !important}}`,
    `@media(max-width:767px){.bx-hm{display:none !important}}`,

    // Hover treatments. Transitions only apply to blocks that opted in, so a
    // plain block keeps an empty style budget.
    `.bx-hv{transition:transform .25s ease,box-shadow .25s ease,opacity .25s ease}`,
    `.bx-hv-lift:hover{transform:translateY(-4px);box-shadow:0 12px 28px rgba(15,23,42,.13)}`,
    `.bx-hv-sink:hover{transform:translateY(3px)}`,
    `.bx-hv-grow:hover{transform:scale(1.02)}`,
    `.bx-hv-shrink:hover{transform:scale(.98)}`,
    `.bx-hv-glow:hover{box-shadow:0 0 0 3px rgba(14,165,233,.22),0 8px 24px rgba(15,23,42,.12)}`,
    `.bx-hv-fade:hover{opacity:.75}`,
    `@media(prefers-reduced-motion:reduce){.bx-hv{transition:none}.bx-hv:hover{transform:none}}`,

    // Scroll animations. `.bx-an` alone does nothing — the observer adds
    // `.bx-an-ready` to arm it and `.bx-in` to release it, which is what keeps
    // the no-JS case visible rather than blank.
    `.bx-an-ready{opacity:0;will-change:opacity,transform;transition:opacity var(--bx-an-dur,600ms) cubic-bezier(.22,.61,.36,1) var(--bx-an-delay,0ms),transform var(--bx-an-dur,600ms) cubic-bezier(.22,.61,.36,1) var(--bx-an-delay,0ms)}`,
    `.bx-an-ready.bx-an-fade-up{transform:translateY(28px)}`,
    `.bx-an-ready.bx-an-fade-down{transform:translateY(-28px)}`,
    `.bx-an-ready.bx-an-fade-left{transform:translateX(28px)}`,
    `.bx-an-ready.bx-an-fade-right{transform:translateX(-28px)}`,
    `.bx-an-ready.bx-an-zoom-in{transform:scale(.92)}`,
    `.bx-an-ready.bx-an-zoom-out{transform:scale(1.08)}`,
    `.bx-an-ready.bx-in{opacity:1;transform:none}`,
    // Someone who asked for less motion gets the end state immediately.
    `@media(prefers-reduced-motion:reduce){.bx-an-ready{opacity:1 !important;transform:none !important;transition:none}}`,
  ].join("");
}
