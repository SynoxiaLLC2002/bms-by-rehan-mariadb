"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { BLOCK_CATEGORIES, BLOCK_LIBRARY, searchBlocks, type BlockCategory, type BlockDef } from "@/lib/blockLibrary";
import { Search, X } from "lucide-react";

export interface ReusableEntry {
  label: string;
  block: unknown;
}

const RECENT_KEY = "bms_recent_blocks";
const RECENT_MAX = 6;

/** The last few blocks inserted, newest first. Best-effort: storage can throw. */
function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(label: string) {
  try {
    const next = [label, ...readRecent().filter((l) => l !== label)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private window, or storage disabled — recents are a convenience only */
  }
}

type Tab = BlockCategory | "all" | "recent" | "saved";

/**
 * The browse-and-insert block picker.
 *
 * Complements the slash menu rather than replacing it: the slash menu is the
 * keyboard path for people who know the block's name, this is the path for
 * finding one you haven't used before. Both read the same registry.
 */
export default function BlockLibrary({
  open,
  onClose,
  onInsert,
  reusable = [],
  onInsertReusable,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (block: BlockDef) => void;
  reusable?: ReusableEntry[];
  onInsertReusable?: (entry: ReusableEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [cols, setCols] = useState(2);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const showingSaved = tab === "saved" && !query;

  const results = useMemo(() => {
    if (showingSaved) return [];
    let pool = BLOCK_LIBRARY;
    if (tab === "recent" && !query) {
      // Preserve most-recent-first order rather than registry order.
      pool = recent
        .map((label) => BLOCK_LIBRARY.find((b) => b.label === label))
        .filter((b): b is BlockDef => !!b);
      return pool;
    }
    if (tab !== "all" && tab !== "recent" && tab !== "saved") {
      pool = BLOCK_LIBRARY.filter((b) => b.category === tab);
    }
    return searchBlocks(query, pool);
  }, [query, tab, recent, showingSaved]);

  // Memoised so the insert callback below isn't rebuilt on every render.
  const savedResults = useMemo(() => (showingSaved ? reusable : []), [showingSaved, reusable]);
  const count = showingSaved ? savedResults.length : results.length;

  // Reset position whenever the result set changes, so the highlight is never
  // left pointing past the end of a shorter list.
  useEffect(() => setActive(0), [query, tab]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setRecent(readRecent());
    setTab(readRecent().length > 0 ? "recent" : "all");
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  // The grid is one column on narrow dialogs and two otherwise; arrow keys need
  // to know which, or ↓ would skip a row.
  useEffect(() => {
    if (!open) return;
    const measure = () => setCols(window.innerWidth < 640 ? 1 : 2);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  const insert = useCallback(
    (i: number) => {
      if (showingSaved) {
        const entry = savedResults[i];
        if (entry && onInsertReusable) onInsertReusable(entry);
        onClose();
        return;
      }
      const block = results[i];
      if (!block) return;
      pushRecent(block.label);
      onInsert(block);
      onClose();
    },
    [showingSaved, savedResults, results, onInsert, onInsertReusable, onClose]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (count === 0) return;
      const step: Record<string, number> = {
        ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols,
      };
      if (e.key === "Enter") { e.preventDefault(); insert(active); return; }
      const d = step[e.key];
      if (d === undefined) return;
      // Left/right inside a text field should move the caret, not the grid.
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && document.activeElement === inputRef.current && query) return;
      e.preventDefault();
      setActive((i) => Math.min(Math.max(i + d, 0), count - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, count, active, cols, query, insert, onClose]);

  // Keep the highlighted card in view when moving by keyboard.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const tabs: { id: Tab; label: string; count: number }[] = [
    ...(recent.length > 0 ? [{ id: "recent" as Tab, label: "Recent", count: recent.length }] : []),
    { id: "all", label: "All blocks", count: BLOCK_LIBRARY.length },
    ...BLOCK_CATEGORIES.map((c) => ({
      id: c.id as Tab,
      label: c.label,
      count: BLOCK_LIBRARY.filter((b) => b.category === c.id).length,
    })),
    ...(reusable.length > 0 ? [{ id: "saved" as Tab, label: "Saved", count: reusable.length }] : []),
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[8vh] px-4" role="dialog" aria-modal="true" aria-label="Add a block">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />

      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[76vh]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (e.target.value && (tab === "recent" || tab === "saved")) setTab("all"); }}
            placeholder={`Search ${BLOCK_LIBRARY.length} blocks…`}
            className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden sm:inline text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">esc</kbd>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 ml-1" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="w-40 shrink-0 border-r border-slate-100 py-2 overflow-y-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setQuery(""); }}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 text-[13px] text-left transition-colors",
                  tab === t.id && !query ? "bg-brand-50 text-brand-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                {t.label}
                <span className="text-[10px] text-slate-400">{t.count}</span>
              </button>
            ))}
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto p-3">
            {count === 0 ? (
              <p className="text-sm text-slate-400 text-center py-16">
                {query ? <>Nothing matches “{query}”.</> : "Nothing here yet."}
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {showingSaved
                  ? savedResults.map((entry, i) => (
                      <Card
                        key={`${entry.label}-${i}`}
                        idx={i}
                        activeIdx={active}
                        onHover={setActive}
                        onPick={() => insert(i)}
                        icon="★"
                        color="#eab308"
                        title={entry.label}
                        hint="Your saved block"
                      />
                    ))
                  : results.map((b, i) => (
                      <Card
                        key={`${b.type}-${b.label}`}
                        idx={i}
                        activeIdx={active}
                        onHover={setActive}
                        onPick={() => insert(i)}
                        icon={b.icon}
                        color={b.color}
                        title={b.label}
                        hint={b.hint}
                      />
                    ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-4">
          <span>
            <kbd className="border border-slate-200 rounded px-1">↑</kbd>{" "}
            <kbd className="border border-slate-200 rounded px-1">↓</kbd>{" "}
            <kbd className="border border-slate-200 rounded px-1">←</kbd>{" "}
            <kbd className="border border-slate-200 rounded px-1">→</kbd> to move
          </span>
          <span><kbd className="border border-slate-200 rounded px-1">↵</kbd> to insert</span>
          <span className="ml-auto">Or type <kbd className="border border-slate-200 rounded px-1">/</kbd> in the editor</span>
        </div>
      </div>
    </div>
  );
}

function Card({
  idx, activeIdx, onHover, onPick, icon, color, title, hint,
}: {
  idx: number; activeIdx: number; onHover: (i: number) => void; onPick: () => void;
  icon: string; color: string; title: string; hint: string;
}) {
  return (
    <button
      data-idx={idx}
      onMouseEnter={() => onHover(idx)}
      onClick={onPick}
      className={cn(
        "flex items-start gap-3 p-2.5 rounded-xl border text-left transition-colors",
        idx === activeIdx ? "border-brand-400 bg-brand-50/60" : "border-transparent hover:border-slate-200"
      )}
    >
      <span
        className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-slate-800">{title}</span>
        <span className="block text-[11px] text-slate-500 leading-snug">{hint}</span>
      </span>
    </button>
  );
}
