import { NextRequest, NextResponse } from "next/server";
import { createSiteDatabase, saveSiteFile, uapiPath } from "@/lib/autoDatabase";
import { secretMatches } from "@/lib/secretCompare";
import { rawQuery } from "@/lib/db/raw";
import { closePool, databaseUrl } from "@/lib/db/pool";

// First-run only: creates the site's database through cPanel (lib/autoDatabase)
// and builds its tables. Refuses for good once a database is configured, so it
// cannot be used to make a second one later. Same SETUP_TOKEN rule as /api/setup.
export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __bmsMigrate?: () => Promise<boolean>; __bmsDbCreating?: Promise<string> };

export async function POST(req: NextRequest) {
  if (databaseUrl()) {
    return NextResponse.json({ error: "This site already has a database." }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const setupToken = (process.env.SETUP_TOKEN ?? "").trim();
  if (setupToken && !secretMatches(setupToken, String(body.setupToken ?? "").trim(), 1)) {
    return NextResponse.json({ error: "That setup token is not the one this site was installed with." }, { status: 403 });
  }
  if (!uapiPath()) {
    return NextResponse.json({ error: "This server has no cPanel command line, so the database has to be created by hand." }, { status: 501 });
  }

  const appRoot = process.env.BMS_APP_ROOT || process.cwd();
  try {
    // A double click waits for the first attempt instead of making two databases.
    g.__bmsDbCreating ??= createSiteDatabase(appRoot).finally(() => (g.__bmsDbCreating = undefined));
    const url = await g.__bmsDbCreating;
    saveSiteFile(appRoot, { DATABASE_URL: url });
    process.env.DATABASE_URL = url;
    await closePool(); // a pool made before the address existed must not be reused

    // server.js builds the tables (the same migrations it runs at every start).
    if (!g.__bmsMigrate || !(await g.__bmsMigrate())) {
      return NextResponse.json({ error: "The database was created, but its tables were not. Restart the app in cPanel → Setup Node.js App, then reload this page." }, { status: 500 });
    }
    await rawQuery("SELECT 1 FROM users LIMIT 1");
    return NextResponse.json({ ok: true, database: new URL(url).pathname.slice(1) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
