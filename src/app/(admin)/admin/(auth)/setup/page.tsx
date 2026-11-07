import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { databaseUrl } from "@/lib/db/pool";
import { uapiPath } from "@/lib/autoDatabase";
import SetupForm from "./SetupForm";
import DatabaseStep from "./DatabaseStep";

// First-run only. `POST /api/setup` already refuses once an account exists, so
// the hole this closes is not a security one — it is that the page happily
// rendered "Create your admin account" forever, and only told you it was dead
// after you had filled the form in and submitted it.
//
// A Server Component so the check happens before any HTML is sent: the form
// never reaches a browser that cannot use it.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const needsToken = !!(process.env.SETUP_TOKEN ?? "").trim();
  // A brand-new site: first the database (created through cPanel), then the account.
  if (!databaseUrl()) return <DatabaseStep canCreate={!!uapiPath()} needsToken={needsToken} />;

  const [existing, session] = await Promise.all([
    db.select({ id: users.id }).from(users).limit(1),
    auth(),
  ]);

  if (existing.length > 0) {
    // Already signed in, so send them where they were going; otherwise the
    // login screen, which is the only useful door left.
    redirect(session?.user ? "/admin" : "/admin/login");
  }

  return <SetupForm needsToken={needsToken} />;
}
