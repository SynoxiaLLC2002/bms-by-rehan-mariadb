// The Author Bio block — the one block that reads live account data
// (avatar, name, biography, social links) instead of storing its own text.
// Same idea as the Business Info block reading Local SEO settings: the block
// only owns *how it looks*, never the data, so editing your profile in
// Users always updates every author page that places this block, with
// nothing to keep in sync by hand.

import { authorCss, blockScope, cssValue, safeClass, withUnit, type PropRec } from "./blockStyle";

export const AUTHOR_BIO_PARTS = [
  { id: "avatar", title: "Avatar" },
  { id: "name", title: "Name" },
  { id: "bio", title: "Biography" },
  { id: "social", title: "Social links" },
] as const;

export const AVATAR_SHAPES: { id: string; title: string }[] = [
  { id: "circle", title: "Circle" },
  { id: "rounded", title: "Rounded" },
  { id: "square", title: "Square" },
];

export const NAME_TAGS: { id: string; title: string }[] = [
  { id: "h1", title: "H1" },
  { id: "h2", title: "H2" },
  { id: "h3", title: "H3" },
];

export interface ResolvedAuthorBio {
  wrapClass: string;
  css: string;
  show: Set<string>;
  align: "left" | "center";
  avatarShape: string;
  nameTag: string;
  anchor?: string;
}

export const authorBioScope = (block: { id?: unknown; props?: unknown }) => blockScope("bmsauth", block);

function parseShow(raw: unknown): Set<string> {
  const s = typeof raw === "string" ? raw : "avatar,name,bio,social";
  const set = new Set(s.split(",").map((x) => x.trim()).filter(Boolean));
  return set.size ? set : new Set(["avatar", "name", "bio", "social"]);
}

/** A plain px number ("80") or an already-unit'd value ("2rem") — never a responsive blob. */
const px = (raw: unknown) => withUnit(typeof raw === "string" ? raw : "", "px");

export function resolveAuthorBio(p: PropRec, scopeBase: string): ResolvedAuthorBio {
  const rules: string[] = [];
  const sel = `.${scopeBase}`;
  const align = p.align === "left" ? "left" : "center";
  const avatarShape = AVATAR_SHAPES.some((s) => s.id === p.avatarShape) ? p.avatarShape : "circle";
  const nameTag = NAME_TAGS.some((t) => t.id === p.nameTag) ? p.nameTag : "h2";

  /* ── Container ─────────────────────────────────────────────────────────── */

  const box: string[] = [`text-align:${align}`];
  const bg = cssValue(p.bg);
  if (bg) box.push(`background:${bg}`);
  const rad = px(p.rad);
  if (rad) box.push(`border-radius:${rad}`);
  const pad = cssValue(p.pad);
  if (pad) box.push(`padding:${pad}`);
  const margin = cssValue(p.margin);
  if (margin) box.push(`margin:${margin}`);
  const maxWidth = px(p.maxWidth);
  if (maxWidth) box.push(`max-width:${maxWidth}`, align === "center" ? "margin-inline:auto" : "");
  rules.push(`${sel}{${box.filter(Boolean).join(";")}}`);

  /* ── Avatar ────────────────────────────────────────────────────────────── */

  const avatarSize = px(p.avatarSize) || "96px";
  rules.push(`${sel} .bmsauth-avatar{width:${avatarSize};height:${avatarSize}}`);

  /* ── Name ──────────────────────────────────────────────────────────────── */

  const name: string[] = [];
  const nameColor = cssValue(p.nameColor);
  if (nameColor) name.push(`color:${nameColor}`);
  const nameFs = px(p.nameFs);
  if (nameFs) name.push(`font-size:${nameFs}`);
  if (name.length) rules.push(`${sel} .bmsauth-name{${name.join(";")}}`);

  /* ── Bio ───────────────────────────────────────────────────────────────── */

  const bio: string[] = [];
  const bioColor = cssValue(p.bioColor);
  if (bioColor) bio.push(`color:${bioColor}`);
  const bioFs = px(p.bioFs);
  if (bioFs) bio.push(`font-size:${bioFs}`);
  if (bio.length) rules.push(`${sel} .bmsauth-bio{${bio.join(";")}}`);

  /* ── Social ────────────────────────────────────────────────────────────── */

  const social: string[] = [];
  const socialColor = cssValue(p.socialColor);
  if (socialColor) social.push(`color:${socialColor}`);
  const socialGap = px(p.socialGap);
  if (socialGap) rules.push(`${sel} .bmsauth-social{gap:${socialGap}}`);
  const socialSize = px(p.socialSize);
  if (socialSize) social.push(`width:${socialSize}`, `height:${socialSize}`);
  if (social.length) rules.push(`${sel} .bmsauth-social a{${social.join(";")}}`);

  const custom = authorCss(p.customCss, sel);
  if (custom) rules.push(custom);

  return {
    wrapClass: ["bmsauth", scopeBase, `is-${align}`, safeClass(p.cssClass)].filter(Boolean).join(" "),
    css: rules.join(""),
    show: parseShow(p.show),
    align,
    avatarShape,
    nameTag,
    anchor: cssValue(p.anchor) || undefined,
  };
}
