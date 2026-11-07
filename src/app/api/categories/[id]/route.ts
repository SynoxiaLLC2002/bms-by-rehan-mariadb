import { NextRequest, NextResponse } from "next/server";
import { categorySlugProblem } from "@/lib/uniqueSlug";
import { releaseRedirectFrom } from "@/lib/autoRedirect";
import { rehomeLanguage } from "@/lib/rehomeLanguage";
import { defaultCategoryId } from "@/lib/defaultCategory";
import { revalidatePublicSite } from "@/lib/revalidateSite";
import { recordSlugChange } from "@/lib/autoRedirect";
import { categoryPath, permalinkStructure, postPath } from "@/lib/permalinks";
import { getSiteSettings } from "@/lib/settings";
import { db } from "@/lib/db";
import { readByIds } from "@/lib/db/write";
import { categories, posts } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isAuthor, FORBIDDEN } from "@/lib/authz";
import { termSlug } from "@/lib/utils";
import { numericId } from "@/lib/routeParams";
import { categorySettingsFrom, parentIdFrom, parentIsAllowed } from "@/lib/categoryFields";

/** One category, every field: the list (GET /api/categories) is public, so this is too. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = await db.query.categories.findFirst({ where: eq(categories.id, numId) });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ category: row });
  } catch {
    return NextResponse.json({ error: "Failed to fetch category" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Taxonomy is site structure: an author files posts under terms, but
    // renaming or deleting one changes every URL it appears in.
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = await req.json();

    // Only touched when the request actually carries it, for the same reason
    // the settings helper is selective: the quick rename in the list sends no
    // parent, and must not therefore un-parent the term.
    const reparenting = Object.prototype.hasOwnProperty.call(body, "parentId");
    const parentId = reparenting ? parentIdFrom(body.parentId) : undefined;

    // A term cannot be its own ancestor — see `parentIsAllowed`.
    if (reparenting && !(await parentIsAllowed(numId, parentId ?? null))) {
      return NextResponse.json(
        { error: "That parent would put the category inside itself." },
        { status: 400 }
      );
    }

    // A language move, the same way a page or post moves. The term leaves one
    // language's partition for another, so everything tied to the old one is
    // untied: posts filed under it (they stay in their language, refiled as
    // Uncategorized there), its parent and children (a trail must not change
    // language halfway up), and its translation link (it may now collide).
    const existing = await db.query.categories.findFirst({ where: eq(categories.id, numId), columns: { language: true, slug: true } });
    const home = await rehomeLanguage(existing?.language, body.language);
    // An edit that sends neither (a description, a colour) keeps the address: building one
    // from "" gave the term a random slug and moved its archive to /category/category-xxxx.
    // The address changes only when the request sends `slug`. A PATCH of SEO fields
    // or a rename alone keeps it (as WordPress does): deriving it from the name moved
    // a live archive to a new URL. An empty `slug` (cleared in the admin) is rebuilt
    // from the name.
    const slug = Object.prototype.hasOwnProperty.call(body, "slug")
      ? termSlug(String(body.slug || body.name || existing?.slug || ""), "category")
      : existing?.slug ?? termSlug("", "category");
    // Only a new address is checked, so an existing clash never blocks an
    // unrelated edit (a description, a colour) of the category.
    if (existing && (home || existing.slug !== slug)) {
      const problem = await categorySlugProblem(slug, home ?? existing.language);
      if (problem) return NextResponse.json({ error: problem }, { status: 409 });
    }
    if (home) {
      const clash = await db.query.categories.findFirst({
        where: and(eq(categories.language, home), eq(categories.slug, slug), ne(categories.id, numId)),
        columns: { id: true },
      });
      if (clash) {
        return NextResponse.json({ error: `A category with the slug "${slug}" already exists in that language.` }, { status: 409 });
      }
      if (existing) {
        const fallback = await defaultCategoryId(existing.language);
        if (fallback !== numId) {
          await db.update(posts).set({ categoryId: fallback }).where(eq(posts.categoryId, numId));
        }
      }
      await db.update(categories).set({ parentId: null }).where(eq(categories.parentId, numId));
    }

    // The same-language clash (a plain rename onto a taken slug) was only
    // checked for language moves; otherwise the unique index threw a 500.
    if (!home && existing) {
      const clash = await db.query.categories.findFirst({
        where: and(eq(categories.language, existing.language), eq(categories.slug, slug), ne(categories.id, numId)),
        columns: { id: true },
      });
      if (clash) {
        return NextResponse.json({ error: `Another category in this language already uses the slug "${slug}".` }, { status: 409 });
      }
    }

    await db.update(categories).set({
      name: body.name,
      slug,
      description: body.description,
      ...(reparenting ? { parentId } : {}),
      ...(home ? { language: home, parentId: null, translationGroup: null } : {}),
      ...categorySettingsFrom(body),
    }).where(eq(categories.id, numId));
    const [category] = await readByIds(categories, [numId]);

    // The archive moved address (a new prefix, maybe a new slug): keep the
    // old one answering, the way a renamed post does.
    if (existing && category && (home || existing.slug !== category.slug)) {
      const settings = await getSiteSettings();
      const from = categoryPath(existing.slug, existing.language, settings);
      const to = categoryPath(category.slug, category.language, settings);
      if (from !== to) await recordSlugChange(from, to);
    }
    if (category) await releaseRedirectFrom(categoryPath(category.slug, category.language, await getSiteSettings()));

    revalidatePublicSite();
    return NextResponse.json({ category });
  } catch {
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Taxonomy is site structure: an author files posts under terms, but
    // renaming or deleting one changes every URL it appears in.
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const doomed = await db.query.categories.findFirst({
      where: eq(categories.id, numId),
      columns: { id: true, slug: true, language: true, parentId: true },
    });
    if (!doomed) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Posts move to the language's default category, as WordPress does. They
    // used to be left with none (`ON DELETE SET NULL`), which with a
    // `%category%` permalink silently moved every one of them to
    // /uncategorised/<slug> with no redirect.
    const fallback = await defaultCategoryId(doomed.language);
    if (fallback === doomed.id) {
      return NextResponse.json(
        { error: "This is the default category for its language — posts with no other category go here, so it cannot be deleted." },
        { status: 400 }
      );
    }
    const settings = await getSiteSettings();
    const fallbackCat = await db.query.categories.findFirst({
      where: eq(categories.id, fallback),
      columns: { slug: true, name: true },
    });

    // Where each post lives now and where it will live, when the category is
    // part of the address. Computed before the move, redirected after.
    const moves: [string, string][] = [];
    if (permalinkStructure(settings) === "custom" && /%category%/.test(settings.permalink_custom || "")) {
      const filed = await db.query.posts.findMany({
        where: eq(posts.categoryId, doomed.id),
        columns: { id: true, slug: true, language: true, publishedAt: true, createdAt: true },
        with: { category: { columns: { slug: true, name: true } } },
      });
      for (const p of filed) {
        const from = postPath(p, settings);
        const to = postPath({ ...p, category: fallbackCat ?? null }, settings);
        if (from !== to) moves.push([from, to]);
      }
    }

    await db.update(posts).set({ categoryId: fallback }).where(eq(posts.categoryId, doomed.id));
    // Children move up a level rather than becoming orphans of a missing id.
    await db.update(categories).set({ parentId: doomed.parentId ?? null }).where(eq(categories.parentId, doomed.id));
    await db.delete(categories).where(eq(categories.id, numId));

    for (const [from, to] of moves) await recordSlugChange(from, to);
    // The archive's old address goes to where its posts went.
    await recordSlugChange(
      categoryPath(doomed.slug, doomed.language, settings),
      categoryPath(fallbackCat?.slug ?? "uncategorized", doomed.language, settings)
    );

    // Its archive is a cached page: without this it keeps answering 200 for a
    // category that no longer exists, and every post that was filed under it
    // keeps showing the chip.
    revalidatePublicSite();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
