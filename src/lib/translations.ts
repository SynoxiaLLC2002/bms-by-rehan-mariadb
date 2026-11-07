// Which documents are versions of each other.
//
// Content is partitioned by language — a French post is its own document, not a
// field on the English one — which is right for editing but leaves one question
// unanswered: given this page, where is the same page in French? Nothing could
// answer it, so there was no language switcher and no `hreflang`, and search
// engines had no way to know the two pages were the same thing twice.
//
// `translation_group` answers it. Every document in a group carries the same
// integer; the group has no row of its own. The key is simply the id of
// whichever document the group started from, which means no sequence, no extra
// table, and no migration beyond the column that already exists. If that first
// document is later deleted the others keep the key and stay linked — the key
// is an identifier, not a reference.

import { cache } from "react";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, pages, posts, tags } from "@/lib/db/schema";
import { absoluteUrlFor, categoryPath, pagePath, postPath, tagPath } from "@/lib/permalinks";
import type { SiteSettings } from "@/lib/settings";
import { contentLanguages, isContentLanguage } from "@/lib/locale";
import { isLiveNow } from "@/lib/publishState";

export type DocKind = "post" | "page";

/**
 * Terms are grouped the same way documents are.
 *
 * "Recipes" and "Recettes" are one concept in two languages, and nothing could
 * say so: the `translation_group` columns were added to `categories` and `tags`
 * in `0006` and then read by nothing. Linking them is what lets a language
 * switcher move a reader between the two archives instead of dropping them on a
 * homepage, and what stops the same concept looking like two unrelated terms.
 */
export type TermKind = "category" | "tag";
export type AnyKind = DocKind | TermKind;

const TABLES = { post: posts, page: pages, category: categories, tag: tags } as const;

export const isTermKind = (kind: string): kind is TermKind =>
  kind === "category" || kind === "tag";

const tableFor = (kind: AnyKind) => TABLES[kind];

// Narrowed on purpose: documents have a `title`, terms have a `name`, so a
// union of all four tables has neither. The term helpers below need the term
// shape specifically.
const termTable = (kind: TermKind) => (kind === "category" ? categories : tags);

/** The columns a translation row needs: identity, language, and its URL. */
const COLUMNS = {
  id: true,
  slug: true,
  title: true,
  status: true,
  language: true,
  translationGroup: true,
  publishedAt: true,
  createdAt: true,
  noIndex: true,
  canonicalUrl: true,
} as const;

export interface Translation {
  id: number;
  language: string;
  slug: string;
  title: string;
  status: string;
  /** Needed to tell "published" from "published, but not until Tuesday". */
  publishedAt: Date | string | null;
  /** The public URL, built by the same helpers everything else uses. */
  path: string;
  /**
   * False when this translation tells search engines not to index it —
   * noindex, or a canonical pointing somewhere else. `hreflang` must not
   * list such a URL: Google reports it as an error and ignores the set.
   */
  indexable: boolean;
}

type Row = {
  id: number;
  slug: string;
  title: string;
  status: string;
  language: string;
  translationGroup: number | null;
  publishedAt: Date | string | null;
  createdAt: Date | string | null;
  noIndex?: boolean | null;
  canonicalUrl?: string | null;
};

/** A path or URL reduced to its path, for "is this canonical pointing at itself". */
function pathOnly(url: string): string {
  let p = url.trim().replace(/^https?:\/\/[^/]+/i, "").replace(/[?#].*$/, "");
  try {
    p = decodeURI(p);
  } catch {
    // Malformed escapes — compare as written.
  }
  return p.replace(/\/+$/, "") || "/";
}

/** Whether a document with these SEO fields, served at `path`, asks to be indexed. */
export function selfIndexable(path: string, noIndex?: boolean | null, canonicalUrl?: string | null): boolean {
  if (noIndex) return false;
  if (canonicalUrl && canonicalUrl.trim() && pathOnly(canonicalUrl) !== pathOnly(path)) return false;
  return true;
}

function toTranslation(kind: DocKind, row: Row, settings: SiteSettings): Translation {
  const path =
    kind === "post"
      ? postPath(row, settings)
      : pagePath({ id: row.id, slug: row.slug, language: row.language }, settings);
  return {
    indexable: selfIndexable(path, row.noIndex, row.canonicalUrl),
    id: row.id,
    language: row.language,
    slug: row.slug,
    title: row.title,
    status: row.status,
    publishedAt: row.publishedAt,
    path,
  };
}

/**
 * The other documents in this one's group.
 *
 * Returns nothing when the document is not in a group, which is the common case
 * and costs no query.
 */
export async function translationsFor(
  kind: DocKind,
  doc: { id: number; translationGroup: number | null },
  settings: SiteSettings
): Promise<Translation[]> {
  // `cache()` keys on arguments by identity. Metadata and the page pass
  // different document objects, so the group id is what they share.
  return translationsCached(kind, doc.id, doc.translationGroup, settings);
}

const translationsCached = cache(async function translationsCached(
  kind: DocKind,
  _documentId: number,
  translationGroup: number | null,
  settings: SiteSettings
): Promise<Translation[]> {
  if (translationGroup == null) return [];
  const table = tableFor(kind);

  // Branched rather than indexed by name: Drizzle's `query` object types each
  // table separately, so `db.query[name]` is a union whose call signatures do
  // not agree and cannot be invoked.
  const where = and(eq(table.translationGroup, translationGroup), ne(table.id, _documentId));

  // A failed lookup degrades to "no translations" rather than throwing.
  //
  // This runs in `generateMetadata` and again in the render of every post and
  // page, to produce `hreflang` and the language switcher — both decorations on
  // a document that has already been fetched. Left unguarded it could take a
  // whole article to the error boundary over a supplementary query, and `[]` is
  // already the well-handled shape here: it is what a document not in a group
  // returns, so every caller down the line already renders it correctly.
  //
  // Only the reads are guarded. `linkTranslations` and `unlinkTranslation`
  // below stay unguarded on purpose — a write that silently reports success
  // while changing nothing is a far worse failure than an error.
  let rows: Row[];
  try {
    rows = (kind === "post"
      ? await db.query.posts.findMany({ where, columns: COLUMNS })
      : await db.query.pages.findMany({ where, columns: COLUMNS })) as Row[];
  } catch {
    return [];
  }

  // One document per language: a group with two French entries is a mistake, and
  // showing both in a switcher would ask the reader to pick at random.
  const seen = new Set<string>();
  const out: Translation[] = [];
  for (const row of rows) {
    if (seen.has(row.language)) continue;
    seen.add(row.language);
    out.push(toTranslation(kind, row, settings));
  }
  return out;
});

/**
 * Every language's version of this document, including itself, in the order the
 * languages are configured — what a switcher renders.
 *
 * Languages with no translation are omitted rather than linked to a page that
 * does not exist. A switcher that offers a language and then 404s is worse than
 * one that does not offer it.
 */
export async function switcherLinks(
  kind: DocKind,
  doc: { id: number; language: string; translationGroup: number | null },
  settings: SiteSettings
): Promise<Translation[]> {
  const others = await translationsFor(kind, doc, settings);
  const byLang = new Map(others.map((t) => [t.language, t]));
  return contentLanguages(settings)
    .map((code) => (code === doc.language ? null : byLang.get(code) ?? null))
    .filter((t): t is Translation => t !== null);
}

/**
 * Links `id` into `targetId`'s group, creating one if neither has it yet.
 *
 * Returns the group key. Both documents end up in the same group, and so does
 * everything already linked to either — joining two groups merges them rather
 * than silently dropping one side's existing links.
 */
export async function linkTranslations(
  kind: DocKind,
  id: number,
  targetId: number
): Promise<number | null> {
  if (id === targetId) return null;
  const table = tableFor(kind);

  const rows = (await db
    .select({ id: table.id, translationGroup: table.translationGroup })
    .from(table)
    .where(inArray(table.id, [id, targetId]))) as { id: number; translationGroup: number | null }[];

  if (rows.length !== 2) return null;

  const a = rows.find((r) => r.id === id)!;
  const b = rows.find((r) => r.id === targetId)!;

  // Prefer an existing group so links already made are kept; otherwise the
  // group starts from the target's id.
  const group = b.translationGroup ?? a.translationGroup ?? targetId;

  // Merge: anything in either old group moves too.
  const oldGroups = [a.translationGroup, b.translationGroup].filter(
    (g): g is number => g != null && g !== group
  );
  if (oldGroups.length) {
    await db
      .update(table)
      .set({ translationGroup: group })
      .where(inArray(table.translationGroup, oldGroups));
  }

  await db.update(table).set({ translationGroup: group }).where(inArray(table.id, [id, targetId]));
  return group;
}

/**
 * Removes one document from its group.
 *
 * The rest of the group stays linked. A group left with a single member is
 * harmless — `translationsFor` returns nothing for it — so it is not cleaned up,
 * which keeps the operation a single write.
 */
/**
 * Every id in this document's translation group, itself included — the pages
 * whose language switcher a link or unlink changes (publishCache
 * refreshTranslationGroup).
 */
export async function groupMemberIds(kind: DocKind | TermKind, id: number): Promise<number[]> {
  const table = kind === "post" || kind === "page" ? tableFor(kind) : termTable(kind);
  const [self] = await db.select({ group: table.translationGroup }).from(table).where(eq(table.id, id)).limit(1);
  if (!self || self.group == null) return [id];
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.translationGroup, self.group));
  return [...new Set([id, ...rows.map((r) => r.id)])];
}

export async function unlinkTranslation(kind: DocKind, id: number): Promise<void> {
  const table = tableFor(kind);
  await db.update(table).set({ translationGroup: null }).where(eq(table.id, id));
}

/**
 * `hreflang` alternates for a document.
 *
 * Only published translations are advertised: pointing a search engine at a
 * draft asks it to index a URL that 404s. `x-default` goes to the default
 * language when that language is in the group, which is what tells a crawler
 * which version to show when it cannot match any of them.
 */
export function alternateLanguages(
  self: { language: string; path: string; status?: string; indexable?: boolean },
  translations: Translation[],
  settings: SiteSettings,
  base = ""
): Record<string, string> | undefined {
  // Scheduled translations are not advertised either: pointing a crawler at a
  // URL that 404s until Tuesday is the same mistake as pointing it at a draft.
  // A page that is itself noindex carries no hreflang: the set is only read
  // from indexable pages, and advertising it here only invites the error.
  if (self.indexable === false) return undefined;
  // Nor are translations search engines are told to skip (see `indexable`).
  const published = translations.filter((t) => isLiveNow(t.status, t.publishedAt) && t.indexable);
  if (published.length === 0) return undefined;

  const out: Record<string, string> = {};
  for (const t of published) out[t.language] = absoluteUrlFor(base, t.path);
  out[self.language] = absoluteUrlFor(base, self.path);

  const [defaultLang] = contentLanguages(settings);
  if (out[defaultLang]) out["x-default"] = out[defaultLang];
  return out;
}


/** A term in another language, for the linking UI. */
export interface TermTranslation {
  id: number;
  language: string;
  name: string;
  slug: string;
}

/** The other terms in this one's group. */
export async function termTranslations(
  kind: TermKind,
  term: { id: number; translationGroup: number | null }
): Promise<TermTranslation[]> {
  if (term.translationGroup == null) return [];
  const table = termTable(kind);
  // Degrades to "no translations", for the same reason as `translationsFor`.
  let rows: { id: number; language: string; name: string; slug: string }[];
  try {
    rows = await db
      .select({ id: table.id, language: table.language, name: table.name, slug: table.slug })
      .from(table)
      .where(and(eq(table.translationGroup, term.translationGroup), ne(table.id, term.id)));
  } catch {
    return [];
  }

  // One per language, for the same reason documents are deduplicated: a
  // switcher cannot ask a reader to choose between two French terms.
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.language) ? false : (seen.add(r.language), true)));
}

/**
 * The `hreflang` map for a term archive — the counterpart of
 * `alternateLanguages` for documents.
 *
 * Linked terms fed the language switcher and nothing else: a French
 * "Recettes" and an English "Recipes" archive were connected on the page and
 * unconnected in the metadata, so a crawler saw two listings competing for
 * the same concept. Same shape as the document version: self, every linked
 * term in a configured language, and `x-default` on the default language.
 * Undefined when the term stands alone, so nothing is claimed.
 */
export async function termAlternateLanguages(
  kind: TermKind,
  term: { id: number; slug: string; language: string; translationGroup: number | null },
  settings: SiteSettings
): Promise<Record<string, string> | undefined> {
  const others = (await termTranslations(kind, term)).filter((t) => isContentLanguage(t.language, settings));
  if (others.length === 0) return undefined;

  const pathFor = kind === "category" ? categoryPath : tagPath;
  const out: Record<string, string> = {};
  for (const t of others) out[t.language] = pathFor(t.slug, t.language, settings);
  out[term.language] = pathFor(term.slug, term.language, settings);

  const [defaultLang] = contentLanguages(settings);
  if (out[defaultLang]) out["x-default"] = out[defaultLang];
  return out;
}

/**
 * Links two terms into one group, merging any groups they already belong to.
 *
 * Same key strategy as documents: the group is just a shared integer, taken
 * from whichever member already had one.
 */
export async function linkTerms(
  kind: TermKind,
  id: number,
  targetId: number
): Promise<number | null> {
  if (id === targetId) return null;
  const table = termTable(kind);

  const rows = await db
    .select({ id: table.id, language: table.language, translationGroup: table.translationGroup })
    .from(table)
    .where(inArray(table.id, [id, targetId]));
  if (rows.length !== 2) return null;

  const a = rows.find((r) => r.id === id)!;
  const b = rows.find((r) => r.id === targetId)!;
  // Two terms in the same language are not translations of each other.
  if (a.language === b.language) return null;
  // Linking merges both groups, so the rule must hold across all of them —
  // not just the pair — or one group ends up with two versions of a language.
  const groups = [a.translationGroup, b.translationGroup].filter((g): g is number => g != null);
  if (groups.length) {
    const members = await db.select({ id: table.id, language: table.language }).from(table).where(inArray(table.translationGroup, groups));
    const seen = new Map<string, number>();
    for (const m of [...members, a, b]) {
      const other = seen.get(m.language);
      if (other !== undefined && other !== m.id) return null;
      seen.set(m.language, m.id);
    }
  }

  const group = b.translationGroup ?? a.translationGroup ?? targetId;
  const oldGroups = [a.translationGroup, b.translationGroup].filter(
    (g): g is number => g != null && g !== group
  );
  if (oldGroups.length) {
    await db
      .update(table)
      .set({ translationGroup: group })
      .where(inArray(table.translationGroup, oldGroups));
  }
  await db.update(table).set({ translationGroup: group }).where(inArray(table.id, [id, targetId]));
  return group;
}

/** Removes one term from its group; the rest stay linked. */
export async function unlinkTerm(kind: TermKind, id: number): Promise<void> {
  const table = termTable(kind);
  await db.update(table).set({ translationGroup: null }).where(eq(table.id, id));
}
