// SEO settings and the title-template engine.
//
// Titles are built from templates with %variables%, the way Rank Math and Yoast
// do it, so a site can change every post title at once instead of editing each
// one. A post's own SEO title always wins over the template.

import { LOCAL_DEFAULTS, type LocalSettings } from "@/lib/localSeo";
export interface SeoSettings extends LocalSettings {
  // Titles & Meta
  seo_separator: string;
  seo_home_title: string;
  seo_home_description: string;
  seo_post_title: string;
  seo_post_description: string;
  seo_page_title: string;
  seo_page_description: string;
  seo_category_title: string;
  seo_category_description: string;
  seo_search_title: string;
  seo_404_title: string;
  // Robots defaults
  seo_post_noindex: string;
  seo_page_noindex: string;
  seo_category_noindex: string;
  seo_tag_title: string;
  seo_tag_description: string;
  seo_tag_noindex: string;
  seo_author_title: string;
  seo_author_description: string;
  seo_paginated_noindex: string;
  seo_fb_page: string;
  seo_category_base_removed: string;
  seo_search_noindex: string;
  // Social / knowledge graph
  seo_kg_type: string;          // person | organization
  seo_kg_name: string;
  seo_kg_logo: string;
  seo_og_default_image: string;
  seo_twitter_card: string;     // summary | summary_large_image
  /** The site's X/Twitter handle, with or without @. Emitted as twitter:site. */
  seo_twitter_site: string;
  /** Profile URLs — `sameAs` in the Organization/Person schema, and the footer/header social widget. */
  social_facebook: string;
  social_twitter: string;
  social_instagram: string;
  social_linkedin: string;
  // Sitemap
  seo_sitemap_enabled: string;
  seo_sitemap_images: string;
  seo_sitemap_posts: string;
  seo_sitemap_pages: string;
  seo_sitemap_categories: string;
  seo_sitemap_tags: string;
  // Links in content
  /**
   * "true": links in post/page text that leave this site get `rel="nofollow"`
   * (Rank Math's "Nofollow external links"). The editor's link dialog has no
   * per-link rel control, so without a site-wide policy every outbound link
   * an author pastes — an app store, a forum, a mirror — passes full
   * PageRank. Buttons, Download Boxes and the Info Box keep their own
   * per-link setting.
   */
  seo_nofollow_external: string;
  /** Hosts (one per line, `example.com`) that stay followed when the policy above is on. */
  seo_nofollow_exclude: string;
  /** "true": external links in content also open in a new tab. Default on, as before. */
  seo_external_new_tab: string;
  // Redirects
  seo_auto_redirect: string;
  /** "true": ping IndexNow (Bing, Yandex…) when a page publishes or changes. */
  seo_indexnow_enabled: string;
  // robots.txt
  seo_robots_txt: string;
  // Webmaster tools. Each is the bare token from the verification meta tag,
  // not the whole tag: `<meta name="google-site-verification" content="X">` -> X.
  seo_verify_google: string;
  seo_verify_bing: string;
  seo_verify_yandex: string;
  seo_verify_pinterest: string;
}

// `/search` is `noindex` and rendered on every request, so a crawler
// following the search form's URLs burns crawl budget on pages it is told
// to forget; the `/*/search` lines are the same page under a language prefix.
//
// Every rule is spelled exactly. robots.txt rules are *prefixes*: the old
// `Disallow: /search` also blocked `/search-engine-tips`, `/admin` blocked
// `/admin-guide`, and `/*/search` blocked `/fr/search-tools` and
// `/2026/09/search-tips` — real posts, kept out of Google with no warning.
// `$` ends a rule; `?` and `/` cover the query and anything below it.
export const ROBOTS_SEARCH_RULES = [
  "Disallow: /search$",
  "Disallow: /search?",
  "Disallow: /search/",
  "Disallow: /*/search$",
  "Disallow: /*/search?",
  "Disallow: /*/search/",
];

export const DEFAULT_ROBOTS_TXT = `User-agent: *
Allow: /
Disallow: /admin$
Disallow: /admin/
Disallow: /api/
${ROBOTS_SEARCH_RULES.join("\n")}`;

/** The prefix rules older versions wrote, and their exact replacements. */
const LEGACY_ROBOTS_RULES: Record<string, string[]> = {
  "/admin": ["Disallow: /admin$", "Disallow: /admin/"],
  "/api": ["Disallow: /api/"],
  "/search": ROBOTS_SEARCH_RULES.slice(0, 3),
  "/*/search": ROBOTS_SEARCH_RULES.slice(3),
};

/**
 * The robots.txt to serve, given what is saved.
 *
 * Two repairs, both invisible to someone who wrote their own rules:
 *   • The four prefix lines this CMS used to ship (and which most sites still
 *     have saved, since the default was written into the setting) become the
 *     exact forms above. Nothing else a person wrote is changed.
 *   • The search rules every site needs are added *inside* the
 *     `User-agent: *` group. Appending them at the end attached them to
 *     whichever group came last — `User-agent: GPTBot`, say — and every other
 *     crawler never saw them. With no `*` group, one is added.
 */
export function servedRobotsTxt(saved: string): string {
  const lines = saved.replace(/\r\n?/g, "\n").split("\n").flatMap((line) => {
    const m = line.match(/^\s*disallow:\s*(\S+)\s*$/i);
    return m && LEGACY_ROBOTS_RULES[m[1]] ? LEGACY_ROBOTS_RULES[m[1]] : [line];
  });
  const has = (rule: string) => lines.some((l) => l.trim().toLowerCase() === rule.toLowerCase());
  const missing = ROBOTS_SEARCH_RULES.filter((r) => !has(r));
  if (missing.length === 0) return lines.join("\n");

  const star = lines.findIndex((l) => /^\s*user-agent:\s*\*\s*$/i.test(l));
  if (star === -1) return [...lines, "", "User-agent: *", ...missing].join("\n");
  // After the run of User-agent lines the group starts with: a rule placed
  // between two of them would end the group early.
  let at = star + 1;
  while (at < lines.length && /^\s*user-agent:/i.test(lines[at])) at++;
  lines.splice(at, 0, ...missing);
  return lines.join("\n");
}

export const seoDefaults: SeoSettings = {
  ...LOCAL_DEFAULTS,
  seo_separator: "-",
  seo_home_title: "%sitename% %sep% %sitedesc%",
  seo_home_description: "%sitedesc%",
  seo_post_title: "%title% %sep% %sitename%",
  seo_post_description: "%excerpt%",
  seo_page_title: "%title% %sep% %sitename%",
  seo_page_description: "%excerpt%",
  seo_category_title: "%term% %sep% %sitename%",
  seo_category_description: "%term_description%",
  seo_search_title: "Search results for %search% %sep% %sitename%",
  seo_404_title: "Page not found %sep% %sitename%",
  seo_post_noindex: "false",
  seo_page_noindex: "false",
  seo_category_noindex: "false",
  seo_tag_title: "%term% %sep% %sitename%",
  seo_tag_description: "%term_description%",
  seo_tag_noindex: "false",
  seo_author_title: "%name% %sep% %sitename%",
  seo_author_description: "",
  seo_paginated_noindex: "false",
  seo_fb_page: "",
  seo_category_base_removed: "false",
  seo_search_noindex: "true",
  seo_kg_type: "organization",
  seo_kg_name: "",
  seo_kg_logo: "",
  seo_og_default_image: "",
  seo_twitter_card: "summary_large_image",
  seo_twitter_site: "",
  social_facebook: "",
  social_twitter: "",
  social_instagram: "",
  social_linkedin: "",
  seo_sitemap_enabled: "true",
  seo_sitemap_images: "true",
  seo_sitemap_posts: "true",
  seo_sitemap_pages: "true",
  seo_sitemap_categories: "true",
  seo_sitemap_tags: "true",
  seo_nofollow_external: "false",
  seo_nofollow_exclude: "",
  seo_external_new_tab: "true",
  seo_auto_redirect: "true",
  seo_indexnow_enabled: "true",
  seo_robots_txt: DEFAULT_ROBOTS_TXT,
  seo_verify_google: "",
  seo_verify_bing: "",
  seo_verify_yandex: "",
  seo_verify_pinterest: "",
};

/** Variables a template may use, with a short description for the admin UI. */
export const SEO_VARIABLES: { token: string; label: string; scope: string }[] = [
  { token: "%title%",            label: "Post or page title",       scope: "post, page" },
  { token: "%sitename%",         label: "Site name",                scope: "everywhere" },
  { token: "%sitedesc%",         label: "Site tagline",             scope: "everywhere" },
  { token: "%sep%",              label: "The separator below",      scope: "everywhere" },
  { token: "%excerpt%",          label: "Excerpt, else first text", scope: "post, page" },
  { token: "%category%",         label: "Primary category name",    scope: "post" },
  { token: "%term%",             label: "Category / archive name",  scope: "category" },
  { token: "%term_description%", label: "Category description",     scope: "category" },
  { token: "%search%",           label: "The search query",         scope: "search" },
  { token: "%date%",             label: "Published date",           scope: "post" },
  { token: "%currentyear%",      label: "The current year",         scope: "everywhere" },
];

export type SeoVars = Partial<{
  title: string;
  sitename: string;
  sitedesc: string;
  excerpt: string;
  category: string;
  term: string;
  term_description: string;
  search: string;
  date: string;
  /** The author's name, for the author-archive templates. */
  name: string;
}>;

/**
 * Fills %variables% in a template.
 *
 * Unknown tokens are stripped rather than left visible, and the result is
 * collapsed so a missing value doesn't leave a stray separator like "Title - ".
 */
export function renderTemplate(template: string, vars: SeoVars, separator = "-"): string {
  if (!template) return "";

  const table: Record<string, string> = {
    "%title%": vars.title ?? "",
    "%sitename%": vars.sitename ?? "",
    "%sitedesc%": vars.sitedesc ?? "",
    "%sep%": separator,
    "%excerpt%": vars.excerpt ?? "",
    "%category%": vars.category ?? "",
    "%term%": vars.term ?? "",
    "%term_description%": vars.term_description ?? "",
    "%search%": vars.search ?? "",
    "%date%": vars.date ?? "",
    // The author pages pass `name` and the SEO screen documents %name%, but it was
    // never in this table, so "%name% %sep% %sitename%" rendered as "- Site".
    "%name%": vars.name ?? "",
    "%currentyear%": String(new Date().getFullYear()),
  };

  let out = template.replace(/%[a-z_]+%/gi, (m) => table[m.toLowerCase()] ?? "");

  // Tidy up what empty values left behind: a dangling separator, doubled
  // separators, or runs of whitespace.
  const sep = separator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  out = out
    .replace(new RegExp(`(\\s*${sep}\\s*){2,}`, "g"), ` ${separator} `)
    .replace(new RegExp(`^\\s*${sep}\\s*`), "")
    .replace(new RegExp(`\\s*${sep}\\s*$`), "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return out;
}

/** Reads SEO settings out of the flat site_settings map. */
export function readSeo(settings: Record<string, string>): SeoSettings {
  const out = { ...seoDefaults };
  for (const key of Object.keys(seoDefaults) as (keyof SeoSettings)[]) {
    const v = settings[key];
    if (v !== undefined && v !== "") out[key] = v;
  }
  return out;
}

/**
 * JSON-LD as a string that is safe to place inside a `<script>` element.
 *
 * An HTML parser ends a `<script>` at the first `</script` in its text, no
 * matter what JavaScript or JSON context it appears in — so a post titled
 * `</script><script>…</script>` closes the schema block early and everything
 * after it runs as script. Escaping `<` sidesteps that entirely and still
 * parses back to the original string, because `\u003c` is just how JSON
 * spells `<`.
 *
 * Lived in `accordion.ts` and was used only by the FAQ schema, while the
 * page, post and home-page schema blocks each called `JSON.stringify`
 * directly. Here so there is one obvious thing to reach for.
 */
export function jsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** "@handle" or undefined — for `twitter:site`, which wants the @ form. */
/**
 * A handle as `twitter:creator` wants it: "@name". Accepts "@name", "name" or
 * a profile URL, since the profile field has taken all three.
 */
export function twitterHandle(raw: string | null | undefined): string | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  const fromUrl = v.match(/(?:twitter|x)\.com\/@?([A-Za-z0-9_]{1,15})/i);
  const name = fromUrl ? fromUrl[1] : v.replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(name) ? `@${name}` : undefined;
}

export function twitterSite(settings: Record<string, string>): string | undefined {
  const raw = (settings.seo_twitter_site ?? "").trim().replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, "");
  const handle = raw.replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "");
  return handle ? `@${handle}` : undefined;
}
