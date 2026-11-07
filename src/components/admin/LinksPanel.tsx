"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Link2, Loader2, Pencil } from "lucide-react";
import type { LinkReport, LinkResult } from "@/lib/linkCheck";

const STATE: Record<LinkResult["state"], { label: string; cls: string }> = {
  broken: { label: "Broken", cls: "bg-red-100 text-red-700" },
  error: { label: "Error", cls: "bg-amber-100 text-amber-700" },
  unreachable: { label: "Unreachable", cls: "bg-slate-100 text-slate-600" },
  redirect: { label: "Redirects", cls: "bg-sky-100 text-sky-700" },
  ok: { label: "OK", cls: "bg-emerald-100 text-emerald-700" },
};

export default function LinksPanel({ initial }: { initial: LinkReport | null }) {
  const [report, setReport] = useState<LinkReport | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showOk, setShowOk] = useState(false);

  async function run() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/links", { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not run the check.");
      else setReport(data.report);
    } catch {
      setError("Could not run the check.");
    } finally {
      setBusy(false);
    }
  }

  const rows = report ? report.results.filter((r) => showOk || r.state !== "ok") : [];
  const counts = report
    ? report.results.reduce<Record<string, number>>((acc, r) => ((acc[r.state] = (acc[r.state] ?? 0) + 1), acc), {})
    : {};

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {report ? `${report.checked} links checked · ${report.broken} broken` : "No check has been run yet"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {report
              ? `Last run ${new Date(report.ranAt).toLocaleString()}.${report.truncated ? " More than 400 links — only the first 400 were checked." : ""}`
              : "Every link in published posts and pages is requested from the server, and dead ones are listed with where they are used."}
          </p>
        </div>
        <button onClick={run} disabled={busy} className="btn-primary flex items-center gap-2 text-xs">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
          {busy ? "Checking…" : report ? "Run again" : "Check links"}
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {report && (
        <div className="card">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 text-[11px]">
            {(Object.keys(STATE) as LinkResult["state"][]).map((s) =>
              counts[s] ? (
                <span key={s} className={`rounded-full px-2 py-0.5 font-medium ${STATE[s].cls}`}>
                  {counts[s]} {STATE[s].label.toLowerCase()}
                </span>
              ) : null
            )}
            <label className="ml-auto flex items-center gap-1.5 text-slate-500">
              <input type="checkbox" checked={showOk} onChange={(e) => setShowOk(e.target.checked)} /> show working links
            </label>
          </div>
          {rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-400">
              {report.checked === 0 ? "No links found in published content." : "Nothing broken. Every link answered."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.url} className="px-5 py-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATE[r.state].cls}`}>
                      {r.status ?? "—"} {STATE[r.state].label}
                    </span>
                    <a href={r.resolved} target="_blank" rel="noreferrer" className="min-w-0 flex-1 break-all font-mono text-xs text-slate-800 hover:underline">
                      {r.url} <ExternalLink size={10} className="inline" />
                    </a>
                  </div>
                  {r.detail && <p className="mt-1 text-[11px] text-slate-400">{r.state === "redirect" ? "→ " : ""}{r.detail}</p>}
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    {r.usedBy.map((u) => (
                      <Link key={`${u.kind}-${u.id}`} href={`/admin/${u.kind}s/${u.id}`} className="flex items-center gap-1 hover:text-brand-600 hover:underline">
                        <Pencil size={10} /> {u.title || `${u.kind} #${u.id}`}
                      </Link>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
