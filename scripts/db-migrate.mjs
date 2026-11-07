#!/usr/bin/env node
//
// Applies every migration in ./drizzle that this database has not seen yet.
//
// This exists because `drizzle-kit migrate` could not do it. Drizzle tracks
// migrations through a journal it writes itself (drizzle/meta/_journal.json);
// where the .sql files are hand-written, there is no journal, and the command
// finds nothing to apply — then exits 0. A migration tool that reports success
// while doing nothing is worse than one that fails, because the deploy goes
// green and the schema silently stays behind until a page 500s on a column
// that was never added.
//
// The rules this runner holds itself to:
//
//   • Each file applies inside a transaction. A statement that fails rolls the
//     whole file back — the alternative is a half-created schema that neither
//     re-runs nor works.
//   • What ran is recorded in `cms_migrations`, so a second run is a no-op and
//     a partial deploy can be resumed.
//   • It says what it did, every time. "Nothing to do" is only ever printed
//     when the files really are all applied.
//   • Any failure exits non-zero, so a deploy that runs this stops.
//
// The work itself lives in apply-migrations.cjs, which server.js also runs at
// startup — so on the host this command is only needed when the automatic run
// reported a failure in startup.log.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { config } from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { applyMigrations } = createRequire(import.meta.url)("./apply-migrations.cjs");

// .env.local wins, matching Next's own order.
config({ path: join(root, ".env.local"), quiet: true });
config({ path: join(root, ".env"), quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "\n  DATABASE_URL is not set.\n\n" +
      "  Copy .env.example to .env.local and put your database URL in it.\n"
  );
  process.exit(1);
}

if (!existsSync(join(root, "drizzle-mysql"))) {
  console.error(`\n  No migrations directory at ${join(root, "drizzle-mysql")}\n`);
  process.exit(1);
}

try {
  const result = await applyMigrations({ root, url, log: (m) => console.log(`  ${m}`) });
  if (result.files === 0) {
    // Not "up to date" — there is nothing to be up to date with, which on a
    // fresh checkout means the download is incomplete.
    console.error("\n  drizzle-mysql/ contains no .sql files. Nothing can be applied.\n");
    process.exit(1);
  }
  if (result.applied.length === 0) {
    console.log(`\n  Database is up to date — all ${result.skipped} migrations already applied.\n`);
  } else {
    console.log(
      `\n  Applied ${result.applied.length} migration${result.applied.length === 1 ? "" : "s"}.` +
        (result.skipped ? ` ${result.skipped} were already in place.` : "") + "\n"
    );
  }
} catch (err) {
  if (err && err.file) {
    console.error(`\n  ${err.message}\n  The database is unchanged by this file.\n`);
  } else {
    console.error(`\n  Could not connect to the database.\n\n  ${err.message}\n`);
    console.error("  Check DATABASE_URL, and that this machine is allowed to reach the host.\n");
  }
  process.exit(1);
}
