// Module-level singleton — bridges block renders (inside BlockNoteView) with the sidebar panel.
// React context cannot reliably cross BlockNote's internal renderer boundary, so we use a plain
// pub/sub store and hook into it with useEffect on the sidebar side.

import type { BlockDef } from "@/lib/blockLibrary";

export interface ActiveBlock {
  id: string;
  type: string;
  props: Record<string, string>;
  update: (props: Record<string, string>) => void;
}

type Listener = (block: ActiveBlock | null) => void;

let _current: ActiveBlock | null = null;
const _listeners = new Set<Listener>();

function _notify() {
  _listeners.forEach((l) => l(_current));
}

export function setActiveBlock(block: ActiveBlock | null): void {
  _current = block;
  _notify();
}

export function getActiveBlock(): ActiveBlock | null {
  return _current;
}

/**
 * True while a sidebar edit is writing into the editor.
 *
 * Writing a prop dispatches a ProseMirror transaction, and that fires the
 * editor's own selection-change handler — which promptly calls setActiveBlock
 * with whatever block the caret happens to sit in. The effect is that changing
 * any setting throws the selection away: edit a Section's padding and the panel
 * snaps back to the Row Layout, mid-edit, on every keystroke.
 *
 * The selection handlers consult this and stand down while it is set. It is
 * cleared on a microtask rather than synchronously because BlockNote flushes
 * some of its notifications one tick after the transaction.
 */
let _writing = false;

export function isPanelWriting(): boolean {
  return _writing;
}

function write(fn: () => void): void {
  _writing = true;
  try {
    fn();
  } finally {
    queueMicrotask(() => { _writing = false; });
  }
}

export function updateActiveBlockProp(key: string, value: string): void {
  if (!_current) return;
  _current = { ..._current, props: { ..._current.props, [key]: value } };
  const next = _current;
  write(() => next.update(next.props));
  _notify();
}

export function updateActiveBlockProps(props: Record<string, string>): void {
  if (!_current) return;
  _current = { ..._current, props };
  const next = _current;
  write(() => next.update(props));
  _notify();
}

export function subscribeActiveBlock(listener: Listener): () => void {
  _listeners.add(listener);
  listener(_current); // fire immediately with current state
  return () => _listeners.delete(listener);
}

// ── Block selection + editor operations (driven from List View / toolbars) ──
/** Returns true when the caret was placed inside the block (a typing block). */
let _selectById: ((id: string) => boolean) | null = null;

export function registerBlockSelector(fn: ((id: string) => boolean) | null): void {
  _selectById = fn;
}

export function selectBlockById(id: string): boolean {
  return _selectById?.(id) ?? false;
}

export interface EditorOps {
  reorder: (fromId: string, toId: string) => void;
  append: (type?: string) => void;
  /** Removes one block, wherever it lives — page canvas or a row column. */
  remove: (id: string) => void;
  /** The live document — read at save time, so no state round-trip is needed. */
  getDocument: () => any[];
  /** Inserts a library block. The toolbar sits outside the editor and needs this. */
  insert: (def: BlockDef, where: InsertWhere) => void;
  undo: () => void;
  redo: () => void;
  /** A block as the document holds it, wherever it lives, or null. */
  get: (id: string) => any | null;
  /**
   * Inserts ready-made blocks after `afterId`, in whichever editor owns it
   * (a column's, if the id is nested); at the end of the page when null.
   * Returns the ids the editor assigned.
   */
  insertAfter: (blocks: any[], afterId: string | null) => string[];
  /** Swaps a block with its previous (-1) or next (+1) sibling, wherever it lives. */
  move: (id: string, dir: -1 | 1) => void;
  /** Puts a link at the caret, or in a new paragraph after the selected block. */
  insertLink: (href: string, text: string) => boolean;
}

export type InsertWhere = "start" | "end" | "cursor";

let _ops: EditorOps | null = null;

export function registerEditorOps(ops: EditorOps | null): void {
  _ops = ops;
}

export function reorderBlocks(fromId: string, toId: string): void {
  _ops?.reorder(fromId, toId);
}

/**
 * Deletes a block by id.
 *
 * The settings panel and List View both point at blocks they cannot reach
 * themselves — a nested block belongs to a column's own editor — so deletion
 * goes through the page editor, which knows how to fall through to the columns.
 */
export function deleteBlockById(id: string): void {
  if (!_ops) {
    console.warn("[delete] no editor is registered; cannot remove", id);
    return;
  }
  _ops.remove(id);
  // The panel would otherwise keep editing a block that no longer exists.
  if (_current?.id === id) setActiveBlock(null);
}

/** The editor's current document, or null when no editor is mounted. */
export function getEditorDocument(): any[] | null {
  return _ops ? _ops.getDocument() : null;
}

export function insertBlockAt(def: BlockDef, where: InsertWhere = "cursor"): void {
  _ops?.insert(def, where);
}

export function getBlockById(id: string): any | null {
  return _ops ? _ops.get(id) : null;
}

export function insertLinkInEditor(href: string, text: string): boolean {
  return _ops?.insertLink(href, text) ?? false;
}

export function moveBlockById(id: string, dir: -1 | 1): void {
  _ops?.move(id, dir);
}

export function insertBlocksAfter(blocks: any[], afterId: string | null): string[] {
  return _ops ? _ops.insertAfter(blocks, afterId) : [];
}

export function editorUndo(): void {
  _ops?.undo();
}

export function editorRedo(): void {
  _ops?.redo();
}

// ── Nested editors (Row Layout columns) ────────────────────────────────────
// A column runs its own editor instance, so blocks inside a row are invisible
// to the page editor's document. Each column registers itself here; List View
// selection falls through to them when an id is not in the top-level document.

export interface NestedEditorApi {
  /** Selects the block if this editor owns it. Returns whether it did. */
  trySelect: (id: string) => boolean;
  /** Deletes the block if this editor owns it. Returns whether it did. */
  tryRemove: (id: string) => boolean;
  /** Writes any debounced edits into the parent row straight away. */
  flush: () => void;
  /** The block, if this editor owns it. */
  tryGet: (id: string) => any | null;
  /** Inserts after `id` if this editor owns it; returns the new ids, or null. */
  tryInsertAfter: (id: string, blocks: any[]) => string[] | null;
  /** Moves the block one step if this editor owns it. Returns whether it did. */
  tryMove: (id: string, dir: -1 | 1) => boolean;
}

const _nestedEditors = new Map<string, NestedEditorApi>();

export function registerNestedEditor(key: string, api: NestedEditorApi | null): void {
  if (api) _nestedEditors.set(key, api);
  else _nestedEditors.delete(key);
}

export function selectInNestedEditors(id: string): boolean {
  for (const api of _nestedEditors.values()) {
    if (api.trySelect(id)) return true;
  }
  return false;
}

export function getInNestedEditors(id: string): any | null {
  for (const api of _nestedEditors.values()) {
    const b = api.tryGet(id);
    if (b) return b;
  }
  return null;
}

export function insertAfterInNestedEditors(id: string, blocks: any[]): string[] | null {
  for (const api of _nestedEditors.values()) {
    const r = api.tryInsertAfter(id, blocks);
    if (r) return r;
  }
  return null;
}

export function moveInNestedEditors(id: string, dir: -1 | 1): boolean {
  for (const api of _nestedEditors.values()) {
    if (api.tryMove(id, dir)) return true;
  }
  return false;
}

/**
 * Swaps a block with its neighbour inside one editor. Shared by the page
 * editor and every column, so "move up" means the same thing everywhere.
 */
export function moveWithinEditor(editor: any, id: string, dir: -1 | 1): boolean {
  try {
    const doc = editor.document as any[];
    const idx = doc.findIndex((b) => b.id === id);
    if (idx < 0) return false;
    const target = doc[idx + dir];
    if (!target) return true; // owned, but already at the edge
    const block = doc[idx];
    editor.removeBlocks([id]);
    editor.insertBlocks([block], target.id, dir < 0 ? "before" : "after");
    return true;
  } catch {
    return false;
  }
}

export function removeInNestedEditors(id: string): boolean {
  for (const api of _nestedEditors.values()) {
    if (api.tryRemove(id)) return true;
  }
  return false;
}

/**
 * Pushes every column's pending edits into its row before the document is read.
 *
 * Column edits are debounced to keep typing cheap, so a save fired within that
 * window would otherwise write the previous keystroke's content.
 */
export function flushNestedEditors(): void {
  for (const api of _nestedEditors.values()) api.flush();
}
