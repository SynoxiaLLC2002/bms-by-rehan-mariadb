// Search, filters and pages for the Posts and Pages lists.
//
// Both lists group every language's version of a document into one row (see
// DocumentRows), so filtering happens on those groups, after grouping —
// filtering the documents first would report every other language as
// "missing". The rows are title-and-status only (no body), so building the
// groups for a few thousand documents is cheap; what did not scale was
// *rendering* every one of them in a single table, which is what paging fixes.

import type { DocGroup } from "@/components/admin/DocumentRows";

export const ADMIN_PAGE_SIZE = 50;

export interface ListQuery {
  q: string;
  status: string;
  category: string;
  page: number;
}

/** `?q=a&q=b` arrives as an array; the first value is the one that counts. */
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function readListQuery(sp: Record<string, string | string[] | undefined>): ListQuery {
  return {
    q: one(sp.q).trim().slice(0, 200),
    status: one(sp.status),
    category: one(sp.category),
    page: Math.max(1, parseInt(one(sp.page), 10) || 1),
  };
}

/** Status values a list can be filtered to — "scheduled" is published with a future date. */
export const STATUS_FILTERS = [
  { id: "", label: "All statuses" },
  { id: "published", label: "Published" },
  { id: "scheduled", label: "Scheduled" },
  { id: "draft", label: "Draft" },
] as const;

/**
 * The groups that match, and the slice for this page.
 *
 * A group matches when any of its versions does, and the first version that
 * matches then leads the row. Matching on the leading version only hid a
 * French draft under "Draft" whenever its English version was published —
 * and bulk actions act on the leading version, so "Publish" on that filtered
 * list changed the English one. Leading with the match keeps what the row
 * shows, what the filter asked for and what a bulk action touches the same.
 */
export function filterAndPage(groups: DocGroup[], query: ListQuery) {
  const needle = query.q.toLocaleLowerCase();
  const now = Date.now();
  const fits = (v: DocGroup["primary"]) => {
    if (needle && !`${v.title}\n${v.path}`.toLocaleLowerCase().includes(needle)) return false;
    if (query.status) {
      const scheduled = v.status === "published" && (v.publishAt ?? 0) > now;
      if (query.status === "scheduled" ? !scheduled : query.status === "published" ? v.status !== "published" || scheduled : v.status !== query.status) {
        return false;
      }
    }
    if (query.category && String(v.categoryId ?? "") !== query.category) return false;
    return true;
  };
  const matched: DocGroup[] = [];
  for (const g of groups) {
    if (fits(g.primary)) {
      matched.push(g);
      continue;
    }
    const hit = g.versions.find(fits);
    if (hit) matched.push({ ...g, primary: hit });
  }
  const totalPages = Math.max(1, Math.ceil(matched.length / ADMIN_PAGE_SIZE));
  const page = Math.min(query.page, totalPages);
  return {
    rows: matched.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE),
    total: matched.length,
    page,
    totalPages,
  };
}

/** Newest first by real timestamp. Sorting the formatted date text ordered rows by month name. */
export function sortGroupsNewestFirst(groups: DocGroup[]) {
  groups.sort((a, b) => (b.primary.sortAt ?? 0) - (a.primary.sortAt ?? 0));
}
