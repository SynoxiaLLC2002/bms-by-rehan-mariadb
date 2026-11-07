import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { insertReturning } from "@/lib/db/write";
import { tags } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { getSiteSettings } from "@/lib/settings";
import { defaultContentLanguage, isContentLanguage } from "@/lib/locale";
import { auth } from "@/lib/auth";
import { termSlug } from "@/lib/utils";
import { releaseRedirectFrom } from "@/lib/autoRedirect";
import { tagPath } from "@/lib/permalinks";

export async function GET(req: NextRequest) {
  try {
    // `?language=` narrows to one language's tags; without it, all of them.
    const language = req.nextUrl.searchParams.get("language");
    const result = await db.query.tags.findMany({
      where: language ? eq(tags.language, language) : undefined,
      orderBy: [asc(tags.name)],
    });
    return NextResponse.json({ tags: result });
  } catch {
    // The table may not exist yet on a database that has not run the migration.
    return NextResponse.json({ tags: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const slug = termSlug(String(body.slug || name), "tag");

    // Tags belong to a language, like the posts they are on. Unspecified means
    // the default language, which is what every existing tag is.
    const settings = await getSiteSettings();
    const language = isContentLanguage(body.language, settings)
      ? String(body.language)
      : defaultContentLanguage(settings);

    // Tagging is a high-traffic, low-ceremony action: a name that already
    // exists returns the existing tag rather than failing the request.
    //
    // Scoped to the language, and resolved *after* it. Slugs are unique per
    // language since `0006`, so an unscoped check matched another language's
    // tag and handed it back — a French post asking for "recipes" received the
    // English tag instead of getting a French one created.
    const existing = await db.query.tags.findFirst({
      where: (t, { and, eq }) => and(eq(t.slug, slug), eq(t.language, language)),
    });
    // The Tags screen asks for `strict`: someone adding a tag there by hand
    // should be told it exists, not handed the old one as if it were new.
    if (existing && body.strict) {
      return NextResponse.json({ error: `A tag with the slug "${slug}" already exists in this language.` }, { status: 409 });
    }
    if (existing) return NextResponse.json({ tag: existing, existed: true });

    const [tag] = await insertReturning(tags, {
      name,
      slug,
      description: body.description ?? null,
      language,
    });
    // Its archive now answers here; an old redirect from this address would
    // hide it (see releaseRedirectFrom).
    if (tag) await releaseRedirectFrom(tagPath(tag.slug, tag.language, settings));

    return NextResponse.json({ tag }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 });
  }
}
