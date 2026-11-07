import Header from "@/components/admin/Header";
import PluginsPanel from "@/components/admin/PluginsPanel";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { listPlugins } from "@/lib/plugins";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/** Install, switch on and off, configure and remove plugins. Administrators only. */
export default async function PluginsPage() {
  const session = await auth();
  if (!isAdmin(session)) notFound();
  return (
    <>
      <Header title="Plugins" />
      <main className="flex-1 p-6">
        <div className="max-w-4xl">
          <PluginsPanel initial={await listPlugins()} />
        </div>
      </main>
    </>
  );
}
