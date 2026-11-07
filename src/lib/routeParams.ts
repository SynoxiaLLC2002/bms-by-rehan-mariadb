// Turning a URL segment into a row id.
//
// Routes read `[id]` and handed it straight to `parseInt`, which answers `NaN`
// for anything that is not a number. `NaN` then travelled into the query, where
// Postgres refused it and the catch-all turned the refusal into
// **500 Internal Server Error**.
//
// So `/api/posts/banana` reported that the server was broken, when the correct
// answer is that there is no such post. That matters beyond tidiness: a 500 is
// something a monitor pages someone about, and a crawler retries.

/**
 * A positive integer id, or `null` when the segment is not one.
 *
 * Deliberately strict. `parseInt` accepts "12abc" and "0x1f" and ignores
 * trailing rubbish, so two different URLs could address the same row — which is
 * the same duplicate-address problem the permalink helpers exist to prevent.
 */
export function numericId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
