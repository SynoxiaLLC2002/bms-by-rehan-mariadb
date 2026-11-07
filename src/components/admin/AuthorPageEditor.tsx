"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Block } from "@blocknote/core";
import { ArrowLeft, Loader2, Save, Check } from "lucide-react";
import { defaultAuthorPageBlocks } from "@/lib/authorPageTemplate";

// BlockNote reaches for the DOM on import, same as every other editor screen.
const BlockEditor = dynamic(() => import("@/components/editor/BlockEditor"), { ssr: false });
const BlockPanel = dynamic(() => import("@/components/editor/BlockPanel"), { ssr: false });

export default function AuthorPageEditor({
  userId,
  userName,
  initialContent,
}: {
  userId: string;
  userName: string | null;
  initialContent: unknown;
}) {
  const seeded = Array.isArray(initialContent) && initialContent.length > 0
    ? (initialContent as Block[])
    : defaultAuthorPageBlocks();

  // Uncontrolled once mounted, same reasoning as the Element editor: content
  // lives in a ref and is only read at save time.
  const contentRef = useRef<Block[]>(seeded);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const onContentChange = useCallback((blocks: Block[]) => {
    contentRef.current = blocks;
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentRef.current }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4 px-8 py-3 border-b border-slate-200 bg-white sticky top-0 z-20">
        <Link
          href={`/admin/users/${userId}#author-page`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={15} /> Back to {userName || "user"}
        </Link>
        <div className="flex items-center gap-3">
          {error && <span className="text-xs text-red-600">{error}</span>}
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      <div className="flex items-start gap-6 p-8">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-400 mb-4">
            {userName ? `${userName}'s` : "This account's"} public author page. The Author Bio
            block below reads the photo, biography and social links straight from the account —
            edit those on the Users screen. Everything else here is layout: add, remove or
            restyle blocks like any other page.
          </p>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <BlockEditor initialContent={seeded} onChange={onContentChange} bare />
          </div>
        </div>

        <aside className="w-80 shrink-0">
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
