// The primitives every "advanced" block's resolver needs.
//
// Pulled out of `button.ts` when the Icon List grew the same needs: a scoped
// class, responsive values turned into breakpoint rules, gradients, and an href
// that cannot carry `javascript:`. Keeping one copy is the same reasoning that
// puts `resolveRow` / `resolveSection` in front of both the canvas and the page
// — two copies of a CSS emitter drift, and the drift shows up as a control that
// silently stops working on one side.

import {
  DEVICE_ORDER,
  effectiveSides,
  parseScalar,
  parseSides,
  rawScalar,
  rawSides,
  shorthand,
  type Device,
} from "./responsive";

export type PropRec = Record<string, string>;

/**
 * The glyph palette every block's icon picker offers.
 *
 * One list rather than one per block: an author who learns the picker in the
 * Icon List should meet the same set in the Accordion and the Info Box.
 *
 * Grouped by subject rather than sorted, because that is how someone looks for
 * one — "something about money" scans a run of six, not ninety. Text glyphs and
 * emoji only: nothing here has to be downloaded, which is the whole reason the
 * blocks use characters instead of an SVG library.
 */
export const GLYPH_ICONS = [
  // Marks and status
  "✓", "✔", "✗", "✕", "●", "○", "◆", "▪", "★", "☆", "ℹ", "⚠", "＋", "−",
  "❓", "❗", "✅", "❌", "🔔", "🏆", "🥇", "👍", "👎", "💯",
  // Arrows and direction
  "▶", "→", "←", "↑", "↓", "⇒", "↳", "⤴", "⇄", "🔁", "🔄", "🧭",
  // Ideas, learning and support
  "💡", "🎯", "🧠", "📚", "🎓", "🔍", "🔎", "❤", "♥", "🤝", "🙌", "👏",
  // People and places
  "👤", "👥", "🏠", "🏢", "🏬", "🌍", "📍", "🗺", "🚩",
  // Transport
  "🚗", "🚕", "🚌", "🚙", "🏎", "🛻", "🚚", "✈", "🚀", "🛵", "🚲", "⛽", "🅿",
  // Devices and tech
  "💻", "🖥", "📱", "⌨", "🖱", "🎮", "🕹", "📶", "🔌", "⚙", "🛠", "🔧", "🧩",
  "☁", "📡", "🤖", "💾", "🗄",
  // Media
  "🎧", "🎵", "🎬", "📷", "📹", "🎤", "📺", "🖼",
  // Money and commerce
  "💰", "💳", "🛒", "🏷", "🎁", "📈", "📉", "📊", "💎", "🔥",
  // Time and planning
  "⏱", "⏳", "📅", "🗓", "📌", "📝", "✏", "📋", "🔖",
  // Trust and safety
  // No glyph appears twice: the pickers key their buttons by the character.
  "🛡", "🔒", "🔓", "🔑", "⚡", "♻", "🌱", "☀", "🌙", "💧", "❄",
  // Communication
  "✉", "📧", "📞", "💬", "💭", "📢", "🔗",
  "📨", "📩", "📬", "☎", "📠", "🗣", "👋",
  // Files, documents and downloads — the set an Info Box reaches for most and
  // the one that was missing entirely: a download button had no download icon.
  "⬇", "⬆", "📥", "📤", "📁", "📂", "📄", "📃", "📑", "🗂", "🗃",
  "🖨", "📎", "🖇", "✂", "🧾", "💿", "📀", "🗒", "🗞", "📖", "📜",
  // Office and business
  "💼", "🏦", "🏛", "🏭", "🧮", "🗳", "🪪", "📇", "🏧",
  "💵", "💶", "💷", "💴", "⚖",
  // Health and science
  "🏥", "💊", "🩺", "🩹", "🚑", "😷", "🧪", "🔬", "🧬",
  // Food, hospitality and travel
  "☕", "🍽", "🍔", "🍕", "🥗", "🍰", "🧁", "🍞", "🥤", "🍳",
  "🏨", "🛏", "🧳", "🎫", "🛂", "🏝", "⛱",
  // Transport, continued
  "🚂", "🚆", "🚢", "⛵", "🛳",
  // Trades and construction
  "🔨", "🪛", "🪚", "🧱", "👷", "🏗", "🪜", "🧰", "🔩", "⛏", "🚜",
  // Sport and wellbeing
  "⚽", "🏀", "🏈", "🎾", "🏐", "🏓", "🥎", "🏋", "🤸", "🚴", "🏊", "🥊", "🧘",
  // Nature, weather and place
  "🌾", "🌳", "🌲", "🌵", "🍀", "🌸", "🐝", "🐾", "🌊", "⛰", "🏔",
  "🌧", "⛅", "🌡", "⏰",
  // Education and writing
  "🏫", "✒", "🖊", "🖋", "📸",
  // Alerts, states and badges
  "🚨", "🚫", "⛔", "✋", "👁", "🔐", "🆔", "🎉", "🎊",
  "🆕", "🆓", "🆗", "🔝", "🔕",
  // Plain marks, for a picker that does not want a colour emoji
  "☰", "⋯", "✱", "✳", "❖", "⬤", "⬜", "🔴", "🟢", "🟡", "🔵", "⭐",
];

/** Strips anything that could break out of a declaration or close the tag. */
export function cssValue(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/[<>{};]/g, "").trim();
}

/**
 * A colour setting as CSS. The swatch picker used to save the word "default"
 * for "no colour", and documents still hold it; it is not a colour, so it
 * becomes nothing here rather than an invalid declaration on the page.
 */
export function cssColor(v: unknown): string {
  const c = cssValue(v);
  return c === "default" ? "" : c;
}

export const withUnit = (raw: string, unit: string): string => {
  const t = raw.trim();
  if (!t) return "";
  return /^-?[\d.]+$/.test(t) ? `${parseFloat(t)}${unit}` : cssValue(t);
};

/**
 * A responsive scalar for one device, or "" when that device inherits.
 *
 * Returning "" rather than the inherited value is what keeps the emitted CSS
 * small: a breakpoint only gets a rule when the author actually set something
 * there, and the cascade does the rest.
 */
export function scalarAt(raw: string | undefined, device: Device, defUnit = "px"): string {
  const v = parseScalar(raw);
  const own = rawScalar(v, device);
  if (!own) return "";
  return withUnit(own, v.u ?? defUnit);
}

/** The raw number for a device with no unit appended — for unitless values. */
export function rawAt(raw: string | undefined, device: Device): string {
  return rawScalar(parseScalar(raw), device);
}

/** A four-sided value for one device, expanded to a full shorthand. */
export function sidesAt(raw: string | undefined, device: Device, defUnit = "px"): string {
  const v = parseSides(raw);
  const own = rawSides(v, device);
  if (own.every((x) => x === "")) return "";
  const unit = v.u ?? defUnit;
  // The device set *some* sides; fill the rest from the wider breakpoint so the
  // shorthand cannot silently reset a side to zero.
  return shorthand(effectiveSides(v, device).map((x) => withUnit(x, unit) || "0"));
}

/** True when a responsive four-sided value carries anything at all. */
export function hasSides(raw: string | undefined): boolean {
  const v = parseSides(raw);
  return DEVICE_ORDER.some((d) => (v[d] ?? []).some((x) => x !== ""));
}

export function gradient(
  type: string | undefined,
  from: string,
  to: string,
  angle: string | undefined
): string {
  const a = from || "#0ea5e9";
  const b = to || "#9333ea";
  if (type === "radial") return `radial-gradient(circle at 50% 50%,${a},${b})`;
  const deg = parseInt(String(angle ?? ""), 10);
  return `linear-gradient(${Number.isFinite(deg) ? deg : 160}deg,${a},${b})`;
}

/** Prefixes a key for a state: "" is normal, "h" is hover. */
export const stateKey = (prefix: string, name: string) =>
  prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name;

/**
 * Blocks `javascript:` and friends the same way the comment author URL does —
 * an author-supplied href lands in an `<a href>` unescaped.
 */
export function safeHref(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // Read the way the browser's URL parser will: it deletes every tab and
  // newline wherever they are, and trims control characters and spaces from
  // both ends. Tested raw, `java\tscript:…` had no scheme by this regex and
  // came back unchanged — harmless in a React `href` (React checks again),
  // not in the `location.assign()` a Wait button or form redirect calls.
  const v = raw.replace(/[\t\n\r]/g, "").replace(/^[\u0000- ]+|[\u0000- ]+$/g, "");
  if (!v) return "";
  if (/^(https?:|mailto:|tel:|sms:|#|\/|\.\/|\.\.\/)/i.test(v)) return v;
  // A bare word is a relative path, which is safe; anything with a scheme is not.
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return "";
  return v;
}

/** Author-supplied class list, reduced to characters a class may contain. */
export function safeClass(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/[^\w\s-]/g, "").trim() : "";
}

/** Author CSS, with `selector` standing for this block's scope. */
export function authorCss(raw: unknown, selector: string): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  return withoutStyleClose(s).replace(/selector/g, selector);
}

/**
 * CSS with every `</style` removed, repeated until none is left.
 *
 * One pass over `<</style/style>` removes the inner `</style` and leaves the
 * outer pieces to close up into a working `</style>` — the pattern
 * reasons.txt §4.1 describes for scripts. Safe today only because React
 * escapes style text; this is the net under that.
 */
export function withoutStyleClose(css: string): string {
  let out = css;
  for (let prev = ""; prev !== out; ) {
    prev = out;
    out = out.replace(/<\/\s*style/gi, "");
  }
  return out;
}

/**
 * The class prefix a block's generated rules hang off.
 *
 * Not the block id directly: blocks nested in a Row Layout column have their
 * ids stripped when the column is serialised, so every one of them would share
 * a scope and the last one's CSS would win. Hashing the props as a fallback
 * keeps distinct blocks distinct, and identical ones colliding is harmless —
 * they generate byte-identical rules.
 *
 * Hashing the id too rather than using it raw, because a BlockNote id can start
 * with a digit, which is not a valid class name.
 */
export function blockScope(prefix: string, block: { id?: unknown; props?: unknown }): string {
  const id = typeof block.id === "string" && block.id ? block.id : "";
  const seed = id || JSON.stringify(block.props ?? {});
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${prefix}-${h.toString(36)}`;
}

/**
 * An inline style object as a CSS rule under a hashed class.
 *
 * Text Advanced headings on one measured page carried the same 200-byte
 * `style` attribute fifteen times — the "pill" look the author gave every
 * H2 — and React repeats every one of them in the hydration data too. The
 * same object always hashes to the same class, so the rule is written once
 * (BlockStyle de-duplicates by content) and each element carries one short
 * class. Values are used as React would write them: numbers get `px` except
 * on the unitless properties; `undefined` is skipped.
 */
const UNITLESS = new Set(["opacity", "zIndex", "fontWeight", "lineHeight", "flex", "flexGrow", "flexShrink", "order", "zoom", "tabSize", "columnCount"]);

export function styleClass(style: Record<string, unknown> | undefined | null, prefix = "s"): { className: string; css: string } | null {
  if (!style) return null;
  const decls: string[] = [];
  for (const [k, v] of Object.entries(style)) {
    if (v === undefined || v === null || v === "") continue;
    const prop = k.startsWith("--") ? k : k.replace(/^(Webkit|Moz|ms)(?=[A-Z])/, "-$1").replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    const val = typeof v === "number" && !UNITLESS.has(k) && !k.startsWith("--") ? `${v}px` : String(v);
    decls.push(`${prop}:${val.replace(/[{};]/g, "")}`);
  }
  if (!decls.length) return null;
  const body = decls.join(";");
  let h = 2166136261;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const className = `${prefix}-${h.toString(36)}`;
  return { className, css: `.${className}{${body}}` };
}
