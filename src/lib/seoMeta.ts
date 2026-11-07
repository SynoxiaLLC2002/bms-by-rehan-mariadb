// The tags every public page should carry, built in one place.
//
// Each route was assembling its own `openGraph` object, and they had drifted:
// posts emitted a canonical and the homepage did not, `og:title` appeared
// without `og:url`, `og:type` or `og:site_name`, and nothing anywhere emitted
// `og:locale` — which on a multilingual site is the tag that tells a share
// preview which language it is looking at.
//
// One helper, so adding a tag adds it everywhere rather than in the one route
// somebody remembered.

import { cache } from "react";
import { buildRobots, parseRobotsAdvanced } from "@/lib/robots";
import { localBusinessSchema } from "@/lib/localSeo";
import type { Metadata } from "next";
import type { SiteSettings } from "@/lib/settings";
import { contentLanguages } from "@/lib/locale";
import { ogSignature } from "@/lib/ogSign";

/**
 * `og:locale` wants `language_TERRITORY`, not a bare language code.
 *
 * A code that already names a region converts directly (`en-GB` -> `en_GB`).
 * The rest get the territory most commonly paired with them; that is a
 * convention, not a fact, which is why it is a table rather than a rule. A
 * language not in the table falls back to its bare code — wrong-ish but
 * harmless, and better than inventing a territory.
 */
const OG_TERRITORY: Record<string, string> = {
  en: "en_US", ur: "ur_PK", ar: "ar_AR", fa: "fa_IR", ps: "ps_AF", he: "he_IL",
  hi: "hi_IN", bn: "bn_BD", pa: "pa_IN", ta: "ta_IN", te: "te_IN", mr: "mr_IN",
  gu: "gu_IN", kn: "kn_IN", ml: "ml_IN", ne: "ne_NP", si: "si_LK",
  "zh-Hans": "zh_CN", "zh-Hant": "zh_TW", ja: "ja_JP", ko: "ko_KR", th: "th_TH",
  vi: "vi_VN", id: "id_ID", ms: "ms_MY", fil: "tl_PH", sw: "sw_KE",
  es: "es_ES", pt: "pt_PT", fr: "fr_FR", de: "de_DE", it: "it_IT", nl: "nl_NL",
  pl: "pl_PL", ru: "ru_RU", uk: "uk_UA", tr: "tr_TR", el: "el_GR", cs: "cs_CZ",
  ro: "ro_RO", hu: "hu_HU", sv: "sv_SE", da: "da_DK", nb: "nb_NO", fi: "fi_FI",
};

export function ogLocale(code: string): string {
  if (OG_TERRITORY[code]) return OG_TERRITORY[code];
  return code.includes("-") ? code.replace("-", "_") : code;
}

export interface PageMetaInput {
  settings: SiteSettings;
  /** The document's content language. */
  language: string;
  /** Site-relative path this page is served from, e.g. `/fr/a-propos`. */
  path: string;
  title: string;
  description?: string | null;
  /** `website` for roots and listings, `article` for a post. */
  type?: "website" | "article";
  images?: string[];
  /** Set only when the author has overridden it; otherwise self-canonical. */
  canonicalOverride?: string | null;
  /** `hreflang` map, already built by `alternateLanguages`. */
  languages?: Record<string, string>;
  /** Article-only. */
  publishedTime?: string;
  modifiedTime?: string;
}

/**
 * Title, description, canonical, Open Graph, Twitter and `hreflang`.
 *
 * The canonical is **self-referencing by default**. A page with no canonical at
 * all leaves a crawler to decide which URL is the real one, and on a site where
 * the same document is reachable by a slug *and* a language root that decision
 * is not obvious. An author override still wins.
 */
export function pageMetadata(input: PageMetaInput): Metadata {
  const {
    settings, language, path, title, description, type = "website",
    images = [], canonicalOverride, languages, publishedTime, modifiedTime,
  } = input;

  const siteName = settings.site_name || undefined;
  const desc = (description ?? "").trim() || undefined;

  // Every other configured language, so a share preview knows the page exists
  // elsewhere too.
  const alternateLocale = contentLanguages(settings)
    .filter((c) => c !== language)
    .map(ogLocale);

  return {
    title,
    description: desc,
    alternates: {
      canonical: canonicalOverride || path,
      ...(languages ? { languages } : {}),
    },
    openGraph: {
      title,
      description: desc,
      // Relative; Next resolves it against `metadataBase`, which is set in the
      // root layout — the same mechanism the `hreflang` URLs rely on.
      url: path,
      siteName,
      locale: ogLocale(language),
      ...(alternateLocale.length ? { alternateLocale } : {}),
      type,
      ...(images.length ? { images: images.map((url) => ({ url: shareImageUrl(url) })) } : {}),
      ...(type === "article" && publishedTime ? { publishedTime } : {}),
      ...(type === "article" && modifiedTime ? { modifiedTime } : {}),
    },
    twitter: {
      // `summary_large_image` only when there is an image to be large.
      card: images.length ? "summary_large_image" : "summary",
      title,
      description: desc,
      ...(images.length ? { images: images.map((url) => twitterImage(url, title)) } : {}),
    },
  };
}

/**
 * Site-level structured data: who publishes this site, and how to search it.
 *
 * The SEO screen has collected `seo_kg_type`, `seo_kg_name` and `seo_kg_logo`
 * since before this — the logo field's own help text says "Used in the publisher
 * schema" — but nothing read them. They were write-only settings: filled in,
 * saved, and never emitted. This is what reads them.
 *
 * `WebSite` no longer carries a `SearchAction`. It existed for the sitelinks
 * search box, which Google retired in November 2024; since then it earns
 * nothing, and on a small site it advertises a search page that has little
 * to find.
 */
/**
 * Stable identifiers, so nodes emitted from different components describe one
 * graph rather than several unrelated ones.
 *
 * Every serious SEO plugin does this: the Article points at the WebPage, which
 * points at the WebSite, which points at the publisher. Separate blocks with no
 * `@id` are three assertions that happen to be on the same page; with `@id`
 * they are one connected description of it.
 */
export const schemaId = {
  identity: (base: string) => `${base}/#identity`,
  website: (base: string) => `${base}/#website`,
  // A bare origin (the site root — see absoluteUrlFor) gets its slash back
  // here, so the root's id reads `https://x.net/#webpage` like `/#website`.
  webpage: (url: string) => `${schemaUrl(url)}${/^https?:\/\/[^/]+$/i.test(url) ? "/" : ""}#webpage`,
};

/**
 * A URL as it belongs in structured data: percent-encoded the way the
 * browser and Next write the canonical. An Arabic slug went out raw in the
 * Article's `url` and `@id` while the canonical said `%D8%AD…` — the same
 * address twice, spelled two ways. Already-encoded input is left alone.
 */
export function schemaUrl(url: string): string {
  try {
    return encodeURI(decodeURI(url));
  } catch {
    return encodeURI(url);
  }
}

export function siteSchemas(
  settings: SiteSettings,
  language: string,
  base: string
): object[] {
  const siteName = settings.site_name || "";
  const kgName = settings.seo_kg_name || siteName;
  const kgLogo = identityLogo(settings, base);
  const kgType = settings.seo_kg_type === "person" ? "Person" : "Organization";

  const out: object[] = [
    prune({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": schemaId.website(base),
      name: siteName || undefined,
      url: base,
      inLanguage: language,
      description: settings.site_description || undefined,
      ...(kgName || kgLogo ? { publisher: { "@id": schemaId.identity(base) } } : {}),
    }),
  ];

  // Only when there is something to say. An empty publisher block is a claim
  // that the site has no publisher, which is worse than staying quiet.
  if (kgName || kgLogo) {
    const sameAs = [settings.social_facebook, settings.social_twitter, settings.social_instagram, settings.social_linkedin]
      .map((v) => (v || "").trim())
      .filter(Boolean);
    out.push(
      prune({
        "@context": "https://schema.org",
        "@type": kgType,
        "@id": schemaId.identity(base),
        name: kgName || undefined,
        url: base,
        // `logo` is an Organization property; a Person has an `image`.
        ...(kgLogo ? (kgType === "Organization" ? { logo: { "@type": "ImageObject", url: kgLogo } } : { image: kgLogo }) : {}),
        ...(sameAs.length ? { sameAs } : {}),
      })
    );
  }

  // A business with a place: LocalBusiness alongside the Organization.
  const local = localBusinessSchema(settings, base);
  if (local) out.push(local);

  return out;
}

/** The publisher block Google's Article guidance asks for. */
export function publisherSchema(settings: SiteSettings, base: string): object | undefined {
  const name = settings.seo_kg_name || settings.site_name || "";
  const logo = identityLogo(settings, base);
  if (!name && !logo) return undefined;
  const type = settings.seo_kg_type === "person" ? "Person" : "Organization";
  return prune({
    "@type": type,
    "@id": schemaId.identity(base),
    name: name || undefined,
    url: base,
    ...(logo ? (type === "Organization" ? { logo: { "@type": "ImageObject", url: logo } } : { image: logo }) : {}),
  });
}

/**
 * An absolute URL for structured data.
 *
 * Uploads are stored site-relative (`/uploads/…`). A page resolves that
 * against itself; JSON-LD does not — schema.org wants a full URL, and Google's
 * Rich Results test reports a relative `url` as invalid. Anything already
 * absolute passes through.
 */
export function absoluteUrl(url: string, base: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return `${base.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
}

/**
 * The publisher's logo: the Knowledge Graph logo from SEO settings, else the
 * site logo from Site Identity. Most sites set the second and never visit the
 * first, and an Organization with no logo is one Google will not show as the
 * publisher of an article.
 */
function identityLogo(settings: SiteSettings, base: string): string {
  const logo = (settings.seo_kg_logo || settings.site_logo || "").trim();
  return logo ? absoluteUrl(logo, base) : "";
}

/** Drops empty values so no property asserts "this is blank". */
function prune<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out as T;
}

/**
 * The robots directive string.
 *
 * `index, follow` alone leaves three defaults on the table that every serious
 * SEO plugin sets:
 *
 *   • `max-image-preview:large`  — without it Google may show a thumbnail or
 *     none at all; it is what makes a result (and a Discover card) carry a full
 *     image. The single highest-value directive here.
 *   • `max-snippet:-1`           — no cap on snippet length.
 *   • `max-video-preview:-1`     — no cap on video preview length.
 *
 * They are omitted when the page is `noindex`, where they mean nothing: there
 * is no result to preview.
 */
/**
 * The full directive string for a term that carries its own robots flags.
 *
 * `robotsDirectives` answers the two-way question — index and follow — which is
 * all a post needed. A term can also say `noarchive`, `noimageindex` and
 * `nosnippet`, and those combine freely, so they are appended rather than
 * encoded into one of a fixed set of answers.
 *
 * The snippet and preview allowances are dropped when `nosnippet` is set: they
 * say how large a snippet may be, and saying "no snippet, up to any length" is
 * contradictory instruction to give a crawler.
 */
export function termRobots(
  flags: {
    noIndex?: boolean | null;
    noFollow?: boolean | null;
    noArchive?: boolean | null;
    noImageIndex?: boolean | null;
    noSnippet?: boolean | null;
  },
  /** What the site-wide setting says when the term itself is silent. */
  indexByDefault: boolean
): string {
  const index = flags.noIndex ? false : indexByDefault;
  const parts = [index ? "index" : "noindex", flags.noFollow ? "nofollow" : "follow"];

  if (flags.noArchive) parts.push("noarchive");
  if (flags.noImageIndex) parts.push("noimageindex");
  if (flags.noSnippet) parts.push("nosnippet");

  // Only worth stating on a page that may be indexed at all.
  if (index && !flags.noSnippet) {
    parts.push("max-snippet:-1", "max-image-preview:large", "max-video-preview:-1");
  }
  return parts.join(", ");
}

export function robotsDirectives(index: boolean, follow: boolean, advanced?: string | null): string {
  return buildRobots(index, follow, parseRobotsAdvanced(advanced));
}

/**
 * A meta description, falling back until there is something to say.
 *
 * A page with no description is a page whose search snippet Google writes for
 * you out of whatever text it finds first — which on a post is usually the
 * navigation. The chain is: what the author wrote, then the excerpt, then the
 * opening of the body, then the site description.
 *
 * Trimmed at a word boundary near 155 characters, which is roughly where Google
 * truncates. An ellipsis is added only when something was actually cut.
 */
export function deriveDescription(
  ...candidates: (string | null | undefined)[]
): string | undefined {
  for (const raw of candidates) {
    const text = (raw ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (text.length <= 155) return text;
    const cut = text.slice(0, 155);
    const lastSpace = cut.lastIndexOf(" ");
    return `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trim()}…`;
  }
  return undefined;
}

/**
 * The `og:image` companions that can be derived from a URL alone.
 *
 * `og:image:width` and `og:image:height` are **not** here. Media is stored
 * without dimensions, so they would have to be guessed, and a wrong size makes
 * a share card render worse than no size at all. Recording dimensions at upload
 * is the real fix; until then these three are honest.
 */
export function ogImageExtras(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (url.startsWith("https://")) out["og:image:secure_url"] = url;

  const ext = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() ?? "";
  const type = ({
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    gif: "image/gif", avif: "image/avif", svg: "image/svg+xml",
  } as Record<string, string>)[ext];
  if (type) out["og:image:type"] = type;

  return out;
}

/**
 * Pixel dimensions for an image URL, if the media library knows them.
 *
 * `og:image:width` / `og:image:height` were left out earlier precisely because
 * nothing recorded them and a guess is worse than silence. Uploads record them
 * now, so this looks the URL up rather than inventing anything: an image pasted
 * from elsewhere, or uploaded before the column existed, still returns null and
 * still emits no size.
 */
export interface ImageInfo {
  width: number;
  height: number;
  /** The blurred placeholder recorded at upload, when there is one. */
  blur?: string;
}

export const lookupImageSize = cache(async function lookupImageSize(url: string): Promise<ImageInfo | null> {
  if (!url) return null;
  try {
    const { db } = await import("@/lib/db");
    const { media } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select({ width: media.width, height: media.height, blur: media.blur })
      .from(media)
      .where(eq(media.url, url))
      .limit(1);
    if (!row?.width || !row?.height) return null;
    return { width: row.width, height: row.height, ...(row.blur ? { blur: row.blur } : {}) };
  } catch {
    // The media table not being reachable must not take a page's metadata down.
    return null;
  }
});

/**
 * Everything a share card can know about one `og:image`, as the descriptor
 * Next's `openGraph.images` takes: secure URL and MIME type from the URL,
 * width and height from the media library when it recorded them.
 *
 * These used to go through metadata's `other`, which writes every key as
 * `<meta name="…">`. Open Graph is read from `property="…"` — a scraper
 * ignores `name="og:image:width"` — so the size, type and secure URL were
 * emitted on every page and read by nobody. Next writes this descriptor's
 * fields with `property`.
 */
/**
 * The URL a share tag should carry for an image: a JPEG copy when the upload
 * is WebP or AVIF (see app/og/jpg), the image itself otherwise.
 */
export function shareImageUrl(url: string): string {
  const m = url.match(/^\/uploads\/([^/?#]+)\.(webp|avif)$/i);
  return m ? `/og/jpg/${m[1]}.jpg` : url;
}

/**
 * A Twitter card image: the share copy of the file (see shareImageUrl) with
 * its alt text. `og:image:alt` was written and `twitter:image:alt` was not,
 * and the card validator flags the missing one as an accessibility miss.
 */
export function twitterImage(url: string, alt?: string | null): { url: string; alt?: string } {
  return { url: shareImageUrl(url), ...(alt ? { alt } : {}) };
}

export async function ogImageDescriptor(url: string, alt?: string | null): Promise<{
  url: string;
  alt?: string;
  secureUrl?: string;
  type?: string;
  width?: number;
  height?: number;
}> {
  // A generated card (see app/og) is always the same shape and format, and no
  // media row records it — so the size was left off precisely for the images
  // this CMS draws itself. Stated here from what the route draws.
  if (/^\/og\?/.test(url)) {
    return { url, ...(alt ? { alt } : {}), type: "image/png", width: 1200, height: 630 };
  }
  const share = shareImageUrl(url);
  const converted = share !== url;
  const extras = ogImageExtras(share);
  let dim = await lookupImageSize(url);
  // The JPEG copy is at most 1200 px wide; the tags must say what is served.
  if (converted && dim && dim.width > 1200) dim = { ...dim, width: 1200, height: Math.round((dim.height * 1200) / dim.width) };
  return {
    url: share,
    ...(alt ? { alt } : {}),
    ...(extras["og:image:secure_url"] ? { secureUrl: extras["og:image:secure_url"] } : {}),
    ...(converted ? { type: "image/jpeg" } : extras["og:image:type"] ? { type: extras["og:image:type"] } : {}),
    ...(dim ? { width: dim.width, height: dim.height } : {}),
  };
}

/**
 * Pixel dimensions for many image URLs at once.
 *
 * The single-URL version is fine for one `og:image`; a page body can hold
 * dozens of images, and one query each would be a query per image on every
 * render. One `IN (…)` answers the whole page.
 *
 * URLs the media library does not know — pasted from elsewhere, or uploaded
 * before dimensions were recorded — are simply absent from the map, and callers
 * emit no attributes for them rather than guessing.
 */
export async function lookupImageSizes(urls: string[]): Promise<Map<string, ImageInfo>> {
  const out = new Map<string, ImageInfo>();
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return out;

  try {
    const { db } = await import("@/lib/db");
    const { media } = await import("@/lib/db/schema");
    const { inArray } = await import("drizzle-orm");
    const rows = await db
      .select({ url: media.url, width: media.width, height: media.height, blur: media.blur })
      .from(media)
      .where(inArray(media.url, unique));
    for (const r of rows) {
      if (r.width && r.height) out.set(r.url, { width: r.width, height: r.height, ...(r.blur ? { blur: r.blur } : {}) });
    }
  } catch {
    // An unreachable media table must not stop a page rendering its images.
  }
  return out;
}

/**
 * A short version stamp for generated share images: changes when the theme
 * settings they are drawn from change, so a cached image is never stale.
 */
export function ogImageVersion(settings: Record<string, string>): string {
  // The leading tag is the renderer's own version: bump it when /og draws
  // differently, or year-cached copies of the old drawing live on. (2: WebP
  // logos converted, text colour follows the background.)
  const src = ["og2", settings.site_name, settings.site_logo, settings.color_primary].join("|");
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

/**
 * The share image URL for a page that has none of its own.
 *
 * Relative, so `metadataBase` makes it absolute the same way it does for an
 * uploaded image. The title and a theme version are in the URL, which is
 * what lets the route cache each image for a year.
 */
export function autoOgImage(title: string, settings: Record<string, string>, kicker?: string): string {
  const t = title.trim().slice(0, 140);
  const k = (kicker ?? "").trim().slice(0, 60);
  const q = new URLSearchParams({ title: t, v: ogImageVersion(settings) });
  if (k) q.set("kicker", k);
  // Signed, so /og only ever draws text this site asked for (lib/ogSign).
  const sig = ogSignature(t, k);
  if (sig) q.set("s", sig);
  return `/og?${q.toString()}`;
}
