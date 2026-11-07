// Writing to the error log, from anywhere.
//
// Deliberately minimal and deliberately silent: the one thing an error logger
// must never do is throw. It uses the raw query helper rather than Drizzle so
// it can be called from instrumentation (which runs before the app's modules
// are loaded) as well as from routes.

import { rawQuery } from "@/lib/db/raw";

export interface ErrorRecord {
  source: "render" | "route" | "middleware" | "client" | "server";
  path?: string | null;
  method?: string | null;
  message: string;
  stack?: string | null;
  digest?: string | null;
  userAgent?: string | null;
}

const RECENT = new Map<string, number>();

export async function recordError(e: ErrorRecord): Promise<void> {
  try {
    // The same error from the same path within a minute is logged once. A
    // broken page hit by a crawler would otherwise write hundreds of rows.
    const key = `${e.source}|${e.path ?? ""}|${e.message.slice(0, 120)}`;
    const now = Date.now();
    const last = RECENT.get(key);
    if (last && now - last < 60_000) return;
    RECENT.set(key, now);
    if (RECENT.size > 500) RECENT.clear();

    await rawQuery(
      `INSERT INTO error_log (source, path, method, message, stack, digest, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        e.source,
        (e.path ?? "").slice(0, 2000) || null,
        (e.method ?? "").slice(0, 10) || null,
        e.message.slice(0, 4000),
        (e.stack ?? "").slice(0, 12000) || null,
        (e.digest ?? "").slice(0, 64) || null,
        (e.userAgent ?? "").slice(0, 500) || null,
      ]
    );
  } catch {
    // Nothing: a logger that fails must fail quietly.
  }
}
