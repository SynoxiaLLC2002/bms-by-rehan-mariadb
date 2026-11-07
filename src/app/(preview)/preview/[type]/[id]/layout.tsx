import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../../../../site.css";
import { getSiteSettings } from "@/lib/settings";
import { defaultContentLanguage, documentDir } from "@/lib/locale";
import { getPreviewPage, getPreviewPost } from "@/lib/previewDoc";

// Always fresh — this layout reads the document so `<html>` can carry its
// language. A cached shell with yesterday's lang/dir is the bug this group
// exists to prevent.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Root layout for a single post/page preview — its own group so `<html>` can
 * carry the *document's* language and direction.
 *
 * This used to render under `(admin)`, whose root layout sets `<html>` to the
 * admin interface's own language (see `adminLang`/`adminDir`) — correct for
 * the editor chrome, wrong for a preview, whose whole point is to show a
 * visitor what the published page will look like. An Arabic page previewed
 * that way still said `lang="en" dir="ltr"` at the document root, which is
 * exactly the mismatch that makes a browser's translate feature misfire on
 * content it never asked to see translated.
 *
 * Must not throw: this is a root layout. An exception here skips `error.tsx`
 * and lands on `global-error.tsx` ("This site is having trouble") — which is
 * what Preview showed on a live site when the document lookup failed.
 *
 * No `next/font` here: the public site dropped Inter for the same reason —
 * the theme font from SiteLayout is what actually renders.
 */
export default async function PreviewDocLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ type: string; id: string }>;
}) {
  try {
    const { type, id } = await params;
    const numId = parseInt(id);
    const settings = await getSiteSettings();

    let language: string | null = null;
    let direction: string | null = null;
    if (!Number.isNaN(numId)) {
      if (type === "post") {
        const row = await getPreviewPost(numId);
        language = row.doc?.language ?? null;
        direction = row.doc?.direction ?? null;
      } else if (type === "page") {
        const row = await getPreviewPage(numId);
        language = row.doc?.language ?? null;
        direction = row.doc?.direction ?? null;
      }
    }

    const lang = language ?? defaultContentLanguage(settings);
    const dir = documentDir(lang, settings, direction);

    return (
      <html lang={lang} dir={dir}>
        <body>{children}</body>
      </html>
    );
  } catch {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }
}
