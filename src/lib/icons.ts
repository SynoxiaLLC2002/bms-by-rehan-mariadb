// What an "icon" value can be, and how to read one.
//
// Every block that shows an icon stores it as one string, and until now that
// string was a character: a tick, an arrow, an emoji. That stays — it is the
// simplest thing and needs nothing downloaded — but two more kinds join it,
// distinguished by a prefix so the old values keep meaning what they did:
//
//   "✓"                a glyph or emoji, rendered as text
//   "lucide:camera"    one of Lucide's ~1,600 SVG icons, drawn in
//                      currentColor so the block's icon colour applies
//   "/uploads/x.png"   an image from the media library (or any URL),
//                      drawn at the icon's size, in its own colours
//
// The lookup for Lucide names lives here too, so the picker and every
// renderer agree on what a name means.

export type IconKind = "glyph" | "lucide" | "image";

export interface ParsedIcon {
  kind: IconKind;
  /** The glyph text, the Lucide name in kebab-case, or the image URL. */
  value: string;
}

const LUCIDE_PREFIX = "lucide:";

export function parseIcon(raw: unknown): ParsedIcon | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return null;
  if (v.startsWith(LUCIDE_PREFIX)) {
    const name = v.slice(LUCIDE_PREFIX.length).trim().toLowerCase();
    return name ? { kind: "lucide", value: name } : null;
  }
  if (/^(https?:\/\/|\/)/i.test(v)) return { kind: "image", value: v };
  return { kind: "glyph", value: v };
}

export function lucideIcon(name: string): string {
  return `${LUCIDE_PREFIX}${name}`;
}

/** "arrow-big-down" → "ArrowBigDown", the export name in lucide-react. */
export function lucideComponentName(kebab: string): string {
  return kebab
    .split("-")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

/** "ArrowBigDown" → "arrow-big-down", the name shown to people and stored. */
export function lucideKebab(component: string): string {
  return component.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();
}
