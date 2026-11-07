// Search and filters above the Posts and Pages lists, and the page links
// below them.
//
// A plain GET form: the filters live in the URL, so a filtered list survives
// a refresh, can be bookmarked, and needs no client state. `lang` and `trash`
// ride along as hidden fields so searching never drops the language filter or
// jumps out of the Trash view.

import Link from "next/link";
import { Search } from "lucide-react";
import { STATUS_FILTERS, type ListQuery } from "@/lib/adminList";

export function ListFilters({
  basePath,
  query,
  keep,
  categories,
}: {
  basePath: string;
  query: ListQuery;
  /** Parameters to carry through unchanged (`lang`, `trash`). */
  keep: Record<string, string | undefined>;
  /** Posts only: the categories to filter by. */
  categories?: { id: number; name: string; language: string }[];
}) {
  const filtered = !!(query.q || query.status || query.category);
  const clearHref = (() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  })();

  return (
    <form action={basePath} method="get" className="mb-4 flex flex-wrap items-center gap-2">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          name="q"
          defaultValue={query.q}
          placeholder="Search titles and URLs…"
          aria-label="Search"
          className="input w-64 py-1.5 pl-8 text-sm"
        />
      </div>
      <select name="status" defaultValue={query.status} aria-label="Status" className="input w-auto py-1.5 text-sm">
        {STATUS_FILTERS.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
      {categories && categories.length > 0 && (
        <select name="category" defaultValue={query.category} aria-label="Category" className="input w-auto max-w-[14rem] py-1.5 text-sm">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
              {categories.some((o) => o.language !== c.language) ? ` (${c.language})` : ""}
            </option>
          ))}
        </select>
      )}
      <button type="submit" className="btn-secondary py-1.5 text-sm">Filter</button>
      {filtered && (
        <Link href={clearHref} className="text-xs font-medium text-slate-500 hover:text-slate-800">
          Clear
        </Link>
      )}
    </form>
  );
}

export function ListPager({
  basePath,
  query,
  keep,
  page,
  totalPages,
  total,
}: {
  basePath: string;
  query: ListQuery;
  keep: Record<string, string | undefined>;
  page: number;
  totalPages: number;
  total: number;
}) {
  if (totalPages <= 1) return null;
  const href = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v) p.set(k, v);
    if (query.q) p.set("q", query.q);
    if (query.status) p.set("status", query.status);
    if (query.category) p.set("category", query.category);
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const link = "rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900";
  return (
    <nav className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500" aria-label="Pages">
      <span>
        Page {page} of {totalPages} · {total} rows
      </span>
      <div className="flex gap-2">
        {page > 1 && <Link href={href(page - 1)} className={link}>← Previous</Link>}
        {page < totalPages && <Link href={href(page + 1)} className={link}>Next →</Link>}
      </div>
    </nav>
  );
}
