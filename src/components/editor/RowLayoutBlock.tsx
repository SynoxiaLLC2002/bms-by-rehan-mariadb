"use client";

// Row Layout — a container block whose columns hold real, editable blocks.
//
// Each column runs its own BlockNote instance and serialises into the row's
// `cols` prop. That is what makes a column behave like the page canvas: the
// slash menu, the formatting toolbar, drag handles and every custom block work
// inside it, without the page editor's document needing a column-aware schema.
//
// The spec is declared `isSelectable: false`, which makes BlockNote stop every
// DOM event at the row's node view — so typing in a column never reaches the
// outer editor, and Backspace in a column cannot delete the row.
//
// A column's schema comes from `editor.schema` — the page editor this row is
// rendered in. Reading it from the live editor rather than a module-level
// registry matters: a registry is populated once at import time, and a hot
// reload that re-evaluates it without re-running its writer leaves it empty,
// which crashed every column on the page.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createReactBlockSpec,
  useCreateBlockNote,
  SuggestionMenuController,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { filterSuggestionItems } from "@blocknote/core";
import {
  setActiveBlock,
  subscribeActiveBlock,
  registerNestedEditor,
  deleteBlockById,
  isPanelWriting,
  moveWithinEditor,
} from "@/lib/blockSettingsStore";
import { openBlockLibrary } from "@/lib/blockLibraryBus";
import { registerRowApi } from "@/lib/rowApi";
import { blockDefaultsFor } from "@/lib/blockDefaults";
import { resolveSection } from "@/lib/section";
import { ProtectBlocks } from "./protectBlocks";
import type { BlockDef } from "@/lib/blockLibrary";
import { SlashMenu, slashItems, insertBlockDef, type MenuItem } from "./slashMenu";
import SafeSideMenu from "./SafeSideMenu";
import Inserter from "./QuickInserter";
import {
  RowDivider,
  RowOverlay,
  clampColumns,
  rowCustomCss,
  rowLinkCss,
  columnsWithoutIds,
  emptyColumn,
  maxWidthLabel,
  parseAllColumns,
  resolveRow,
  serializeColumns,
  type AnyBlock,
  type RowColumnData,
} from "@/lib/rowLayout";

/** How long a column waits after the last keystroke before saving into the row. */
const SAVE_DEBOUNCE_MS = 300;

export const ROW_LAYOUT_PROPS = {
  bx:            { default: "" },
  columns:       { default: "2" },
  /** Width preset id — see ROW_PRESETS. */
  layout:        { default: "" },
  /** Pre-nesting props, still read so old rows keep their layout. */
  ratio:         { default: "" },
  gap:           { default: "" },
  padding:       { default: "" },
  gutter:        { default: "md" },
  gutterCustom:  { default: "" },
  vGutter:       { default: "md" },
  vGutterCustom: { default: "" },
  valign:        { default: "top" },
  mobileStack:   { default: "stack" },
  mobileOrder:   { default: "normal" },
  bgColor:       { default: "" },
  padT:          { default: "" },
  padR:          { default: "" },
  padB:          { default: "" },
  padL:          { default: "" },
  minHeight:     { default: "" },
  radius:        { default: "" },
  inheritMax:    { default: "true" },
  maxWidth:      { default: "" },
  maxWidthUnit:  { default: "px" },
  divTopStyle:   { default: "none" },
  divTopColor:   { default: "#ffffff" },
  divTopHeight:  { default: "60" },
  divTopFlip:    { default: "false" },
  divTopWidth:   { default: "100" },
  divBotStyle:   { default: "none" },
  divBotColor:   { default: "#ffffff" },
  divBotHeight:  { default: "60" },
  divBotFlip:    { default: "false" },
  divBotWidth:   { default: "100" },

  // ── Background ──────────────────────────────────────────────────────────
  /** "color" | "gradient" | "image". */
  bgType:        { default: "color" },
  gradType:      { default: "linear" },
  gradFrom:      { default: "" },
  gradTo:        { default: "" },
  gradAngle:     { default: "160" },
  bgImage:       { default: "" },
  bgSize:        { default: "cover" },
  bgPos:         { default: "center center" },
  bgRepeat:      { default: "no-repeat" },
  bgAttach:      { default: "scroll" },

  // ── Background overlay ──────────────────────────────────────────────────
  /** "" (none) | "color" | "gradient". */
  ovType:        { default: "" },
  ovColor:       { default: "" },
  ovGradType:    { default: "linear" },
  ovGradFrom:    { default: "" },
  ovGradTo:      { default: "" },
  ovGradAngle:   { default: "160" },
  ovOpacity:     { default: "30" },
  ovBlend:       { default: "normal" },

  // ── Border and shadow ───────────────────────────────────────────────────
  bdWidth:       { default: "" },
  bdStyle:       { default: "solid" },
  bdColor:       { default: "" },
  radTL:         { default: "" },
  radTR:         { default: "" },
  radBR:         { default: "" },
  radBL:         { default: "" },
  shadow:        { default: "false" },
  shX:           { default: "0" },
  shY:           { default: "8" },
  shBlur:        { default: "24" },
  shSpread:      { default: "0" },
  shColor:       { default: "" },

  // ── Text colours ────────────────────────────────────────────────────────
  textColor:     { default: "" },
  linkColor:     { default: "" },
  linkHoverColor:{ default: "" },

  // ── Structure ───────────────────────────────────────────────────────────
  htmlTag:       { default: "div" },
  maxHeight:     { default: "" },
  fullHeight:    { default: "false" },
  zIndex:        { default: "" },

  // ── Visibility by viewer ────────────────────────────────────────────────
  hideLoggedIn:  { default: "false" },
  hideLoggedOut: { default: "false" },

  // ── Escape hatches ──────────────────────────────────────────────────────
  /** Locks the layout: columns stay editable, row chrome goes away. */
  contentOnly:   { default: "false" },
  anchor:        { default: "" },
  cssClass:      { default: "" },
  customCss:     { default: "" },

  cols:          { default: "" },
};

// ─────────────────────────────────────────────────────────────────────────────
// One column: a nested editor plus its appenders
// ─────────────────────────────────────────────────────────────────────────────

interface ColumnCanvasProps {
  rowId: string;
  index: number;
  /** Read once, at mount — after that the nested editor owns its content. */
  initial: AnyBlock[];
  /** The page editor's schema, so a column accepts exactly the same blocks. */
  schema: any;
  editable: boolean;
  /** Drives the empty-column "+": a focused column shows its caret instead. */
  focused: boolean;
  onBlocks: (blocks: AnyBlock[]) => void;
  onFocus: () => void;
  onBlur: () => void;
}

/** A column counts as empty while it holds nothing but one blank paragraph. */
function isBlank(blocks: AnyBlock[]): boolean {
  if (blocks.length === 0) return true;
  if (blocks.length > 1) return false;
  const only = blocks[0];
  return (
    only?.type === "paragraph" &&
    (!Array.isArray(only.content) || only.content.length === 0)
  );
}

function ColumnCanvas({ rowId, index, initial, schema, editable, focused, onBlocks, onFocus, onBlur }: ColumnCanvasProps) {
  const editor = useCreateBlockNote(
    {
      schema,
      initialContent: initial && initial.length > 0 ? initial : undefined,
      // See BlockEditor: without this every column keeps an empty paragraph
      // pinned to its end that no delete can shift.
      trailingBlock: false,
      _tiptapOptions: { extensions: [ProtectBlocks] },
    },
    [schema]
  );

  // The parent re-renders on every keystroke it receives; keeping the callback
  // in a ref means the change subscription is set up once per editor.
  const onBlocksRef = useRef(onBlocks);
  onBlocksRef.current = onBlocks;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracked here rather than read off the row's props: the nested editor owns
  // its content between saves, and the "+" has to appear the instant the last
  // block is deleted — not one debounce later.
  const [blank, setBlank] = useState(() => isBlank(initial));

  /**
   * Defer mount to after first commit, for the same reason the page editor
   * does it — but the column needs it far more badly.
   *
   * A column's BlockNoteView is rendered from inside the row's ProseMirror node
   * view, so it always mounts during the *outer* editor's render phase. Building
   * an EditorView there hands its own node views a `getPos` the view has not
   * wired up yet, and BlockNote's block lookup calls `doc.resolve(getPos())`
   * straight away — which is `resolve(undefined)`, and takes the whole editor
   * down with "Position undefined out of range" before a row ever paints.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /**
   * Writes the column's blocks into the row.
   *
   * A blank document is stored as no blocks at all. ProseMirror will not let a
   * nested editor be truly empty, so deleting a column's last block leaves an
   * empty paragraph behind — and storing that paragraph made the column look
   * exactly as it did before the delete, with a fresh id. Normalising here is
   * what lets an emptied column fall back to its "+" placeholder.
   */
  const save = useCallback(() => {
    // Reading a torn-down editor throws; a column that is going away has
    // nothing left to save anyway.
    try {
      const doc = editor.document as AnyBlock[];
      onBlocksRef.current(isBlank(doc) ? [] : doc);
    } catch { /* gone */ }
  }, [editor]);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    save();
  }, [save]);

  /** Debounced so a keystroke does not rewrite the row's props each time. */
  const handleChange = useCallback(() => {
    try { setBlank(isBlank(editor.document as AnyBlock[])); } catch { /* gone */ }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      save();
    }, SAVE_DEBOUNCE_MS);
  }, [editor, save]);

  useEffect(
    // Never drop the last keystroke on unmount — a column can disappear because
    // the count dropped, and its content must still be stored.
    () => () => { if (timer.current) flush(); },
    [flush]
  );

  /** Mirrors the page editor: the selected block drives the settings sidebar. */
  const selectBlock = useCallback(
    (blockId: string) => {
      const ed = editor as any;
      const block = ed.getBlock?.(blockId);
      if (!block) return false;
      setActiveBlock({
        id: block.id,
        type: block.type,
        props: block.props ?? {},
        update: (np) => {
          ed.updateBlock(block, { props: np });
          flush();
        },
      });
      return true;
    },
    [editor, flush]
  );

  const handleSelectionChange = useCallback(() => {
    // See BlockEditor: a panel edit must not hand the selection to whatever
    // block the caret is parked in.
    if (isPanelWriting()) return;
    try {
      const block = (editor as any).getTextCursorPosition().block;
      if (block) selectBlock(block.id);
    } catch { /* no cursor yet */ }
  }, [editor, selectBlock]);

  // List View selects blocks by id; the page editor has no idea which column
  // owns a nested block, so every column offers to claim the id.
  useEffect(() => {
    const key = `${rowId}:${index}`;
    registerNestedEditor(key, {
      trySelect: (id) => {
        const claimed = selectBlock(id);
        if (claimed) {
          try {
            (editor as any).setTextCursorPosition(id, "start");
            (editor as any).focus();
          } catch { /* widget block */ }
        }
        return claimed;
      },
      tryRemove: (id) => {
        const ed = editor as any;
        if (!ed.getBlock?.(id)) return false;
        const doc = ed.document as { id: string }[];
        // A column's editor cannot hold an empty document either; emptying the
        // last block turns the column back into its "+" placeholder.
        if (doc.length <= 1) ed.replaceBlocks([id], [{ type: "paragraph" }]);
        else ed.removeBlocks([id]);
        setBlank(isBlank(ed.document as AnyBlock[]));
        flush();
        return true;
      },
      flush,
      tryGet: (id) => {
        try {
          return (editor as any).getBlock?.(id) ?? null;
        } catch {
          return null;
        }
      },
      tryInsertAfter: (id, blocks) => {
        const ed = editor as any;
        if (!ed.getBlock?.(id)) return null;
        const inserted = ed.insertBlocks(blocks, id, "after") ?? [];
        setBlank(false);
        flush();
        return inserted.map((b: { id: string }) => b.id);
      },
      tryMove: (id, dir) => {
        const ed = editor as any;
        if (!ed.getBlock?.(id)) return false;
        moveWithinEditor(ed, id, dir);
        flush();
        return true;
      },
    });
    return () => registerNestedEditor(key, null);
  }, [rowId, index, editor, selectBlock, flush]);

  const insert = useCallback((def: BlockDef) => insertBlockDef(editor, def), [editor]);

  const appendAtEnd = useCallback(
    (def: BlockDef) => {
      const doc = (editor as any).document as { id: string }[];
      insertBlockDef(editor, def, doc[doc.length - 1]?.id);
    },
    [editor]
  );

  // An untouched column is drawn as nothing but a centred "+", the way Kadence
  // draws one. Clicking the blank space around the button still falls through
  // to the editor, which focuses it and hands the column back its caret.
  const showPlus = editable && blank && !focused;

  return (
    <div
      className={`bms-col-canvas relative ${showPlus ? "bms-col-empty" : ""}`}
      onFocus={onFocus}
      // focusout also fires when moving between blocks inside the column, and
      // that is not the column losing focus.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onBlur();
      }}
    >
      {mounted ? (
        <BlockNoteView
          editor={editor}
          editable={editable}
          theme="light"
          slashMenu={false}
          sideMenu={false}
          onChange={handleChange}
          onSelectionChange={handleSelectionChange}
        >
          <SafeSideMenu />
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(slashItems(editor, insert) as MenuItem[], query)
            }
            suggestionMenuComponent={SlashMenu as any}
          />
        </BlockNoteView>
      ) : (
        // One frame only: the editor arrives on the next commit. Holding the
        // line height keeps the row from jumping as each column fills in.
        <div className="min-h-[2.25rem]" />
      )}

      {showPlus ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-2">
          {/* Reaching for the "+" is not the same as clicking into the column.
              Without stopping these, the column counts as focused, `showPlus`
              goes false, and the placeholder paragraph the empty editor has to
              carry is revealed with a caret — which looks exactly like the "+"
              silently inserted a paragraph before you chose anything. */}
          <div
            className="pointer-events-auto w-full"
            onMouseDown={(e) => e.stopPropagation()}
            onFocusCapture={(e) => e.stopPropagation()}
          >
            <Inserter
              variant="ghost"
              title="Add a block to this column"
              onPick={appendAtEnd}
              onBrowseAll={() => openBlockLibrary(appendAtEnd)}
            />
          </div>
        </div>
      ) : (
        editable && (
          <div className="px-2 pb-1 opacity-0 focus-within:opacity-100 group-hover/row:opacity-100 transition-opacity">
            <Inserter
              variant="bar"
              title="Add a block to this column"
              onPick={appendAtEnd}
              onBrowseAll={() => openBlockLibrary(appendAtEnd)}
            />
          </div>
        )
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The row itself
// ─────────────────────────────────────────────────────────────────────────────

const toolBtn =
  "w-7 h-7 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 text-xs transition-colors";

function RowLayoutRender({ block, editor }: { block: any; editor: any }) {
  const p = block.props as Record<string, string>;
  const row = useMemo(() => resolveRow(p), [p]);
  const count = row.count;
  // A read-only page editor must not hand out editable columns.
  const editable = editor.isEditable !== false;
  // "Content only" keeps the columns typeable but takes away everything that
  // would change the row's shape — the Kadence lock, for handing a built
  // layout to someone who should only be filling it in.
  const locked = p.contentOnly === "true";
  // Columns are built from the page editor's own schema, so they accept exactly
  // the blocks the page does — and nothing has to register it anywhere.
  const schema = editor?.schema;

  const [focusedCol, setFocusedCol] = useState<number | null>(null);
  const [rowActive, setRowActive] = useState(false);
  /** The selected element is inside one of this row's columns. */
  const [childActive, setChildActive] = useState(false);
  /** Which column is open in the sidebar as a Section, if any. */
  const [activeSection, setActiveSection] = useState<number | null>(null);

  useEffect(
    () =>
      subscribeActiveBlock((active) => {
        // A Section is stored under its row's id, so "is this row selected" has
        // to look at the type too — otherwise picking a column lights up the
        // whole row and the author cannot tell what they are editing.
        const mine = active?.id === block.id;
        const section = mine && active?.type === "section";
        setRowActive(mine && !section);
        const index = section ? parseInt(active!.props?.__index ?? "", 10) : NaN;
        setActiveSection(Number.isInteger(index) ? index : null);
        // Selecting something inside a column must not light up the row's
        // toolbar too — two ⧉ on screen, one of which duplicates the whole row.
        let inside = false;
        if (active && !mine && typeof document !== "undefined") {
          const el = document.querySelector(`[data-id="${active.id}"]`);
          inside = el?.closest("[data-row-id]")?.getAttribute("data-row-id") === block.id;
        }
        setChildActive(inside);
      }),
    [block.id]
  );

  const selected = rowActive || focusedCol !== null || activeSection !== null;

  /** Writes columns back into the row without stealing focus from a column. */
  const commit = useCallback(
    (next: RowColumnData[]) => {
      const el = document.activeElement as HTMLElement | null;
      try {
        editor.updateBlock(block.id, { props: { cols: serializeColumns(next) } });
      } catch (err) {
        // The row can genuinely go away mid-edit, but anything else here means
        // a column's changes never reached the document.
        console.warn("[row] could not write columns", err);
      }
      if (el && el.isConnected && document.activeElement !== el) {
        try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
      }
    },
    [editor, block.id]
  );

  /** The row's columns as they are right now, not as they were at last render. */
  const liveColumns = useCallback(
    (upTo = 0) => {
      const live = (editor.getBlock?.(block.id) as any) ?? block;
      const all = parseAllColumns(live.props?.cols);
      // A column added by raising the column count starts from the saved
      // Section default, the same way a new block does.
      while (all.length <= upTo) all.push(emptyColumn(blockDefaultsFor("section")));
      return all;
    },
    [editor, block]
  );

  const setColumnBlocks = useCallback(
    (index: number, blocks: AnyBlock[]) => {
      const all = liveColumns(index);
      const current = all[index];
      if (JSON.stringify(current.blocks ?? []) === JSON.stringify(blocks)) return;
      all[index] = { ...current, blocks };
      commit(all);
    },
    [commit, liveColumns]
  );

  /** Opens one column's Section panel — the canvas twin of the List View row. */
  const selectSection = useCallback((index: number) => {
    const all = liveColumns();
    const current = all[index] ?? { blocks: [] };
    const styles: Record<string, string> = {};
    for (const [key, value] of Object.entries(current)) {
      if (key !== "blocks" && typeof value === "string") styles[key] = value;
    }
    setActiveBlock({
      id: block.id,
      type: "section",
      props: { ...styles, __index: String(index) },
      update: (np) => {
        const cols = liveColumns(index);
        const patch = { ...np };
        delete patch.__index;
        cols[index] = { ...cols[index], ...patch };
        commit(cols);
      },
    });
  }, [block.id, liveColumns, commit]);

  // Column styling is driven from the sidebar, which has no way to reach a
  // column otherwise — and must not write the stale `cols` it holds.
  useEffect(() => {
    registerRowApi(block.id, {
      getColumns: () => liveColumns(),
      setColumnStyle: (index, patch) => {
        const all = liveColumns(index);
        all[index] = { ...all[index], ...patch };
        commit(all);
      },
      selectSection,
    });
    return () => registerRowApi(block.id, null);
  }, [block.id, liveColumns, commit, selectSection]);

  const selectRow = useCallback(() => {
    setActiveBlock({
      id: block.id,
      type: "rowLayout",
      props: p,
      update: (np) => {
        // The sidebar sends back the whole props snapshot it was given, and its
        // copy of `cols` is one keystroke old the moment a column is edited.
        const { cols: _stale, ...rest } = np;
        editor.updateBlock(block.id, { props: rest });
      },
    });
  }, [block.id, editor, p]);

  const setProp = (key: string, value: string) => {
    try { editor.updateBlock(block.id, { props: { [key]: value } }); } catch { /* ignore */ }
  };

  const move = (dir: -1 | 1) => {
    try {
      const doc = editor.document as { id: string }[];
      const idx = doc.findIndex((b) => b.id === block.id);
      const target = doc[idx + dir];
      if (!target) return;
      const copy = { type: block.type, props: { ...block.props } };
      editor.removeBlocks([block.id]);
      editor.insertBlocks([copy], target.id, dir === -1 ? "before" : "after");
    } catch { /* ignore */ }
  };

  const cycleValign = () => {
    const order = ["top", "middle", "bottom"];
    const current = p.valign === "center" ? "middle" : p.valign || "top";
    setProp("valign", order[(order.indexOf(current) + 1) % order.length]);
  };

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  // One stable class per row, so generated rules cannot reach another one.
  const shellClass = `row-${String(block.id).replace(/[^a-zA-Z0-9]/g, "")}-shell`;
  const shellCss = `${rowLinkCss(p, shellClass)}${rowCustomCss(p, shellClass)}`;

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: row.template,
    columnGap: `${row.gap}px`,
    rowGap: `${row.rowGap}px`,
    alignItems: row.alignItems,
  };

  return (
    <div
      contentEditable={false}
      data-row-id={block.id}
      className={`bms-row group/row relative my-1 mt-5 rounded-md border transition-colors ${
        locked
          ? "border-transparent"
          : rowActive || activeSection !== null
            ? "border-sky-500"
            : selected
              ? "border-sky-300/60"
              : "border-transparent hover:border-sky-300/70"
      }`}
      onClick={(e) => {
        // Clicks that land on a column belong to the block inside it.
        if ((e.target as HTMLElement).closest("[data-row-col]")) return;
        selectRow();
      }}
    >
      {/* Block toolbar — clears the width tag below it */}
      <div
        className={`absolute -top-11 left-1/2 -translate-x-1/2 z-20 items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1 py-0.5 shadow-md ${
          // Only when the row itself is what the author picked. With the caret
          // inside a column the block there is the subject; that block has
          // its own toolbar, and this one would duplicate the wrong thing.
          !editable || locked
            ? "hidden"
            : rowActive || activeSection !== null
              ? "flex"
              : childActive || focusedCol !== null
                ? "hidden"
                : "hidden group-hover/row:flex"
        }`}
      >
        <span className="px-1.5 text-[11px] font-bold text-violet-500" title="Row Layout">▦</span>
        <span className="mx-0.5 h-4 w-px bg-slate-200" />
        <button title="Move up" className={toolBtn} onMouseDown={stop(() => move(-1))}>↑</button>
        <button title="Move down" className={toolBtn} onMouseDown={stop(() => move(1))}>↓</button>
        <button title="Vertical align" className={toolBtn} onMouseDown={stop(cycleValign)}>
          {row.alignItems === "center" ? "⬍" : row.alignItems === "end" ? "⤓" : "⤒"}
        </button>
        <button
          title="Add column"
          className={toolBtn}
          onMouseDown={stop(() => setProp("columns", String(clampColumns(count + 1))))}
        >
          ⊞
        </button>
        <button
          title="Duplicate row"
          className={toolBtn}
          onMouseDown={stop(() => {
            try {
              editor.insertBlocks(
                [{
                  type: "rowLayout",
                  props: {
                    ...block.props,
                    cols: serializeColumns(columnsWithoutIds(liveColumns())),
                  },
                }],
                block.id,
                "after"
              );
            } catch { /* ignore */ }
          })}
        >
          ⧉
        </button>
        <button title="Row settings" className={toolBtn} onMouseDown={stop(selectRow)}>⚙</button>
        <span className="mx-0.5 h-4 w-px bg-slate-200" />
        <button
          title="Delete row"
          className={`${toolBtn} hover:text-red-600`}
          // Routed through the store so the settings panel lets go of the row
          // instead of editing a block that is no longer in the document.
          onMouseDown={stop(() => deleteBlockById(block.id))}
        >
          ✕
        </button>
      </div>

      {/* Width tag — only worth the pixels once the row stops inheriting the
          theme width, which is the only case where the number is news. */}
      {p.inheritMax === "false" && (
        <div
          className={`absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 rounded bg-emerald-500 px-2 py-px text-[9px] font-semibold uppercase tracking-wide text-white ${
            selected ? "block" : "hidden group-hover/row:block"
          }`}
        >
          {maxWidthLabel(p)}
        </div>
      )}

      <div
        id={row.anchor}
        className={["relative overflow-hidden", shellClass, row.extraClass].filter(Boolean).join(" ")}
        style={{
          background: row.background,
          color: row.color,
          padding: row.padding,
          minHeight: row.minHeight,
          maxHeight: row.maxHeight,
          border: row.border,
          borderRadius: row.borderRadius,
          boxShadow: row.boxShadow,
        }}
      >
        {/* Link colours and the author's own CSS target descendants, so the
            editor has to carry them as rules too or the canvas stops matching
            the published page. */}
        {shellCss && <style>{shellCss}</style>}
        {row.overlay && <RowOverlay {...row.overlay} />}
        <RowDivider {...row.top} />
        <RowDivider {...row.bottom} />

        {/* Content rides above the overlay and the divider shapes. */}
        <div
          className="relative"
          style={{ zIndex: 1, maxWidth: row.maxWidth, marginInline: row.maxWidth ? "auto" : undefined }}
        >
          <div style={gridStyle}>
            {row.columns.map((col, i) => {
              // The canvas reads a column through the same resolver the page
              // does, so a Section styled here looks the same once published.
              const secScope = `${shellClass}-sec${i}`;
              const sec = resolveSection(col, secScope);
              return (
              <div
                key={i}
                data-row-col={i}
                onClick={(e) => {
                  // Clicking the column's own chrome selects the Section; a
                  // click that landed on its content belongs to that block.
                  if (e.target === e.currentTarget) selectSection(i);
                }}
                className={`bms-col relative min-w-0 rounded border transition-colors ${secScope} ${
                  activeSection === i
                    ? "border-violet-500 ring-2 ring-violet-300/60"
                    : focusedCol === i
                      ? "border-sky-400"
                      : selected
                        ? "border-slate-200 hover:border-sky-300"
                        : "border-transparent group-hover/row:border-slate-200/90"
                } ${sec.extraClass ?? ""}`}
                style={{
                  ...(sec.style as React.CSSProperties),
                  // The row's own border is the selection affordance here, so
                  // the Section's border cannot be allowed to replace it.
                  border: undefined,
                  alignSelf: col.valign
                    ? col.valign === "middle" ? "center" : col.valign === "bottom" ? "end" : "start"
                    : undefined,
                }}
              >
                {sec.css && <style>{sec.css}</style>}
                {sec.overlay && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: sec.overlay.background,
                      opacity: sec.overlay.opacity,
                      mixBlendMode: sec.overlay.blend as React.CSSProperties["mixBlendMode"],
                      pointerEvents: "none",
                    }}
                  />
                )}
                {schema ? (
                  <ColumnCanvas
                    rowId={block.id}
                    index={i}
                    schema={schema}
                    editable={editable}
                    focused={focusedCol === i}
                    initial={col.blocks ?? []}
                    onBlocks={(blocks) => setColumnBlocks(i, blocks)}
                    onFocus={() => setFocusedCol(i)}
                    onBlur={() => setFocusedCol((v) => (v === i ? null : v))}
                  />
                ) : (
                  // Never take the whole editor down with the row: a column
                  // without a schema is a broken column, not a broken page.
                  <p className="p-3 text-[11px] text-slate-400">Column unavailable</p>
                )}
              </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export const RowLayoutBlock = createReactBlockSpec(
  {
    type: "rowLayout" as const,
    propSchema: ROW_LAYOUT_PROPS,
    content: "none" as const,
    // Keeps every event inside the row: the columns are editors of their own.
    isSelectable: false,
  },
  {
    render: ({ block, editor }: any) => <RowLayoutRender block={block} editor={editor} />,
  }
);
