"use client";

// The filter and the New button for the Posts and Pages lists.
//
// Two things the grouped list still needs:
//
//   • A way to see one language on its own. The grouped view answers "which
//     documents exist, and in which languages"; filtering answers "show me the
//     French ones", which is what you want while translating.
//
//   • A way to create in a language other than the default. Removing the old
//     tab strip took that with it — the New button could only ever create in
//     the default language, which made a second language write-only through the
//     per-row "add" menu.

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";

export default function ListToolbar({
  basePath,
  newPath,
  label,
  languages,
  languageNames,
  defaultLang,
  active,
  counts,
}: {
  /** `/admin/posts` — where the filter links point. */
  basePath: string;
  /** `/admin/posts/new` — where the button goes. */
  newPath: string;
  /** "New Post". */
  label: string;
  languages: string[];
  languageNames: Record<string, string>;
  defaultLang: string;
  /** The language currently filtered to, or null for all. */
  active: string | null;
  /** Documents per language, so the filter shows what is behind each option. */
  counts: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const multilingual = languages.length > 1;

  // Creating follows the filter: with French selected, New makes a French one.
  // That is the behaviour the old tabs had, and the one people expect.
  const createIn = active ?? defaultLang;
  const hrefFor = (code: string) =>
    code === defaultLang ? newPath : `${newPath}?lang=${encodeURIComponent(code)}`;

  // Built directly rather than read from `useSearchParams`: `lang` is the only
  // parameter these lists take, and reading the live query would drag a
  // Suspense boundary into a component that needs none.
  const filterHref = (code: string | null) =>
    code ? `${basePath}?lang=${encodeURIComponent(code)}` : basePath;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {multilingual && (
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          <FilterChip href={filterHref(null)} active={active === null} label="All languages" />
          {languages.map((code) => (
            <FilterChip
              key={code}
              href={filterHref(code)}
              active={active === code}
              label={languageNames[code] ?? code}
              count={counts[code] ?? 0}
            />
          ))}
        </div>
      )}

      <div className="relative flex">
        <Link
          href={hrefFor(createIn)}
          className={`btn-primary ${multilingual ? "rounded-r-none" : ""}`}
        >
          <Plus size={16} />
          {label}
          {multilingual && createIn !== defaultLang && (
            <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">
              {createIn}
            </span>
          )}
        </Link>

        {multilingual && (
          <>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label="Choose a language to create in"
              className="btn-primary rounded-l-none border-l border-white/25 px-2"
            >
              <ChevronDown size={14} />
            </button>
            {open && (
              <>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-0 top-11 z-20 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Create in
                  </p>
                  {languages.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        router.push(hrefFor(code));
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <span className="flex-1 truncate">{languageNames[code] ?? code}</span>
                      <code className="text-[10px] text-slate-400">{code}</code>
                      {code === defaultLang && (
                        <span className="rounded bg-slate-900 px-1 py-0.5 text-[9px] font-semibold uppercase text-white">
                          Default
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-white hover:text-slate-800"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`ml-1.5 text-[10px] ${active ? "opacity-70" : "opacity-50"}`}>{count}</span>
      )}
    </Link>
  );
}
