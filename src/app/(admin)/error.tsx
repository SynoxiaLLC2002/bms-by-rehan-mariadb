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
import { useEffect } from "react";

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
  useEffect(() => {
    // A chunk that no longer exists means the site was updated while this tab
    // was open: the browser is asking for last version's files. Reloading once
    // gets the new ones; the flag stops a genuinely broken chunk from looping.
    if (isStaleChunkError(error)) {
      try {
        const key = "bms:chunk-reload";
        if (sessionStorage.getItem(key) !== window.location.pathname) {
          sessionStorage.setItem(key, window.location.pathname);
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
      <h1 className="mb-3 text-3xl font-bold">Something went wrong</h1>
      <p className="mb-8 opacity-60">
        This page failed to load. Trying again often fixes it — if it doesn&apos;t, the problem is on our side.
      </p>

      <div className="flex items-center justify-center gap-4 text-sm">
        <button type="button" onClick={reset} className="btn">
          Try again
        </button>
        <Link href="/" className="opacity-70 transition-opacity hover:opacity-100">
          Go home →
        </Link>
      </div>

      {error.digest && (
        <p className="mt-10 font-mono text-[11px] opacity-30">Reference: {error.digest}</p>
      )}
    </div>
  );
}
