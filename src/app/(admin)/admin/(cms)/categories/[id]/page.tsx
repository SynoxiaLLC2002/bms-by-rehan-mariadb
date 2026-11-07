import { and, eq, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import Header from "@/components/admin/Header";
import CategoryEditor from "@/components/admin/CategoryEditor";
import { getSiteSettings, withoutSecrets } from "@/lib/settings";
import { categoryPath } from "@/lib/permalinks";
import { numericId } from "@/lib/routeParams";

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = numericId(id);
  if (numId === null) notFound();

  const [category, settings] = await Promise.all([
    db.query.categories.findFirst({ where: eq(categories.id, numId) }),
    getSiteSettings(),
  ]);
  if (!category) notFound();

  // Parent candidates: other terms in the same language.
  //
  // Cross-language parents are excluded here as well as being nonsense — a
  // French category under an English one would produce a breadcrumb that
  // changes language halfway up. The cycle check lives in the API, because
  // this list cannot know what the user will pick.
  const parents = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.language, category.language), ne(categories.id, category.id)));

  return (
    <>
      <Header title={category.name} />
      <CategoryEditor
        category={category}
        parents={parents}
        archiveUrl={categoryPath(category.slug, category.language, settings)}
        settings={withoutSecrets(settings)}
      />
    </>
  );
}
