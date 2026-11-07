import Header from "@/components/admin/Header";
import PageEditor from "@/components/admin/PageEditor";
import CanvasTheme from "@/components/admin/CanvasTheme";
import { getSiteSettings, withoutSecrets } from "@/lib/settings";
import { resolveContentLanguage } from "@/lib/locale";
import { isAdmin } from "@/lib/authz";
import { auth } from "@/lib/auth";

export default async function NewPagePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ lang }, settings] = await Promise.all([searchParams, getSiteSettings()]);

  // "New Page" from the French tab makes a French page — blank, in draft, with
  // nothing carried over from any other language.
  const language = resolveContentLanguage(lang, settings);

  return (
    <>
      <Header title="New Page" />
      <main className="flex-1 p-6">
        <CanvasTheme settings={settings} />
        <PageEditor language={language} settings={withoutSecrets(settings)} isAdmin={isAdmin(await auth())} />
      </main>
    </>
  );
}
