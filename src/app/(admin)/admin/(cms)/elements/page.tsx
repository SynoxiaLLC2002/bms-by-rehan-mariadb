"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/admin/Header";
import { cn } from "@/lib/utils";
import { ELEMENT_HOOKS, hookLabel } from "@/lib/elements";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";

interface ElementRow {
  id: number;
  name: string;
  hook: string;
  status: string;
  priority: number;
  updatedAt: string;
}

export default function ElementsPage() {
  const [rows, setRows] = useState<ElementRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const res = await fetch("/api/elements");
    const data = await res.json();
    setRows(data.elements ?? []);
  };

  useEffect(() => { void load(); }, []);

  const create = async () => {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/elements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled element", hook: "before_footer", content: [] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the element");
      window.location.href = `/admin/elements/${data.element.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the element");
      setCreating(false);
    }
  };

  const remove = async (id: number, name: string) => {
    if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) return;
    const res = await fetch(`/api/elements/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setError((data as { error?: string }).error || `“${name}” could not be deleted.`);
    } else setError("");
    void load();
  };

  if (!rows) {
    return (
      <>
        <Header title="Elements" />
        <div className="p-8 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading elements…
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Elements" />
      <div className="p-8 max-w-[1000px]">
        <div className="flex items-start justify-between gap-6 mb-6">
          <p className="text-sm text-slate-500 max-w-xl leading-relaxed">
            Reusable content dropped into a fixed spot on the site — an announcement bar above the
            header, a call to action under every post. Built in the same editor as your pages, and
            shown only on the page types you pick.
          </p>
          <button
            onClick={create}
            disabled={creating}
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60"
          >
            {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            New element
          </button>
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        {rows.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl py-16 text-center">
            <p className="text-sm text-slate-500">No elements yet.</p>
            <p className="text-xs text-slate-400 mt-1">
              Create one and pick where on the page it should appear.
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr className="text-left">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Position</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium w-20 text-right">Order</th>
                  <th className="px-4 py-2.5 w-24" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <Link href={`/admin/elements/${r.id}`} className="font-medium text-slate-800 hover:text-brand-700">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{hookLabel(r.hook)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-block px-2 py-0.5 rounded-full text-[11px] font-medium",
                          r.status === "published"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        )}
                      >
                        {r.status === "published" ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400 tabular-nums">{r.priority}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/elements/${r.id}`}
                          className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </Link>
                        <button
                          onClick={() => remove(r.id, r.name)}
                          className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-8 grid sm:grid-cols-2 gap-3">
          {ELEMENT_HOOKS.map((h) => (
            <div key={h.id} className="rounded-lg border border-slate-200 px-3.5 py-2.5">
              <div className="text-[13px] font-medium text-slate-700">{h.label}</div>
              <div className="text-[11px] text-slate-400 leading-snug">{h.hint}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
