// Unsaved editor state, held briefly for the Preview button.
//
// Preview used to open the copy saved in the database, so anything typed
// since the last save was missing — "the preview shows the old text". Saving
// on preview is not an option: Save Draft would unpublish a live post. The
// editor posts its current state here instead, gets a token, and the preview
// page lays that state over the saved row. Nothing is written to the database.
//
// In memory, per process, for 30 minutes: a preview is looked at right away,
// and a shared host runs one process.

import { randomBytes } from "node:crypto";

export interface PreviewDraft {
  kind: "post" | "page";
  id: number;
  userId: string;
  data: Record<string, unknown>;
  expires: number;
  /** Serialized size, measured once on write so eviction need not re-measure. */
  bytes: number;
}

const TTL_MS = 30 * 60 * 1000;
const MAX = 200;

/**
 * Total bytes of draft content held at once, and the most any one author may
 * hold.
 *
 * Counting drafts was not a bound on anything that matters. The API accepts up
 * to 8 MB per draft, so 200 of them is up to 1.6 GB — on a shared host where
 * the app runs under `--max-old-space-size=384`. Any signed-in author could
 * fill that from the editor, and the process would be killed long before the
 * count limit was reached.
 *
 * 32 MB is comfortably more than real previewing needs (a large document is
 * tens of kilobytes; 8 MB is the ceiling for a pathological one) and small
 * enough to be invisible next to the heap limit. The per-author share stops
 * one account evicting everyone else's previews.
 */
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_PER_USER = 10;
// On `globalThis`, not module scope: the API route and the preview page are
// separate bundles, each with its own copy of this module, so a module-level
// Map written by one was invisible to the other.
const g = globalThis as unknown as { __bmsPreviewDrafts?: Map<string, PreviewDraft> };
const store = (g.__bmsPreviewDrafts ??= new Map<string, PreviewDraft>());

function totalBytes(): number {
  let n = 0;
  for (const v of store.values()) n += v.bytes;
  return n;
}

function dropOldest(): boolean {
  const oldest = store.keys().next().value;
  if (oldest === undefined) return false;
  store.delete(oldest);
  return true;
}

function sweep() {
  const now = Date.now();
  for (const [k, v] of store) if (v.expires < now) store.delete(k);
  while (store.size > MAX) if (!dropOldest()) break;
  // Map iteration is insertion-ordered, so the oldest goes first.
  while (totalBytes() > MAX_TOTAL_BYTES) if (!dropOldest()) break;
}

export function putPreviewDraft(draft: Omit<PreviewDraft, "expires" | "bytes">): string {
  sweep();
  // One author's own oldest previews go before anyone else's: a person who
  // keeps hitting Preview should displace their own, not a colleague's.
  const mine = [...store.entries()].filter(([, v]) => v.userId === draft.userId);
  for (let i = 0; i <= mine.length - MAX_PER_USER; i++) store.delete(mine[i][0]);

  let bytes = 0;
  try {
    bytes = JSON.stringify(draft.data).length;
  } catch {
    // Unserialisable data would not survive the round trip anyway; charge it
    // the maximum so it is evicted first.
    bytes = MAX_TOTAL_BYTES;
  }

  const token = randomBytes(12).toString("hex");
  store.set(token, { ...draft, expires: Date.now() + TTL_MS, bytes });
  // Re-check after inserting, so this draft cannot push the store over budget.
  while (totalBytes() > MAX_TOTAL_BYTES && store.size > 1) if (!dropOldest()) break;
  return token;
}

/** The draft for this document and this user, or null. */
export function getPreviewDraft(token: string | undefined, kind: string, id: number, userId: string): Record<string, unknown> | null {
  if (!token || !/^[a-f0-9]{24}$/.test(token)) return null;
  const d = store.get(token);
  if (!d || d.expires < Date.now() || d.kind !== kind || d.id !== id || d.userId !== userId) return null;
  return d.data;
}

/** Only the fields a preview renders; anything else in the request is ignored. */
export const PREVIEW_FIELDS = [
  "title", "content", "excerpt", "featuredImage", "showTitle", "showFeaturedImage",
  "postLayout", "contentStyle", "verticalSpacing", "transparentHeader", "cssClasses",
  "disableHeader", "disableFooter",
] as const;
