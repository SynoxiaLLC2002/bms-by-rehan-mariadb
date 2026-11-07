import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A URL slug that keeps the language it was written in.
 *
 * `slugify`'s transliteration turned every Arabic title into Latin gibberish
 * — "حل المشكلات الشائعة" became `hl-almshklat-alshaeah`, which is not a word in
 * any language and tells a reader or a search engine nothing. Non-Latin slugs
 * are ordinary on the web: the browser percent-encodes them in the address
 * bar and shows them decoded, and Google reads them as the words they are.
 *
 * So: lowercase, and any run of characters that is not a letter, a number or a
 * combining mark in *any* script becomes a single hyphen. This is the same
 * rule the heading anchors and the Table of Contents already use
 * (`tableOfContents.ts`), which is why those worked on Arabic pages while the
 * permalink did not.
 *
 * `\p{M}` is there because Arabic diacritics are Marks, not Letters. Without
 * it, the tanween in "مجانًا" was a separator like a space, and the heading
 * anchor came out `#مجان-ا` — one word split into two with the vowel dropped.
 * Hindi matras, Hebrew niqqud and Vietnamese tone marks are the same category
 * and broke the same way.
 *
 * Existing slugs are untouched — they are stored, and the editor only derives
 * a new one for a record that has never been saved.
 */
export function toSlug(str: string) {
  return str
    .normalize("NFKC")
    .toLowerCase()
    // Apostrophes join words rather than splitting them: "don't" → "dont".
    .replace(/['’ʼ]/g, "")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Longest slug derived from a title, measured **percent-encoded**.
 *
 * The unit matters. Slugs keep the language they were written in (see
 * `toSlug`), and a non-Latin slug is percent-encoded in the URL: one Arabic
 * letter is two bytes, so six characters as `%D8%AA`. Counting characters
 * would let an Arabic headline through at 60 characters and publish a 276
 * character link, while cutting an English one that was perfectly short. A
 * cap in characters is a cap that means something different in every
 * language — exactly what this CMS must not do, since it is meant for French,
 * Polish, Urdu and the rest as much as English.
 *
 * So the limit is on what actually appears in the address bar. 150 leaves a
 * readable, shareable URL in any script, well inside the ~255 byte ceilings
 * that filesystems and some proxies still impose, and short enough that
 * search results do not truncate it to an ellipsis.
 *
 * Only derived slugs are trimmed; an editor who types their own keeps it.
 */
const MAX_SLUG_ENCODED = 150;

const encodedLength = (value: string) => encodeURIComponent(value).length;

/**
 * `slug`, trimmed until its encoded form fits, cut on a word boundary.
 *
 * Words are added back one at a time rather than the string being sliced,
 * because slicing a multi-byte character in half produces a lone surrogate
 * and `encodeURIComponent` throws on it. A single word too long on its own
 * falls back to a character-wise trim, which walks whole code points.
 */
export function capSlug(slug: string): string {
  if (encodedLength(slug) <= MAX_SLUG_ENCODED) return slug;

  let out = "";
  for (const word of slug.split("-")) {
    const next = out ? `${out}-${word}` : word;
    if (encodedLength(next) > MAX_SLUG_ENCODED) break;
    out = next;
  }

  if (!out) {
    // One very long word. `[...slug]` iterates code points, so this never
    // splits a character.
    for (const char of [...slug]) {
      if (encodedLength(out + char) > MAX_SLUG_ENCODED) break;
      out += char;
    }
  }

  return out.replace(/-+$/, "");
}

/**
 * A category or tag slug: the name (or typed slug) in its own script, capped
 * the same way a post's is, and never empty.
 *
 * Terms used an ASCII-only rule in the admin preview and no cap at all on the
 * server, so "Android 14 أندرويد" previewed as `android-14`, "Café" as `caf`,
 * and an emoji-only name saved an empty slug — an archive at `/tag/`.
 * `fallback` names the term kind, so an unsluggable name still gets an
 * address a person can read.
 */
export function termSlug(input: string, fallback: "tag" | "category"): string {
  return capSlug(toSlug(input || "")) || `${fallback}-${Date.now().toString(36)}`;
}

export function formatDate(date: Date | string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function truncate(str: string, length: number) {
  if (str.length <= length) return str;
  return str.slice(0, length) + "…";
}

/**
 * A value that is safe to use as a Postgres `integer` row id, or null.
 *
 * `parseInt` alone is not enough: it happily returns 1e18 for a long string of
 * digits, and `Number.isFinite` says yes to that. The driver then raises "value
 * out of range for type integer" and the route turns that into a 500 — on
 * endpoints anyone can reach by guessing a URL or posting a body. Bounded to
 * int4 so an over-large id is simply "not found" instead.
 */
export function toRowId(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isSafeInteger(n) || n < 1 || n > 2_147_483_647) return null;
  return n;
}

/**
 * Text into HTML-safe text.
 *
 * For the few places that build a small piece of markup by hand — a text widget
 * that turns newlines into `<br/>`, say. React escapes everything it renders,
 * so this is only ever needed on the way into `dangerouslySetInnerHTML`; if you
 * are not calling that, you do not need this.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * An `http(s)` URL, normalised — or "" for anything else.
 *
 * A commenter's website lands in an `<a href>`, so `javascript:` and friends
 * have to go. The comments API and the comment list each had this function,
 * which is one edit away from the check that runs on save disagreeing with the
 * check that runs on render.
 */
export function safeHttpUrl(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}
