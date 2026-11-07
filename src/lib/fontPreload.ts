// Which font files to preload (Speed → Page optimisation → "Preload fonts").
//
// The font CSS is inlined in the head, but the browser still only requests a
// font file once layout has found text that needs it — after the stylesheets
// have arrived and the first paint is being laid out. A `<link rel=preload>`
// for the one file the body text will certainly use starts that download
// with the HTML, which is the single largest saving on a font-heavy page.
//
// Only what is certain: the body family at regular weight, and the heading
// family at bold if it differs, in the character set the page's language is
// written in. Preloading more than that competes with the page's own CSS and
// images for bandwidth and ends up slower, which is why WP Rocket caps it too.

interface Face {
  family: string;
  weightMin: number;
  weightMax: number;
  style: string;
  subset: string;
  url: string;
}

/** The character set a language is written in, as Google names its subsets. */
export function subsetForLanguage(language: string | undefined): string {
  const lang = (language || "").toLowerCase().split("-")[0];
  if (["ar", "fa", "ur", "ps", "ku", "sd"].includes(lang)) return "arabic";
  if (["ru", "uk", "bg", "sr", "mk", "be", "kk", "ky", "mn"].includes(lang)) return "cyrillic";
  if (lang === "el") return "greek";
  if (lang === "vi") return "vietnamese";
  if (lang === "he") return "hebrew";
  if (lang === "th") return "thai";
  if (["hi", "mr", "ne"].includes(lang)) return "devanagari";
  if (lang === "bn") return "bengali";
  if (lang === "ta") return "tamil";
  if (lang === "ko") return "korean";
  if (lang === "ja") return "japanese";
  return "latin";
}

/** Latin-script languages whose letters (ł, ş, ő, ț…) are in latin-ext rather than latin. */
const LATIN_EXT = new Set(["pl", "cs", "sk", "sl", "hr", "bs", "sr", "hu", "ro", "tr", "az", "lv", "lt", "et", "mt", "sq", "is", "cy", "ga", "eo", "uz", "tk", "ku", "ha", "yo", "vi"]);

/**
 * Google's font CSS with the character sets no language of this site uses
 * taken out.
 *
 * Google's css2 API answers with every subset a family has — Poppins comes as
 * latin, latin-ext and devanagari for each weight, fifteen `@font-face`
 * blocks at five weights — and ignores the old `&subset=` parameter, so the
 * "Google Font Subsets" setting had been doing nothing. `unicode-range` kept
 * the unused files from downloading, but the CSS for them is inlined into
 * every page. What stays: latin (numbers, product names, URLs), the script
 * of each content language, and anything listed in that setting. A family
 * that would be left with no faces at all keeps all of them — a font with no
 * Latin subset is still better than none.
 */
export function keepSubsets(css: string, languages: string[], extra: string[] = []): string {
  const keep = new Set(["latin", ...extra.map((s) => s.trim().toLowerCase()).filter(Boolean)]);
  for (const language of languages) {
    const subset = subsetForLanguage(language);
    keep.add(subset);
    if (subset === "cyrillic") keep.add("cyrillic-ext");
    if (LATIN_EXT.has(language.toLowerCase().split("-")[0])) keep.add("latin-ext");
  }
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}\s*/gi;
  // Families that still have at least one face once filtered.
  const survives = new Set<string>();
  for (const m of css.matchAll(re)) {
    if (keep.has(m[1].toLowerCase())) survives.add(familyOf(m[2]));
  }
  return css.replace(re, (whole, subset: string, body: string) =>
    keep.has(subset.toLowerCase()) || !survives.has(familyOf(body)) ? whole : ""
  );
}

function familyOf(faceBody: string): string {
  return (faceBody.match(/font-family:\s*['"]?([^;'"]+)/i)?.[1] ?? "").trim().toLowerCase();
}

/**
 * One `@font-face` per file instead of one per weight.
 *
 * Google describes a variable font (Cairo, Inter, Noto…) as a separate
 * `@font-face` for every requested weight, all pointing at the same file:
 * five blocks per character set for 400–800, identical except for the
 * weight. A single block with the range (`font-weight: 400 800`) says the
 * same thing — the browser picks any weight in it from that one file — in a
 * fifth of the CSS that is inlined into every page. Faces are merged only
 * when everything but the weight matches, so a static family with one file
 * per weight is left exactly as it was.
 */
export function mergeVariableFaces(css: string): string {
  const re = /(\/\*\s*[a-z-]+\s*\*\/\s*)?@font-face\s*\{([^}]*)\}\s*/gi;
  const groups = new Map<string, { min: number; max: number; body: string; comment: string }>();
  const order: (string | { key: string })[] = [];
  let last = 0;
  for (const m of css.matchAll(re)) {
    order.push(css.slice(last, m.index));
    last = m.index! + m[0].length;
    const body = m[2];
    const weight = body.match(/font-weight:\s*([^;]+);?/i)?.[1]?.trim() ?? "400";
    const [w1, w2] = weight.split(/\s+/).map((n) => parseInt(n, 10));
    // Everything except the weight, whitespace-normalised, is the identity.
    const key = (m[1] ?? "") + body.replace(/font-weight:\s*[^;]+;?/i, "").replace(/\s+/g, " ").trim();
    const g = groups.get(key);
    if (g && Number.isFinite(w1)) {
      g.min = Math.min(g.min, w1);
      g.max = Math.max(g.max, Number.isFinite(w2) ? w2 : w1);
      continue;
    }
    groups.set(key, { min: w1 || 400, max: (Number.isFinite(w2) ? w2 : w1) || 400, body, comment: m[1] ?? "" });
    order.push({ key });
  }
  order.push(css.slice(last));
  return order
    .map((part) => {
      if (typeof part === "string") return part;
      const g = groups.get(part.key)!;
      const weight = g.min === g.max ? `${g.min}` : `${g.min} ${g.max}`;
      const body = /font-weight:/i.test(g.body) ? g.body.replace(/font-weight:\s*[^;]+/i, `font-weight: ${weight}`) : `${g.body}\n  font-weight: ${weight};`;
      return `${g.comment}@font-face {${body}}\n`;
    })
    .join("");
}

/** Every `@font-face` in Google's CSS, with the subset comment Google puts before each one. */
function parseFaces(css: string): Face[] {
  const faces: Face[] = [];
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/gi;
  for (const m of css.matchAll(re)) {
    const body = m[2];
    const family = body.match(/font-family:\s*['"]?([^;'"]+)/i)?.[1]?.trim() ?? "";
    const weight = body.match(/font-weight:\s*([^;]+)/i)?.[1]?.trim() ?? "400";
    const [w1, w2] = weight.split(/\s+/).map((n) => parseInt(n, 10));
    const style = body.match(/font-style:\s*([^;]+)/i)?.[1]?.trim() ?? "normal";
    const url = body.match(/url\((["']?)([^)"']+)\1\)/i)?.[2] ?? "";
    if (!family || !url) continue;
    faces.push({ family, weightMin: w1 || 400, weightMax: w2 || w1 || 400, style, subset: m[1].toLowerCase(), url });
  }
  return faces;
}

function pick(faces: Face[], family: string | undefined, weight: number, subset: string): string | null {
  if (!family) return null;
  const want = family.trim().toLowerCase();
  const candidates = faces.filter(
    (f) => f.family.toLowerCase() === want && f.style === "normal" && f.weightMin <= weight && weight <= f.weightMax
  );
  // The page's script first. A Latin-only family on an Arabic page still
  // draws the Latin words (a product name, a version number), so its Latin
  // file is the one that will be used.
  return (candidates.find((f) => f.subset === subset) ?? candidates.find((f) => f.subset === "latin"))?.url ?? null;
}

/**
 * The font URLs worth preloading for a page: the body face, the heading face,
 * and the button face. Empty when nothing matches (a custom upload, a family
 * the CSS does not carry).
 *
 * Google splits a family into one file per weight per subset, so "the heading
 * font" and "the body font" are different downloads even when the family is
 * the same — this used to skip the heading whenever both settings named one
 * family, which is the common case. The result on a Poppins site was that the
 * one preloaded file (weight 400) was not the one the first paint needed:
 * the headings at 700 and the buttons at 600 were found only after the CSS
 * had parsed, and PageSpeed measured them as the whole remaining critical
 * path. What matters is the weight, not the family name.
 *
 * Still deliberately short. Preloading every face competes with the page's
 * own CSS and image for bandwidth and ends up slower, so this is capped at
 * three: the faces a page is certain to paint above the fold.
 */
const MAX_PRELOADS = 3;

export function fontPreloadUrls(
  fontCss: string | null,
  opts: {
    body?: string;
    heading?: string;
    language?: string;
    /** Heading weight from Customize -> Typography. */
    headingWeight?: number;
    /** Button weight; buttons are above the fold on most designs. */
    buttonWeight?: number;
  }
): string[] {
  if (!fontCss) return [];
  const faces = parseFaces(fontCss);
  if (faces.length === 0) return [];
  const subset = subsetForLanguage(opts.language);
  const heading = opts.heading || opts.body;
  // A family that does not draw this page's script (Poppins on an Arabic
  // page) paints only the odd Latin word — a version number, a brand. Those
  // are worth one early file, for the heading, not three: the rest of the
  // text is in the visitor's system font whatever is preloaded.
  const max = subset !== "latin" && !faces.some((f) => f.subset === subset) ? 1 : MAX_PRELOADS;
  const urls = new Set<string>();

  // Order matters: a browser starts preloads in document order, and the
  // heading is usually the LCP element.
  for (const [family, weight] of [
    [heading, opts.headingWeight || 700],
    [opts.body, 400],
    [opts.body, opts.buttonWeight || 600],
  ] as const) {
    const url = pick(faces, family, weight, subset);
    if (url) urls.add(url);
    if (urls.size >= max) break;
  }
  // A page in another script almost always has Latin in its first screen
  // too — the product name, a version, "APK" — and a family that covers both
  // splits them into two files. With a variable font the loop above finds
  // one file for every weight, and the Latin one was left to be discovered
  // from the CSS; PageSpeed showed it as the late link in the critical chain.
  if (subset !== "latin" && urls.size < max) {
    const latin = pick(faces, heading, opts.headingWeight || 700, "latin");
    if (latin) urls.add(latin);
  }
  return [...urls].slice(0, max);
}
