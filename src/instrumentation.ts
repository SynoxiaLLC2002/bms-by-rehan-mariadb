// Next's server-side error hook.
//
// `onRequestError` is called for every uncaught error in a render, a route
// handler or middleware, with the request it happened on. It is the one place
// that sees server errors on hosts where the server log is out of reach.

import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // Not for expected control flow: a `notFound()` or `redirect()` throws
  // internally and never reaches here, but be safe about anything with a
  // digest that says so.
  const e = err as { message?: string; stack?: string; digest?: string };
  if (typeof e?.digest === "string" && /^(NEXT_NOT_FOUND|NEXT_REDIRECT)/.test(e.digest)) return;

  // Node only. The database driver cannot load in the Edge runtime, and the
  // dev bundler compiles this file for Edge as well — the check is replaced at
  // compile time, so the Edge copy never contains the import at all.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("@/lib/errorLog");
  await recordError({
    source: context.routerKind === "App Router" && context.routeType === "route" ? "route" : context.routeType === "middleware" ? "middleware" : "render",
    path: request.path,
    method: request.method,
    message: e?.message || String(err),
    stack: e?.stack ?? null,
    digest: e?.digest ?? null,
    userAgent: typeof request.headers?.["user-agent"] === "string" ? request.headers["user-agent"] : null,
  });
};
