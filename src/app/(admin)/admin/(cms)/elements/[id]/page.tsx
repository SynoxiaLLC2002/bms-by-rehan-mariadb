"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import Header from "@/components/admin/Header";
import { cn } from "@/lib/utils";
import { ELEMENT_HOOKS, ELEMENT_PAGE_TYPES, type ElementConditions } from "@/lib/elements";
import { contentLanguages, languageName } from "@/lib/locale";
import type { Block } from "@blocknote/core";
import { ArrowLeft, Loader2, Save, Check } from "lucide-react";

// BlockNote reaches for the DOM on import, same as the page and post editors.
const BlockEditor = dynamic(() => import("@/components/editor/BlockEditor"), { ssr: false });
// 6,300+ lines and only needed once the "Block" sidebar tab is actually open.
const BlockPanel = dynamic(() => import("@/components/editor/BlockPanel"), { ssr: false });

interface ElementData {
  name: string;
  hook: string;
  status: string;
  priority: number;
  conditions: ElementConditions;
  content: Block[];
}

export default function ElementEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<ElementData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  // The version loaded; a save from a stale copy is refused (lib/staleSave.ts).
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  // The site's content languages; the Languages card only appears with two or more.
  const [siteLanguages, setSiteLanguages] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.settings && setSiteLanguages(contentLanguages(d.settings)))
      .catch(() => {});
  }, []);

  // The editor is uncontrolled once mounted, so content lives in a ref and is
  // read at save time — re-rendering the editor on every keystroke would cost
  // a remount and the caret with it.
  const contentRef = useRef<Block[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      const res = await fetch(`/api/elements/${id}`);
      if (!res.ok) { router.replace("/admin/elements"); return; }
      const { element } = await res.json();
      if (!live) return;
      const content: Block[] = Array.isArray(element.content) ? (element.content as Block[]) : [];
      contentRef.current = content;
      setLoadedAt(element.updatedAt ? new Date(element.updatedAt).toISOString() : null);
      setData({
        name: element.name,
        hook: element.hook,
        status: element.status,
        priority: element.priority,
        conditions: {
          include: element.conditions?.include ?? [],
          exclude: element.conditions?.exclude ?? [],
          languages: element.conditions?.languages ?? [],
        },
        content,
      });
    })();
    return () => { live = false; };
  }, [id, router]);

  const onContentChange = useCallback((blocks: Block[]) => {
    contentRef.current = blocks;
  }, []);

  const set = <K extends keyof ElementData>(k: K, v: ElementData[K]) =>
    setData((d) => (d ? { ...d, [k]: v } : d));

  const toggle = (list: "include" | "exclude" | "languages", pageType: string) =>
    setData((d) => {
      if (!d) return d;
      const current = d.conditions[list] ?? [];
      const next = current.includes(pageType)
        ? current.filter((x) => x !== pageType)
        : [...current, pageType];
      return { ...d, conditions: { ...d.conditions, [list]: next } };
    });

  const save = async () => {
    if (!data) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/elements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, content: contentRef.current, expectedUpdatedAt: loadedAt }),
      });
      if (res.status === 409) {
        setConflict(true);
        throw new Error((await res.json()).error || "This element was changed somewhere else. Reload to continue.");
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not save");
      if (json.updatedAt) setLoadedAt(json.updatedAt);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <>
        <Header title="Element" />
        <div className="p-8 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      </>
    );
  }

  const include = data.conditions.include ?? [];
  const exclude = data.conditions.exclude ?? [];

  return (
    <>
      <Header title="Element" />

      <div className="flex items-center justify-between gap-4 px-8 py-3 border-b border-slate-200 bg-white sticky top-0 z-20">
        <Link
          href="/admin/elements"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={15} /> All elements
        </Link>
        <div className="flex items-center gap-3">
          {error && <span className="text-xs text-red-600">{error}</span>}
          <button
            onClick={conflict ? () => window.location.reload() : save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
            {conflict ? "Reload to save" : saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      <div className="flex items-start gap-6 p-8">
        <div className="flex-1 min-w-0">
          <input
            value={data.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Element name"
            className="w-full text-2xl font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none mb-5"
          />
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <BlockEditor initialContent={data.content} onChange={onContentChange} bare />
          </div>
        </div>

        <aside className="w-80 shrink-0 space-y-4">
          <Card title="Placement">
            <Label>Position</Label>
            <select
              value={data.hook}
              onChange={(e) => set("hook", e.target.value)}
              className={field}
            >
              {ELEMENT_HOOKS.map((h) => (
                <option key={h.id} value={h.id}>{h.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
              {ELEMENT_HOOKS.find((h) => h.id === data.hook)?.hint}
            </p>

            <Label className="mt-4">Status</Label>
            <select
              value={data.status}
              onChange={(e) => set("status", e.target.value)}
              className={field}
            >
              <option value="draft">Draft — not shown</option>
              <option value="published">Published — live</option>
            </select>

            <Label className="mt-4">Order</Label>
            <input
              type="number"
              value={data.priority}
              onChange={(e) => set("priority", parseInt(e.target.value) || 0)}
              className={field}
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              Lower renders first when elements share a position.
            </p>
          </Card>

          <Card title="Show on">
            <p className="text-[11px] text-slate-400 mb-2.5 leading-snug">
              Nothing selected means every page. Hiding always wins over showing.
            </p>
            <div className="space-y-1">
              {ELEMENT_PAGE_TYPES.map((t) => {
                const on = include.includes(t.id);
                const off = exclude.includes(t.id);
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 py-0.5">
                    <span className={cn("text-[13px]", off ? "text-slate-300 line-through" : "text-slate-600")}>
                      {t.label}
                    </span>
                    <div className="flex gap-1">
                      <Pill active={on} onClick={() => toggle("include", t.id)}>Show</Pill>
                      <Pill active={off} danger onClick={() => toggle("exclude", t.id)}>Hide</Pill>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {siteLanguages.length > 1 && (
            <Card title="Languages">
              <p className="text-[11px] text-slate-400 mb-2.5 leading-snug">
                Nothing selected means every language. Pick some to show this element only on pages in those languages.
              </p>
              <div className="flex flex-wrap gap-1">
                {/* A language removed from Settings stays listed while the
                    element still names it, so it can be switched off. */}
                {Array.from(new Set([...siteLanguages, ...(data.conditions.languages ?? [])])).map((code) => (
                  <Pill key={code} active={(data.conditions.languages ?? []).includes(code)} onClick={() => toggle("languages", code)}>
                    {languageName(code)} <span className="opacity-60">({code})</span>
                  </Pill>
                ))}
              </div>
            </Card>
          )}

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Block settings
            </div>
            <BlockPanel />
          </div>
        </aside>
      </div>
    </>
  );
}

const field =
  "w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-brand-400";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{title}</div>
      {children}
    </div>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11px] font-medium text-slate-500 mb-1", className)}>{children}</div>
  );
}

function Pill({
  active, danger, onClick, children,
}: {
  active: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2 py-0.5 rounded text-[11px] font-medium border transition-colors",
        active
          ? danger
            ? "bg-red-50 border-red-200 text-red-600"
            : "bg-brand-50 border-brand-300 text-brand-700"
          : "bg-white border-slate-200 text-slate-400 hover:text-slate-600"
      )}
    >
      {children}
    </button>
  );
}
