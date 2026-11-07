"use client";

// The "+" inserter: the small round button, the wide appender bar, and the
// popover both of them open.
//
// The popover is rendered in a portal and positioned from the trigger's
// bounding rect — the editor canvas scrolls, and an absolutely positioned menu
// inside it gets clipped by that scroll container.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BLOCK_LIBRARY, searchBlocks, type BlockDef } from "@/lib/blockLibrary";
import { recentBlocks, rememberBlock } from "@/lib/recentBlocks";

/** The six tiles shown before the author types anything. */
const QUICK_PICKS: BlockDef[] = [
  { type: "paragraph", label: "Paragraph", hint: "Plain body text",   icon: "¶",  color: "#64748b", category: "text" },
  { type: "rowLayout", label: "Row Layout", hint: "Multi-column row", icon: "▦",  color: "#8b5cf6", category: "layout" },
  { type: "image",     label: "Image",      hint: "A single image",   icon: "▣",  color: "#ec4899", category: "media" },
  { type: "heading",   label: "Heading",    hint: "Section heading",  icon: "H",  color: "#0f172a", category: "text", props: { level: 2 } },
  { type: "heading",   label: "Heading 1",  hint: "Large heading",    icon: "H1", color: "#0f172a", category: "text", props: { level: 1 } },
  { type: "heading",   label: "Heading 2",  hint: "Medium heading",   icon: "H2", color: "#334155", category: "text", props: { level: 2 } },
];

const PANEL_WIDTH = 236;

interface PopoverProps {
  anchor: HTMLElement;
  onPick: (def: BlockDef) => void;
  onBrowseAll: () => void;
  onClose: () => void;
}

const COLUMNS = 3;

function InserterPopover({ anchor, onPick, onBrowseAll, onClose }: PopoverProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const searching = query.trim().length > 0;

  // Before anyone types, lead with what this author actually uses and pad the
  // rest of the grid with the defaults.
  const quick = useMemo(() => {
    const recent = recentBlocks(QUICK_PICKS);
    const out = [...recent];
    for (const def of QUICK_PICKS) {
      if (out.length >= 6) break;
      if (!out.some((d) => d.type === def.type && d.label === def.label)) out.push(def);
    }
    return out.slice(0, 6);
  }, []);

  const results = useMemo(
    () => (searching ? searchBlocks(query, BLOCK_LIBRARY).slice(0, 12) : quick),
    [searching, query, quick]
  );

  useEffect(() => setCursor(0), [query]);

  const choose = useCallback(
    (def: BlockDef) => {
      rememberBlock(def);
      onPick(def);
    },
    [onPick]
  );

  // Place under the trigger, nudged back inside the viewport when it would
  // overflow the right or bottom edge.
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const height = panelRef.current?.offsetHeight ?? 300;
      let left = r.left + r.width / 2 - PANEL_WIDTH / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - PANEL_WIDTH - 8));
      let top = r.bottom + 6;
      if (top + height > window.innerHeight - 8) top = Math.max(8, r.top - height - 6);
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, results.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (anchor.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[70] rounded-lg border border-slate-200 bg-white shadow-2xl"
      style={{ width: PANEL_WIDTH, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="p-2">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // The grid is driven from the search field so typing and picking
              // never need a hand off the keyboard.
              const move = (d: number) => {
                e.preventDefault();
                setCursor((c) => Math.min(results.length - 1, Math.max(0, c + d)));
              };
              if (e.key === "ArrowDown") move(COLUMNS);
              else if (e.key === "ArrowUp") move(-COLUMNS);
              else if (e.key === "ArrowRight") move(1);
              else if (e.key === "ArrowLeft") move(-1);
              else if (e.key === "Enter" && results[cursor]) { e.preventDefault(); choose(results[cursor]); }
            }}
            placeholder="Search blocks"
            className="w-full rounded border-2 border-sky-500 pl-6 pr-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
          {searching ? `${results.length} result${results.length === 1 ? "" : "s"}` : "Most used"}
        </span>
        <span className="text-[9px] text-slate-300">↑↓ then ⏎</span>
      </div>

      <div className="grid grid-cols-3 gap-1 px-2 pb-2 max-h-64 overflow-y-auto">
        {results.length === 0 && (
          <p className="col-span-3 py-6 text-center text-[11px] text-slate-400">No blocks found</p>
        )}
        {results.map((def, i) => (
          <button
            key={`${def.type}-${def.label}-${i}`}
            type="button"
            title={def.hint}
            onMouseEnter={() => setCursor(i)}
            onMouseDown={(e) => { e.preventDefault(); choose(def); }}
            className={`flex flex-col items-center justify-start gap-1.5 rounded px-1 py-2.5 transition-colors ${
              i === cursor ? "bg-sky-50 ring-1 ring-sky-400" : "hover:bg-slate-100"
            }`}
          >
            <span
              className="flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold"
              style={{ color: def.color }}
            >
              {def.icon}
            </span>
            <span className="text-[10px] leading-tight text-slate-700 text-center">{def.label}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onBrowseAll(); }}
        className="w-full rounded-b-lg bg-slate-900 py-2 text-[11px] font-semibold text-white hover:bg-slate-800 transition-colors"
      >
        Browse all
      </button>
    </div>,
    document.body
  );
}

interface InserterProps {
  onPick: (def: BlockDef) => void;
  onBrowseAll: () => void;
  /**
   * `round` is the small blue button beside a block, `bar` the wide appender
   * inside the canvas, `square` the toolbar button in the editor header, and
   * `ghost` the borderless "+" that fills an empty Row Layout column.
   */
  variant?: "round" | "bar" | "square" | "ghost";
  className?: string;
  title?: string;
  /** Dark bubble shown under the button on hover, as the block editor does. */
  tooltip?: string;
}

/** Trigger + popover. Owns nothing but its own open state. */
export default function Inserter({
  onPick, onBrowseAll, variant = "round", className = "", title, tooltip,
}: InserterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const common = {
    ref,
    type: "button" as const,
    title: tooltip ? undefined : title ?? "Add block",
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => setOpen((v) => !v),
  };

  let trigger: React.ReactNode;
  if (variant === "bar") {
    trigger = (
      <button
        {...common}
        className={`group flex w-full items-center justify-center rounded border py-1.5 transition-colors ${
          open ? "border-sky-500 bg-sky-50/60" : "border-slate-300 hover:border-sky-400 hover:bg-sky-50/40"
        } ${className}`}
      >
        <span className="text-base leading-none text-slate-500 group-hover:text-sky-600">+</span>
      </button>
    );
  } else if (variant === "ghost") {
    trigger = (
      <button
        {...common}
        className={`flex w-full items-center justify-center rounded py-3 text-xl leading-none transition-colors ${
          open ? "bg-sky-50 text-sky-600" : "text-slate-400 hover:bg-sky-50/70 hover:text-sky-600"
        } ${className}`}
      >
        +
      </button>
    );
  } else if (variant === "square") {
    trigger = (
      <button
        {...common}
        className={`flex h-7 w-7 items-center justify-center rounded text-lg leading-none text-white transition-colors ${
          open ? "bg-slate-800 rotate-45" : "bg-sky-600 hover:bg-sky-700"
        } ${className}`}
      >
        +
      </button>
    );
  } else {
    trigger = (
      <button
        {...common}
        className={`flex h-5 w-5 items-center justify-center rounded text-sm leading-none text-white transition-colors ${
          open ? "bg-slate-800" : "bg-sky-600 hover:bg-sky-700"
        } ${className}`}
      >
        {open ? "×" : "+"}
      </button>
    );
  }

  return (
    <>
      {tooltip ? (
        <span className="group/tip relative inline-flex">
          {trigger}
          <span className="pointer-events-none absolute left-1/2 top-full z-[60] mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover/tip:opacity-100">
            {tooltip}
          </span>
        </span>
      ) : (
        trigger
      )}
      {open && ref.current && (
        <InserterPopover
          anchor={ref.current}
          onClose={close}
          onPick={(def) => { close(); onPick(def); }}
          onBrowseAll={() => { close(); onBrowseAll(); }}
        />
      )}
    </>
  );
}
