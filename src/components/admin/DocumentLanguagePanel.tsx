"use client";

import { Globe } from "lucide-react";
import { contentLanguages, isContentLanguage, languageDir, languageName, siteDir, defaultContentLanguage } from "@/lib/locale";
import type { SiteSettings } from "@/lib/settings";

// Language and writing direction of one document, in the Page / Post tab.
//
// Both used to be decided elsewhere and only shown here: the language was
// fixed at creation and the direction followed it. That left a page created
// as English on a site that had since become Arabic with no way out except a
// banner, and no way at all to write one document against the grain of its
// language. The two controls below are that way out. A language move is a
// real move — the update route re-checks the slug, redirects the old address
// and re-syncs tags in the new language — so it is saved with the document,
// not applied on change.

const DIRECTIONS: { value: string; label: string; hint: string }[] = [
  { value: "", label: "Automatic", hint: "Follows the language" },
  { value: "ltr", label: "Left to right", hint: "English, Urdu in Roman script" },
  { value: "rtl", label: "Right to left", hint: "Arabic, Urdu, Hebrew, Persian" },
];

export default function DocumentLanguagePanel({
  kind,
  language,
  direction,
  settings,
  onLanguage,
  onDirection,
}: {
  kind: "page" | "post" | "category";
  language: string;
  /** "ltr", "rtl", or "" / null for automatic. */
  direction: string | null | undefined;
  settings: SiteSettings;
  onLanguage: (code: string) => void;
  onDirection: (value: string) => void;
}) {
  const published = contentLanguages(settings);
  const stranded = !isContentLanguage(language, settings);
  // The current language stays in the list even when the site no longer
  // publishes it, so the select shows the truth rather than the first option.
  const options = stranded ? [language, ...published] : published;
  const automatic =
    language === defaultContentLanguage(settings) ? siteDir(settings) : languageDir(language);

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Language</label>
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-slate-400 shrink-0" />
          <select className="input flex-1" value={language} onChange={(e) => onLanguage(e.target.value)}>
            {options.map((code) => (
              <option key={code} value={code}>
                {languageName(code)} ({code}){!isContentLanguage(code, settings) ? " — not published" : ""}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          {stranded ? (
            <>
              The site no longer publishes {languageName(language)}, so this {kind} has no public address until
              it moves. Pick a language above, then save.
            </>
          ) : (
            <>
              {kind === "category" ? (
                <>
                  Decides the archive&apos;s address, which language&apos;s posts can be filed here and the{" "}
                  <code>lang</code> readers and search engines see. Moving it refiles its posts under the old
                  language&apos;s Uncategorized and detaches its parent and children.
                </>
              ) : (
                <>
                  Decides the address, which listings the {kind} appears in and the <code>lang</code> readers and search
                  engines see. Moving it re-checks the slug in the new language and redirects the old address.
                </>
              )}
            </>
          )}
        </p>
      </div>

      <div>
        <label className="label">Text Direction</label>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
          {DIRECTIONS.map((d) => {
            const active = (direction || "") === d.value;
            return (
              <button
                key={d.value}
                type="button"
                title={d.hint}
                onClick={() => onDirection(d.value)}
                className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                  active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {d.label}
                {d.value === "" && <span className="ml-1 font-normal uppercase text-slate-400">{automatic}</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          Automatic follows the language — and Settings → Text Direction for the site&apos;s default language.
          Set it here only when this {kind} is written the other way.
        </p>
      </div>
    </div>
  );
}
