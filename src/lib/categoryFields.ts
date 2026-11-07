// The settings a category carries beyond its name and slug.
//
// Written once and used by both the create and update routes. The two used to
// each list the columns they accepted, which is exactly the shape of bug this
// codebase keeps finding: a field added to one path and forgotten on the other
// saves correctly when you edit a term and silently vanishes when you make one.

import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** A trimmed string, or null when it is empty — never an empty string. */
const text = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

const flag = (v: unknown): boolean => v === true || v === "true";

/** `default` or one of 1..4; anything else falls back to `default`. */
const columns = (v: unknown): string => {
  const s = String(v ?? "default");
  return ["1", "2", "3", "4"].includes(s) ? s : "default";
};

/**
 * One of the Customizer's card designs, or `default` to follow the site.
 *
 * The list is the vocabulary in BlogArchive (CARD_STYLES) and in the archive
 * stylesheet; anything else would write a class no rule matches, so it is
 * rejected here rather than stored and puzzled over later.
 */
const cardStyle = (v: unknown): string => {
  const s = String(v ?? "default");
  return ["classic", "elevated", "bordered", "overlay", "list", "minimal"].includes(s) ? s : "default";
};

/**
 * The colour keys a category may override, and how each is checked.
 *
 * The names are the Customizer's own setting names so both paths feed the same
 * CSS builders (siteCss `archiveColourCss`). Colours are matched against the
 * shapes a picker produces — these end up inside a stylesheet, where a stray
 * `}` would end the rule and let anything after it be parsed as new CSS.
 */
const DESIGN_COLOURS = [
  "archive_header_bg", "archive_body_bg", "archive_title_color", "archive_desc_color",
  "archive_count_color", "archive_card_bg", "archive_card_border", "archive_card_title_color",
  "archive_card_title_hover", "archive_card_meta_color", "archive_card_excerpt_color",
  "archive_card_more_color",
  // Not `archive_card_term_color`: the category already has its own
  // "Archive Color" column for that very label, and two stored values for one
  // rule is a question about which wins waiting to be asked.
] as const;

const isColour = (v: string): boolean =>
  /^#[0-9a-fA-F]{3,8}$/.test(v) ||
  /^rgba?\([\d\s.,%]+\)$/.test(v) ||
  /^hsla?\([\d\s.,%deg]+\)$/.test(v) ||
  /^var\(--[a-zA-Z0-9-]+\)$/.test(v) ||
  /^[a-zA-Z]{3,20}$/.test(v);

/**
 * The category's own archive colours, as a JSON string or null.
 *
 * Rebuilt key by key rather than stored as sent: an unknown key, a value that
 * is not a colour, or anything that is not a plain object is dropped, so what
 * reaches the stylesheet is only ever what this list allows.
 */
function archiveDesign(raw: unknown): string | null {
  let obj: Record<string, unknown> | null = null;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) obj = raw as Record<string, unknown>;
  else if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) obj = parsed;
    } catch {
      return null;
    }
  }
  if (!obj) return null;

  const out: Record<string, string> = {};
  for (const key of DESIGN_COLOURS) {
    const v = String(obj[key] ?? "").trim();
    if (v && isColour(v)) out[key] = v;
  }
  const radius = parseInt(String(obj.archive_card_radius ?? ""), 10);
  if (Number.isFinite(radius) && radius >= 0 && radius <= 200) out.archive_card_radius = String(radius);

  return Object.keys(out).length ? JSON.stringify(out) : null;
}

/**
 * The archive-appearance and SEO columns, read off a request body.
 *
 * **Only keys the body actually contains** are returned, which is what makes
 * this safe to spread into an update. The quick rename in the category list
 * sends nothing but a name, a slug and a description; if this returned all
 * eighteen columns, that rename would silently wipe the term's colours, its
 * canonical URL and every robots flag.
 *
 * Present-but-empty is different from absent, and both are respected: `""`
 * clears the value, a missing key leaves it alone. That is what PATCH means.
 */
export function categorySettingsFrom(body: Record<string, unknown>) {
  const out: Record<string, string | boolean | null> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  const TEXT = [
    "archiveColor", "archiveHoverColor", "headerImage",
    "seoTitle", "seoDescription", "focusKeyword", "canonicalUrl",
    "ogTitle", "ogDescription", "ogImage",
  ] as const;
  for (const k of TEXT) if (has(k)) out[k] = text(body[k]);

  const FLAGS = ["noIndex", "noFollow", "noArchive", "noImageIndex", "noSnippet"] as const;
  for (const k of FLAGS) if (has(k)) out[k] = flag(body[k]);

  if (has("archiveColumns")) out.archiveColumns = columns(body.archiveColumns);
  if (has("archiveCardStyle")) out.archiveCardStyle = cardStyle(body.archiveCardStyle);
  if (has("archiveDesign")) out.archiveDesign = archiveDesign(body.archiveDesign);
  // "ltr" / "rtl", or null for "follow the language" — anything else is null.
  if (has("direction")) out.direction = body.direction === "ltr" || body.direction === "rtl" ? body.direction : null;

  return out;
}

/**
 * Whether `parentId` may be used as the parent of `id`.
 *
 * Walks up from the proposed parent looking for `id`. Without this a term can
 * be made its own ancestor, and every later walk of the tree — a breadcrumb, a
 * child listing — loops forever. The database cannot express this constraint,
 * so it is checked here, and the walk is bounded as a second guarantee in case
 * a cycle already exists in the data.
 */
export async function parentIsAllowed(id: number, parentId: number | null): Promise<boolean> {
  if (parentId === null) return true;
  if (parentId === id) return false;

  let cursor: number | null = parentId;
  for (let hops = 0; cursor !== null && hops < 50; hops++) {
    const row: { parentId: number | null } | undefined = await db.query.categories.findFirst({
      where: eq(categories.id, cursor),
      columns: { parentId: true },
    });
    if (!row) return false;
    if (row.parentId === id) return false;
    cursor = row.parentId;
  }
  return true;
}

/** A parent id from a request body: a real row id, or null for "no parent". */
export function parentIdFrom(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}
