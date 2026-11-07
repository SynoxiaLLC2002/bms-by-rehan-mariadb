"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardCopy, ClipboardPaste, Copy, Paintbrush, Star, Trash2 } from "lucide-react";
import {
  deleteBlockById,
  getActiveBlock,
  getBlockById,
  insertBlocksAfter,
  moveBlockById,
  selectBlockById,
  subscribeActiveBlock,
  updateActiveBlockProps,
} from "@/lib/blockSettingsStore";
import { copyBlocks, stripIds } from "@/lib/blockClipboard";
import { applyStyle, copyStyle, getCopiedStyle } from "@/lib/styleClipboard";
import { blockMeta } from "@/lib/blockMeta";
import { saveReusableBlock } from "./customBlocks";

// A small toolbar that follows whichever element is selected — a paragraph, a
// heading, a list item, inside a column or not — with the few actions every
// element needs: move, duplicate, copy, delete.
//
// Row Layout draws its own toolbar (RowLayoutBlock.tsx) because it has row-only
// actions; this one steps aside for it. Everything else — text blocks, which
// had no toolbar at all, and custom blocks, which had a hover-only one — is
// handled here, so the selected element and the element ⧉ acts on are always
// the same thing. Before this, with the caret in a paragraph inside a Row
// Layout the only visible ⧉ was the row's, and it duplicated the whole row.

const btn = "flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800";

/** Row Layout draws its own toolbar (align, add column, row settings). */
function ownToolbar(el: HTMLElement): boolean {
  // The block's own content, not a nested block's: a paragraph inside a row's
  // column is a different [data-id] and never reaches here through the row.
  const content = el.querySelector(":scope > .bn-block > .bn-block-content, :scope .bn-block-content");
  if (!content) return false;
  return !!content.querySelector(":scope > .bms-row, :scope > * > .bms-row");
}

/** BlockNote's built-in blocks; everything else is one of ours and can be saved as reusable. */
const BUILT_IN = new Set(["paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem", "quote", "table", "codeBlock", "image", "video", "audio", "file"]);

export default function ActiveBlockToolbar({ host }: { host: React.RefObject<HTMLDivElement | null> }) {
  const [active, setActive] = useState<{ id: string; type: string } | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Hidden while the author types; back on the next mouse movement. */
  const [typing, setTyping] = useState(false);
  const [styleMenu, setStyleMenu] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeActiveBlock((b) => setActive(b ? { id: b.id, type: b.type } : null)), []);
  // Another element selected: the menu belonged to the previous one.
  useEffect(() => setStyleMenu(false), [active?.id]);

  const place = useCallback(() => {
    const root = host.current;
    if (!root || !active) {
      setPos(null);
      return;
    }
    const el = root.querySelector<HTMLElement>(`[data-id="${active.id}"]`);
    if (!el || ownToolbar(el)) {
      setPos(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const h = root.getBoundingClientRect();
    if (r.height === 0) {
      setPos(null);
      return;
    }
    const width = barRef.current?.offsetWidth ?? 190;
    const height = barRef.current?.offsetHeight ?? 30;
    // Beside the block when the canvas has room on the right, so it never
    // covers text; otherwise just above the block's top edge.
    const besideLeft = r.right - h.left + 10;
    if (besideLeft + width <= h.width - 4) {
      setPos({ top: r.top - h.top, left: besideLeft });
    } else {
      setPos({
        top: Math.max(0, r.top - h.top - height - 6),
        left: Math.max(8, Math.min(r.right - h.left - width, h.width - width - 8)),
      });
    }
  }, [active, host]);

  // Follow the block as the document, the scroll position or the window change.
  useLayoutEffect(() => {
    place();
    if (!active) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    const root = host.current;
    const mo = root ? new MutationObserver(schedule) : null;
    if (root) mo!.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      mo?.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [active, place, host]);

  useEffect(() => {
    const root = host.current;
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.key.length > 1 && !["Backspace", "Delete", "Enter"].includes(e.key))) return;
      setTyping(true);
    };
    const onMove = () => setTyping(false);
    root.addEventListener("keydown", onKey, true);
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      root.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousemove", onMove);
    };
  }, [host]);

  const flash = (text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 1200);
  };

  if (!active || !pos || typing) return null;
  const label = blockMeta(active.type).label;
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  return (
    <div
      ref={barRef}
      contentEditable={false}
      className="pointer-events-auto absolute z-20 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1 py-0.5 shadow-md"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="max-w-[110px] truncate px-1.5 text-[11px] font-semibold text-slate-500" title={label}>
        {notice ?? label}
      </span>
      <span className="mx-0.5 h-4 w-px bg-slate-200" />
      <button type="button" title="Move up" className={btn} onMouseDown={stop(() => moveBlockById(active.id, -1))}>
        <ArrowUp size={13} />
      </button>
      <button type="button" title="Move down" className={btn} onMouseDown={stop(() => moveBlockById(active.id, 1))}>
        <ArrowDown size={13} />
      </button>
      <button
        type="button"
        title={`Duplicate this ${label.toLowerCase()}`}
        className={btn}
        onMouseDown={stop(() => {
          const block = getBlockById(active.id);
          if (!block) return;
          const ids = insertBlocksAfter(stripIds([block]), active.id);
          if (ids[0]) setTimeout(() => selectBlockById(ids[0]), 30);
        })}
      >
        <Copy size={13} />
      </button>
      <button
        type="button"
        title="Copy (paste anywhere with Ctrl+V)"
        className={btn}
        onMouseDown={stop(async () => {
          const block = getBlockById(active.id);
          if (!block) return;
          flash((await copyBlocks([block])) ? "Copied" : "Copy failed");
        })}
      >
        <ClipboardCopy size={13} />
      </button>
      <div className="relative">
        <button
          type="button"
          title="Copy / paste style"
          className={`${btn} ${styleMenu ? "bg-slate-100 text-slate-800" : ""}`}
          onMouseDown={stop(() => setStyleMenu((o) => !o))}
        >
          <Paintbrush size={13} />
        </button>
        {styleMenu && (
          <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
              onMouseDown={stop(() => {
                const block = getBlockById(active.id);
                if (!block) return;
                copyStyle(block.type, block.props ?? {});
                setStyleMenu(false);
                flash("Style copied");
              })}
            >
              Copy style <Copy size={12} className="text-slate-400" />
            </button>
            <button
              type="button"
              disabled={!getCopiedStyle()}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              onMouseDown={stop(() => {
                const block = getBlockById(active.id);
                setStyleMenu(false);
                if (!block) return;
                const next = applyStyle(block.type, block.props ?? {});
                if (!next) {
                  flash(getCopiedStyle() ? "No matching style" : "Nothing copied");
                  return;
                }
                // Through the store rather than the editor directly, so the
                // sidebar shows the pasted values straight away.
                if (getActiveBlock()?.id !== active.id) return;
                updateActiveBlockProps(next as Record<string, string>);
                flash("Style pasted");
              })}
            >
              Paste style <ClipboardPaste size={12} className="text-slate-400" />
            </button>
          </div>
        )}
      </div>
      {!BUILT_IN.has(active.type) && (
        <button
          type="button"
          title="Save as reusable block"
          className={btn}
          onMouseDown={stop(() => {
            const block = getBlockById(active.id);
            if (!block) return;
            const name = window.prompt("Name this reusable block:");
            if (name) {
              saveReusableBlock(name, block);
              flash("Saved");
            }
          })}
        >
          <Star size={13} />
        </button>
      )}
      <span className="mx-0.5 h-4 w-px bg-slate-200" />
      <button type="button" title="Delete" className={`${btn} hover:text-red-600`} onMouseDown={stop(() => deleteBlockById(active.id))}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}
