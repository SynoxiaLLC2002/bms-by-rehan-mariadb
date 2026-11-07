import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readByIds } from "@/lib/db/write";
import { tags } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isAuthor, FORBIDDEN } from "@/lib/authz";
import { termSlug } from "@/lib/utils";
import { recordSlugChange, releaseRedirectFrom } from "@/lib/autoRedirect";
import { tagPath } from "@/lib/permalinks";
import { getSiteSettings } from "@/lib/settings";
import { numericId } from "@/lib/routeParams";
import { revalidatePublicSite } from "@/lib/revalidateSite";

/** One tag, every field: the list (GET /api/tags) is public, so this is too. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numId = numericId(id);
    if (numId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = await db.query.tags.findFirst({ where: eq(tags.id, numId) });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ tag: row });
  } catch {
    return NextResponse.json({ error: "Failed to fetch tag" }, { status: 500 });
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

    const existing = await db.query.tags.findFirst({
      where: eq(tags.id, numId),
      columns: { slug: true, language: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // An edit that sends neither (a description, a colour) keeps the address: building one
    // from "" gave the term a random slug and moved its archive to /category/category-xxxx.
    // The address changes only when the request sends `slug`. A PATCH of SEO fields
    // or a rename alone keeps it (as WordPress does): deriving it from the name moved
    // a live archive to a new URL. An empty `slug` (cleared in the admin) is rebuilt
    // from the name.
    const slug = Object.prototype.hasOwnProperty.call(body, "slug")
      ? termSlug(String(body.slug || body.name || existing?.slug || ""), "tag")
      : existing.slug ?? termSlug("", "tag");
    // Slugs are unique per language. Without this check the unique index
    // threw, the catch-all answered 500, and the Tags screen — which did not
    // look at the answer — showed the edit as saved.
    const clash = await db.query.tags.findFirst({
      where: and(eq(tags.language, existing.language), eq(tags.slug, slug), ne(tags.id, numId)),
      columns: { id: true },
    });
    if (clash) {
      return NextResponse.json({ error: `Another tag in this language already uses the slug "${slug}".` }, { status: 409 });
    }

    await db.update(tags).set({
      name: body.name,
      slug,
      description: body.description,
    }).where(eq(tags.id, numId));
    const [tag] = await readByIds(tags, [numId]);

    // Posts, pages and categories keep their old address answering when the
    // slug changes; tags did not, so a renamed tag's archive became a 404
    // for every link and every search result pointing at it.
    const settings = await getSiteSettings();
    const cfPaths = tag ? [tagPath(tag.slug, tag.language, settings)] : [];
    if (tag) await releaseRedirectFrom(cfPaths[0]);
    if (tag && existing.slug !== tag.slug) {
      const from = tagPath(existing.slug, existing.language, settings);
      const to = tagPath(tag.slug, tag.language, settings);
      cfPaths.push(from);
      if (from !== to) await recordSlugChange(from, to);
    }

    // A tag's name and slug are on every post that carries it, and its
    // archive is a cached page — see lib/revalidateSite.ts. At Cloudflare
    // only the archive is dropped; the tag chip on posts refreshes with the
    // edge's normal expiry rather than by emptying the whole zone.
    revalidatePublicSite({ cloudflarePaths: cfPaths });
    return NextResponse.json({ tag });
  } catch {
    return NextResponse.json({ error: "Failed to update tag" }, { status: 500 });
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
    const doomed = await db.query.tags.findFirst({ where: eq(tags.id, numId), columns: { slug: true, language: true } });
    // The join rows go with it: post_tags cascades on delete.
    await db.delete(tags).where(eq(tags.id, numId));
    revalidatePublicSite({ cloudflarePaths: doomed ? [tagPath(doomed.slug, doomed.language, await getSiteSettings())] : [] });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 });
  }
}
