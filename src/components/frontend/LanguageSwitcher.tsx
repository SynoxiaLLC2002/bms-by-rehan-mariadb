import Link from "next/link";
import { Globe } from "lucide-react";
import { languageName } from "@/lib/locale";

export interface SwitcherTarget {
  language: string;
  /** Where this language's version of the current document lives. */
  path: string;
}

/**
 * Lets a reader move between languages without losing their place.
 *
 * Every entry is a real destination. A language whose version of this document
 * does not exist is either dropped or sent to that language's root, never
 * linked to a URL built by guesswork — offering a language and then 404ing is
 * worse than not offering it, and it is what naive switchers do when they
 * simply prefix the current path.
 *
 * Rendered as plain links rather than a `<select>`: they are crawlable, they
 * work without JavaScript, and they sit inside `hreflang`'s story rather than
 * beside it.
 */
export default function LanguageSwitcher({
  current,
  targets,
  showLabel = true,
  label,
}: {
  current: string;
  targets: SwitcherTarget[];
  /** The landmark's name, in the page's language. */
  label: string;
  /** Off in tight header zones, where the code alone is enough. */
  showLabel?: boolean;
}) {
  // Nothing to switch to is not an empty menu — it is no menu.
  if (targets.length === 0) return null;

  // "English (United States)" is the admin's name for it, where en and en-GB
  // must be told apart; a header needs "English". The region stays only when
  // two variants of one language are both on offer.
  const shown = [current, ...targets.map((t) => t.language)];
  const base = (code: string) => code.split("-")[0].toLowerCase();
  const name = (code: string) => {
    const full = languageName(code);
    const twins = shown.filter((c) => base(c) === base(code)).length > 1;
    return twins ? full : full.replace(/\s*\([^)]*\)\s*$/, "");
  };

  return (
    <nav className="bmslang flex items-center gap-2" aria-label={label}>
      <Globe size={14} className="bmslang-icon shrink-0 opacity-60" aria-hidden="true" />
      <ul className="bmslang-list flex items-center gap-2">
        <li className="bmslang-item is-current">
          {/* `lang` on each name, so a screen reader says "العربية" in an
              Arabic voice rather than spelling it out in the page's own. */}
          <span className="bmslang-current text-sm font-medium" aria-current="true" lang={current} dir="auto">
            {showLabel ? name(current) : current.toUpperCase()}
          </span>
        </li>
        {targets.map((t) => (
          <li key={t.language} className="bmslang-item">
            <Link
              href={t.path}
              hrefLang={t.language}
              lang={t.language}
              dir="auto"
              className="bmslang-link text-sm opacity-70 transition-opacity hover:opacity-100"
            >
              {showLabel ? name(t.language) : t.language.toUpperCase()}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
