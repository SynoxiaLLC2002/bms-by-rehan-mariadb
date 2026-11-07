"use client";

import { useEffect, useState } from "react";

/**
 * "This document is open in another tab."
 *
 * WordPress locks a post while someone edits it. This is the lighter form:
 * each open editor heartbeats a localStorage key for its document, and a
 * second editor of the same document sees the heartbeat and says so. The
 * server-side version check (lib/staleSave.ts) is what actually prevents the
 * overwrite; this just tells people *before* they type into the wrong tab.
 *
 * localStorage is per browser, so this only sees the same person's tabs —
 * which is the case that actually happened (two Edit Page tabs, one stale).
 */
export default function EditLock({ kind, id }: { kind: "page" | "post"; id: number | null | undefined }) {
  const [elsewhere, setElsewhere] = useState(false);

  useEffect(() => {
    if (!id) return;
    const key = `bms-editing:${kind}:${id}`;
    const me = Math.random().toString(36).slice(2);
    const read = (): { tab: string; at: number } | null => {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
    };
    const beat = () => {
      const cur = read();
      const fresh = cur && Date.now() - cur.at < 15_000 && cur.tab !== me;
      setElsewhere(!!fresh);
      // Only claim the key when nobody else holds a fresh one, so the first
      // tab keeps it and every later tab is the one that gets warned.
      if (!fresh) { try { localStorage.setItem(key, JSON.stringify({ tab: me, at: Date.now() })); } catch {} }
    };
    beat();
    const t = setInterval(beat, 5_000);
    const release = () => { const cur = read(); if (cur?.tab === me) { try { localStorage.removeItem(key); } catch {} } };
    window.addEventListener("beforeunload", release);
    return () => { clearInterval(t); window.removeEventListener("beforeunload", release); release(); };
  }, [kind, id]);

  if (!elsewhere) return null;
  return (
    <div className="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
      <strong>This {kind} is already open in another tab.</strong> Close one of them — the older tab&apos;s
      autosave cannot overwrite the newer one any more, but edits made in both will not merge.
    </div>
  );
}
