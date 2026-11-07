"use client";

// "Where is this page in French?" — asked and answered in the editor sidebar.
//
// Content is partitioned, so a translation is a separate document. Linking them
// is what makes a language switcher and `hreflang` possible; without it the two
// versions are unrelated rows that happen to say the same thing.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Languages, Link2, Loader2, Plus, Unlink } from "lucide-react";

interface Translation {
  id: number;
  language: string;
  slug: string;
  title: string;
  status: string;
  path: string;
}

interface Candidate {
  id: number;
  title: string;
  slug: string;
  status: string;
}

export default function TranslationsPanel({
  kind,
  id,
  language,
  languages,
  languageNames,
  initial,
}: {
  kind: "post" | "page";
  /** Absent while the document is unsaved — there is nothing to link yet. */
  id?: number;
  language: string;
  /** Every configured content language, in order. */
  languages: string[];
  /** code -> display name, resolved on the server where the table lives. */
  languageNames: Record<string, string>;
  initial: Translation[];
}) {
  const [translations, setTranslations] = useState<Translation[]>(initial);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const others = languages.filter((c) => c !== language);
  const byLang = new Map(translations.map((t) => [t.language, t]));

  const editHref = (docId: number) => `/admin/${kind === "post" ? "posts" : "pages"}/${docId}`;

  const loadCandidates = useCallback(
    async (code: string) => {
      if (!id) return;
      setBusy(true);
      setError("");
      try {
        const res = await fetch(
          `/api/translations?kind=${kind}&id=${id}&language=${encodeURIComponent(code)}`
        );
        const data = await res.json();
        setCandidates(res.ok ? data.documents ?? [] : []);
        if (!res.ok) setError(data.error ?? "Could not load documents");
      } finally {
        setBusy(false);
      }
    },
    [id, kind]
  );

  useEffect(() => {
    if (openFor) loadCandidates(openFor);
  }, [openFor, loadCandidates]);

  async function link(targetId: number) {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/translations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, targetId }),
      });
      const data = await res.json();
      if (res.ok) {
        setTranslations(data.translations ?? []);
        setOpenFor(null);
      } else {
        setError(data.error ?? "Could not link");
      }
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/translations?kind=${kind}&id=${id}`, { method: "DELETE" });
      if (res.ok) setTranslations([]);
      else setError("Could not unlink");
    } finally {
      setBusy(false);
    }
  }

  if (others.length === 0) return null;

  return (
    <div>
      <label className="label flex items-center gap-1.5">
        <Languages size={13} className="text-slate-400" />
        Translations
      </label>

      {!id ? (
        <p className="text-[11px] text-slate-400">Save this {kind} first, then link its translations.</p>
      ) : (
        <div className="space-y-1.5">
          {others.map((code) => {
            const t = byLang.get(code);
            return (
              <div key={code} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">
                    {languageNames[code] ?? code}
                  </span>
                  <code className="text-[10px] text-slate-400">{code}</code>
                  {t && (
                    <span
                      className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        t.status === "published"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {t.status}
                    </span>
                  )}
                </div>

                {t ? (
                  <div className="mt-1 flex items-center gap-2">
                    <Link
                      href={editHref(t.id)}
                      className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-700 hover:text-brand-600"
                      title={t.title || "(untitled)"}
                    >
                      {t.title || "(untitled)"}
                    </Link>
                    <code className="shrink-0 text-[10px] text-slate-400">{t.path}</code>
                  </div>
                ) : openFor === code ? (
                  <div className="mt-1.5">
                    {busy ? (
                      <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Loader2 size={12} className="animate-spin" /> Loading…
                      </span>
                    ) : candidates.length === 0 ? (
                      <p className="text-[11px] text-slate-400">
                        Nothing in {languageNames[code] ?? code} yet. Create it first, then link it here.
                      </p>
                    ) : (
                      <select
                        className="input py-1 text-xs"
                        defaultValue=""
                        onChange={(e) => e.target.value && link(Number(e.target.value))}
                      >
                        <option value="">Choose the {languageNames[code] ?? code} version…</option>
                        {candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title || "(untitled)"}
                            {c.status !== "published" ? " — draft" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => setOpenFor(null)}
                      className="mt-1 text-[11px] text-slate-400 hover:text-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenFor(code)}
                    disabled={busy}
                    className="mt-1 flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700"
                  >
                    <Link2 size={11} /> Link an existing {languageNames[code] ?? code} {kind}
                  </button>
                )}
              </div>
            );
          })}

          {translations.length > 0 && (
            <button
              type="button"
              onClick={unlink}
              disabled={busy}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-600"
            >
              <Unlink size={11} /> Unlink this {kind} from the group
            </button>
          )}

          {error && <p className="text-[11px] text-red-600">{error}</p>}

          <p className="text-[11px] leading-relaxed text-slate-400">
            <Plus size={10} className="inline" /> Linked documents share a language switcher and tell
            search engines they are the same page in another language.
          </p>
        </div>
      )}
    </div>
  );
}
