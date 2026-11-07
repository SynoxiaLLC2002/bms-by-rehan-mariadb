import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { pages, posts } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import type { Session } from "next-auth";
import { canEditDocument, isAuthor, FORBIDDEN } from "@/lib/authz";
import { getSiteSettings } from "@/lib/settings";
import { refreshTranslationGroup } from "@/lib/publishCache";
import { isContentLanguage } from "@/lib/locale";
import {
  groupMemberIds,
  linkTranslations,
  translationsFor,
  unlinkTranslation,
  type DocKind,
} from "@/lib/translations";

/**
 * Linking a document to its counterpart in another language.
 *
 * Its own endpoint rather than a field on the document PATCH: `translation_group`
 * is a shared key, not a property of one row, so writing it means touching every
 * member of both groups. Exposing it as an ordinary editable field would let a
 * client set an arbitrary integer and silently join two unrelated documents.
 */

const kindOf = (raw: unknown): DocKind | null =>
  raw === "post" || raw === "page" ? raw : null;

const idOf = (raw: unknown): number | null => {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Whether this session may change the translation links of these documents.
 * Linking writes every member's `translation_group`, so it follows the
 * editor's rule for each of them: authors never touch pages, and touch only
 * their own posts.
 */
async function mayLink(session: Session | null, kind: DocKind, ids: number[]): Promise<boolean> {
  if (!isAuthor(session)) return true;
  if (kind === "page") return false;
  for (const id of ids) {
    const row = await db.query.posts.findFirst({ where: eq(posts.id, id), columns: { authorId: true } });
    if (row && !canEditDocument(session, row.authorId)) return false;
  }
  return true;
}

/** Candidates to link to: that language's documents, minus this one. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const kind = kindOf(searchParams.get("kind"));
  const id = idOf(searchParams.get("id"));
  const language = searchParams.get("language") ?? "";
  if (!kind || !id) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  // An author has no pages to link; the candidate list is every page's title.
  if (kind === "page" && isAuthor(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

  const settings = await getSiteSettings();
  if (!isContentLanguage(language, settings)) {
    return NextResponse.json({ error: "Unknown language" }, { status: 400 });
  }

  const table = kind === "post" ? posts : pages;
  const where = and(eq(table.language, language), ne(table.id, id));
  const columns = { id: true, title: true, slug: true, status: true } as const;

  const rows =
    kind === "post"
      ? await db.query.posts.findMany({ where, columns, limit: 200 })
      : await db.query.pages.findMany({ where, columns, limit: 200 });

  return NextResponse.json({ documents: rows });
}

/** Links this document into the target's group. */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const kind = kindOf(body.kind);
    const id = idOf(body.id);
    const targetId = idOf(body.targetId);
    if (!kind || !id || !targetId) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    if (id === targetId) {
      return NextResponse.json({ error: "A document cannot translate itself" }, { status: 400 });
    }
    if (!(await mayLink(session, kind, [id, targetId]))) return NextResponse.json(FORBIDDEN, { status: 403 });

    const table = kind === "post" ? posts : pages;
    const rows = await db
      .select({ id: table.id, language: table.language })
      .from(table)
      .where(eq(table.id, id));
    const targets = await db
      .select({ id: table.id, language: table.language })
      .from(table)
      .where(eq(table.id, targetId));

    if (rows.length === 0 || targets.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Two documents in the same language are not translations of each other, and
    // a group holding both would make a switcher ambiguous.
    if (rows[0].language === targets[0].language) {
      return NextResponse.json(
        { error: "Both documents are in the same language" },
        { status: 400 }
      );
    }

    // Linking merges both documents' *groups*, not just the two documents, so
    // the same-language rule has to hold for everyone who ends up together.
    // Checked only on the pair, English+French linked to German+(another)
    // English made one group with two English versions.
    {
      const both = await db
        .select({ id: table.id, language: table.language, translationGroup: table.translationGroup })
        .from(table)
        .where(inArray(table.id, [id, targetId]));
      const groups = both.map((r) => r.translationGroup).filter((g): g is number => g != null);
      const members = groups.length
        ? await db.select({ id: table.id, language: table.language }).from(table).where(inArray(table.translationGroup, groups))
        : [];
      const seen = new Map<string, number>();
      for (const m of [...members, ...both]) {
        const other = seen.get(m.language);
        if (other !== undefined && other !== m.id) {
          return NextResponse.json(
            { error: `Both groups already have a ${m.language} version — unlink one of them first.` },
            { status: 400 }
          );
        }
        seen.set(m.language, m.id);
      }
    }

    const group = await linkTranslations(kind, id, targetId);
    if (group == null) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const settings = await getSiteSettings();
    const translations = await translationsFor(kind, { id, translationGroup: group }, settings);
    // Every member's switcher and hreflang just changed.
    const headers = new Headers();
    await refreshTranslationGroup(kind, await groupMemberIds(kind, id), headers).catch(() => undefined);
    return NextResponse.json({ group, translations }, { headers });
  } catch {
    return NextResponse.json({ error: "Failed to link" }, { status: 500 });
  }
}

/** Removes this document from its group; the rest stay linked. */
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const kind = kindOf(searchParams.get("kind"));
    const id = idOf(searchParams.get("id"));
    if (!kind || !id) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    if (!(await mayLink(session, kind, [id]))) return NextResponse.json(FORBIDDEN, { status: 403 });

    // Collected before the unlink, so the leaving document is refreshed too.
    const members = await groupMemberIds(kind, id);
    await unlinkTranslation(kind, id);
    const headers = new Headers();
    await refreshTranslationGroup(kind, members, headers).catch(() => undefined);
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ error: "Failed to unlink" }, { status: 500 });
  }
}
