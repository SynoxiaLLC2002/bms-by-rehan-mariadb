import Header from "@/components/admin/Header";
import LinksPanel from "@/components/admin/LinksPanel";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { lastLinkReport } from "@/lib/linkCheck";
import { notFound } from "next/navigation";
import OrphansPanel from "@/components/admin/OrphansPanel";
import { orphanReport } from "@/lib/orphans";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

/** Dead links in published content, checked from the server on demand. */
export default async function LinksPage() {
  // Started together: the settings are site configuration, not privileged
  // data, so reading them before the guard resolves leaks nothing.
  const [session, settings] = await Promise.all([auth(), getSiteSettings()]);
  if (!isAdmin(session)) notFound();
  return (
    <>
      <Header title="Links" />
      <main className="flex-1 p-6">
        <div className="max-w-4xl space-y-6">
          <OrphansPanel report={await orphanReport(settings, siteUrl(settings))} />
          <LinksPanel initial={lastLinkReport()} />
        </div>
      </main>
    </>
  );
}
