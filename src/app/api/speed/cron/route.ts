import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { cronJobs, installedJobs, installJobs } from "@/lib/cronSetup";

const noStore = { headers: { "Cache-Control": "no-store" } };

async function origin(): Promise<string | null> {
  const url = siteUrl(await getSiteSettings());
  // A localhost address would put a cron on the host that calls nothing.
  return /^https?:\/\/(localhost|127\.)/i.test(url) ? null : url.replace(/\/+$/, "");
}

/** The lines this site needs, and whether they are already in the account's crontab. */
export async function GET() {
  if (!isAdmin(await auth())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const o = await origin();
  if (!o) return NextResponse.json({ jobs: [], missing: [], installed: [], supported: false, reason: "Set the Site URL in Settings first — the cron jobs call the site by its public address." }, noStore);
  const { jobs, missing } = cronJobs(o);
  try {
    return NextResponse.json({ jobs, missing, installed: await installedJobs(o), supported: true }, noStore);
  } catch (e) {
    return NextResponse.json({ jobs, missing, installed: [], supported: false, reason: (e as Error).message }, noStore);
  }
}

/** Write (or rewrite) this site's cron jobs into the account's crontab. */
export async function POST() {
  if (!isAdmin(await auth())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const o = await origin();
  if (!o) return NextResponse.json({ error: "Set the Site URL in Settings first." }, { status: 400 });
  try {
    return NextResponse.json({ installed: await installJobs(o) }, noStore);
  } catch (e) {
    return NextResponse.json({ error: `Could not set up the cron jobs automatically: ${(e as Error).message}. Copy the lines below into cPanel → Cron Jobs instead.` }, { status: 500 });
  }
}
