/**
 * Optimistic concurrency for document saves — WordPress's post lock, without
 * the lock.
 *
 * Two editor tabs on the same page, or two people, each hold a full copy and
 * each save sends the whole copy. Without a check the later save wins and
 * silently reverts everything the other one did: the case that emptied a
 * homepage's SEO description while it was being filled in elsewhere. The
 * editor sends the `updatedAt` it loaded; if the row has moved on since,
 * the save is refused with a message that says so.
 *
 * Lenient on purpose about what "sent" means: an old client, an import
 * script or a plugin that sends no version keeps working as before.
 */
export function staleSave(expected: unknown, current: Date | null | undefined): { error: string; code: "conflict"; updatedAt: string } | null {
  if (typeof expected !== "string" || !expected || !current) return null;
  const sent = Date.parse(expected);
  if (Number.isNaN(sent)) return null;
  // Compared at second precision: JSON round-trips and database timestamp
  // precision can differ in the milliseconds.
  if (Math.floor(sent / 1000) === Math.floor(current.getTime() / 1000)) return null;
  return {
    error: "This document was changed somewhere else — another tab, another person — after you opened it. Reload to see the latest version; your unsaved changes here would overwrite it.",
    code: "conflict",
    updatedAt: current.toISOString(),
  };
}
