import { PRERENDER_TERMS } from "@/lib/prerender";
import { db } from "@/lib/db";
import { getSiteSettings } from "@/lib/settings";
import { categories } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import CategoryArchive, { categoryArchiveMetadata } from "@/components/frontend/CategoryArchive";
import { categoryBaseRemoved, categoryPath, decodeSegment } from "@/lib/permalinks";

export const revalidate = 3600;

export async function generateStaticParams({ params }: { params: { lang: string } }) {
  try {
    // Terms belong to a language now, so a language prerenders its own.
    const all = await db.query.categories.findMany({
      where: eq(categories.language, params.lang),
      columns: { slug: true },
      // Bounded, like posts: the rest render on first visit (lib/prerender).
      limit: PRERENDER_TERMS,
    });
    return all.map((c) => ({ slug: c.slug }));
  } catch {
    return [];
  }
}

const find = (slug: string, lang: string) =>
  db.query.categories.findFirst({ where: and(eq(categories.slug, slug), eq(categories.language, lang)) });

export async function generateMetadata({ params }: { params: Promise<{ lang: string; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params;
  const decodedSlug = decodeSegment(slug);
  const [category, settings] = await Promise.all([find(decodedSlug, lang), getSiteSettings()]);
  if (!category || categoryBaseRemoved(settings)) return {};
  return categoryArchiveMetadata(category, lang, settings);
}

export default async function CategoryPage({ params }: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, slug } = await params;
  const decodedSlug = decodeSegment(slug);
  const [category, settings] = await Promise.all([find(decodedSlug, lang), getSiteSettings()]);
  if (!category) notFound();
  // With the base removed the archive lives at `/<slug>`; this address only
  // forwards there, so old links keep working.
  if (categoryBaseRemoved(settings)) permanentRedirect(categoryPath(category.slug, lang, settings));
  return <CategoryArchive category={category} lang={lang} settings={settings} />;
}
