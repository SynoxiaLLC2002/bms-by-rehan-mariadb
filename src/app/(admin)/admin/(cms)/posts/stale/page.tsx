import Link from "next/link";
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import { Clock, Pencil, Eye } from "lucide-react";
import Header from "@/components/admin/Header";
import { auth } from "@/lib/auth";
import { isAuthor } from "@/lib/authz";
import { db } from "@/lib/db";
import { posts } from "@/lib/db/schema";
import { postPath } from "@/lib/permalinks";
import { getSiteSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const WINDOWS = [
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "1 year" },
  { months: 24, label: "2 years" },
];

/**
 * Published posts that have not been touched in a while, oldest first.
 *
 * Search engines notice when a page never changes, and app pages go stale in
 * a very literal way — the version in the title stops being the current one.
 * This is the list to work through: open, refresh, save. Authors see only
 * their own, like everywhere else.
 */
export default async function StalePostsPage({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  const { months: raw } = await searchParams;
  const months = WINDOWS.some((w) => String(w.months) === raw) ? Number(raw) : 6;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  // Independent of each other; in series they were two round trips to Neon.
  const [session, settings] = await Promise.all([auth(), getSiteSettings()]);
  const mine = isAuthor(session) ? eq(posts.authorId, session!.user!.id as string) : undefined;

  const rows = await db.query.posts.findMany({
    where: and(eq(posts.status, "published"), isNull(posts.deletedAt), lt(posts.updatedAt, cutoff), mine),
    orderBy: [asc(posts.updatedAt)],
    limit: 200,
    columns: { id: true, title: true, slug: true, language: true, updatedAt: true, publishedAt: true, createdAt: true },
    with: { category: { columns: { name: true } } },
  });

  const age = (d: Date | null) => {
    if (!d) return "—";
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (days < 60) return `${days} days`;
    const m = Math.floor(days / 30);
    return m < 24 ? `${m} months` : `${Math.floor(m / 12)} years`;
  };

  return (
    <>
      <Header title="Stale Content" />
      <main className="flex-1 p-6">
        <div className="max-w-4xl">
          <div className="card mb-4 flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {rows.length === 0 ? `Nothing older than ${months} months` : `${rows.length}${rows.length === 200 ? "+" : ""} post${rows.length === 1 ? "" : "s"} not updated in ${months}+ months`}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Oldest first. Refreshing a post — a newer version, a corrected date, a better paragraph — and saving it
                updates the date search engines see.
              </p>
            </div>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs">
              {WINDOWS.map((w) => (
                <Link
                  key={w.months}
                  href={`/admin/posts/stale?months=${w.months}`}
                  className={`rounded-md px-3 py-1.5 font-medium ${w.months === months ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {w.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="card">
            {rows.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-400">Everything published has been updated within {months} months.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {rows.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                    <Clock size={15} className="shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{p.title}</p>
                      <p className="text-[11px] text-slate-400">
                        Updated {p.updatedAt ? p.updatedAt.toLocaleDateString() : "—"} · {age(p.updatedAt)} ago
                        {p.category?.name ? ` · ${p.category.name}` : ""}
                      </p>
                    </div>
                    <Link href={postPath(p, settings)} target="_blank" className="btn-ghost p-1.5" title="View">
                      <Eye size={14} />
                    </Link>
                    <Link href={`/admin/posts/${p.id}`} className="btn-ghost p-1.5" title="Edit">
                      <Pencil size={14} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
