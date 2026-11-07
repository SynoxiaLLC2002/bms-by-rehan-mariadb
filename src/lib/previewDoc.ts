// One document read for a preview request, shared by the root layout and the page.
//
// The preview route group is its own root layout so `<html lang>` can follow
// the document. That layout used to query language/direction on its own, and
// the page then queried the same row again with relations. The two ran at the
// same time. On a shared host the pool is five connections (lib/db); a timeout
// in the *root* layout is uncatchable by `error.tsx` and surfaces as
// `global-error.tsx` — the "This site is having trouble" screen. One cached
// read, guarded, is both cheaper and safe.
//
// A thrown query is not the same as "no such document". The page used to call
// `notFound()` for both, and this route group has no `not-found.tsx`, so a
// timed-out lookup looked like a 500. `failed` lets the page retry instead.

import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pages, posts } from "@/lib/db/schema";

export type PreviewLookup<T> = { doc: T | null; failed: boolean };

export const getPreviewPost = cache(async (id: number) => {
  try {
    const doc =
      (await db.query.posts.findFirst({
        where: eq(posts.id, id),
        with: { category: true, author: true },
      })) ?? null;
    return { doc, failed: false } satisfies PreviewLookup<typeof doc>;
  } catch (err) {
    console.error("[previewDoc post]", err);
    return { doc: null, failed: true };
  }
});

export const getPreviewPage = cache(async (id: number) => {
  try {
    const doc = (await db.query.pages.findFirst({ where: eq(pages.id, id) })) ?? null;
    return { doc, failed: false } satisfies PreviewLookup<typeof doc>;
  } catch (err) {
    console.error("[previewDoc page]", err);
    return { doc: null, failed: true };
  }
});
