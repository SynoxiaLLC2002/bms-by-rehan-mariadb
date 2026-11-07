"use client";

// "Is this the same term as that one, in another language?"
//
// `categories` and `tags` gained `translation_group` columns and nothing read
// them, so "Recipes" and "Recettes" stayed two unrelated terms. Linking them is
// what lets a reader move between the two archives, and what stops the same
// concept counting twice.
//
// Rendered as one cell per row rather than a separate screen: the question is
// always about a term you are already looking at.

import { useState } from "react";
import { Languages, Link2, Loader2, Unlink } from "lucide-react";

interface TermLink {
  id: number;
  language: string;
  name: string;
  slug: string;
}

interface Candidate {
  id: number;
  name: string;
  slug: string;
}

export default function TermTranslationCell({
  kind,
  id,
  language,
  languages,
  languageNames,
  initial,
}: {
  kind: "category" | "tag";
  id: number;
  language: string;
  languages: string[];
  languageNames: Record<string, string>;
  initial: TermLink[];
}) {
  const [links, setLinks] = useState<TermLink[]>(initial);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const others = languages.filter((c) => c !== language);

  async function open(code: string) {
    setOpenFor(code);
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/translations/terms?kind=${kind}&id=${id}&language=${encodeURIComponent(code)}`
      );
      const data = await res.json();
      setCandidates(res.ok ? data.terms ?? [] : []);
      if (!res.ok) setError(data.error ?? "Could not load");
    } finally {
      setBusy(false);
    }
  }

  async function link(targetId: number) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/translations/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, targetId }),
      });
      const data = await res.json();
      if (res.ok) {
        setLinks(data.translations ?? []);
        setOpenFor(null);
      } else setError(data.error ?? "Could not link");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    try {
      const res = await fetch(`/api/translations/terms?kind=${kind}&id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) setLinks([]);
      else setError("Could not unlink");
    } finally {
      setBusy(false);
    }
  }

  if (others.length === 0) return null;

  return (
    <div className="text-xs">
      {links.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Languages size={11} className="text-slate-400" />
          {links.map((l) => (
            <span
              key={l.id}
              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
              title={`${languageNames[l.language] ?? l.language}: ${l.name}`}
            >
              {l.language} · {l.name}
            </span>
          ))}
          <button
            type="button"
            onClick={unlink}
            disabled={busy}
            title="Unlink from the group"
            className="text-slate-300 hover:text-red-600"
          >
            <Unlink size={11} />
          </button>
        </div>
      ) : openFor ? (
        <div>
          {busy ? (
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <Loader2 size={11} className="animate-spin" /> Loading…
            </span>
          ) : candidates.length === 0 ? (
            <span className="text-[11px] text-slate-400">
              Nothing in {languageNames[openFor] ?? openFor} yet.
            </span>
          ) : (
            <select
              className="input py-1 text-xs"
              defaultValue=""
              onChange={(e) => e.target.value && link(Number(e.target.value))}
            >
              <option value="">Choose the {languageNames[openFor] ?? openFor} term…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setOpenFor(null)}
            className="mt-1 block text-[11px] text-slate-400 hover:text-slate-600"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {others.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => open(code)}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-brand-600"
            >
              <Link2 size={10} /> {code}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
