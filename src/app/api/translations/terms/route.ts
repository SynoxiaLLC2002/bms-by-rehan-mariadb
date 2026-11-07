import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, tags } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { isAuthor, FORBIDDEN } from "@/lib/authz";
import { getSiteSettings } from "@/lib/settings";
import { refreshTranslationGroup } from "@/lib/publishCache";
import { isContentLanguage } from "@/lib/locale";
import {
  groupMemberIds,
  isTermKind,
  linkTerms,
  termTranslations,
  unlinkTerm,
  type TermKind,
} from "@/lib/translations";

/**
 * Linking a category or tag to the same term in another language.
 *
 * Separate from the document endpoint because a term has no status, no
 * permalink and no draft state — forcing it through the document shape would
 * mean inventing three fields to ignore.
 */

const table = (kind: TermKind) => (kind === "category" ? categories : tags);

const kindOf = (raw: unknown): TermKind | null =>
  typeof raw === "string" && isTermKind(raw) ? raw : null;

const idOf = (raw: unknown): number | null => {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** Terms in a given language that this one could be linked to. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const kind = kindOf(searchParams.get("kind"));
  const id = idOf(searchParams.get("id"));
  const language = searchParams.get("language") ?? "";
  if (!kind || !id) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const settings = await getSiteSettings();
  if (!isContentLanguage(language, settings)) {
    return NextResponse.json({ error: "Unknown language" }, { status: 400 });
  }

  const t = table(kind);
  const terms = await db
    .select({ id: t.id, name: t.name, slug: t.slug })
    .from(t)
    .where(and(eq(t.language, language), ne(t.id, id)))
    .limit(200);

  return NextResponse.json({ terms });
}

/** Links this term into the target's group. */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Taxonomy is site structure — authors may not edit terms (see the
    // categories and tags routes), and relinking one is editing it.
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const body = await req.json();
    const kind = kindOf(body.kind);
    const id = idOf(body.id);
    const targetId = idOf(body.targetId);
    if (!kind || !id || !targetId) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const group = await linkTerms(kind, id, targetId);
    if (group == null) {
      // `linkTerms` refuses a self-link and two terms in the same language;
      // both are the same mistake from the user's side.
      return NextResponse.json(
        { error: "Those two cannot be linked — pick a term in another language" },
        { status: 400 }
      );
    }

    const translations = await termTranslations(kind, { id, translationGroup: group });
    // The archives' language switchers and hreflang just changed.
    const headers = new Headers();
    await refreshTranslationGroup(kind, await groupMemberIds(kind, id), headers).catch(() => undefined);
    return NextResponse.json({ group, translations }, { headers });
  } catch {
    return NextResponse.json({ error: "Failed to link" }, { status: 500 });
  }
}

/** Removes this term from its group; the rest stay linked. */
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { searchParams } = req.nextUrl;
    const kind = kindOf(searchParams.get("kind"));
    const id = idOf(searchParams.get("id"));
    if (!kind || !id) return NextResponse.json({ error: "Bad request" }, { status: 400 });

    const members = await groupMemberIds(kind, id);
    await unlinkTerm(kind, id);
    const headers = new Headers();
    await refreshTranslationGroup(kind, members, headers).catch(() => undefined);
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ error: "Failed to unlink" }, { status: 500 });
  }
}
