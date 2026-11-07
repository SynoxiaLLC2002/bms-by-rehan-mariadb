import { and, count, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { posts, users } from "@/lib/db/schema";
import BlogArchive from "@/components/frontend/BlogArchive";
import AuthorProfile, { authorSchema } from "@/components/frontend/AuthorProfile";
import { getSiteSettings } from "@/lib/settings";
import { authorPath, decodeSegment } from "@/lib/permalinks";
import { ogImageDescriptor, ogLocale, termRobots, twitterImage } from "@/lib/seoMeta";
import { isLive } from "@/lib/publishState";
import { jsonLd, readSeo, renderTemplate, twitterSite } from "@/lib/seo";
import { siteUrl } from "@/lib/siteUrl";
import BlockRenderer from "@/components/frontend/BlockRenderer";
import type { Block } from "@blocknote/core";

export const revalidate = 3600;

/**
 * Only authors who have actually published in this language.
 *
 * An author page listing nothing is a thin page, and prerendering one for every
 * account would publish the staff list as a side effect of having logins.
 */
export async function generateStaticParams({ params }: { params: { lang: string } }) {
  try {
    const rows = await db
      .selectDistinct({ slug: users.slug })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.authorId))
      .where(and(isLive(posts), eq(posts.language, params.lang), eq(users.publicProfile, true)));
    return rows.filter((r) => r.slug).map((r) => ({ slug: r.slug as string }));
  } catch {
    return [];
  }
}

/**
 * The author behind a slug, or undefined.
 *
 * `publicProfile` is part of the lookup rather than a check afterwards: an
 * account with its page turned off should be indistinguishable from one that
 * does not exist, not a 403 that confirms the account is real.
 */
async function findAuthor(slug: string) {
  try {
    return await db.query.users.findFirst({
      where: and(eq(users.slug, slug), eq(users.publicProfile, true)),
      columns: {
        id: true, name: true, slug: true, image: true, bio: true, website: true,
        twitter: true, linkedin: true, facebook: true, instagram: true,
        github: true, youtube: true, content: true, direction: true, language: true,
        seoTitle: true, seoDescription: true, canonicalUrl: true, ogImage: true,
        noIndex: true,
        // Layout, the same set a page carries.
        pageLayout: true, contentStyle: true, verticalSpacing: true,
        cssClasses: true, customCss: true, scriptHead: true, scriptBodyEnd: true,
        transparentHeader: true, disableHeader: true, disableFooter: true,
      },
    });
  } catch {
    return undefined;
  }
}

/** How many posts this author has live in this language. */
async function postCount(authorId: string, language: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(posts)
    .where(and(isLive(posts), eq(posts.language, language), eq(posts.authorId, authorId)));
  return row?.n ?? 0;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  const decodedSlug = decodeSegment(slug);
  const [author, settings] = await Promise.all([findAuthor(decodedSlug), getSiteSettings()]);
  if (!author) return {};

  const name = author.name || author.slug || "Author";
  const seo = readSeo(settings);
  const vars = { name, sitename: settings.site_name || "", sitedesc: settings.site_description || "" };
  const title = author.seoTitle || renderTemplate(seo.seo_author_title, vars, seo.seo_separator) || name;
  const description =
    author.seoDescription ||
    renderTemplate(seo.seo_author_description, vars, seo.seo_separator) ||
    author.bio ||
    `Posts written by ${name}.`;
  const image = author.ogImage || author.image || seo.seo_og_default_image || undefined;

  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: author.canonicalUrl || authorPath(author.slug!, lang, settings),
    },
    robots: termRobots(author, true),
    openGraph: {
      title,
      description,
      url: authorPath(author.slug!, lang, settings),
      siteName: settings.site_name || undefined,
      // `profile`, not `website`: this page is about a person, and the type is
      // what tells a crawler which vocabulary the rest of the tags belong to.
      type: "profile",
      locale: ogLocale(lang),
      // Through the descriptor, like every other share image on the site: an
      // avatar uploaded as WebP is served as the JPEG copy, with its type,
      // dimensions and alt text. Written as a bare URL it was the one profile
      // card that could come back blank.
      ...(image ? { images: [await ogImageDescriptor(image, name)] } : {}),
    },
    twitter: {
      site: twitterSite(settings),
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [twitterImage(image, name)] } : {}),
    },
  };
}

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  const decodedSlug = decodeSegment(slug);
  const [author, settings] = await Promise.all([findAuthor(decodedSlug), getSiteSettings()]);
  if (!author) notFound();

  // An author with nothing published in *this* language has no archive here,
  // even though they may have one under another prefix. Rendering an empty
  // listing would be a thin page at an indexable URL.
  if ((await postCount(author.id, lang)) === 0) notFound();

  const base = siteUrl(settings);
  const customContent = Array.isArray(author.content) && author.content.length > 0 ? author.content as Block[] : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(authorSchema(author, `${base}${authorPath(author.slug!, lang, settings)}`)),
        }}
      />
      <BlogArchive
        page={1}
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
        // `postLayout` is what `ContentShell` reads on every document type —
        // the name is historical, the meaning is "which width". Mapped here
        // rather than renamed on the table, because passing `author` straight
        // through silently matched nothing and the width setting did nothing.
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
    </>
  );
}
