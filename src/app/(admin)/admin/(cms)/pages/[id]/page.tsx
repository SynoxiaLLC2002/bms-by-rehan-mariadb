import { db } from "@/lib/db";
import { pages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Header from "@/components/admin/Header";
import PageEditor from "@/components/admin/PageEditor";
import CanvasTheme from "@/components/admin/CanvasTheme";
import { getSiteSettings, withoutSecrets } from "@/lib/settings";
import { contentLanguages, languageName } from "@/lib/locale";
import { translationsFor } from "@/lib/translations";
import { isAdmin } from "@/lib/authz";
import { numericId } from "@/lib/routeParams";
import { auth } from "@/lib/auth";

export default async function EditPagePage({ params }: { params: Promise<{ id: string }> }) {
  const numId = numericId((await params).id);
  if (numId === null) notFound();
  const [page, settings] = await Promise.all([
    db.query.pages.findFirst({ where: eq(pages.id, numId) }),
    getSiteSettings(),
  ]);
  if (!page) notFound();

  // Resolved here rather than in the editor: the editor is a client component
  // and cannot reach the database or the language table.
  const translations = await translationsFor("page", page, settings);
  const languageNames = Object.fromEntries(
    contentLanguages(settings).map((c) => [c, languageName(c)])
  );

  return (
    <>
      <Header title="Edit Page" />
      <main className="flex-1 p-6">
        <CanvasTheme settings={settings} />
        <PageEditor
          page={page}
          language={page.language}
          settings={withoutSecrets(settings)}
          languageNames={languageNames}
          translations={translations}
          isAdmin={isAdmin(await auth())}
        />
      </main>
    </>
  );
}
