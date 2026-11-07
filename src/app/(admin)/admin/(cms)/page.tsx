import { db } from "@/lib/db";
import { after } from "next/server";
import { cleanupIfDue } from "@/lib/maintenance";
import { posts, pages, categories, media } from "@/lib/db/schema";
import { and, eq, count, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isAuthor } from "@/lib/authz";
import Header from "@/components/admin/Header";
import Link from "next/link";
import { FileText, File, Tag, Image, Plus } from "lucide-react";
import PurgeCacheButton from "@/components/admin/PurgeCacheButton";

async function getStats() {
  // Fired together, not one after another — each Neon round trip costs ~140ms,
  // so sequential counts made the dashboard wait ~700ms for nothing.
  const [[postCount], [pageCount], [categoryCount], [mediaCount], [publishedCount]] =
    await Promise.all([
      // The trash is not content; the Posts and Pages screens leave it out too.
      db.select({ count: count() }).from(posts).where(isNull(posts.deletedAt)),
      db.select({ count: count() }).from(pages).where(isNull(pages.deletedAt)),
      db.select({ count: count() }).from(categories),
      db.select({ count: count() }).from(media),
      db.select({ count: count() }).from(posts).where(and(eq(posts.status, "published"), isNull(posts.deletedAt))),
    ]);

  return {
    posts: postCount.count,
    pages: pageCount.count,
    categories: categoryCount.count,
    media: mediaCount.count,
    published: publishedCount.count,
  };
}

/** An author's own posts only — the Posts screen's rule, so no one else's draft titles. */
async function getRecentPosts(authorId: string | null) {
  return db.query.posts.findMany({
    where: authorId ? and(isNull(posts.deletedAt), eq(posts.authorId, authorId)) : isNull(posts.deletedAt),
    orderBy: (posts, { desc }) => [desc(posts.createdAt)],
    limit: 5,
    with: { category: true },
    // Five rows, but five whole post bodies — the dashboard shows a title and
    // a status.
    columns: { id: true, title: true, slug: true, status: true, createdAt: true },
  });
}

export default async function DashboardPage() {
  // The daily clean-up (old trash, logs, sessions, excess revisions) used to
  // run only from the publish cron — on a site whose cron is not set up, it
  // never ran at all. Opening the dashboard runs it too, after the page has
  // been sent, and only when a day has passed since the last run.
  after(() => cleanupIfDue().catch(() => null));
  const session = await auth();
  const onlyMine = isAuthor(session) ? session?.user?.id ?? null : null;
  const [stats, recentPosts] = await Promise.all([getStats(), getRecentPosts(onlyMine)]);

  const statCards = [
    { label: "Total Posts", value: stats.posts, icon: FileText, href: "/admin/posts", color: "bg-blue-50 text-blue-600" },
    { label: "Published", value: stats.published, icon: FileText, href: "/admin/posts?status=published", color: "bg-green-50 text-green-600" },
    { label: "Pages", value: stats.pages, icon: File, href: "/admin/pages", color: "bg-purple-50 text-purple-600" },
    { label: "Media Files", value: stats.media, icon: Image, href: "/admin/media", color: "bg-orange-50 text-orange-600" },
  ];

  return (
    <>
      <Header title="Dashboard" />
      <main className="flex-1 p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((stat) => (
            <Link key={stat.label} href={stat.href} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${stat.color}`}>
                  <stat.icon size={18} />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
              <div className="text-sm text-slate-500 mt-0.5">{stat.label}</div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 text-sm">Recent Posts</h2>
              <Link href="/admin/posts/new" className="btn-primary py-1.5 text-xs">
                <Plus size={14} />
                New Post
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {recentPosts.length === 0 && (
                <div className="px-5 py-8 text-center text-slate-400 text-sm">No posts yet</div>
              )}
              {recentPosts.map((post) => (
                <div key={post.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <Link href={`/admin/posts/${post.id}`} className="text-sm font-medium text-slate-800 hover:text-brand-600">
                      {post.title}
                    </Link>
                    {post.category && (
                      <span className="text-xs text-slate-400 ml-2">{post.category.name}</span>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    post.status === "published"
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-600"
                  }`}>
                    {post.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900 text-sm">Quick Actions</h2>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              {[
                { label: "New Post", href: "/admin/posts/new", icon: FileText },
                { label: "New Page", href: "/admin/pages/new", icon: File },
                { label: "New Category", href: "/admin/categories", icon: Tag },
                { label: "Upload Media", href: "/admin/media", icon: Image },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors text-sm font-medium text-slate-700 hover:text-brand-700"
                >
                  <action.icon size={16} />
                  {action.label}
                </Link>
              ))}
              <PurgeCacheButton />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
