// Copy style / paste style — an element's look without its content.
//
// Kept apart from the system clipboard on purpose: copying a style should not
// throw away the text the author just copied, and pasting text should not be
// able to paste a style. Stored in localStorage so a style copied in one post
// can be pasted in another tab.
//
// A block's props mix look (colours, spacing, fonts, borders, tag) with content
// (text, links, images, list items, nested columns). Everything not on the
// content list below counts as style.
//
// Blocks do not agree on names: Text Advanced says `color`, a paragraph says
// `textColor`, a Callout says `titleColor`; padding is `paddingTop` here and
// `padT` there. Pasting only exact keys meant a style from one element landed
// on a different kind as "No matching style", even on an empty paragraph. So
// each concept has its aliases below: on paste, every key the target owns is
// looked up in the copied props under any of its names. Built-in blocks
// (paragraph, heading, lists) also speak a different dialect of colour —
// "default" or a palette name instead of "" or a hex — which is translated
// both ways, and a heading's numeric `level` maps to an `h1`–`h6` tag.

const KEY = "bms-style-clipboard";

/** Props that are content or structure, never style. */
const CONTENT = new Set([
  "after", "afterLabel", "alt", "anchor", "before", "beforeLabel", "bio", "btns",
  "buttonLabel", "buttonUrl", "caption", "captions", "categoryId", "cols", "columns",
  "count", "faqSchema", "fields", "foot", "formName", "head", "heading", "icon",
  "iconChar", "iconTitle", "image", "images", "items", "label", "learnMore",
  "lessLabel", "link", "linkContent", "linkTitle", "linkUrl", "links", "moreLabel",
  "name", "number", "orderBy", "photo", "redirectUrl", "role", "rows", "slides", "src",
  "submitLabel", "successMessage", "text", "title", "triggerImage", "triggerLabel",
  "url", "value", "video", "checked",
]);

/** One concept, every name a block spells it with. Order is the lookup order. */
const ALIASES: string[][] = [
  ["color", "textColor", "titleColor", "cText"],
  ["bgColor", "bg", "backgroundColor", "cBg"],
  ["align", "textAlign", "textAlignment", "alignT", "alignM"],
  ["fontSize", "fs", "titleFs", "textFs"],
  ["fontWeight", "fw"],
  ["fontFamily", "ff", "titleFf", "textFf"],
  ["lineHeight", "lh"],
  ["letterSpacing", "ls"],
  ["textTransform", "tt"],
  ["borderRadius", "radius", "rad"],
  ["borderWidth", "bdWidth"],
  ["borderColor", "bdColor"],
  ["borderStyle", "bdStyle"],
  ["paddingTop", "padT"],
  ["paddingRight", "padR"],
  ["paddingBottom", "padB"],
  ["paddingLeft", "padL"],
  ["tag", "htmlTag", "titleTag", "level"],
];

const aliasOf = new Map<string, string[]>();
for (const group of ALIASES) for (const k of group) aliasOf.set(k, group);

/** The built-in blocks' colour palette, so a named colour can become a hex and back. */
const PALETTE: Record<string, string> = {
  gray: "#9ca3af", brown: "#92400e", red: "#ef4444", orange: "#f97316", yellow: "#eab308",
  green: "#22c55e", blue: "#3b82f6", purple: "#a855f7", pink: "#ec4899",
};
/** BlockNote's own text blocks — the ones that speak the "default"/"red" colour dialect. */
const BUILT_IN = new Set(["paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem", "quote"]);
const isColorKey = (k: string) => { const g = aliasOf.get(k)?.[0]; return g === "color" || g === "bgColor"; };

/** Translate a value from the source block's dialect into the target's. */
function convert(fromType: string, fromKey: string, toType: string, toKey: string, value: unknown): unknown {
  if (fromKey === toKey && BUILT_IN.has(fromType) === BUILT_IN.has(toType)) return value;
  const v = value == null ? "" : String(value);
  // Colours: built-ins say "default"/"red", everything else says ""/"#ef4444".
  if (isColorKey(toKey)) {
    if (BUILT_IN.has(toType) && !BUILT_IN.has(fromType)) return v ? v.toLowerCase() : "default";
    if (BUILT_IN.has(fromType) && !BUILT_IN.has(toType)) return !v || v === "default" ? "" : (PALETTE[v] ?? v);
  }
  // Heading level (number; BlockNote headings go 1–3) ↔ tag ("h1"–"h6").
  if (toKey === "level" && fromKey !== "level") {
    const m = /^h([1-6])$/.exec(v);
    return m ? Math.min(3, Number(m[1])) : null;
  }
  if (fromKey === "level" && toKey !== "level") return v ? `h${v}` : null;
  // The tag-ish keys are only interchangeable when the value is a real tag.
  if (aliasOf.get(toKey)?.[0] === "tag" && fromKey !== toKey && !/^(p|h[1-6]|div|span)$/.test(v)) return null;
  return v;
}

export interface CopiedStyle {
  type: string;
  props: Record<string, unknown>;
}

let memory: CopiedStyle | null = null;

export function copyStyle(type: string, props: Record<string, unknown>): void {
  const style: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) if (!CONTENT.has(k)) style[k] = v;
  memory = { type, props: style };
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* private window — the in-memory copy still works in this tab */
  }
}

export function getCopiedStyle(): CopiedStyle | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as CopiedStyle;
  } catch {
    /* fall back to memory */
  }
  return memory;
}

/**
 * The target's props with the copied style laid over them, or null when the
 * two blocks share no style settings at all (an image onto a form, say).
 */
export function applyStyle(targetType: string, target: Record<string, unknown>): Record<string, unknown> | null {
  const copied = getCopiedStyle();
  if (!copied) return null;
  const next = { ...target };
  let touched = 0;
  for (const k of Object.keys(target)) {
    if (CONTENT.has(k)) continue;
    // The exact name first, then the concept's other spellings.
    const names = k in copied.props ? [k] : (aliasOf.get(k) ?? []).filter((n) => n in copied.props);
    if (!names.length) continue;
    const from = names[0];
    const v = convert(copied.type, from, targetType, k, copied.props[from]);
    if (v === null) continue;
    next[k] = v;
    touched++;
  }
  return touched ? next : null;
}
