// Language and region.
//
// Four settings, each of which actually changes something — the lesson from the
// permalink structure, which was saved and displayed and read by nothing:
//
//   site_language   -> the `lang` on <html>, and the locale dates format in
//   site_direction  -> the `dir` on <html>
//   date_format     -> how every published date reads
//   site_timezone   -> which day a timestamp near midnight belongs to
//
// The last one is not only cosmetic. `toLocaleDateString` without an explicit
// zone uses whatever the *runtime* is set to, so a post published at 23:30 UTC
// rendered as one day on the server and another in the browser — a hydration
// mismatch, and a date that changed depending on where the reader was.

import type { SiteSettings } from "./settings";

/** A BCP 47 language tag: `en`, `en-GB`, `ur`, `zh-Hans`. */
const LANG_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/**
 * Scripts written right to left.
 *
 * Matched on the language subtag alone, so `ur`, `ur-PK` and `ar-EG` all count.
 * This is what "Automatic" resolves against.
 */
const RTL_LANGUAGES = new Set(["ar", "arc", "dv", "fa", "ha", "he", "khw", "ks", "ku", "ps", "sd", "ur", "yi"]);

export type TextDirection = "ltr" | "rtl";

/**
 * The languages the pickers offer.
 *
 * Listed by native name first, the way WordPress does it — someone choosing
 * Urdu is looking for "اردو", not for "Urdu" filed under U in an English list.
 * The English name follows so an administrator who does not read the script can
 * still find it.
 *
 * Not exhaustive, and deliberately so: every entry here has to be a real BCP 47
 * tag that `Intl` can format dates in. Adding one is a single line.
 */
export const LANGUAGES: { code: string; native: string; english: string }[] = [
  { code: "en", native: "English (United States)", english: "English (US)" },
  { code: "en-GB", native: "English (United Kingdom)", english: "English (UK)" },
  { code: "ur", native: "اردو", english: "Urdu" },
  { code: "ar", native: "العربية", english: "Arabic" },
  { code: "fa", native: "فارسی", english: "Persian" },
  { code: "ps", native: "پښتو", english: "Pashto" },
  { code: "he", native: "עברית", english: "Hebrew" },
  { code: "hi", native: "हिन्दी", english: "Hindi" },
  { code: "bn", native: "বাংলা", english: "Bengali" },
  { code: "pa", native: "ਪੰਜਾਬੀ", english: "Punjabi" },
  { code: "ta", native: "தமிழ்", english: "Tamil" },
  { code: "te", native: "తెలుగు", english: "Telugu" },
  { code: "mr", native: "मराठी", english: "Marathi" },
  { code: "gu", native: "ગુજરાતી", english: "Gujarati" },
  { code: "kn", native: "ಕನ್ನಡ", english: "Kannada" },
  { code: "ml", native: "മലയാളം", english: "Malayalam" },
  { code: "ne", native: "नेपाली", english: "Nepali" },
  { code: "si", native: "සිංහල", english: "Sinhala" },
  { code: "zh-Hans", native: "简体中文", english: "Chinese (Simplified)" },
  { code: "zh-Hant", native: "繁體中文", english: "Chinese (Traditional)" },
  { code: "ja", native: "日本語", english: "Japanese" },
  { code: "ko", native: "한국어", english: "Korean" },
  { code: "th", native: "ไทย", english: "Thai" },
  { code: "vi", native: "Tiếng Việt", english: "Vietnamese" },
  { code: "id", native: "Bahasa Indonesia", english: "Indonesian" },
  { code: "ms", native: "Bahasa Melayu", english: "Malay" },
  { code: "fil", native: "Filipino", english: "Filipino" },
  { code: "sw", native: "Kiswahili", english: "Swahili" },
  { code: "es", native: "Español", english: "Spanish" },
  { code: "pt-BR", native: "Português (Brasil)", english: "Portuguese (Brazil)" },
  { code: "pt", native: "Português", english: "Portuguese" },
  { code: "fr", native: "Français", english: "French" },
  { code: "de", native: "Deutsch", english: "German" },
  { code: "it", native: "Italiano", english: "Italian" },
  { code: "nl", native: "Nederlands", english: "Dutch" },
  { code: "pl", native: "Polski", english: "Polish" },
  { code: "ru", native: "Русский", english: "Russian" },
  { code: "uk", native: "Українська", english: "Ukrainian" },
  { code: "tr", native: "Türkçe", english: "Turkish" },
  { code: "el", native: "Ελληνικά", english: "Greek" },
  { code: "cs", native: "Čeština", english: "Czech" },
  { code: "ro", native: "Română", english: "Romanian" },
  { code: "hu", native: "Magyar", english: "Hungarian" },
  { code: "sv", native: "Svenska", english: "Swedish" },
  { code: "da", native: "Dansk", english: "Danish" },
  { code: "nb", native: "Norsk bokmål", english: "Norwegian" },
  { code: "fi", native: "Suomi", english: "Finnish" },
];

/** How a language reads in the picker: native name, then English if different. */
export const languageLabel = (l: { native: string; english: string }) =>
  l.native === l.english ? l.native : `${l.native} — ${l.english}`;

/* ── Content languages ──────────────────────────────────────────────────── */

/**
 * The languages this site publishes in.
 *
 * Stored as one comma-separated setting rather than a table: it is a short,
 * ordered list that is read on nearly every request and edited about twice in
 * a site's life. The first entry is the default — the language a document gets
 * when nothing says otherwise, and the one the public site serves.
 *
 * Content is *partitioned* by these, not shared. Adding Urdu does not translate
 * anything; it opens a second set of posts and pages that happens to live in
 * the same install.
 */
export function contentLanguages(settings: SiteSettings): string[] {
  const raw = (settings.content_languages ?? "").trim();
  const codes = raw
    .split(",")
    .map((c) => c.trim())
    .filter((c) => LANG_TAG.test(c));

  // Always at least one, and never a duplicate — the admin's language tabs and
  // every default read off this list.
  const unique = Array.from(new Set(codes));
  return unique.length ? unique : [siteLang(settings)];
}

/** The language a new document gets, and what the public site serves. */
export function defaultContentLanguage(settings: SiteSettings): string {
  return contentLanguages(settings)[0];
}

/** Whether a code is one this site publishes in. */
/**
 * Whether this is a language the picker knows about, configured or not.
 *
 * `isContentLanguage` asks "is this one of the site's languages"; this asks "is
 * this a real language we can offer". Adding a content language from a document
 * needs the second question — the language is by definition not configured yet
 * — while still refusing arbitrary codes typed into a URL.
 */
export function isKnownLanguage(code: string): boolean {
  return LANGUAGES.some((l) => l.code === code);
}

export function isContentLanguage(code: string, settings: SiteSettings): boolean {
  return contentLanguages(settings).includes(code);
}

/**
 * A language code narrowed to one the site actually publishes in.
 *
 * Anything else — an old code left in a URL after a language was removed, or a
 * hand-typed one — falls back to the default rather than showing an empty list
 * that looks like "you have no posts".
 */
export function resolveContentLanguage(code: string | null | undefined, settings: SiteSettings): string {
  const wanted = (code ?? "").trim();
  return isContentLanguage(wanted, settings) ? wanted : defaultContentLanguage(settings);
}

/** How a code reads in the UI, falling back to the code when it is unknown. */
export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.native ?? code;
}

/**
 * Time zones offered in the picker.
 *
 * A representative list rather than the full IANA database, which runs to
 * hundreds of entries and would be unusable as a dropdown. `siteTimeZone`
 * accepts any zone `Intl` knows, so a value set outside this list still works —
 * the list is a convenience, not the validation.
 */
export const TIME_ZONES: string[] = [
  "UTC",
  "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi",
  "America/Argentina/Buenos_Aires", "America/Bogota", "America/Chicago",
  "America/Denver", "America/Los_Angeles", "America/Mexico_City",
  "America/New_York", "America/Sao_Paulo", "America/Toronto",
  "Asia/Baghdad", "Asia/Bangkok", "Asia/Colombo", "Asia/Dhaka", "Asia/Dubai",
  "Asia/Hong_Kong", "Asia/Jakarta", "Asia/Jerusalem", "Asia/Kabul",
  "Asia/Karachi", "Asia/Kathmandu", "Asia/Kolkata", "Asia/Kuala_Lumpur",
  "Asia/Manila", "Asia/Riyadh", "Asia/Seoul", "Asia/Shanghai",
  "Asia/Singapore", "Asia/Tehran", "Asia/Tokyo",
  "Australia/Brisbane", "Australia/Melbourne", "Australia/Perth", "Australia/Sydney",
  "Europe/Amsterdam", "Europe/Athens", "Europe/Berlin", "Europe/Brussels",
  "Europe/Dublin", "Europe/Istanbul", "Europe/Lisbon", "Europe/London",
  "Europe/Madrid", "Europe/Moscow", "Europe/Paris", "Europe/Rome",
  "Europe/Stockholm", "Europe/Warsaw", "Europe/Zurich",
  "Pacific/Auckland", "Pacific/Honolulu",
];

export const TEXT_DIRECTIONS: { id: string; label: string; hint: string }[] = [
  { id: "auto", label: "Automatic", hint: "Right-to-left when the language is, otherwise left-to-right" },
  { id: "ltr", label: "Left to right", hint: "English, Urdu written in Roman script, most European languages" },
  { id: "rtl", label: "Right to left", hint: "Urdu, Arabic, Hebrew, Persian" },
];

/**
 * Date presets, as `Intl` options.
 *
 * Presets rather than a strftime-style pattern: the pattern would have to be
 * parsed and reimplemented, and `Intl` already knows how each locale writes a
 * date. `medium` is what the site produced before this setting existed, so it
 * is the default and nothing changes for anyone who never opens the screen.
 */
export const DATE_FORMATS: { id: string; label: string; options: Intl.DateTimeFormatOptions }[] = [
  { id: "medium", label: "28 Aug 2026", options: { year: "numeric", month: "short", day: "numeric" } },
  { id: "long", label: "28 August 2026", options: { year: "numeric", month: "long", day: "numeric" } },
  { id: "full", label: "Friday, 28 August 2026", options: { weekday: "long", year: "numeric", month: "long", day: "numeric" } },
  { id: "numeric", label: "28/08/2026", options: { year: "numeric", month: "2-digit", day: "2-digit" } },
  { id: "iso", label: "2026-08-28", options: {} },
];

/** Reads one language setting, falling back to `en`. */
function langOf(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return LANG_TAG.test(value) ? value : "en";
}

/** Resolves a direction setting, deriving "auto" from its language. */
function dirOf(choice: string | undefined, lang: string): TextDirection {
  if (choice === "rtl" || choice === "ltr") return choice;
  return RTL_LANGUAGES.has(lang.split("-")[0].toLowerCase()) ? "rtl" : "ltr";
}

/** The published site's language tag, or `en` when unset or malformed. */
export function siteLang(settings: SiteSettings): string {
  return langOf(settings.site_language);
}

/**
 * The admin's own language — deliberately not the site's.
 *
 * The root layout renders one `<html>` for the whole application, so the site's
 * language was being applied to the CMS as well: publishing an Urdu site turned
 * the editor right-to-left along with it. They are unrelated choices — the
 * audience of the site and the person running it are usually different people —
 * so the admin carries its own pair and defaults to English regardless of what
 * the site is set to.
 */
export function adminLang(settings: SiteSettings): string {
  return langOf(settings.admin_language);
}

export function adminDir(settings: SiteSettings): TextDirection {
  return dirOf(settings.admin_direction, adminLang(settings));
}

/** The site's text direction, resolving "auto" against the language. */
/**
 * Reading direction for one content language, independent of the site-wide
 * setting.
 *
 * `siteDir` answers "which way does this site read", which was the only
 * question while there was one language. With several, `/ur` reads right to
 * left even on a site whose default is English, so the direction has to come
 * from the language of the document being served.
 */
export function languageDir(code: string): TextDirection {
  return RTL_LANGUAGES.has((code || "").split("-")[0].toLowerCase()) ? "rtl" : "ltr";
}

/**
 * The direction a document is written in.
 *
 * The public site already decides this per page — the default language follows
 * the Settings choice (explicit, or automatic from the site language), any
 * other language follows its own script. The editor did not: it sat inside the
 * admin, which has its own direction, so an Arabic post was typed with its
 * punctuation at the wrong end even though it rendered correctly once
 * published. Same rule, one function, used by both.
 *
 * `override` is the document's own Direction setting, when it has one.
 */
export function documentDir(language: string, settings: SiteSettings, override?: string | null): TextDirection {
  // A document may say so itself — one written against the grain of its
  // language, or whose language was recorded wrongly and cannot yet move.
  if (override === "ltr" || override === "rtl") return override;
  return language === defaultContentLanguage(settings) ? siteDir(settings) : languageDir(language);
}

export function siteDir(settings: SiteSettings): TextDirection {
  const choice = settings.site_direction ?? "auto";
  if (choice === "rtl" || choice === "ltr") return choice;
  const base = siteLang(settings).split("-")[0].toLowerCase();
  return RTL_LANGUAGES.has(base) ? "rtl" : "ltr";
}

/**
 * The configured time zone, or "UTC".
 *
 * Validated by asking `Intl` to use it: an unknown zone throws a RangeError
 * rather than silently falling back, and an invalid one stored in settings must
 * not take every page down.
 */
export function siteTimeZone(settings: SiteSettings): string {
  const raw = (settings.site_timezone ?? "").trim();
  if (!raw) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: raw });
    return raw;
  } catch {
    return "UTC";
  }
}

/**
 * The same date for a `<time dateTime>` attribute: ISO 8601, or undefined for
 * nothing usable. `formatSiteDate` follows the site's format and language,
 * which a crawler cannot parse; this is the half it can.
 */
export function isoDate(date: Date | string | null | undefined): string | undefined {
  if (!date) return undefined;
  const at = date instanceof Date ? date : new Date(date);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

/**
 * A date, written the way this site writes dates.
 *
 * Always pinned to an explicit locale *and* zone, so the same timestamp reads
 * identically on the server and in the browser.
 *
 * `language` is the document's. Every date used the site language, so a
 * French post on an Arabic site read "٢١ سبتمبر ٢٠٢٦" under a French
 * heading. The default content language still uses the site's own tag,
 * which may carry a region (`ar-EG`) the bare code does not.
 */
export function formatSiteDate(date: Date | string | null | undefined, settings: SiteSettings, language?: string): string {
  if (!date) return "—";
  const at = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(at.getTime())) return "—";

  const timeZone = siteTimeZone(settings);
  const chosen = settings.date_format ?? "medium";

  // ISO is a fixed shape, not a locale's idea of one.
  if (chosen === "iso") {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
    return parts;
  }

  const preset = DATE_FORMATS.find((f) => f.id === chosen) ?? DATE_FORMATS[0];
  try {
    const locale = !language || language === defaultContentLanguage(settings) ? siteLang(settings) : language;
    return new Intl.DateTimeFormat(locale, { ...preset.options, timeZone }).format(at);
  } catch {
    // A locale Intl does not know should not blank the date.
    return new Intl.DateTimeFormat("en", { ...preset.options, timeZone }).format(at);
  }
}
