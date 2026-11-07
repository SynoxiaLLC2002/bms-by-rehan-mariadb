import { db } from "@/lib/db";
import { getSiteSettings } from "@/lib/settings";
import { categories } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import CategoryArchive, { categoryArchiveMetadata } from "@/components/frontend/CategoryArchive";
import { archivePageCount, archivePageCounts } from "@/components/frontend/BlogArchive";
import { categoryBaseRemoved, categoryPath, decodeSegment } from "@/lib/permalinks";

export const revalidate = 3600;

export async function generateStaticParams({ params }: { params: { lang: string; slug: string } }) {
  try {
    const cat = await db.query.categories.findFirst({
      where: and(eq(categories.slug, params.slug), eq(categories.language, params.lang)),
      columns: { id: true },
    });
    if (!cat) return [];
    const counts = await archivePageCounts(params.lang);
    const total = counts.get(cat.id) ?? 1;
    return Array.from({ length: Math.max(0, total - 1) }, (_, i) => ({ page: String(i + 2) }));
  } catch {
    return [];
  }
}

const find = (slug: string, lang: string) =>
  db.query.categories.findFirst({ where: and(eq(categories.slug, slug), eq(categories.language, lang)) });

export async function generateMetadata({ params }: { params: Promise<{ lang: string; slug: string; page: string }> }): Promise<Metadata> {
  const { lang, slug, page } = await params;
  const decodedSlug = decodeSegment(slug);
  const [category, settings] = await Promise.all([find(decodedSlug, lang), getSiteSettings()]);
  if (!category || categoryBaseRemoved(settings)) return {};
  return categoryArchiveMetadata(category, lang, settings, parseInt(page, 10));
}

export default async function CategoryPagedPage({ params }: { params: Promise<{ lang: string; slug: string; page: string }> }) {
  const { lang, slug, page } = await params;
  const decodedSlug = decodeSegment(slug);
  const n = parseInt(page, 10);
  const [category, settings] = await Promise.all([find(decodedSlug, lang), getSiteSettings()]);
  if (!category) notFound();
  if (categoryBaseRemoved(settings)) permanentRedirect(`${categoryPath(category.slug, lang, settings)}/page/${n}`);
  if (!/^[1-9]\d*$/.test(page) || n < 2 || n > (await archivePageCount(lang, category.id))) notFound();
  return <CategoryArchive category={category} lang={lang} settings={settings} page={n} />;
}
