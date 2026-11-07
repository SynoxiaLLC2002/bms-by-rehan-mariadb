"use client";

// What a visitor sees when a server render throws.
//
// Without this file Next falls back to its own screen, which in production is
// a bare "Application error: a server-side exception has occurred" on a blank
// white page — no header, no navigation, no way back, and nothing that looks
// like the site they were on. A CMS that other people deploy should fail more
// gracefully than that.
//
// Deliberately does not use `SiteLayout`: the chrome reads settings from the
// database, and a database that is down is one of the likeliest reasons to be
// here in the first place. This renders from nothing but its own markup.

import Link from "next/link";
import { useEffect, useState } from "react";
import { errorText } from "@/lib/notFoundText";

function isStaleChunkError(error: Error): boolean {
  return error.name === "ChunkLoadError" || /Loading (CSS )?chunk [\w-]+ failed/i.test(error.message ?? "");
}

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The document's own language, which the layout put on <html>. This boundary
  // gets no params and cannot read settings, and an English error screen on an
  // Arabic site is the wrong moment to stop speaking someone's language.
  // English until the effect runs — one frame, on a page that already failed.
  const [t, setT] = useState(() => errorText("en"));
  useEffect(() => {
    setT(errorText(document.documentElement.lang || "en"));
  }, []);

  useEffect(() => {
    // A chunk that no longer exists means the site was updated while this tab
    // was open: the browser is asking for last version's files. Reloading
    // gets the new ones. The guard is a time window, not a once-per-session
    // flag: a genuinely broken chunk reloads straight back here within
    // seconds and is stopped, while a *second* update later in the same
    // session reloads again instead of showing the error screen.
    if (isStaleChunkError(error)) {
      try {
        const key = "bms:chunk-reload";
        const last = JSON.parse(sessionStorage.getItem(key) || "null") as { path?: string; at?: number } | null;
        const recent = last?.path === window.location.pathname && Date.now() - (last.at ?? 0) < 60_000;
        if (!recent) {
          sessionStorage.setItem(key, JSON.stringify({ path: window.location.pathname, at: Date.now() }));
          window.location.reload();
          return;
        }
      } catch {
        // No sessionStorage — fall through to the normal error screen.
      }
    }
    // The digest is the only handle on the server-side stack, which Next
    // deliberately withholds from the browser in production.
    console.error("[render error]", error.digest ?? "", error);
    // Tell the server what the browser saw. The server logged its own half
    // under the same digest; together they are one readable entry in
    // Admin -> Errors. Fire-and-forget: a failed report must not matter.
    fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message || String(error),
        stack: error.stack ?? null,
        digest: error.digest ?? null,
        path: typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="mb-4 text-7xl font-bold opacity-50">500</p>
      <h1 className="mb-3 text-3xl font-bold">{t.title}</h1>
      <p className="mb-8 opacity-60">{t.body}</p>

      <div className="flex items-center justify-center gap-4 text-sm">
        <button type="button" onClick={reset} className="btn">
          {t.retry}
        </button>
        <Link href="/" className="opacity-70 transition-opacity hover:opacity-100">
          {t.home} <span aria-hidden>→</span>
        </Link>
      </div>

      {error.digest && (
        <p className="mt-10 font-mono text-[11px] opacity-30">Reference: {error.digest}</p>
      )}
    </div>
  );
}
