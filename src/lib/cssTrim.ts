/**
 * Leaving out the CSS for blocks a page does not contain.
 *
 * `allSiteCss` builds one stylesheet covering every block the CMS can render.
 * On a site with "Inline site CSS" on, that stylesheet is in the document, so
 * every visitor to every page downloads and — more expensively — parses it in
 * full before the browser can paint anything. Measured on a real page: 40,777
 * bytes, of which 15,474 belonged to families the page never rendered. The
 * download-box rules alone are 7.3 KB, shipped to every site whether or not it
 * has ever used a download box.
 *
 * The rule here is deliberately lopsided. Keeping CSS a page does not need
 * costs bytes; dropping CSS a page does need means a visitor sees an unstyled
 * block, on a live site, and nobody finds out until someone looks. So a rule
 * is dropped only when *everything* it selects is positively known to belong
 * to a block that is positively known to be absent. Anything unrecognised is
 * kept.
 *
 * It only ever runs when the stylesheet is inlined. A linked
 * `/site/<hash>.css` is shared by every page and cached for a year, so
 * trimming it per page would defeat the caching it exists for — and the hash
 * in its name is built from the settings, not the page.
 */

/**
 * Class prefix → the block types that can emit it.
 *
 * Only families with a known, complete owner list are here. `.star` is left
 * out because accordions, app info and the rating block all emit it;
 * `.social` because both the social icons block and the author bio use it;
 * `.bmsbtn` because buttons appear inside other blocks. Those keep their CSS
 * unconditionally, which costs a few hundred bytes and removes a whole class
 * of way to be wrong.
 */
export const FAMILY_BLOCKS: Record<string, readonly string[]> = {
  bmsta: ["textAdvanced"],
  dlb: ["downloadBox"],
  bmsib: ["infoBox"],
  bmsia: ["imageAdvanced"],
  bmsapp: ["appInfo"],
  imgcmp: ["imageCompare"],
  pricing: ["pricingTable"],
  showmore: ["showMore"],
  cform: ["contactForm"],
  bmstbl: ["table", "tableAdvanced"],
  bmstoc: ["tableOfContents"],
  bmsacc: ["accordion"],
  bmsil: ["iconList"],
  postgrid: ["postGrid"],
  "bms-timeline": ["timeline"],
  "bms-tl": ["timeline"],
  "bms-video": ["video", "videoEmbed"],
  // Not blocks: the search results page and the post listings. Their owners
  // are names no content contains, so they are always absent — correct,
  // because trimming only happens on a page or post (a route that passes its
  // document), and neither ever renders SearchResults, BlogArchive or
  // CategoryArchive. Those routes get the whole stylesheet. `hsearch-*`, the
  // header's search box, is a different family and is never touched.
  search: ["@search-page"],
  archive: ["@archive-page"],
  "star-rating": ["starRating"],
  "bms-cform": ["contactForm"],
  // Page furniture, not blocks: SiteLayout adds the marker when the header
  // really uses it — the off-canvas menu when a header zone holds the menu
  // trigger, the desktop/mobile swap when a header row differs between the
  // two (identical rows are emitted once, as `.hdr-both`).
  offcanvas: ["@offcanvas"],
  "hdr-desktop": ["@hdr-split"],
  "hdr-mobile": ["@hdr-split"],
  // The header search box, when a header zone holds the search item.
  hsearch: ["@hsearch"],
  // The title area and after-content pieces are `.post-…` on a post and
  // `.page-…` on a page; each document is one kind. `postgrid` has no hyphen
  // after "post" and is not matched (familyOf demands `family-`).
  post: ["@kind-post"],
  page: ["@kind-page"],
  // Small per-block defaults from blockCss, each with one owner.
  "bms-callout": ["callout"],
  "bms-prog": ["progressBar"],
  "bms-gal": ["gallery"],
  "bms-spacer": ["spacer"],
  "social-icons": ["socialIcons"],
  "bms-cta-btn": ["splitContent"],
  "bms-col": ["rowLayout"],
  "bms-row-in": ["rowLayout"],
  "social-icon": ["socialIcons"],
  "icon-block-mark": ["icon"],
  "html-embed": ["htmlEmbed"],
  "bms-loadmore": ["@archive-page"],
  // The header menu, when a shown zone has a Navigation item whose menu has
  // items — SiteLayout adds the marker.
  hnav: ["@hnav"],
};

/** Every block type named above, for the scan. */
export const TRIMMABLE_BLOCK_TYPES: readonly string[] = [
  ...new Set(Object.values(FAMILY_BLOCKS).flat()),
];

/**
 * Which of the trimmable block types appear anywhere in this content.
 *
 * A scan of the serialised content rather than a walk of the block tree, and
 * that is the point: a block nested in a Row Layout column is not a child in
 * the tree at all — the columns are a JSON string inside the parent's props —
 * and tabs, modals and split content each nest differently again. A walk has
 * to understand all of it and is wrong the day a new container is added.
 *
 * It looks for the block's `"type":"<name>"` pair, with the quotes escaped
 * any number of times (a block in a column is serialised twice). It used to
 * look for the bare name, and the settings passed in here contain the key
 * `perf_video_facade`, so every page on every site carried the video CSS.
 * Names starting with `@` are not block types but markers the caller adds
 * itself (see SiteLayout), and are matched as plain text.
 *
 * It can still say yes when the answer is no — an article quoting a block's
 * JSON would keep that block's CSS — and that is the harmless direction.
 */
export function presentBlockTypes(...sources: (string | null | undefined)[]): Set<string> {
  const blob = sources.filter(Boolean).join("\n");
  const found = new Set<string>();
  // Attribute facts the caller states (`@attr:kind=page`) — see attrIsDead.
  for (const m of blob.matchAll(/@attr:[\w-]+=[\w-]+/g)) found.add(m[0]);
  for (const type of TRIMMABLE_BLOCK_TYPES) {
    if (type.startsWith("@")) {
      if (blob.includes(type)) found.add(type);
      continue;
    }
    const pair = new RegExp(`type\\\\*"\\s*:\\s*\\\\*"${type}\\\\*"`);
    if (pair.test(blob)) found.add(type);
  }
  return found;
}

/**
 * Splits CSS into top-level rules, keeping at-rules whole.
 *
 * Not a parser: it counts braces, which is all that is needed for a
 * stylesheet this module generated itself. Strings and comments would break
 * it; the builders emit neither at the top level.
 */
function topLevelRules(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        out.push(css.slice(start, i + 1));
        start = i + 1;
      }
    }
  }
  if (start < css.length) out.push(css.slice(start));
  return out;
}

/**
 * The family a class name belongs to, or null when it is not a known one.
 *
 * A class belongs to a family only when it *is* the family name or continues
 * it after a hyphen. Matching any class that merely starts with the letters
 * would mean a future `.dlbanner` or `.pricing-table-of-contents` silently
 * inheriting another block's fate, which in this direction means being
 * deleted. Checked against the whole generated stylesheet: no class today is
 * matched by the loose rule and not the strict one, so this costs nothing and
 * closes the hole.
 *
 * Longest family first, so `bms-timeline` is not mistaken for `bms-tl`.
 */
function familyOf(className: string): string | null {
  let best: string | null = null;
  for (const family of Object.keys(FAMILY_BLOCKS)) {
    if (className === family || className.startsWith(family + "-")) {
      if (!best || family.length > best.length) best = family;
    }
  }
  return best;
}

/**
 * True when no selector in this list can match anything on the page.
 *
 * One selector (`.pricing-plan.is-featured`, `.bmsapp-stars span.on`) needs
 * every class it names to be on some element, so a single class from a
 * family whose block is absent is enough to make it dead — whatever else it
 * names. The rule used to demand that *every* class be from a known family,
 * which kept all of those alive for the sake of an `.is-featured`. A list is
 * dropped only when every selector in it is dead.
 *
 * What is inside `:not(…)`, `:is(…)`, `:where(…)` or `[…]` is ignored: a
 * class in `:not()` being absent makes the selector match *more*, and an
 * attribute value is text, not a class.
 */
/**
 * Attribute facts about this document, as markers in `present`:
 * `@attr:kind=page`, `@attr:layout=fullwidth`, `@attr:style=unboxed`,
 * `@attr:spacing=disable` (the content shell's data-* values) and one
 * `@attr:hrow=<row>` per header row that is shown. A selector naming
 * `[data-kind="archive"]` on a page, or `[data-hrow="topbar"]` when no top
 * bar is on, can match nothing. `data-post-el` / `data-page-el` belong to
 * that kind's title area; `data-search-el` to the search page, which no
 * document ever is. With no facts of a name, nothing is assumed.
 */
function attrIsDead(selector: string, present: Set<string>): boolean {
  const facts = (name: string) => [...present].filter((m) => m.startsWith(`@attr:${name}=`)).map((m) => m.slice(name.length + 7));
  for (const m of selector.matchAll(/\[data-([\w-]+)(?:="([^"]*)")?\]/g)) {
    const [, name, value] = m;
    if (name === "search-el" && facts("kind").length) return true;
    if (name === "post-el" || name === "page-el") {
      const kinds = facts("kind");
      if (kinds.length && !kinds.includes(name.slice(0, -3))) return true;
      continue;
    }
    if (value === undefined) continue;
    const known = facts(name);
    if (known.length && !known.includes(value)) return true;
  }
  return false;
}

function selectorIsDroppable(selector: string, present: Set<string>): boolean {
  // A comment before a rule is part of its prelude here. One in blockCss
  // read "…the icon; everything else takes the full width, so…" — its comma
  // made a second, class-less "selector", which kept a download-box rule
  // alive on every page. Comments say nothing about what a rule matches.
  const stripped = selector.replace(/\/\*[\s\S]*?\*\//g, "");
  // Split on the commas between selectors only — one inside `:where(.a,.b)`
  // separates arguments, not selectors.
  const members: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) { members.push(stripped.slice(start, i)); start = i + 1; }
  }
  members.push(stripped.slice(start));
  const live = members.map((m) => m.trim()).filter(Boolean);
  if (live.length === 0) return false;
  // What is inside `:not(…)`, `:is(…)`, `:where(…)` or `[…]` is ignored for
  // classes; innermost first, until none are left.
  const bare = (m: string) => {
    let plain = m;
    for (let prev = ""; prev !== plain; ) {
      prev = plain;
      plain = plain.replace(/\([^()]*\)/g, "").replace(/\[[^[\]]*\]/g, "");
    }
    return plain;
  };
  return live.every((rawMember) => {
    if (attrIsDead(rawMember, present)) return true;
    const member = bare(rawMember);
    for (const m of member.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      const family = familyOf(m[1]);
      if (family && !FAMILY_BLOCKS[family].some((type) => present.has(type))) return true;
    }
    return false;
  });
}

/**
 * The stylesheet with absent block families removed.
 *
 * At-rules are recursed into rather than skipped — a `@media` wrapper around
 * a block's responsive rules would otherwise hide the whole family from this
 * — and one that ends up empty is dropped with its contents.
 */
export function trimSiteCss(css: string, present: Set<string>): string {
  const kept: string[] = [];
  for (const rule of topLevelRules(css)) {
    const brace = rule.indexOf("{");
    if (brace === -1) {
      // An at-statement like `@import ...;` — never ours to judge.
      if (rule.trim()) kept.push(rule);
      continue;
    }
    const prelude = rule.slice(0, brace);
    if (prelude.trimStart().startsWith("@")) {
      // A block's own animation goes with the block: `@keyframes bmsib-pulse`
      // belongs to the info box like `.bmsib-…` does.
      const kf = prelude.match(/^\s*@keyframes\s+([\w-]+)/);
      if (kf) {
        const family = familyOf(kf[1]);
        if (family && !FAMILY_BLOCKS[family].some((type) => present.has(type))) continue;
        kept.push(rule);
        continue;
      }
      // Conditional groups hold rules; everything else (@font-face) holds
      // declarations and must be passed through untouched.
      if (/^\s*@(media|supports|layer|container)\b/.test(prelude)) {
        const body = rule.slice(brace + 1, rule.lastIndexOf("}"));
        const inner = trimSiteCss(body, present);
        if (inner.trim()) kept.push(`${prelude}{${inner}}`);
      } else {
        kept.push(rule);
      }
      continue;
    }
    if (!selectorIsDroppable(prelude, present)) kept.push(rule);
  }
  return kept.join("");
}
