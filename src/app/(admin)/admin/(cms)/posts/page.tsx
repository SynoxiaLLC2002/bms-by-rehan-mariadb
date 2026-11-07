import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isAuthor } from "@/lib/authz";
import { getSiteSettings } from "@/lib/settings";
import { postPath } from "@/lib/permalinks";
import { LANGUAGES, contentLanguages, defaultContentLanguage, languageLabel, languageName } from "@/lib/locale";
import { categories, posts } from "@/lib/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { isTrashed, notTrashed } from "@/lib/publishState";
import Header from "@/components/admin/Header";
import Link from "next/link";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import DocumentRows, { type DocGroup, type DocVersion } from "@/components/admin/DocumentRows";
import ListToolbar from "@/components/admin/ListToolbar";
import { ListFilters, ListPager } from "@/components/admin/ListFilters";
import { filterAndPage, readListQuery, sortGroupsNewestFirst } from "@/lib/adminList";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sp, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const lang = typeof sp.lang === "string" ? sp.lang : undefined;
  const trash = typeof sp.trash === "string" ? sp.trash : undefined;
  const query = readListQuery(sp);
  // The trash is its own view. Everywhere else, trashed posts are simply gone
  // from the listing — which is the whole point of a trash, and why the delete
  // button no longer destroys anything.
  const showTrash = trash === "1";
  const languages = contentLanguages(settings);
  const defaultLang = defaultContentLanguage(settings);
  const multilingual = languages.length > 1;

  // Every language at once, grouped by translation below — the language tab
  // strip is gone, because "which posts exist in which languages" is the
  // question, and a filter hides exactly that.
  const session = await auth();
  const mine = isAuthor(session) ? eq(posts.authorId, session!.user!.id as string) : undefined;
  const allPosts = await db.query.posts.findMany({
    where: and(showTrash ? isTrashed(posts) : notTrashed(posts), mine),
    orderBy: [desc(posts.createdAt)],
    with: { category: true },
    // A listing never renders a post's body, and that `content` JSON runs to
    // hundreds of kilobytes each — selecting it was pulling the whole site's
    // content into memory to draw a table of titles.
    columns: {
      id: true, title: true, slug: true, excerpt: true,
      status: true, createdAt: true, publishedAt: true, noIndex: true,
      language: true, translationGroup: true, categoryId: true,
    },
  });
  const allCategories = await db.query.categories.findMany({
    columns: { id: true, name: true, language: true },
    orderBy: [asc(categories.name)],
  });

  const toVersion = (p: (typeof allPosts)[number]): DocVersion => ({
    id: p.id,
    title: p.title,
    status: p.status,
    language: p.language,
    path: postPath(p, settings),
    // The published date once there is one — a post written in March and
    // published in September is a September post. Drafts show when they were
    // started, since they have no other date.
    date: formatDate(p.publishedAt ?? p.createdAt),
    sortAt: new Date(p.publishedAt ?? p.createdAt).getTime(),
    publishAt: p.publishedAt ? new Date(p.publishedAt).getTime() : undefined,
    categoryId: p.categoryId,
    isHome: false,
    noIndex: !!p.noIndex,
    meta: p.category?.name ?? "—",
  });

  const buckets = new Map<string, DocVersion[]>();
  for (const p of allPosts) {
    const key = p.translationGroup != null ? `g${p.translationGroup}` : `p${p.id}`;
    const list = buckets.get(key) ?? [];
    list.push(toVersion(p));
    buckets.set(key, list);
  }

  const order = new Map(languages.map((code, i) => [code, i]));
  const groups: DocGroup[] = [...buckets.entries()].map(([key, versions]) => {
    versions.sort((a, b) => (order.get(a.language) ?? 99) - (order.get(b.language) ?? 99));
    // The default language leads when it exists; otherwise whichever comes
    // first, so a post written only in French still gets a row.
    const primary = versions.find((v) => v.language === defaultLang) ?? versions[0];
    const present = new Set(versions.map((v) => v.language));
    return { key, primary, versions, missing: languages.filter((c) => !present.has(c)) };
  });

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
  for (const p of allPosts) if (p.language in counts) counts[p.language] += 1;

  const languageNames = Object.fromEntries(languages.map((c) => [c, languageName(c)]));
  // The whole table, not just the configured ones: a language can be added
  // from a row, so the picker has to be able to offer one the site does not
  // publish in yet.
  const allLanguages = LANGUAGES.map((l) => ({ code: l.code, label: languageLabel(l) }));

  return (
    <>
      <Header title="Posts" />
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{showTrash ? "Trash" : "All Posts"}</h2>
            <p className="text-sm text-slate-500">
              {total} {total === 1 ? "post" : "posts"}
              {total !== visible.length && <> of {visible.length}</>}
              {multilingual && !active && allPosts.length !== groups.length && (
                <> · {allPosts.length} documents across {languages.length} languages</>
              )}
            </p>
          </div>
          {/* The way in and out of the trash. Always visible, so a deleted post
              is findable rather than only rediscoverable by someone who already
              knows the URL. */}
          <Link
            href={showTrash ? "/admin/posts" : "/admin/posts?trash=1"}
            className="whitespace-nowrap text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            {showTrash ? "← Back to posts" : "Trash"}
          </Link>
          <ListToolbar
            basePath="/admin/posts"
            newPath="/admin/posts/new"
            label="New Post"
            languages={languages}
            languageNames={languageNames}
            defaultLang={defaultLang}
            active={active}
            counts={counts}
          />
        </div>

        <ListFilters basePath="/admin/posts" query={query} keep={keep} categories={allCategories} />

        <div className="card overflow-hidden">
          {rows.length === 0 && visible.length > 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">Nothing matches these filters.</div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-slate-400 text-sm mb-4">No posts yet</p>
              <Link href="/admin/posts/new" className="btn-primary">
                <Plus size={16} />
                Write your first post
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Title</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden md:table-cell">Category</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden lg:table-cell">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden lg:table-cell">Index</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden lg:table-cell">Date</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <DocumentRows
                  kind="post"
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
        <ListPager basePath="/admin/posts" query={query} keep={keep} page={page} totalPages={totalPages} total={total} />
      </main>
    </>
  );
}
