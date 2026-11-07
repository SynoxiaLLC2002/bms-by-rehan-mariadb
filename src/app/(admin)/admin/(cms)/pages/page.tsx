import { db } from "@/lib/db";
import { getSiteSettings } from "@/lib/settings";
import { LANGUAGES, contentLanguages, defaultContentLanguage, languageLabel, languageName } from "@/lib/locale";
import { homepageId, pagePath } from "@/lib/permalinks";
import { pages } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { isTrashed, notTrashed } from "@/lib/publishState";
import Header from "@/components/admin/Header";
import Link from "next/link";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import DocumentRows, { type DocGroup, type DocVersion } from "@/components/admin/DocumentRows";
import ListToolbar from "@/components/admin/ListToolbar";
import { ListFilters, ListPager } from "@/components/admin/ListFilters";
import { filterAndPage, readListQuery, sortGroupsNewestFirst } from "@/lib/adminList";

export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sp, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const lang = typeof sp.lang === "string" ? sp.lang : undefined;
  const trash = typeof sp.trash === "string" ? sp.trash : undefined;
  const query = readListQuery(sp);
  // Same as the posts list: the trash is its own view, and everywhere else a
  // trashed page is simply absent.
  const showTrash = trash === "1";
  const languages = contentLanguages(settings);
  const defaultLang = defaultContentLanguage(settings);
  const multilingual = languages.length > 1;

  // Every language at once. The list used to filter to one language behind a
  // tab strip, which hid the question an author actually has — which pages
  // exist in which languages, and which are missing.
  const allPages = await db.query.pages.findMany({
    where: showTrash ? isTrashed(pages) : notTrashed(pages),
    orderBy: [desc(pages.createdAt)],
    // The table shows a title, a slug, a status and a date. Selecting the body
    // as well meant every page's block JSON crossed the wire to draw it.
    columns: {
      id: true,
      title: true,
      slug: true,
      status: true,
      noIndex: true,
      createdAt: true,
      publishedAt: true,
      language: true,
      translationGroup: true,
    },
  });

  const homeIds = new Set(
    languages.map((code) => homepageId(code, settings)).filter((id): id is number => id != null)
  );

  const toVersion = (p: (typeof allPages)[number]): DocVersion => ({
    id: p.id,
    title: p.title,
    status: p.status,
    language: p.language,
    // The real URL, not the slug: a homepage answers at its language root and
    // its slug decides nothing, so showing `/{slug}` there would be a lie.
    path: pagePath(p, settings),
    date: formatDate(p.publishedAt ?? p.createdAt),
    sortAt: new Date(p.publishedAt ?? p.createdAt).getTime(),
    publishAt: p.publishedAt ? new Date(p.publishedAt).getTime() : undefined,
    isHome: homeIds.has(p.id),
    noIndex: !!p.noIndex,
  });

  // Grouped by translation group; anything ungrouped is its own group of one.
  const buckets = new Map<string, DocVersion[]>();
  for (const p of allPages) {
    const key = p.translationGroup != null ? `g${p.translationGroup}` : `p${p.id}`;
    const list = buckets.get(key) ?? [];
    list.push(toVersion(p));
    buckets.set(key, list);
  }

  const order = new Map(languages.map((code, i) => [code, i]));
  const groups: DocGroup[] = [...buckets.entries()].map(([key, versions]) => {
    // Configured-language order, so the expanded rows read the same way the
    // language settings do rather than in insertion order.
    versions.sort((a, b) => (order.get(a.language) ?? 99) - (order.get(b.language) ?? 99));
    // The default language leads when it exists; otherwise whichever comes
    // first, so a group written only in French still has a row.
    const primary = versions.find((v) => v.language === defaultLang) ?? versions[0];
    const present = new Set(versions.map((v) => v.language));
    return { key, primary, versions, missing: languages.filter((c) => !present.has(c)) };
  });

  // Newest first, by the row actually shown.
  sortGroupsNewestFirst(groups);

  // Groups are always built from every language, so "which languages does this
  // exist in" stays true. The filter only decides which version *leads* the row
  // and which groups appear at all — computing groups from a filtered set would
  // report every other language as missing.
  const active = lang && languages.includes(lang) ? lang : null;
  const visible = active
    ? groups
        .filter((g) => g.versions.some((v) => v.language === active))
        .map((g) => ({ ...g, primary: g.versions.find((v) => v.language === active)! }))
    : groups;
  const { rows, total, page, totalPages } = filterAndPage(visible, query);
  const keep = { lang: active ?? undefined, trash: showTrash ? "1" : undefined };

  const counts: Record<string, number> = Object.fromEntries(languages.map((c) => [c, 0]));
  for (const p of allPages) if (p.language in counts) counts[p.language] += 1;

  const languageNames = Object.fromEntries(languages.map((c) => [c, languageName(c)]));
  // The whole table, not just the configured ones: a language can be added
  // from a row, so the picker has to be able to offer one the site does not
  // publish in yet.
  const allLanguages = LANGUAGES.map((l) => ({ code: l.code, label: languageLabel(l) }));

  return (
    <>
      <Header title="Pages" />
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {showTrash ? "Trash" : "All Pages"}
            </h2>
            <p className="text-sm text-slate-500">
              {total} {total === 1 ? "page" : "pages"}
              {total !== visible.length && <> of {visible.length}</>}
              {multilingual && !active && allPages.length !== groups.length && (
                <> · {allPages.length} documents across {languages.length} languages</>
              )}
            </p>
          </div>
          {/* In and out of the trash, always visible — a deleted page has to be
              findable, not only rediscoverable by someone who knows the URL. */}
          <Link
            href={showTrash ? "/admin/pages" : "/admin/pages?trash=1"}
            className="whitespace-nowrap text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            {showTrash ? "← Back to pages" : "Trash"}
          </Link>
          <ListToolbar
            basePath="/admin/pages"
            newPath="/admin/pages/new"
            label="New Page"
            languages={languages}
            languageNames={languageNames}
            defaultLang={defaultLang}
            active={active}
            counts={counts}
          />
        </div>

        <ListFilters basePath="/admin/pages" query={query} keep={keep} />

        <div className="card overflow-hidden">
          {rows.length === 0 && visible.length > 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">Nothing matches these filters.</div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-slate-400 text-sm mb-4">No pages yet</p>
              <Link href="/admin/pages/new" className="btn-primary">
                <Plus size={16} />
                Create your first page
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Title</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden md:table-cell">Slug</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden lg:table-cell">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden lg:table-cell">Index</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden lg:table-cell">Date</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <DocumentRows
                  kind="page"
                  trashed={showTrash}
                  groups={rows}
                  languageNames={languageNames}
                  multilingual={multilingual}
                  allLanguages={allLanguages}
                  configured={languages}
                />
              </tbody>
            </table>
          )}
        </div>
        <ListPager basePath="/admin/pages" query={query} keep={keep} page={page} totalPages={totalPages} total={total} />
      </main>
    </>
  );
}
