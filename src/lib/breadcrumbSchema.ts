// `BreadcrumbList` structured data.
//
// The trail is rendered on every post and page and has been since the title
// block was built — but only for a human. Google reads the visible crumbs as
// text and no more, which is why a result shows a bare URL where it could show
// `example.com › Blog › Guides`. RankMath emits this; this is the missing half.
//
// The one rule that matters: **the schema must describe the trail that is
// actually on the page.** Structured data claiming a hierarchy the visitor
// cannot see is exactly what the spam policies are written about, so this is
// built from the same inputs `PostTitleBlock` renders from, in the same order.

import { absoluteUrlFor, categoryPath, rootPath } from "@/lib/permalinks";
import { archiveText } from "@/lib/archiveText";
import { parsePageElements, parsePostElements } from "@/lib/appearanceSettings";
import type { SiteSettings } from "@/lib/settings";
import { schemaUrl } from "./seoMeta";

/**
 * Whether this document actually shows a breadcrumb trail.
 *
 * Two things can hide it, and both are the reason this check exists rather than
 * emitting the markup unconditionally:
 *
 *  - the document's title is set to hidden, which drops the whole title block
 *    the trail lives in;
 *  - the `breadcrumb` element is switched off in the Customizer's element list,
 *    which hides it with `display:none`.
 *
 * Caught by rendering the markup and then looking for the trail: a post with
 * its title hidden emitted a four-level `BreadcrumbList` for a page that showed
 * no crumbs at all. That is the mismatch the structured-data spam policies are
 * written about, and it is worth failing closed on.
 */
export function breadcrumbIsVisible(
  kind: "post" | "page",
  settings: SiteSettings,
  hideTitle: boolean
): boolean {
  if (hideTitle) return false;
  const elements =
    kind === "post"
      ? parsePostElements(settings.post_elements ?? "")
      : parsePageElements(settings.page_elements ?? "");
  return elements.find((e) => e.id === "breadcrumb")?.visible !== false;
}

export interface Crumb {
  name: string;
  /** Absolute. A breadcrumb URL is read without a page to resolve against. */
  url: string;
}

/**
 * The trail for a post: Home › Category › Post — the trail WordPress and
 * Rank Math render. There is no listing crumb: a site has no post listing
 * unless a Posts page is chosen, and the category archive always exists.
 *
 * The category link appears only when the post has one, which is exactly when
 * the rendered trail shows it.
 */
export function postCrumbs(
  post: { title: string; language: string },
  category: { name: string; slug: string } | null | undefined,
  path: string,
  settings: SiteSettings,
  base: string
): Crumb[] {
  const lang = post.language;
  const crumbs: Crumb[] = [
    // The site's own word for it: "Home" in the trail of an Arabic post was
    // the one English word in a rich result otherwise written in Arabic.
    { name: archiveText(lang).home, url: absoluteUrlFor(base, rootPath(lang, settings)) },
  ];
  if (category) {
    crumbs.push({
      name: category.name,
      url: `${base}${categoryPath(category.slug, lang, settings)}`,
    });
  }
  crumbs.push({ name: post.title, url: `${base}${path}` });
  return crumbs;
}

/** The trail for a page: Home › Page. A page sits outside the blog. */
export function pageCrumbs(
  page: { title: string; language: string },
  path: string,
  settings: SiteSettings,
  base: string
): Crumb[] {
  return [
    { name: archiveText(page.language).home, url: absoluteUrlFor(base, rootPath(page.language, settings)) },
    { name: page.title, url: `${base}${path}` },
  ];
}

/** The `@id` a page's BreadcrumbList carries, so its WebPage node can point at it. */
export const breadcrumbId = (pageUrl: string) => `${schemaUrl(pageUrl)}#breadcrumb`;

/**
 * The JSON-LD node, or null when there is nothing worth saying.
 *
 * A single-item list describes no hierarchy at all, so it is omitted rather
 * than emitted as noise — and an unnamed crumb is dropped instead of publishing
 * an empty `name`, which is what an untitled page would otherwise produce.
 * A WebPage's `breadcrumb` must point at this only when it is non-null.
 */
export function breadcrumbSchema(crumbs: Crumb[], pageUrl?: string): Record<string, unknown> | null {
  const clean = crumbs.filter((c) => c.name.trim() && c.url);
  if (clean.length < 2) return null;

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    // Named, so the WebPage's `breadcrumb` is a reference into this graph
    // rather than a second, unconnected list.
    ...(pageUrl ? { "@id": breadcrumbId(pageUrl) } : {}),
    itemListElement: clean.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: schemaUrl(c.url),
    })),
  };
}
