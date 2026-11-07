"use client";

import { contentLanguages, isContentLanguage, languageName } from "@/lib/locale";

/**
 * Warns when a document sits in a language the site no longer publishes.
 *
 * It happens when Settings → Languages changes after the document was written:
 * a page made while the site was English, on a site that is now Arabic only.
 * Nothing said so — the page opened and saved as normal, was typed
 * left-to-right because it still said English, and would have been a 404 the
 * day it was published, since the site only serves the languages it lists.
 * The offer here is the one move the update route allows: into a language the
 * site does publish.
 */
export default function StrandedLanguageNotice({
  kind,
  language,
  settings,
  onMove,
}: {
  kind: "page" | "post";
  language: string;
  settings: Record<string, string>;
  onMove: (language: string) => void;
}) {
  if (isContentLanguage(language, settings)) return null;
  const target = contentLanguages(settings)[0];
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
      <span>
        This {kind} is in <b>{languageName(language)}</b>, which the site no longer publishes. It will not
        appear on the site, and it is laid out the way {languageName(language)} reads.
      </span>
      <button
        type="button"
        onClick={() => onMove(target)}
        className="font-semibold underline underline-offset-2 hover:no-underline"
      >
        Move it to {languageName(target)}
      </button>
      <span className="text-amber-700/70">— then save.</span>
    </div>
  );
}
