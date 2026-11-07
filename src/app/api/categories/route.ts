import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { insertReturning } from "@/lib/db/write";
import { categories } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { categorySettingsFrom, parentIdFrom } from "@/lib/categoryFields";
import { revalidatePublicSite } from "@/lib/revalidateSite";
import { getSiteSettings } from "@/lib/settings";
import { defaultContentLanguage, isContentLanguage } from "@/lib/locale";
import { auth } from "@/lib/auth";
import { isAuthor, FORBIDDEN } from "@/lib/authz";
import { termSlug } from "@/lib/utils";
import { categorySlugProblem } from "@/lib/uniqueSlug";
import { releaseRedirectFrom } from "@/lib/autoRedirect";
import { categoryPath } from "@/lib/permalinks";

export async function GET(req: NextRequest) {
  try {
    // `?language=` narrows to one language's terms; without it the whole list
    // comes back, which is what the Categories screen wants.
    const language = req.nextUrl.searchParams.get("language");
    const result = await db.query.categories.findMany({
      where: language ? eq(categories.language, language) : undefined,
      orderBy: [asc(categories.name)],
    });
    return NextResponse.json({ categories: result });
  } catch {
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Taxonomy is site structure: an author files posts under terms, but
    // renaming or deleting one changes every URL it appears in.
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const body = await req.json();
    const slug = termSlug(String(body.slug || body.name || ""), "category");

    // A term belongs to a language, like the posts filed under it. Unspecified
    // means the default language, which is what every existing term is.
    const settings = await getSiteSettings();
    const language = isContentLanguage(body.language, settings)
      ? String(body.language)
      : defaultContentLanguage(settings);

    // A duplicate hit the unique index and came back as a bare 500.
    const clash = await db.query.categories.findFirst({
      where: (c, { and, eq }) => and(eq(c.language, language), eq(c.slug, slug)),
      columns: { id: true },
    });
    if (clash) {
      return NextResponse.json({ error: `A category with the slug "${slug}" already exists in this language.` }, { status: 409 });
    }
    const problem = await categorySlugProblem(slug, language);
    if (problem) return NextResponse.json({ error: problem }, { status: 409 });

    const [category] = await insertReturning(categories, {
      name: body.name,
      slug,
      description: body.description,
      language,
      // A new term has no id yet, so it cannot be its own ancestor; the cycle
      // check belongs on update, where re-parenting happens.
      parentId: parentIdFrom(body.parentId),
      ...categorySettingsFrom(body),
    });

    // A new term shows up in the chip row of every archive and in the category
    // sitemap, both of which are cached pages — only the update route dropped
    // that cache, so a category could be added and stay invisible for an hour.
    // Its archive now answers here; an old redirect from this address would
    // hide it (see releaseRedirectFrom).
    if (category) await releaseRedirectFrom(categoryPath(category.slug, category.language, settings));
    revalidatePublicSite();
    return NextResponse.json({ category }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
