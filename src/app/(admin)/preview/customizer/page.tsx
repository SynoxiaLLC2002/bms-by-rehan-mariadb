import { db } from "@/lib/db";
import { posts } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import SiteLayout from "@/components/frontend/SiteLayout";
import SearchResults, { type SearchPost } from "@/components/frontend/SearchResults";
import { getSiteSettings } from "@/lib/settings";
import { postPath } from "@/lib/permalinks";
import { defaultContentLanguage } from "@/lib/locale";

// Always fresh, and never statically generated — this route pre-renders every
// builder item so the Customizer can show layout changes without publishing.
// It lives on its own route precisely so the public pages stay static.
export const dynamic = "force-dynamic";

export default async function CustomizerPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");

  const { view } = await searchParams;

  const [recent, settings] = await Promise.all([
    db.query.posts.findMany({
      where: eq(posts.status, "published"),
      orderBy: [desc(posts.publishedAt), desc(posts.id)],
      limit: 5,
      // The card fields, which is all this preview draws — and all `SearchPost`
      // needs. Without a list it fetched five whole posts, `content` JSON and
      // all, every time the customizer iframe reloaded.
      columns: { id: true, title: true, slug: true, excerpt: true, featuredImage: true, publishedAt: true, createdAt: true, language: true },
    }),
    getSiteSettings(),
  ]);

  if (view === "search") {
    // Fall back to sample cards so the layout controls are visible on a site
    // that has no published posts yet.
    const sample: SearchPost[] = recent.length
      ? (recent as unknown as SearchPost[])
      : Array.from({ length: 6 }, (_, i) => ({
          id: -(i + 1),
          title: `Example result ${i + 1}`,
          slug: "#",
          excerpt: "A short preview of the post content appears here so you can judge spacing and type.",
          featuredImage: null,
          publishedAt: null,
          createdAt: null,
          // Sample cards are placeholders with slug "#"; the default language
          // keeps their hrefs unprefixed, matching what they stand in for.
          language: defaultContentLanguage(settings),
          category: { name: "Category", slug: "#" },
        }));

    return (
      <SiteLayout customizerMode language={defaultContentLanguage(settings)}>
        <SearchResults query="example" posts={sample} settings={settings} language={defaultContentLanguage(settings)} />
      </SiteLayout>
    );
  }

  return (
    <SiteLayout customizerMode language={defaultContentLanguage(settings)}>
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-3">Welcome</h1>
        <p className="opacity-70 mb-10">
          This is a preview of your site chrome. Header and footer changes appear here as you edit.
        </p>

        {recent.length === 0 ? (
          <p className="opacity-60">No posts published yet.</p>
        ) : (
          <div className="space-y-6">
            {recent.map((p) => (
              <article key={p.id} className="border-b border-black/10 pb-5">
                <h2 className="text-xl font-semibold mb-1">
                  <Link href={postPath(p, settings)} className="hover:opacity-70 transition-opacity">{p.title}</Link>
                </h2>
                {p.publishedAt && <p className="text-sm opacity-60">{formatDate(p.publishedAt)}</p>}
              </article>
            ))}
          </div>
        )}
      </div>
    </SiteLayout>
  );
}
