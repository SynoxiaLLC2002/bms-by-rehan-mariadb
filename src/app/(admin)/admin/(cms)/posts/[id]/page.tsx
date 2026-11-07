import { db } from "@/lib/db";
import { posts, categories } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Header from "@/components/admin/Header";
import PostEditor from "@/components/admin/PostEditor";
import CanvasTheme from "@/components/admin/CanvasTheme";
import { tagsForPost } from "@/lib/postTags";
import { getSiteSettings, withoutSecrets } from "@/lib/settings";
import { postPath } from "@/lib/permalinks";
import { contentLanguages, languageName } from "@/lib/locale";
import { translationsFor } from "@/lib/translations";
import { canEditDocument, isAdmin } from "@/lib/authz";
import { numericId } from "@/lib/routeParams";
import { auth } from "@/lib/auth";

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const numId = numericId((await params).id);
  if (numId === null) notFound();
  const session = await auth();

  const [post, cats, tags, settings] = await Promise.all([
    db.query.posts.findFirst({ where: eq(posts.id, numId), with: { category: true } }),
    db.query.categories.findMany({ orderBy: [asc(categories.name)] }),
    tagsForPost(numId),
    getSiteSettings(),
  ]);

  // The whole post goes to the browser below, so an author may open only
  // their own — the rule `/api/posts/[id]` applies to the same read.
  if (!post || !canEditDocument(session, post.authorId)) notFound();

  // Resolved server-side: the editor is a client component with no database
  // access and no language table.
  const translations = await translationsFor("post", post, settings);
  // Only this post's language's categories: filing a French post under an
  // English term is what made `/fr/blog` show English category names.
  const categoriesInLanguage = cats.filter((c) => c.language === post.language);
  const languageNames = Object.fromEntries(
    contentLanguages(settings).map((c) => [c, languageName(c)])
  );

  // Resolved here rather than in the editor: the permalink structure is a site
  // setting, and the editor is a client component with no way to read it.

  return (
    <>
      <Header title="Edit Post" />
      <main className="flex-1 p-6">
        <CanvasTheme settings={settings} />
        <PostEditor
          post={post}
          categories={categoriesInLanguage}
          tags={tags.map((t) => t.name)}
          permalink={postPath(post, settings)}
          language={post.language}
          settings={withoutSecrets(settings)}
          languageNames={languageNames}
          translations={translations}
          isAdmin={isAdmin(session)}
        />
      </main>
    </>
  );
}
