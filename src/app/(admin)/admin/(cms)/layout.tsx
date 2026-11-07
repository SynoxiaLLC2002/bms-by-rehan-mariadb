import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import Sidebar from "@/components/admin/Sidebar";
import { getSiteSettings } from "@/lib/settings";
import { adminDir, adminLang } from "@/lib/locale";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Started together, not one after the other. Neither depends on the other,
  // and each is a round trip from a shared host to Neon — running them in
  // series added one of those to *every* admin page load, including every
  // client-side navigation between admin screens, which fetches this layout's
  // payload again.
  //
  // The cost of parallelising is that a signed-out request also reads the
  // settings before being redirected. That read is React-cached and tiny, and
  // signed-out hits on admin pages are rare, so it is a good trade.
  const [session, settings] = await Promise.all([auth(), getSiteSettings()]);

  if (!session?.user?.id) {
    redirect("/admin/login");
  }

  // The root layout renders one `<html>` for the whole application and sets it
  // from the *site's* language — so an Urdu site was turning the CMS
  // right-to-left with it. `lang` and `dir` are valid on any element, so the
  // admin overrides both on its own wrapper and is unaffected by what the
  // public site is set to.

  return (
    <SessionProvider session={session}>
      <div
        lang={adminLang(settings)}
        dir={adminDir(settings)}
        className="flex min-h-screen bg-slate-50"
      >
        <Sidebar role={(session.user as { role?: string }).role} userId={session.user.id} />
        <div className="flex-1 flex flex-col min-w-0">
          {children}
        </div>
      </div>
    </SessionProvider>
  );
}
