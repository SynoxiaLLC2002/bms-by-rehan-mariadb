// Content analysis for the editor — the "is this post ready" checklist.
//
// The kind of thing Rank Math and Yoast show: is the focus keyword where it
// should be, is the title the right length, is the post long enough, do the
// images have alt text. None of it is magic; all of it is the list an
// experienced blogger runs in their head, made visible to one who is not.
//
// Pure: takes the document as the editor holds it, returns findings. It runs
// on every keystroke (debounced by the caller), so it walks the blocks once
// and does everything from that one pass.

export type Severity = "good" | "ok" | "bad" | "info";

export interface SeoFinding {
  id: string;
  severity: Severity;
  label: string;
  detail?: string;
}

export interface SeoAnalysis {
  score: number;
  findings: SeoFinding[];
  words: number;
  readingMinutes: number;
  keyword: string;
}

export interface SeoInput {
  title: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  slug: string;
  excerpt: string;
  featuredImage: string;
  content: unknown;
  /** The site's own origin, to tell internal links from external ones. */
  siteOrigin?: string;
  /**
   * The document's title is hidden (Design → Page Title → Disable), so the
   * content is expected to supply the `<h1>` itself — a hero block, usually.
   */
  titleHidden?: boolean;
}

interface Walked {
  paragraphs: string[];
  headings: { level: number; text: string }[];
  images: { alt: string }[];
  links: string[];
  /** Internal links set to open in a new tab — a reader-hostile choice worth flagging. */
  newTabInternal: string[];
}

function inlineText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      if (typeof c !== "object" || c === null) return "";
      const n = c as Record<string, unknown>;
      if (typeof n.text === "string") return n.text;
      if (Array.isArray(n.content)) return inlineText(n.content);
      return "";
    })
    .join("");
}

function collectLinks(content: unknown, out: string[]) {
  if (!Array.isArray(content)) return;
  for (const c of content) {
    if (typeof c !== "object" || c === null) continue;
    const n = c as Record<string, unknown>;
    if (n.type === "link" && typeof n.href === "string") out.push(n.href);
    if (Array.isArray(n.content)) collectLinks(n.content, out);
  }
}

const HEADING_TAGS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };

/** Keys under which custom blocks keep readable text in their props. */
const TEXT_KEYS = new Set(["text", "title", "content", "label", "body", "question", "answer", "caption", "description", "summary", "heading", "name", "value", "notice", "footerText", "intro", "eyebrow", "ticks", "pros", "cons", "changes", "points", "quote", "note", "footnote"]);

/**
 * Nested block trees hidden inside props — Row Layout columns (`cols`),
 * Accordion panes, Icon List items, table cells — arrive as JSON strings.
 * Anything that parses to an object or array is descended into.
 */
function parsed(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!(t.startsWith("[") || t.startsWith("{"))) return v;
  try { return JSON.parse(t); } catch { return v; }
}

/**
 * Walks an arbitrary value from a block's props: nested `blocks` arrays are
 * real block trees (a Row Layout column), objects with `alt` and a source are
 * images, known text keys are prose, `href`/`url` are links.
 */
function walkProps(value: unknown, w: Walked, depth = 0): void {
  if (depth > 12) return;
  const v = parsed(value);
  if (Array.isArray(v)) {
    // A list of blocks (each has a `type`) is a block tree; anything else is
    // a list of items whose fields are looked at one by one.
    if (v.some((x) => x && typeof x === "object" && "type" in (x as object) && "props" in (x as object))) {
      walk(v, w);
    } else {
      for (const x of v) walkProps(x, w, depth + 1);
    }
    return;
  }
  if (!v || typeof v !== "object") return;
  const o = v as Record<string, unknown>;
  if (Array.isArray(o.blocks)) walk(o.blocks, w);
  if (typeof o.alt === "string" || typeof o.src === "string" || typeof o.url === "string") {
    if ((typeof o.src === "string" && o.src) || (typeof o.url === "string" && /\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/i.test(o.url))) {
      w.images.push({ alt: String(o.alt ?? o.caption ?? "").trim() });
    }
  }
  for (const [k, raw] of Object.entries(o)) {
    if (k === "blocks") continue;
    const val = parsed(raw);
    if (typeof val === "string") {
      if (TEXT_KEYS.has(k) && val.trim().length > 1) w.paragraphs.push(val);
      else if ((k === "href" || k === "link") && (/^(https?:)?\/\//.test(val) || val.startsWith("/"))) {
        w.links.push(val);
        if (val.startsWith("/") && (o.target === "_blank" || o.linkTarget === "_blank")) w.newTabInternal.push(val);
      }
    } else if (val && typeof val === "object") {
      walkProps(val, w, depth + 1);
    }
  }
}

function walk(blocks: unknown, w: Walked) {
  if (!Array.isArray(blocks)) return;
  for (const b of blocks) {
    if (typeof b !== "object" || b === null) continue;
    const block = b as Record<string, unknown>;
    const props = (block.props ?? {}) as Record<string, unknown>;
    const type = String(block.type ?? "");
    const text = inlineText(block.content);
    collectLinks(block.content, w.links);

    // A built-in table keeps its text in `content.rows[].cells[]` — each cell
    // `{ content }` (BlockNote 0.30) or a bare array (older) — which the
    // inline reader above cannot see; its words and links were not counted.
    if (type === "table") {
      const rows = (block.content as { rows?: unknown } | null)?.rows;
      const cellTexts: string[] = [];
      for (const row of Array.isArray(rows) ? rows : []) {
        const cells = (row as { cells?: unknown })?.cells;
        for (const cell of Array.isArray(cells) ? cells : []) {
          const inline = Array.isArray(cell) ? cell : (cell as { content?: unknown })?.content;
          collectLinks(inline, w.links);
          const t = inlineText(inline).trim();
          if (t) cellTexts.push(t);
        }
      }
      if (cellTexts.length) w.paragraphs.push(cellTexts.join(" "));
    }

    if (type === "heading") {
      w.headings.push({ level: Number(props.level) || 2, text });
    } else if (type === "textAdvanced" && HEADING_TAGS[String(props.tag)]) {
      // Text Advanced set to h1–h6 is a heading, the same as the renderer
      // and the Table of Contents treat it.
      w.headings.push({ level: HEADING_TAGS[String(props.tag)], text });
    } else if (type === "image" || type === "imageAdvanced") {
      const alt = String(props.alt ?? props.caption ?? props.name ?? "").trim();
      if (props.url || props.src) w.images.push({ alt });
    } else if (text) {
      w.paragraphs.push(text);
    }

    // Everything a custom block keeps in props: Row Layout columns, Accordion
    // panes, Icon List items, table cells, button links, gallery images.
    // Before this only three flat keys were read, so a page built from Row
    // Layouts analysed as "0 words".
    for (const [k, raw] of Object.entries(props)) {
      if (type === "heading" && k === "level") continue;
      const val = parsed(raw);
      if (typeof val === "string") {
        if (TEXT_KEYS.has(k) && type !== "heading" && val.trim().length > 1) w.paragraphs.push(val);
        else if (k === "href" || k === "linkUrl" || (k === "url" && !/image|video|embed|gallery|map/i.test(type))) {
          if (/^(https?:)?\/\//.test(val) || val.startsWith("/")) {
            w.links.push(val);
            if (val.startsWith("/") && (props.target === "_blank" || props.linkTarget === "_blank")) w.newTabInternal.push(val);
          }
        }
      } else if (val && typeof val === "object") {
        walkProps(val, w);
      }
    }
    if (Array.isArray(block.children)) walk(block.children, w);
  }
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** The distinct values that occur more than once, ignoring case and spacing. */
function duplicates(values: string[]): string[] {
  const seen = new Map<string, string>();
  const out = new Map<string, string>();
  for (const v of values) {
    const key = norm(v);
    if (!key) continue;
    if (seen.has(key)) out.set(key, seen.get(key)!);
    else seen.set(key, v.trim());
  }
  return [...out.values()];
}
/**
 * Words, counted the way a reader would.
 *
 * `\p{M}` belongs inside a word (reasons.txt §5.2): Arabic harakat and
 * tanween, and every Hindi vowel sign, are Marks. Without it "مجانًا" counted
 * as two words and "हिन्दी" as three or four, which skewed the word count,
 * the reading time, the thin-content warning and keyword density.
 */
const WORD = /[\p{L}\p{N}][\p{L}\p{M}\p{N}'’-]*/gu;
const countWords = (s: string) => (s.match(WORD) || []).length;

/**
 * Text as the keyword checks compare it.
 *
 * Case folded, every combining mark dropped (Arabic diacritics, Latin
 * accents after NFD, Indic vowel signs — the same on both sides, so a match
 * is still a match), tatweel removed, and the Arabic letters people write
 * interchangeably folded to one form: أ إ آ ٱ → ا, ة → ه, ى → ي. A focus
 * keyword "اخر اصدار" used to miss "آخر إصدار" in the text, and every check
 * reported "bad" — which pushed writers to stuff spelling variants.
 */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .toLowerCase()
    .replace(/\p{M}+/gu, "")
    .replace(/\u0640/g, "")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0649/g, "\u064A");
}

/** The folded words of a text, in order. */
function tokens(s: string): string[] {
  return fold(s).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
}

/**
 * Whole-word occurrences of a phrase. Matching inside words counted "app"
 * in "apple" and "happy".
 */
function occurrences(haystack: string, needle: string): number {
  const n = tokens(needle);
  if (n.length === 0) return 0;
  const h = tokens(haystack);
  let c = 0;
  for (let i = 0; i + n.length <= h.length; i++) {
    let hit = true;
    for (let j = 0; j < n.length; j++) {
      if (h[i + j] !== n[j]) { hit = false; break; }
    }
    if (hit) { c++; i += n.length - 1; }
  }
  return c;
}

/** Whether a text begins with the phrase, word for word. */
function startsWithPhrase(text: string, phrase: string): boolean {
  const t = tokens(text);
  const n = tokens(phrase);
  return n.length > 0 && n.every((w, i) => t[i] === w);
}

export function analyzeSeo(input: SeoInput): SeoAnalysis {
  const w: Walked = { paragraphs: [], headings: [], images: [], links: [], newTabInternal: [] };
  walk(input.content, w);

  const body = w.paragraphs.join("\n");
  const words = countWords(body);
  const readingMinutes = Math.max(1, Math.round(words / 220));
  const keyword = (input.seoKeywords || "").split(",")[0]?.trim() ?? "";
  const title = (input.seoTitle || input.title || "").trim();
  const description = (input.seoDescription || "").trim();

  const f: SeoFinding[] = [];
  const add = (id: string, severity: Severity, label: string, detail?: string) => f.push({ id, severity, label, detail });

  // ── Keyword ────────────────────────────────────────────────────────────────
  if (!keyword) {
    add("kw", "info", "No focus keyword", "Add the phrase you want this page to rank for under Focus Keywords; the checks below then use it.");
  } else {
    const inTitle = occurrences(title, keyword) > 0;
    add("kw-title", inTitle ? "good" : "bad", inTitle ? "Keyword is in the title" : "Keyword is not in the title",
      inTitle && startsWithPhrase(title, keyword) ? "And it comes first — the strongest position." : undefined);
    add("kw-desc", occurrences(description, keyword) > 0 ? "good" : "bad", occurrences(description, keyword) > 0 ? "Keyword is in the meta description" : "Keyword is not in the meta description");
    const inSlug = occurrences(input.slug.replace(/-/g, " "), keyword) > 0;
    add("kw-url", inSlug ? "good" : "ok", inSlug ? "Keyword is in the URL" : "Keyword is not in the URL", "Search engines read the slug; a keyword there is a small, free signal.");
    // The opening: the first 10% of the words, and never fewer than 50.
    const bodyWords = tokens(body);
    const early = occurrences(bodyWords.slice(0, Math.max(50, Math.floor(bodyWords.length * 0.1))).join(" "), keyword) > 0;
    add("kw-intro", early ? "good" : "bad", early ? "Keyword appears early in the content" : "Keyword does not appear in the first paragraphs", "Use it naturally in the opening — readers and crawlers both decide what a page is about from the start.");
    const inHeading = w.headings.some((h) => occurrences(h.text, keyword) > 0);
    add("kw-h", inHeading ? "good" : "ok", inHeading ? "Keyword is in a subheading" : "Keyword is not in any subheading");
    const kwCount = occurrences(body, keyword);
    const density = words ? (kwCount * countWords(keyword) * 100) / words : 0;
    add("kw-density", density === 0 ? "bad" : density > 3 ? "bad" : density < 0.5 ? "ok" : "good",
      `Keyword density ${density.toFixed(1)}% (${kwCount}×)`,
      density > 3 ? "That reads as stuffing. Aim for 0.5–2.5%." : density < 0.5 ? "Use it a few more times where it fits naturally." : "In the healthy range.");
    const altHit = w.images.some((i) => occurrences(i.alt, keyword) > 0);
    if (w.images.length) add("kw-alt", altHit ? "good" : "ok", altHit ? "Keyword is in an image alt text" : "Keyword is not in any image alt text");
  }

  // ── Title & description ────────────────────────────────────────────────────
  const tl = title.length;
  add("title-len", tl === 0 ? "bad" : tl < 30 ? "ok" : tl <= 60 ? "good" : "ok",
    tl === 0 ? "No title" : `Title is ${tl} characters`,
    tl > 60 ? "Google shows about 60; the end will be cut off." : tl < 30 && tl > 0 ? "Short. Room to say more about what the reader gets." : undefined);
  const dl = description.length;
  add("desc-len", dl === 0 ? "bad" : dl < 120 ? "ok" : dl <= 160 ? "good" : "ok",
    dl === 0 ? "No meta description" : `Meta description is ${dl} characters`,
    dl === 0 ? "Without one, Google writes its own from the page — usually worse than yours." : dl > 160 ? "About 160 fit; the rest is cut." : dl < 120 ? "Room for a fuller sentence." : undefined);
  if (!input.excerpt.trim()) add("excerpt", "info", "No excerpt", "Listings and the RSS feed show the excerpt; without one they use the first lines of content.");

  // ── Content ────────────────────────────────────────────────────────────────
  add("words", words < 300 ? "bad" : words < 600 ? "ok" : "good", `${words.toLocaleString()} words · ${readingMinutes} min read`,
    words < 300 ? "Thin. Posts under ~300 words rarely rank for anything competitive." : words < 600 ? "Fine for a short answer; longer guides tend to do better." : undefined);
  add("headings", w.headings.length === 0 ? (words > 250 ? "bad" : "ok") : "good",
    w.headings.length === 0 ? "No subheadings" : `${w.headings.length} subheading${w.headings.length === 1 ? "" : "s"}`,
    w.headings.length === 0 ? "Break the text up with H2/H3 headings — they help readers scan and give the page structure." : undefined);
  const h1s = w.headings.filter((h) => h.level === 1).length;
  if (input.titleHidden) {
    // With the title hidden, the content owns the H1: exactly one is right.
    if (h1s === 1) add("h1", "good", "Content provides the H1", "The title is hidden, so the heading in your content is the page's H1.");
    else if (h1s === 0) add("h1", "bad", "No H1 heading", "The title is hidden and nothing in the content is an H1 — add one, or show the title.");
    else add("h1", "bad", `${h1s} H1 headings in the content`, "Only one H1 per page. Make the others H2.");
  } else if (h1s) {
    add("h1", "bad", `${h1s} H1 heading${h1s === 1 ? "" : "s"} in the content`, "The title is already the page's H1. Use H2 and below in the body, or hide the title under Design.");
  }
  // Two headings with the same words: the reader cannot tell the sections
  // apart in the contents, search engines see one topic claimed twice, and
  // the second one's anchor gets a "-2" suffix.
  const dupHeadings = duplicates(w.headings.map((h) => h.text));
  if (dupHeadings.length) add("dup-headings", "bad", `${dupHeadings.length} heading${dupHeadings.length === 1 ? "" : "s"} used more than once`, `“${dupHeadings.slice(0, 3).join("”, “")}” — give each section its own heading.`);
  const longPara = w.paragraphs.filter((p) => countWords(p) > 150).length;
  if (longPara) add("para", "ok", `${longPara} very long paragraph${longPara === 1 ? "" : "s"}`, "Over 150 words each. Split them — walls of text lose readers on phones.");

  // ── Images ─────────────────────────────────────────────────────────────────
  add("featured", input.featuredImage ? "good" : "ok", input.featuredImage ? "Featured image set" : "No featured image", input.featuredImage ? undefined : "It is the share preview and the listing thumbnail.");
  const noAlt = w.images.filter((i) => !i.alt).length;
  if (w.images.length === 0) add("images", words > 300 ? "ok" : "info", "No images in the content", "Posts with images get more clicks from search and more time on page.");
  else add("alt", noAlt ? "bad" : "good", noAlt ? `${noAlt} of ${w.images.length} images have no alt text` : `All ${w.images.length} images have alt text`, noAlt ? "Alt text is how search engines and screen readers see an image." : undefined);
  // The same alt on different images describes at least one of them wrongly.
  const dupAlts = duplicates(w.images.map((i) => i.alt).filter(Boolean));
  if (dupAlts.length) add("dup-alt", "ok", `${dupAlts.length} alt text${dupAlts.length === 1 ? "" : "s"} reused on several images`, `“${dupAlts.slice(0, 3).join("”, “")}” — describe what each image actually shows.`);

  // ── Links ──────────────────────────────────────────────────────────────────
  const origin = (input.siteOrigin || "").replace(/\/$/, "");
  const internal = w.links.filter((l) => l.startsWith("/") || l.startsWith("#") || (origin && l.startsWith(origin))).length;
  const external = w.links.length - internal;
  add("int-links", internal ? "good" : "ok", internal ? `${internal} internal link${internal === 1 ? "" : "s"}` : "No internal links", internal ? undefined : "Link to your other posts — it keeps readers on the site and passes ranking signal between pages.");
  if (w.newTabInternal.length) add("int-newtab", "ok", `${w.newTabInternal.length} internal link${w.newTabInternal.length === 1 ? "" : "s"} open${w.newTabInternal.length === 1 ? "s" : ""} in a new tab`, "A link to your own site should open in the same tab — a new tab is for leaving the site. Set it to Same Tab.");
  add("ext-links", external ? "good" : "info", external ? `${external} external link${external === 1 ? "" : "s"}` : "No external links", external ? undefined : "Linking to a good source or two is a quality signal, not a leak.");

  // ── URL ────────────────────────────────────────────────────────────────────
  if (input.slug.length > 75) add("slug", "ok", "URL is long", "Under ~75 characters reads better in results.");

  // Score: bad = 0, ok = half, good = full; info does not count.
  const scored = f.filter((x) => x.severity !== "info");
  const points = scored.reduce((n, x) => n + (x.severity === "good" ? 1 : x.severity === "ok" ? 0.5 : 0), 0);
  const score = scored.length ? Math.round((points / scored.length) * 100) : 0;

  const order: Record<Severity, number> = { bad: 0, ok: 1, info: 2, good: 3 };
  f.sort((a, b) => order[a.severity] - order[b.severity]);

  return { score, findings: f, words, readingMinutes, keyword };
}
