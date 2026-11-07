"use client";

import { useEffect } from "react";

/**
 * Preview is its own root layout. Without this file a throw in the page
 * climbed to `global-error.tsx`, which reads as "the whole site is down"
 * rather than "this preview failed".
 */
export default function PreviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[preview error]", error.digest ?? "", error);
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
    // `dir="ltr"` because this screen's text is English while the document
    // around it is not: the preview layout sets `dir` from the post, so on an
    // Arabic post the browser laid this out right-to-left and moved the full
    // stops to the wrong end — ".Trying again often works". The sentence is
    // chrome for the author, not content, so it states its own direction.
    <div dir="ltr" className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="mb-4 text-7xl font-bold opacity-50">500</p>
      <h1 className="mb-3 text-3xl font-bold">This preview could not load</h1>
      <p className="mb-8 opacity-60">
        The live site is separate — this tab is only the unpublished preview. Trying again often works.
      </p>
      <button type="button" onClick={reset} className="btn">
        Try again
      </button>
      {(error.message || error.digest) && (
        <p className="mt-10 font-mono text-[11px] opacity-40 break-all">
          {error.message}
          {error.digest ? ` · ${error.digest}` : ""}
        </p>
      )}
    </div>
  );
}
