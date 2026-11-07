// Flattens BlockNote content into plain text so post bodies can be searched.
// Stored in posts.search_text on save; a generated tsvector column indexes it.

type AnyBlock = Record<string, unknown>;

/** Props on custom blocks whose values are worth indexing. */
const TEXT_PROPS = [
  "text", "title", "label", "caption", "content", "url",
  "items", "tabs", "quote", "author", "role", "learnMore",
  // Steps Grid (a JSON list) and Iframe Embed Advanced.
  "steps", "heading", "badge", "notice", "footerText", "buttonLabel",
  // Highlight Panel.
  "points", "intro",
  // Hero, CTA Band, Card Grid, Pros & Cons, Comparison Table, Version History.
  "eyebrow", "ticks", "btn1Label", "btn2Label", "cards", "pros", "cons", "prosTitle", "consTitle",
  "cols", "rows", "versions", "linkLabel",
  // Link Grid, Review Grid, Price List, Fact Sheet.
  "links", "reviews", "footnote",
];

function inlineText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      if (typeof c !== "object" || c === null) return "";
      const node = c as AnyBlock;
      if (typeof node.text === "string") return node.text;
      if (Array.isArray(node.content)) return inlineText(node.content);
      return "";
    })
    .join("");
}

/**
 * A built-in table's text. Its `content` is `{ type: "tableContent", rows }`,
 * not an inline array, so `inlineText` read nothing and table text was not
 * searchable. A cell is `{ content }` (BlockNote 0.30) or a bare array (older).
 */
export function tableText(content: unknown): string {
  const rows = (content as AnyBlock | null)?.rows;
  if (!Array.isArray(rows)) return "";
  const out: string[] = [];
  for (const row of rows) {
    const cells = (row as AnyBlock | null)?.cells;
    for (const cell of Array.isArray(cells) ? cells : []) {
      out.push(inlineText(Array.isArray(cell) ? cell : (cell as AnyBlock)?.content));
    }
  }
  return out.filter(Boolean).join(" ");
}

/** Pulls readable strings out of a custom block's props, including JSON-encoded ones. */
function propsText(props: unknown): string {
  if (typeof props !== "object" || props === null) return "";
  const out: string[] = [];

  for (const [key, value] of Object.entries(props as AnyBlock)) {
    if (typeof value !== "string" || !value.trim()) continue;
    if (!TEXT_PROPS.includes(key)) continue;

    const trimmed = value.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      // Several blocks (accordion, tabs, icon list) stash arrays of objects here.
      try {
        const parsed = JSON.parse(trimmed);
        // A Row Layout's `cols` holds whole blocks: columnText reads those as
        // text. Collected here as well, every type, id and setting in them was
        // indexed and every word appeared twice.
        if (key === "cols" && Array.isArray(parsed) && parsed.some((c) => c && typeof c === "object" && "blocks" in c)) continue;
        out.push(collectStrings(parsed));
        continue;
      } catch {
        /* fall through and index the raw string */
      }
    }
    out.push(trimmed);
  }

  return out.join(" ");
}

/** Keys inside a block's JSON props that are settings, never words a reader sees. */
const NOT_TEXT_KEYS = new Set(["id", "type", "styles", "icon", "iconColor", "color", "bg", "background", "image", "img", "src", "href", "url", "target", "rel", "variant", "style", "align", "width", "height", "size"]);
/** Values that are ids, colours, sizes or switches. */
const NOT_TEXT_VALUE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|#[0-9a-f]{3,8}|-?\d+(?:\.\d+)?(?:px|%|rem|em|vh|vw)?|true|false|null)$/i;

function collectStrings(value: unknown, depth = 0): string {
  if (depth > 6) return "";
  if (typeof value === "string") return NOT_TEXT_VALUE.test(value.trim()) ? "" : value;
  if (Array.isArray(value)) return value.map((v) => collectStrings(v, depth + 1)).filter(Boolean).join(" ");
  if (typeof value === "object" && value !== null) {
    return Object.entries(value)
      .filter(([k]) => !NOT_TEXT_KEYS.has(k))
      .map(([, v]) => collectStrings(v, depth + 1))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

/**
 * Text inside a Row Layout's columns.
 *
 * A row keeps its columns as nested block lists in the `cols` prop, so without
 * this a page built out of rows would index as empty.
 */
function columnText(props: unknown, depth: number): string {
  if (typeof props !== "object" || props === null) return "";
  const raw = (props as AnyBlock).cols;
  if (typeof raw !== "string" || !raw.trim().startsWith("[")) return "";
  try {
    const cols = JSON.parse(raw);
    if (!Array.isArray(cols)) return "";
    return cols
      .map((c) => (c && typeof c === "object" ? blocksToPlainText((c as AnyBlock).blocks, depth + 1) : ""))
      .filter(Boolean)
      .join(" ");
  } catch {
    return "";
  }
}

export function blocksToPlainText(content: unknown, depth = 0): string {
  if (depth > 12 || !Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const raw of content) {
    if (typeof raw !== "object" || raw === null) continue;
    const block = raw as AnyBlock;

    parts.push(inlineText(block.content));
    parts.push(tableText(block.content));
    parts.push(propsText(block.props));
    parts.push(columnText(block.props, depth));
    if (Array.isArray(block.children)) parts.push(blocksToPlainText(block.children, depth + 1));
  }

  return parts
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100_000); // guard against a runaway document
}
