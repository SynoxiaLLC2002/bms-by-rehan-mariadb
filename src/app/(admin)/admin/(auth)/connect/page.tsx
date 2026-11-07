import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sessionAuth } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { checkAuthorize, isClaudeRedirect, OAuthError } from "@/lib/oauth";
import ConnectForm from "./ConnectForm";

// "Connect Claude" — the Allow screen (lib/oauth.ts). Claude sends the person
// here through /api/oauth/authorize; middleware has already made them sign in
// and brought them back with the query string intact.
//
// Outside the admin layout on purpose, like the login page: it is one
// decision, and the sidebar would only invite clicking away and losing it.
export const dynamic = "force-dynamic";

export default async function ConnectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") q.set(k, v);

  const session = await sessionAuth();
  if (!session?.user?.id) redirect(`/admin/login?next=${encodeURIComponent(`/admin/connect?${q}`)}`);

  let problem = "";
  let ar: ReturnType<typeof checkAuthorize> | null = null;
  try {
    ar = checkAuthorize(q);
  } catch (e) {
    if (!(e instanceof OAuthError)) throw e;
    problem = e.message;
  }

  const [me, settings] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, session.user.id), columns: { name: true, email: true, role: true } }),
    getSiteSettings(),
  ]);
  if (!me) redirect("/admin/login");

  let siteHost = "";
  try {
    siteHost = new URL(String(settings.site_url || process.env.NEXTAUTH_URL || "")).host;
  } catch {
    // Name only.
  }

  return (
    <ConnectForm
      query={q.toString()}
      problem={problem}
      appName={ar?.client.name ?? ""}
      returnHost={ar ? new URL(ar.redirectUri).host : ""}
      isClaude={ar ? isClaudeRedirect(ar.redirectUri) : false}
      siteName={String(settings.site_name || siteHost || "this site")}
      userName={me.name || me.email}
      userRole={me.role}
    />
  );
}
