import Header from "@/components/admin/Header";
import HealthPanel from "@/components/admin/HealthPanel";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { runHealthChecks } from "@/lib/siteHealth";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * One screen that answers "is this site set up properly" — the things that
 * fail silently: a Site URL still pointing at localhost, a missing migration,
 * an uploads folder that cannot be written to. Administrators only, because
 * the answers describe the hosting.
 */
export default async function HealthPage() {
  const session = await auth();
  if (!isAdmin(session)) notFound();

  const report = await runHealthChecks();

  return (
    <>
      <Header title="Site Health" />
      <main className="flex-1 p-6">
        <div className="max-w-7xl">
          <HealthPanel report={report} />
        </div>
      </main>
    </>
  );
}
