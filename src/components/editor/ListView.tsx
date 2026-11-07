"use client";

// The left rail: the document as a tree, plus a headings-only outline.
//
// Row Layout columns hold their own blocks, so the tree is not simply the
// editor's document — a row contributes its nested blocks as children, which is
// how a paragraph inside a column becomes reachable from here.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  reorderBlocks,
  selectBlockById,
  subscribeActiveBlock,
  deleteBlockById,
  getBlockById,
  insertBlocksAfter,
} from "@/lib/blockSettingsStore";
import { parseColumns, type AnyBlock } from "@/lib/rowLayout";
import { copyBlocks, parseBlocks, readClipboardBlocks } from "@/lib/blockClipboard";
import { getRowApi } from "@/lib/rowApi";
import { blockMeta } from "@/lib/blockMeta";
import { parseItems } from "@/lib/iconList";
import { parsePanes } from "@/lib/accordion";
import { setActiveListItem, subscribeActiveListItem } from "@/lib/listItemBus";

function preview(block: AnyBlock): string {
  const content = Array.isArray(block.content) ? block.content : [];
  const text = content.map((c: AnyBlock) => c.text ?? "").join("").trim();
  if (text) return text.slice(0, 36);
  const p = block.props ?? {};
  if (p.text) return String(p.text).slice(0, 36);
  if (p.url) return String(p.url).slice(0, 36);
  return "";
}

interface Row {
  /** Stable key and collapse handle. Columns are not blocks, so they get one. */
  id: string;
  block: AnyBlock;
  depth: number;
  /** Which column of the parent row this row is, for column rows. */
  column?: number;
  /** Top-level blocks can be dragged to reorder; nested ones cannot. */
  draggable: boolean;
  /** Column and item rows are structure, not blocks of their own. */
  kind: "block" | "column" | "item";
  /** Which list item this row is, for item rows. */
  item?: number;
  /** The glyph an item row shows in place of a block badge. */
  itemIcon?: string;
  /** The text an item row shows, already resolved by `subItemsOf`. */
  itemLabel?: string;
  /** The Row Layout a column belongs to. */
  rowId?: string;
  /** Whether this row has anything under it, so it can offer a caret. */
  hasChildren: boolean;
}

const columnRowId = (rowId: string, index: number) => `${rowId}:col:${index}`;
const itemRowId = (blockId: string, index: number) => `${blockId}:item:${index}`;

function rowColumns(block: AnyBlock) {
  return parseColumns(block.props?.cols, parseInt(block.props?.columns) || 2);
}

function childrenOf(block: AnyBlock): AnyBlock[] {
  return Array.isArray(block.children) ? block.children : [];
}

/**
 * The sub-parts a block owns that are not blocks of their own.
 *
 * An Icon List item and an Accordion pane are what an author thinks they are
 * selecting, so the tree lists them the way Kadence does — even though each is
 * a record inside one block's props rather than a block.
 */
function subItemsOf(block: AnyBlock): { label: string; icon: string }[] {
  if (block.type === "iconList") {
    const listIcon = String(block.props?.icon ?? "") || "✓";
    return parseItems(block.props?.items).map((it, i) => ({
      label: String(it.text ?? "").replace(/==([^=]+)==/g, "$1").trim() || `Item ${i + 1}`,
      icon: String(it.icon ?? "") || listIcon,
    }));
  }
  if (block.type === "accordion") {
    return parsePanes(block.props?.items).map((it, i) => ({
      label: String(it.title ?? "").trim() || `Pane ${i + 1}`,
      icon: "▾",
    }));
  }
  return [];
}

/**
 * The document as a tree, to whatever depth it actually nests.
 *
 * A Row Layout contributes a node per column and then that column's blocks —
 * matching how the canvas is built, and how a page builder's list view reads.
 * Rows inside columns recurse, so a layout nested three deep is still
 * navigable rather than silently flattened.
 */
function walk(
  blocks: AnyBlock[],
  depth: number,
  collapsed: Set<string>,
  out: Row[],
  draggable: boolean
): void {
  for (const block of blocks) {
    const isRow = block.type === "rowLayout";
    const kids = childrenOf(block);
    const subItems = subItemsOf(block);
    out.push({
      id: block.id,
      block,
      depth,
      draggable,
      kind: "block",
      hasChildren: isRow || kids.length > 0 || subItems.length > 0,
    });
    if (collapsed.has(block.id)) continue;

    if (subItems.length > 0) {
      subItems.forEach((it, ii) => {
        out.push({
          id: itemRowId(block.id, ii),
          block,
          depth: depth + 1,
          item: ii,
          itemIcon: it.icon,
          itemLabel: it.label,
          draggable: false,
          kind: "item",
          hasChildren: false,
        });
      });
      continue;
    }

    if (isRow) {
      rowColumns(block).forEach((col, ci) => {
        const id = columnRowId(block.id, ci);
        const colBlocks = col.blocks ?? [];
        out.push({
          id,
          block,
          depth: depth + 1,
          column: ci,
          draggable: false,
          kind: "column",
          rowId: block.id,
          hasChildren: colBlocks.length > 0,
        });
        if (collapsed.has(id)) return;
        walk(colBlocks, depth + 2, collapsed, out, false);
      });
      continue;
    }

    if (kids.length > 0) walk(kids, depth + 1, collapsed, out, false);
  }
}

function flatten(blocks: AnyBlock[], collapsed: Set<string>): Row[] {
  const out: Row[] = [];
  walk(blocks, 0, collapsed, out, true);
  return out;
}

interface ListViewProps {
  blocks: AnyBlock[];
  onSelect?: (id: string) => void;
}

export default function ListView({ blocks, onSelect }: ListViewProps) {
  const [tab, setTab] = useState<"list" | "outline">("list");
  const [dragId, setDragId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  /** `rowId:index` of the column open in the sidebar, if one is. */
  const [activeSection, setActiveSection] = useState<string | null>(null);
  /** Which Icon List item the panel is on, so the tree can mark it. */
  const [activeItem, setActiveItem] = useState<{ blockId: string; index: number } | null>(null);

  useEffect(() => subscribeActiveListItem(setActiveItem), []);

  useEffect(
    () =>
      subscribeActiveBlock((b) => {
        setActiveId(b?.id ?? null);
        setActiveSection(
          b && b.type === "section" ? columnRowId(b.id, parseInt(b.props?.__index ?? "0", 10) || 0) : null
        );
      }),
    []
  );

  // `blocks` is a fresh array on every keystroke (BlockEditor's onChange
  // replaces it wholesale), and this tree walk recurses into every nested
  // Row Layout column — memoized so typing in the canvas doesn't also re-walk
  // the whole document twice per character in this sidebar.
  const rows = useMemo(() => flatten(blocks, collapsed), [blocks, collapsed]);
  // The outline walks the same tree, so a heading inside a Row Layout column is
  // listed too — it is part of the document's structure either way. Built from
  // an uncollapsed walk so collapsing a row in List View cannot hide it here.
  const headings = useMemo(
    () =>
      flatten(blocks, new Set<string>())
        .filter((r) => r.kind === "block" && r.block.type === "heading")
        .map((r) => r.block),
    [blocks]
  );

  const listRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 1400);
  };

  const select = (id: string) => {
    const el = document.querySelector(`[data-id="${id}"]`) ?? document.querySelector(`[data-row-id="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const caretPlaced = selectBlockById(id);
    onSelect?.(id);
    // A typing block keeps the caret the editor just placed in it. For any
    // other element keep keyboard focus here, so Ctrl+C / Ctrl+V act on the
    // element the author just picked rather than on whatever the canvas had.
    if (!caretPlaced) listRef.current?.focus({ preventScroll: true });
  };

  /**
   * Copy the selected block — the whole element, exactly as stored — and
   * paste it after the selected block (or at the end). Cross-document too:
   * the clipboard carries JSON, so a Row Layout copied in one post pastes
   * into another with every column and setting intact.
   */
  const copyActive = async () => {
    if (!activeId) return;
    const block = getBlockById(activeId);
    if (!block) return flash("Nothing to copy");
    const ok = await copyBlocks([block]);
    flash(ok ? `Copied ${blockMeta(block.type).label}` : "Copy failed");
  };
  const pasteBlocks = (blocks: Record<string, unknown>[] | null) => {
    if (!blocks || blocks.length === 0) return flash("Clipboard has no block");
    const ids = insertBlocksAfter(blocks, activeId);
    flash(`Pasted ${blocks.length === 1 ? blockMeta(blocks[0].type as string).label : `${blocks.length} blocks`}`);
    if (ids[0]) setTimeout(() => select(ids[0]), 50);
  };
  // Ctrl+V arrives as a native paste event carrying the data — no permission
  // needed — so the key itself is left alone and handled there.
  const onPaste = (e: React.ClipboardEvent) => {
    const blocks = parseBlocks(e.clipboardData.getData("text/plain"));
    if (!blocks) return;
    e.preventDefault();
    pasteBlocks(blocks);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key.toLowerCase() === "c") {
      e.preventDefault();
      void copyActive();
    }
  };

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <div className="flex border-b border-slate-100 shrink-0">
        {(["list", "outline"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
              tab === t ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {t === "list" ? "List View" : "Outline"}
          </button>
        ))}
      </div>

      <div
        ref={listRef}
        tabIndex={0}
        onKeyDown={onKeyDown} onPaste={onPaste}
        className="relative overflow-y-auto flex-1 py-1 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sky-300"
        title="Select an element, then Ctrl+C copies it and Ctrl+V pastes it after the selection"
      >
        {notice && (
          <div className="pointer-events-none sticky top-1 z-10 mx-2 rounded-md bg-slate-900 px-2 py-1 text-center text-[11px] text-white shadow">
            {notice}
          </div>
        )}
        {tab === "list" && (
          <>
            {rows.length === 0 && (
              <p className="text-[11px] text-slate-400 text-center py-6 px-3">No blocks yet</p>
            )}
            {rows.map((row) => {
              const { id, block, depth, draggable, kind, hasChildren } = row;
              const isColumn = kind === "column";
              const isItem = kind === "item";
              const m = blockMeta(block.type);
              const level = block.type === "heading" ? block.props?.level ?? 1 : 0;
              const badge = isItem
                ? row.itemIcon || "•"
                : isColumn
                  ? "▥"
                  : block.type === "heading"
                    ? `H${level}`
                    : m.badge;
              const label = isItem
                ? `Item ${(row.item ?? 0) + 1}`
                : isColumn
                  ? `Column ${(row.column ?? 0) + 1}`
                  : m.label;
              const color = isItem ? "#0ea5e9" : isColumn ? "#8b5cf6" : m.color;
              const active = isItem
                ? activeItem?.blockId === block.id && activeItem?.index === row.item
                : isColumn
                  ? activeSection === id
                  : activeId === block.id;
              const text = isItem
                ? (row.itemLabel ?? "").slice(0, 36)
                : isColumn
                  ? ""
                  : preview(block);

              return (
                <div
                  key={id}
                  draggable={draggable}
                  onDragStart={() => draggable && setDragId(block.id)}
                  onDragOver={(e) => draggable && e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggable && dragId && dragId !== block.id) reorderBlocks(dragId, block.id);
                    setDragId(null);
                  }}
                  className={`group/lv flex items-center gap-1 pr-1 transition-colors ${
                    active ? (isColumn ? "bg-violet-50" : "bg-sky-50") : "hover:bg-slate-50"
                  } ${dragId === block.id ? "opacity-40" : ""}`}
                  style={{ paddingLeft: `${8 + depth * 14}px` }}
                >
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => toggle(id)}
                      title={collapsed.has(id) ? "Expand" : "Collapse"}
                      className="w-4 shrink-0 text-[9px] text-slate-400 hover:text-slate-700"
                    >
                      {collapsed.has(id) ? "▸" : "▾"}
                    </button>
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}

                  <button
                    type="button"
                    // A column is not a BlockNote block, so it cannot go through
                    // the normal selector — the row that owns it opens its
                    // Section panel, falling back to selecting the row itself if
                    // that row is not currently mounted.
                    onClick={() => {
                      // An item is not a block: select the list that owns it,
                      // then tell the panel which item to open.
                      if (isItem) {
                        select(block.id);
                        setActiveListItem({ blockId: block.id, index: row.item ?? 0 });
                        return;
                      }
                      if (!isColumn) return select(block.id);
                      const api = getRowApi(row.rowId!);
                      if (api) api.selectSection(row.column ?? 0);
                      else select(row.rowId!);
                    }}
                    className={`flex flex-1 items-center gap-2 py-1.5 text-left min-w-0 ${
                      draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                    }`}
                  >
                    <span
                      className="text-[9px] font-bold shrink-0 w-7 h-5 flex items-center justify-center rounded"
                      style={{ backgroundColor: color + "20", color }}
                    >
                      {badge}
                    </span>
                    <span className={`text-[11px] truncate leading-tight ${
                      active
                        ? isColumn ? "text-violet-700 font-medium" : "text-sky-700 font-medium"
                        : isColumn || isItem ? "text-slate-500" : "text-slate-600"
                    }`}>
                      {text || <span className={isColumn ? "" : "italic text-slate-400"}>{label}</span>}
                    </span>
                  </button>

                  {!isColumn && !isItem && (
                    <>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const b = getBlockById(block.id);
                          if (b) flash((await copyBlocks([b])) ? `Copied ${m.label}` : "Copy failed");
                        }}
                        title={`Copy this ${m.label} (Ctrl+C)`}
                        className="h-5 w-5 shrink-0 rounded text-[10px] leading-none text-slate-300 opacity-0 transition-colors hover:bg-sky-50 hover:text-sky-600 focus-visible:opacity-100 group-hover/lv:opacity-100"
                      >
                        ⧉
                      </button>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const blocks = await readClipboardBlocks();
                          if (!blocks?.length) return flash("Clipboard has no block");
                          const ids = insertBlocksAfter(blocks, block.id);
                          flash("Pasted");
                          if (ids[0]) setTimeout(() => select(ids[0]), 50);
                        }}
                        title="Paste the copied element after this one (Ctrl+V)"
                        className="h-5 w-5 shrink-0 rounded text-[10px] leading-none text-slate-300 opacity-0 transition-colors hover:bg-emerald-50 hover:text-emerald-600 focus-visible:opacity-100 group-hover/lv:opacity-100"
                      >
                        ⤵
                      </button>
                    </>
                  )}
                  {!isColumn && !isItem && (
                    <button
                      type="button"
                      onClick={() => deleteBlockById(block.id)}
                      title={`Delete this ${m.label}`}
                      className="h-5 w-5 shrink-0 rounded text-[10px] leading-none text-slate-300 opacity-0 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover/lv:opacity-100"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}

        {tab === "outline" && (
          <>
            {headings.length === 0 && (
              <p className="text-[11px] text-slate-400 text-center py-6 px-3">No headings yet</p>
            )}
            {headings.map((block) => {
              const level = block.props?.level ?? 1;
              const text = preview(block);
              return (
                <button
                  key={block.id}
                  onClick={() => select(block.id)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-50 transition-colors text-left"
                  style={{ paddingLeft: `${12 + (level - 1) * 10}px` }}
                >
                  <span className="text-[9px] font-bold text-sky-500 shrink-0">H{level}</span>
                  <span className={`text-[11px] text-slate-600 truncate ${level > 1 ? "opacity-70" : "font-medium"}`}>
                    {text || <span className="italic text-slate-400">Untitled heading</span>}
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
