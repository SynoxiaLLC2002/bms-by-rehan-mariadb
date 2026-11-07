import { db } from "@/lib/db";
import { postTags, posts, tags } from "@/lib/db/schema";
import { and, count, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BlogArchive, { postsPerPage } from "@/components/frontend/BlogArchive";
import { getSiteSettings } from "@/lib/settings";
import { readSeo, renderTemplate } from "@/lib/seo";
import { tagPath, decodeSegment } from "@/lib/permalinks";
import { deriveDescription, pageMetadata, robotsDirectives } from "@/lib/seoMeta";
import { isLive } from "@/lib/publishState";
import { archiveText } from "@/lib/archiveText";

// Page 2 onwards of a tag archive. BlogArchive has always linked to
// `/tag/<slug>/page/N` once a tag outgrew one page, and nothing answered
// there — every such link was a 404. The category archive has had this
// route all along; this is its twin.
export const revalidate = 3600;

const find = async (slug: string, language: string) => {
  try {
    return await db.query.tags.findFirst({ where: and(eq(tags.slug, slug), eq(tags.language, language)) });
  } catch {
    return undefined;
  }
};

/** How many pages this tag's live posts in this language fill. */
async function tagPageCount(tagId: number, language: string): Promise<number> {
  const perPage = await postsPerPage();
  const [row] = await db
    .select({ n: count() })
    .from(postTags)
    .innerJoin(posts, eq(posts.id, postTags.postId))
    .where(and(eq(postTags.tagId, tagId), isLive(posts), eq(posts.language, language)));
  return Math.max(1, Math.ceil((row?.n ?? 0) / perPage));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string; slug: string; page: string }> }): Promise<Metadata> {
  const { lang, slug, page } = await params;
  const n = parseInt(page, 10);
  const [tag, settings] = await Promise.all([find(decodeSegment(slug), lang), getSiteSettings()]);
  if (!tag || Number.isNaN(n)) return {};
  const seo = readSeo(settings);
  const vars = { term: tag.name, term_description: tag.description || "", sitename: settings.site_name || "", sitedesc: settings.site_description || "" };
  // Page 2 onwards says so (" · page 2 of 5", in the archive's language): with the
  // first page's title and description repeated, every page was a duplicate.
  const suffix = archiveText(lang).pageOf(n, await tagPageCount(tag.id, lang));
  const title = `${renderTemplate(seo.seo_tag_title, { ...vars, term: `${tag.name}${suffix}` }, seo.seo_separator) || `${tag.name}${suffix}`}`;
  const description = deriveDescription(renderTemplate(seo.seo_tag_description, vars, seo.seo_separator), tag.description, settings.site_description)?.concat(suffix);
  const meta = pageMetadata({ settings, language: lang, path: `${tagPath(tag.slug, lang, settings)}/page/${n}`, title, description });
  return {
    ...meta,
    title: { absolute: title },
    robots: robotsDirectives(seo.seo_tag_noindex !== "true" && seo.seo_paginated_noindex !== "true", true),
  };
}

export default async function TagPagedPage({ params }: { params: Promise<{ lang: string; slug: string; page: string }> }) {
  const { lang, slug, page } = await params;
  const n = parseInt(page, 10);
  const [tag, settings] = await Promise.all([find(decodeSegment(slug), lang), getSiteSettings()]);
  if (!tag) notFound();
  if (!/^[1-9]\d*$/.test(page) || n < 2 || n > (await tagPageCount(tag.id, lang))) notFound();
  return (
    <BlogArchive
      page={n}
      language={lang}
      tagId={tag.id}
      title={tag.name}
      description={tag.description}
      base={tagPath(tag.slug, lang, settings)}
    />
  );
}
