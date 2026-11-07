import { and, count, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { posts, users } from "@/lib/db/schema";
import BlogArchive, { postsPerPage } from "@/components/frontend/BlogArchive";
import AuthorProfile from "@/components/frontend/AuthorProfile";
import { getSiteSettings } from "@/lib/settings";
import { authorPath, decodeSegment } from "@/lib/permalinks";
import { pageMetadata, robotsDirectives } from "@/lib/seoMeta";
import { isLive } from "@/lib/publishState";
import { readSeo, renderTemplate } from "@/lib/seo";
import BlockRenderer from "@/components/frontend/BlockRenderer";
import type { Block } from "@blocknote/core";

// Page 2 onwards of an author archive.
//
// `BlogArchive` has always linked to `/author/<slug>/page/N` once an author
// outgrew one page, and nothing answered there — every one of those links was
// a 404. Tags had exactly the same gap and exactly this fix; this is its twin,
// and the category archive has had the route all along.
export const revalidate = 3600;

async function findAuthor(slug: string) {
  try {
    return await db.query.users.findFirst({
      where: and(eq(users.slug, slug), eq(users.publicProfile, true)),
    });
  } catch {
    return undefined;
  }
}

/** How many pages this author's live posts in this language fill. */
async function authorPageCount(authorId: string, language: string): Promise<number> {
  const perPage = await postsPerPage();
  const [row] = await db
    .select({ n: count() })
    .from(posts)
    .where(and(isLive(posts), eq(posts.language, language), eq(posts.authorId, authorId)));
  return Math.max(1, Math.ceil((row?.n ?? 0) / perPage));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string; page: string }>;
}): Promise<Metadata> {
  const { lang, slug, page } = await params;
  const n = parseInt(page, 10);
  const [author, settings] = await Promise.all([findAuthor(decodeSegment(slug)), getSiteSettings()]);
  if (!author || Number.isNaN(n)) return {};

  const name = author.name || author.slug || "Author";
  const seo = readSeo(settings);
  const vars = { name, sitename: settings.site_name || "", sitedesc: settings.site_description || "" };
  const title = author.seoTitle || renderTemplate(seo.seo_author_title, vars, seo.seo_separator) || name;
  const description =
    author.seoDescription ||
    renderTemplate(seo.seo_author_description, vars, seo.seo_separator) ||
    author.bio ||
    `Posts written by ${name}.`;

  const meta = pageMetadata({
    settings,
    language: lang,
    path: `${authorPath(author.slug!, lang, settings)}/page/${n}`,
    title,
    description,
  });
  return {
    ...meta,
    title: { absolute: title },
    // Page 2 onwards is noindex by the same rule the other archives follow:
    // it is the same content re-sliced, and the first page is the canonical
    // entry point.
    robots: robotsDirectives(seo.seo_paginated_noindex !== "true", true),
  };
}

export default async function AuthorPagedPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string; page: string }>;
}) {
  const { lang, slug, page } = await params;
  const n = parseInt(page, 10);
  const [author, settings] = await Promise.all([findAuthor(decodeSegment(slug)), getSiteSettings()]);
  if (!author) notFound();
  // Same guard as the tag route: a non-numeric, first-page or out-of-range
  // number must 404 rather than render an empty archive at an indexable URL.
  if (!/^[1-9]\d*$/.test(page) || n < 2 || n > (await authorPageCount(author.id, lang))) notFound();

  const customContent = Array.isArray(author.content) && author.content.length > 0 ? (author.content as Block[]) : null;

  return (
    <BlogArchive
      page={n}
      language={lang}
      authorId={author.id}
      title={author.name || author.slug!}
      description={author.bio}
      hideTitle={!!customContent}
      direction={author.direction}
      langOverride={author.language}
      intro={
        customContent
          ? <BlockRenderer blocks={customContent} language={lang} author={author} />
          : <AuthorProfile author={author} slot="avatar" />
      }
      outro={customContent ? undefined : <AuthorProfile author={author} slot="links" />}
      design={{
        postLayout: author.pageLayout,
        contentStyle: author.contentStyle,
        verticalSpacing: author.verticalSpacing,
        cssClasses: author.cssClasses,
        transparentHeader: author.transparentHeader,
        disableHeader: author.disableHeader,
        disableFooter: author.disableFooter,
      }}
      customCss={author.customCss}
      scriptHead={author.scriptHead}
      scriptBodyEnd={author.scriptBodyEnd}
      base={authorPath(author.slug!, lang, settings)}
    />
  );
}
