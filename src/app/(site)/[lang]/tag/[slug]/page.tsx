import { db } from "@/lib/db";
import { posts, postTags, tags } from "@/lib/db/schema";
import { and, count, eq } from "drizzle-orm";
import { isLive } from "@/lib/publishState";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BlogArchive from "@/components/frontend/BlogArchive";
import { getSiteSettings } from "@/lib/settings";
import { readSeo, renderTemplate } from "@/lib/seo";
import { tagPath, decodeSegment } from "@/lib/permalinks";
import { autoOgImage, deriveDescription, ogImageDescriptor, pageMetadata, robotsDirectives, twitterImage } from "@/lib/seoMeta";
import { termAlternateLanguages } from "@/lib/translations";

import { PRERENDER_TERMS } from "@/lib/prerender";

export const revalidate = 3600;

export async function generateStaticParams({ params }: { params: { lang: string } }) {
  try {
    const all = await db.query.tags.findMany({
      where: eq(tags.language, params.lang),
      columns: { slug: true },
      // Bounded, like posts: the rest render on first visit (lib/prerender).
      limit: PRERENDER_TERMS,
    });
    return all.map((t) => ({ slug: t.slug }));
  } catch {
    return []; // Tags not migrated yet — render on demand.
  }
}

/** Same reasoning as `findCategory`: tag slugs are unique per language. */
async function findTag(slug: string, language: string) {
  try {
    return await db.query.tags.findFirst({
      where: and(eq(tags.slug, slug), eq(tags.language, language)),
    });
  } catch {
    return undefined;
  }
}

/**
 * Whether the tag has any live post in this language.
 *
 * A tag with none renders an archive of nothing. The sitemap already left
 * those out; the page itself still said "index me", so a crawler that found
 * the URL any other way indexed an empty listing — thin content, site-wide.
 */
async function tagHasPosts(tagId: number, language: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ n: count() })
      .from(postTags)
      .innerJoin(posts, eq(posts.id, postTags.postId))
      .where(and(eq(postTags.tagId, tagId), eq(posts.language, language), isLive(posts)));
    return Number(row?.n ?? 0) > 0;
  } catch {
    return true; // Unknown — keep the configured directive.
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  const decodedSlug = decodeSegment(slug);
  const [tag, settings] = await Promise.all([findTag(decodedSlug, lang), getSiteSettings()]);
  if (!tag) return {};
  // The same template pair every other listing has; tags had a bare name.
  const seo = readSeo(settings);
  const vars = { term: tag.name, term_description: tag.description || "", sitename: settings.site_name || "", sitedesc: settings.site_description || "" };
  const title = renderTemplate(seo.seo_tag_title, vars, seo.seo_separator) || tag.name;
  // The same chain a category has — template, the tag's own text, then the
  // site's. The English "Posts tagged …" fallback is gone: it was the one
  // untranslated sentence on an otherwise Arabic (or French) site.
  const description = deriveDescription(
    renderTemplate(seo.seo_tag_description, vars, seo.seo_separator),
    tag.description,
    settings.site_description
  );
  // The tag archive was the thinnest metadata on the site: a title and a
  // description, no canonical and no directives — and then, still, no Open
  // Graph and no Twitter card at all, so a tag shared anywhere came back as a
  // bare link while the category beside it had a picture and a summary. It is
  // a listing like that category and is built by the same helper.
  const shareImage = autoOgImage(tag.name, settings, "Tag");
  const meta = pageMetadata({
    settings,
    language: lang,
    path: tagPath(tag.slug, lang, settings),
    title,
    description,
    // Linked tags in other languages — the same `hreflang` a document gets.
    languages: await termAlternateLanguages("tag", tag, settings),
  });
  return {
    ...meta,
    title: { absolute: title },
    openGraph: { ...meta.openGraph, images: [await ogImageDescriptor(shareImage, title)] },
    twitter: { ...meta.twitter, card: "summary_large_image", images: [twitterImage(shareImage, title)] },
    robots: robotsDirectives(seo.seo_tag_noindex !== "true" && (await tagHasPosts(tag.id, lang)), true),
  };
}

// Tags are shared across languages, but the archive is not: `/tag/x` and
// `/fr/tag/x` list the same tag's posts in different languages.
export default async function TagPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  const decodedSlug = decodeSegment(slug);
  const [tag, settings] = await Promise.all([findTag(decodedSlug, lang), getSiteSettings()]);
  if (!tag) notFound();

  return (
    <BlogArchive
      page={1}
      language={lang}
      tagId={tag.id}
      title={tag.name}
      description={tag.description}
      // The tag's own slug, not the URL segment: that one arrives
      // percent-encoded, and `segment()` stripped the `%` signs out of it.
      base={tagPath(tag.slug, lang, settings)}
    />
  );
}
