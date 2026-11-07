"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { ErrorRow } from "@/app/(admin)/admin/(cms)/errors/page";

const SOURCE_LABEL: Record<string, string> = {
  render: "Page",
  route: "API",
  middleware: "Middleware",
  client: "Browser",
  server: "Server",
};

export default function ErrorsPanel({ rows, unavailable }: { rows: ErrorRow[]; unavailable: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  async function clear() {
    if (!confirm("Clear the whole error log?")) return;
    setClearing(true);
    await fetch("/api/errors", { method: "DELETE" }).catch(() => {});
    setClearing(false);
    router.refresh();
  }

  if (unavailable) {
    return (
      <div className="card p-5 text-sm text-slate-600">
        The error log table is not available: <code className="text-xs">{unavailable}</code>. Run{" "}
        <code className="text-xs">npm run db:migrate</code>.
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 p-5">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {rows.length === 0 ? "No errors recorded" : `${rows.length} most recent error${rows.length === 1 ? "" : "s"}`}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Everything the site throws — on the server or in a visitor&rsquo;s browser — lands here, with the stack.
            The same error on the same page is recorded once a minute.
          </p>
        </div>
        {rows.length > 0 && (
          <button onClick={clear} disabled={clearing} className="btn-ghost flex shrink-0 items-center gap-1.5 text-xs text-red-600">
            <Trash2 size={13} /> Clear
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-400">Nothing to show. That is the good outcome.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => {
            const isOpen = open === r.id;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : r.id)}
                  className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-slate-50"
                >
                  <AlertOctagon size={15} className="mt-0.5 shrink-0 text-red-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{r.message}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-slate-400">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                        {SOURCE_LABEL[r.source] ?? r.source}
                      </span>
                      {r.path && (
                        <span className="font-mono">
                          {r.method ? `${r.method} ` : ""}
                          {r.path}
                        </span>
                      )}
                      <span>{new Date(r.created_at).toLocaleString()}</span>
                      {r.digest && <span className="font-mono">#{r.digest}</span>}
                    </p>
                  </div>
                  {isOpen ? (
                    <ChevronDown size={14} className="mt-1 text-slate-400" />
                  ) : (
                    <ChevronRight size={14} className="mt-1 text-slate-400" />
                  )}
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
                    {r.stack ? (
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-slate-700">
                        {r.stack}
                      </pre>
                    ) : (
                      <p className="text-xs text-slate-400">No stack was recorded for this one.</p>
                    )}
                    {r.user_agent && <p className="mt-2 truncate text-[10px] text-slate-400">{r.user_agent}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
