import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Header from "@/components/admin/Header";
import UserEditor from "@/components/admin/UserEditor";
import { getSiteSettings } from "@/lib/settings";
import { authorPath } from "@/lib/permalinks";
import { contentLanguages, defaultContentLanguage, languageName } from "@/lib/locale";
import { auth } from "@/lib/auth";
import { canManageUser, isAdmin } from "@/lib/authz";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  // Yourself, or an administrator — the rule `/api/users/[id]` applies. This
  // page reads the row directly and hands it to the browser, so without the
  // check an editor could read any account here, the admin's included.
  if (!canManageUser(session, id)) notFound();
  const [user, settings] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, id),
      columns: {
        id: true, name: true, email: true, role: true,
        totpEnabled: true, lastLogin: true, createdAt: true,
        // The public profile. Explicitly *not* `password` or `totpSecret` —
        // this object is serialised into the client component below, so every
        // column named here is a column the browser receives.
        slug: true, image: true, bio: true, website: true,
        twitter: true, linkedin: true, facebook: true, instagram: true,
        github: true, youtube: true,
        seoTitle: true, seoDescription: true, canonicalUrl: true, ogImage: true,
        noIndex: true, publicProfile: true, direction: true, language: true,
        pageLayout: true, contentStyle: true, verticalSpacing: true,
        cssClasses: true, customCss: true, scriptHead: true, scriptBodyEnd: true,
        transparentHeader: true, disableHeader: true, disableFooter: true,
      },
    }),
    getSiteSettings(),
  ]);

  if (!user) notFound();

  return (
    <>
      <Header title="Edit User" />
      <main className="flex-1 p-6">
        <UserEditor
          user={user}
          isAdmin={isAdmin(session)}
          isSelf={session?.user?.id === user.id}
          authorUrl={
            user.slug
              ? authorPath(user.slug, defaultContentLanguage(settings), settings)
              : undefined
          }
          languages={contentLanguages(settings).map((code) => ({ code, name: languageName(code) }))}
        />
      </main>
    </>
  );
}
