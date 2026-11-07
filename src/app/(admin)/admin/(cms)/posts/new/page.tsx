import Header from "@/components/admin/Header";
import PostEditor from "@/components/admin/PostEditor";
import CanvasTheme from "@/components/admin/CanvasTheme";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { getSiteSettings, withoutSecrets } from "@/lib/settings";
import { resolveContentLanguage } from "@/lib/locale";
import { isAdmin } from "@/lib/authz";
import { auth } from "@/lib/auth";

export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ lang }, cats, settings] = await Promise.all([
    searchParams,
    db.query.categories.findMany({ orderBy: [asc(categories.name)] }),
    getSiteSettings(),
  ]);

  // "New Post" from the Urdu tab makes an Urdu post. Resolved against the
  // configured languages so a stale `?lang=` cannot create content in a
  // language the site does not publish in.
  const language = resolveContentLanguage(lang, settings);

  return (
    <>
      <Header title="New Post" />
      <main className="flex-1 p-6">
        {/* Only this language's categories — a post filed under another
            language's term is what put English names on `/fr/blog`. */}
        <CanvasTheme settings={settings} />
        <PostEditor
          isAdmin={isAdmin(await auth())}
          categories={cats.filter((c) => c.language === language)}
          language={language}
          settings={withoutSecrets(settings)}
        />
      </main>
    </>
  );
}
