"use client";

import { useState } from "react";
import { Zap, Loader2 } from "lucide-react";

export default function PurgeCacheButton() {
  const [purging, setPurging] = useState(false);
  const [note, setNote] = useState("");

  async function purgeCache() {
    setPurging(true);
    setNote("");
    try {
      const res = await fetch("/api/cache/purge", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error ?? "Purge failed.");
        return;
      }
      const cf = data.cloudflare as { attempted: boolean; ok: boolean; error?: string } | undefined;
      setNote(
        !cf?.attempted
          ? "LiteSpeed cache purged."
          : cf.ok
            ? "LiteSpeed and Cloudflare caches purged."
            : `LiteSpeed purged — Cloudflare failed: ${cf.error}`
      );
    } catch {
      setNote("Purge failed.");
    } finally {
      setPurging(false);
    }
  }

  return (
    <button
      type="button"
      onClick={purgeCache}
      disabled={purging}
      title={note || "Purge LiteSpeed (and Cloudflare, if configured) cache"}
      className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors text-sm font-medium text-slate-700 hover:text-brand-700 disabled:opacity-50 text-left"
    >
      {purging ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
      {purging ? "Purging…" : note || "Purge Cache"}
    </button>
  );
}
