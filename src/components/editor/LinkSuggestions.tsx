"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Link2, Loader2, Plus, Search } from "lucide-react";
import { insertLinkInEditor } from "@/lib/blockSettingsStore";

// Internal links, suggested while writing.
//
// The posts of this site that are about the same thing as the one being
// written — found by the focus keyword, or failing that the title — with one
// click to link to them. Internal links are what lets a search engine find
// and rank the rest of the site from the page it already knows; a post that
// links to three related ones lifts all four. Rank Math does this in its
// sidebar; here it sits under the content analysis, where the keyword is.

interface Item {
  kind: "post" | "page";
  id: number;
  title: string;
  url: string;
  excerpt: string;
}

interface Props {
  /** Focus keyword; the title is used when empty. */
  keyword: string;
  title: string;
  language: string;
  excludePost?: number;
  excludePage?: number;
  /** The document's blocks, to mark what is already linked. */
  content: unknown;
}

function stopWords(s: string): string {
  return s
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(the|and|for|with|from|that|this|your|you|are|how|what|why|apk|app|download|version|latest|free|best|top|new|guide|2024|2025|2026)$/i.test(w))
    .slice(0, 5)
    .join(" ");
}

export default function LinkSuggestions({ keyword, title, language, excludePost, excludePage, content }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = custom.trim() || keyword.trim() || stopWords(title);
  const linked = useMemo(() => {
    let text = "";
    try {
      text = JSON.stringify(content ?? "");
    } catch {
      text = "";
    }
    return (url: string) => text.includes(`"href":"${url}"`) || text.includes(`"href":"${url}/"`) || text.includes(`${url}"`);
  }, [content]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.length < 2) {
      setItems([]);
      return;
    }
    // The debounce only cancels a request that has not started. Once one is in
    // flight the next keystroke starts a second, and if the first is slower it
    // lands last and overwrites the newer suggestions — so the effect that is
    // no longer current drops its own answer.
    let current = true;
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const params = new URLSearchParams({ q: query, lang: language });
        if (excludePost) params.set("excludePost", String(excludePost));
        if (excludePage) params.set("excludePage", String(excludePage));
        const res = await fetch(`/api/links/suggest?${params}`);
        const data = await res.json();
        if (current) setItems(res.ok ? data.items ?? [] : []);
      } catch {
        if (current) setItems([]);
      } finally {
        if (current) setBusy(false);
      }
    }, 500);
    return () => {
      current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, language, excludePost, excludePage]);

  const flash = (url: string) => {
    setDone(url);
    setTimeout(() => setDone(null), 1200);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Link2 size={13} className="text-slate-400" />
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Link suggestions</p>
        {busy && <Loader2 size={11} className="animate-spin text-slate-400" />}
      </div>
      <div className="relative">
        <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-7 text-xs"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder={keyword ? `Matching “${keyword}” — or type to search` : "Search your posts to link…"}
        />
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-slate-400">
          {query.length < 2 ? "Set a focus keyword or type above." : busy ? "Searching…" : "No published post matches. Try another phrase."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {items.map((it) => {
            const already = linked(it.url);
            return (
              <li key={`${it.kind}-${it.id}`} className="flex items-start gap-2 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-800" title={it.title}>
                    {it.title}
                    {it.kind === "page" && <span className="ml-1.5 rounded bg-slate-100 px-1 text-[9px] font-semibold uppercase text-slate-500">page</span>}
                    {already && <span className="ml-1.5 rounded bg-emerald-50 px-1 text-[9px] font-semibold uppercase text-emerald-700">linked</span>}
                  </p>
                  <p className="truncate font-mono text-[10px] text-slate-400" title={it.url}>{it.url}</p>
                </div>
                <button
                  type="button"
                  title="Insert a link to this at the cursor"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-sky-50 hover:text-sky-700"
                  onClick={() => {
                    if (insertLinkInEditor(it.url, it.title)) flash(it.url);
                  }}
                >
                  {done === it.url ? <Check size={12} className="text-emerald-600" /> : <Plus size={12} />}
                </button>
                <button
                  type="button"
                  title="Copy the URL"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  onClick={() => navigator.clipboard?.writeText(it.url).then(() => flash(`copy:${it.url}`))}
                >
                  {done === `copy:${it.url}` ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
