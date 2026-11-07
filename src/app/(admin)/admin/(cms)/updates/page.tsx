import Header from "@/components/admin/Header";
import UpdatesPanel from "@/components/admin/UpdatesPanel";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { notFound } from "next/navigation";

/**
 * One screen that answers "what am I running, and is there anything newer".
 *
 * Administrators only — it exposes the deployment's update mechanism, and the
 * button on it starts a build.
 */
export default async function UpdatesPage() {
  const session = await auth();
  if (!isAdmin(session)) notFound();

  return (
    <>
      <Header title="Updates" />
      <main className="flex-1 p-6">
        <div className="max-w-2xl">
          <UpdatesPanel />
        </div>
      </main>
    </>
  );
}
