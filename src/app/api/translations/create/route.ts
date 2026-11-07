import { NextRequest, NextResponse } from "next/server";
import { revalidatePublicSite } from "@/lib/revalidateSite";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { insertReturning } from "@/lib/db/write";
import { pages, posts } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { canEditDocument, isAdmin, isAuthor, FORBIDDEN } from "@/lib/authz";
import { getSiteSettings } from "@/lib/settings";
import { contentLanguages, isContentLanguage, isKnownLanguage, languageName } from "@/lib/locale";
import { siteSettings } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { uniqueSlug } from "@/lib/uniqueSlug";
import { linkTranslations, type DocKind } from "@/lib/translations";
import { homepageId, homepageSettingKey } from "@/lib/permalinks";

/**
 * "Add this page in another language."
 *
 * Creates a blank document in the target language and links it to the source in
 * one step, because doing it by hand is three: create, find, link — and getting
 * the third wrong leaves two unrelated documents that look translated.
 *
 * Deliberately blank. No blocks are copied from the source: a copy in the wrong
 * language is worse than an empty page, because it looks finished and ships
 * untranslated content to readers. It starts as a draft for the same reason.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const kind: DocKind | null =
      body.kind === "post" || body.kind === "page" ? body.kind : null;
    const sourceId = parseInt(String(body.sourceId ?? ""), 10);
    const language = String(body.language ?? "");

    if (!kind || !Number.isInteger(sourceId) || sourceId <= 0) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    // Same rules as creating the document directly: no pages for an author.
    if (kind === "page" && isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const settings = await getSiteSettings();

    // A language that is not configured yet can be added here, so "write this
    // page in Spanish" is one action rather than a trip to Settings and back.
    // Validated against the known language table, never taken as free text —
    // `content_languages` decides routing, so an arbitrary code would mint a
    // URL prefix that resolves to nothing.
    let addedLanguage = false;
    if (!isContentLanguage(language, settings)) {
      if (!isKnownLanguage(language)) {
        return NextResponse.json({ error: "Unknown language" }, { status: 400 });
      }
      // Adding a language to the site is a settings change — every URL
      // prefix, the sitemap, the language switcher — so it is an
      // administrator's decision, the same as the Settings screen it mirrors.
      if (!isAdmin(session)) {
        return NextResponse.json({ error: "Only an administrator can add a new language to the site." }, { status: 403 });
      }
      const next = [...contentLanguages(settings), language];
      await db
        .insert(siteSettings)
        .values({ key: "content_languages", value: next.join(","), updatedAt: new Date() })
        .onDuplicateKeyUpdate({ set: { value: sql.raw("VALUES(`value`)"), updatedAt: sql.raw("VALUES(`updated_at`)") },
        });
      addedLanguage = true;
    }

    const table = kind === "post" ? posts : pages;
    const [source] = await db
      .select({ id: table.id, title: table.title, language: table.language, authorId: table.authorId, translationGroup: table.translationGroup })
      .from(table)
      .where(eq(table.id, sourceId));

    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // An author translates their own work only.
    if (!canEditDocument(session, source.authorId)) return NextResponse.json(FORBIDDEN, { status: 403 });
    if (source.language === language) {
      return NextResponse.json(
        { error: "That document is already in this language" },
        { status: 400 }
      );
    }

    // One version per language per group. Without this, pressing "Add
    // French" twice made two French translations of the same document.
    if (source.translationGroup != null) {
      const [existing] = await db
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.translationGroup, source.translationGroup), eq(table.language, language)));
      if (existing) {
        return NextResponse.json(
          { error: `This document already has a ${languageName(language)} version.`, id: existing.id },
          { status: 409 }
        );
      }
    }

    // The title carries the language so the two are tellable apart in a list
    // before either has been written. It is a starting point, not a rule — the
    // author renames it.
    const title = `${source.title || "Untitled"} (${languageName(language)})`;
    const slug = await uniqueSlug(kind, title, undefined, language);

    const values = {
      title,
      slug,
      content: [],
      status: "draft" as const,
      language,
      // Owned by whoever asked for it — without this the draft had no author,
      // so the author who created it could not open it again.
      authorId: session.user.id,
    };

    const [created] =
      kind === "post"
        ? await insertReturning(posts, values)
        : await insertReturning(pages, values);

    const group = await linkTranslations(kind, created.id, sourceId);

    // Translating the homepage produces the homepage.
    //
    // Without this the new page fell back to a slug URL — `/fr/untitled-francais`
    // for the French version of the page that answers at `/`. A homepage's
    // address is its language root, so the translation of one has to be
    // registered as that language's homepage or it is not a translation of it,
    // it is an ordinary page that happens to say the same thing.
    let becameHomepage = false;
    if (kind === "page" && homepageId(source.language, settings) === sourceId) {
      await db
        .insert(siteSettings)
        .values({
          key: homepageSettingKey(language, settings),
          value: String(created.id),
          updatedAt: new Date(),
        })
        .onDuplicateKeyUpdate({ set: { value: sql.raw("VALUES(`value`)"), updatedAt: sql.raw("VALUES(`updated_at`)") },
        });
      becameHomepage = true;
    }

    // A new language changes every page's switcher and hreflang, and a new
    // homepage key changes that root; neither reached any cache before.
    if (addedLanguage || becameHomepage) revalidatePublicSite();

    return NextResponse.json({ id: created.id, language, slug, title, group, becameHomepage });
  } catch {
    return NextResponse.json({ error: "Failed to create translation" }, { status: 500 });
  }
}
