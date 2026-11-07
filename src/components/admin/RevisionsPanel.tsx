"use client";

// Version history for one document.
//
// Loaded on demand rather than with the editor: the list is a query nobody
// needs until they open it, and the editor already does enough work on mount.

import { useState } from "react";
import { ChevronRight, History, Loader2, RotateCcw } from "lucide-react";

interface Revision {
  id: number;
  title: string | null;
  createdAt: string;
  authorName: string | null;
  blocks: number;
}

export default function RevisionsPanel({
  kind,
  id,
}: {
  kind: "post" | "page";
  /** Absent until the document is saved — there is no history of nothing yet. */
  id?: number;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Revision[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/revisions?kind=${kind}&id=${id}`);
      const data = await res.json();
      setList(res.ok ? data.revisions ?? [] : []);
      if (!res.ok) setError(data.error ?? "Could not load history");
    } catch {
      setError("Could not load history");
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && list === null) load();
  }

  async function restore(revisionId: number) {
    if (!id) return;
    // Destructive enough to be worth a beat, and cheap to confirm: it replaces
    // what is on screen.
    if (!confirm("Restore this version? The current one is kept in the history.")) return;

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/revisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, revisionId }),
      });
      if (res.ok) {
        // A full reload rather than patching editor state: the editor holds the
        // document in memory, and writing underneath it would leave the canvas
        // showing the old version until something else forced a re-read.
        window.location.reload();
      } else {
        const data = await res.json();
        setError(data.error ?? "Could not restore");
        setBusy(false);
      }
    } catch {
      setError("Could not restore");
      setBusy(false);
    }
  }

  const when = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
  };

  return (
    <div className="rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <History size={13} className="text-slate-400" />
        <span className="text-xs font-medium text-slate-700">Revisions</span>
        {list && list.length > 0 && (
          <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {list.length}
          </span>
        )}
        <ChevronRight
          size={13}
          className={`ml-auto text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-slate-100 p-3">
          {!id ? (
            <p className="text-[11px] text-slate-400">
              Save this {kind} first — there is no history until there is a version to keep.
            </p>
          ) : busy && list === null ? (
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Loader2 size={12} className="animate-spin" /> Loading…
            </span>
          ) : list && list.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-slate-400">
              No earlier versions yet. One is kept each time you save a change to the title, excerpt,
              content, SEO fields, featured image, slug or category.
            </p>
          ) : (
            <>
              <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
                A version keeps the title, excerpt, content, SEO fields, featured image, slug and
                category. Restoring puts all of those back.
              </p>
            <ul className="space-y-1.5">
              {list?.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-slate-700">
                      {r.title || "(untitled)"}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {when(r.createdAt)}
                      {r.authorName ? ` · ${r.authorName}` : ""}
                      {r.blocks ? ` · ${r.blocks} block${r.blocks === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => restore(r.id)}
                    disabled={busy}
                    title="Restore this version"
                    className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-brand-600 hover:bg-white disabled:opacity-50"
                  >
                    <RotateCcw size={11} /> Restore
                  </button>
                </li>
              ))}
            </ul>
            </>
          )}

          {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}

          {list && list.length > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              Restoring keeps the current version in the history too, so it is itself undoable.
              The last 30 versions are kept.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
