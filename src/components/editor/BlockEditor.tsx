"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "./editor.css";
import { useCreateBlockNote, SuggestionMenuController } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { filterSuggestionItems } from "@blocknote/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Block } from "@blocknote/core";
import { customSchema, getReusableBlocks } from "./customBlocks";
import { parseBlocks } from "@/lib/blockClipboard";
import {
  setActiveBlock,
  registerBlockSelector,
  registerEditorOps,
  selectInNestedEditors,
  removeInNestedEditors,
  isPanelWriting,
  getInNestedEditors,
  insertAfterInNestedEditors,
  moveInNestedEditors,
  moveWithinEditor,
  getActiveBlock,
  insertBlocksAfter,
  selectBlockById,
} from "@/lib/blockSettingsStore";
import { registerLibraryOpener, type LibraryHandler } from "@/lib/blockLibraryBus";
import { loadBlockDefaults } from "@/lib/blockDefaults";
import BlockLibrary from "./BlockLibrary";
import Inserter from "./QuickInserter";
import { SlashMenu, slashItems, insertBlockDef, type MenuItem } from "./slashMenu";
import SafeSideMenu from "./SafeSideMenu";
import ActiveBlockToolbar from "./ActiveBlockToolbar";
import IconListLinkBubble from "./IconListLinkBubble";
import { ProtectBlocks } from "./protectBlocks";
import type { BlockDef } from "@/lib/blockLibrary";

interface BlockEditorProps {
  initialContent?: Block[];
  onChange?: (blocks: Block[]) => void;
  editable?: boolean;
  bare?: boolean;
  /** Writing direction of the document. Inherited by every block; see documentDir(). */
  dir?: "ltr" | "rtl";
}

type SchemaBlock = typeof customSchema.Block;

export default function BlockEditor({ initialContent, onChange, editable = true, bare = false, dir }: BlockEditorProps) {
  const editor = useCreateBlockNote({
    schema: customSchema,
    initialContent: initialContent && initialContent.length > 0
      ? (initialContent as unknown as SchemaBlock[])
      : undefined,
    // BlockNote's trailingNode plugin re-inserts an empty paragraph at the end
    // of the document on every change, which makes the last block genuinely
    // undeletable — remove it and it is back before the List View repaints.
    // It exists so there is always somewhere to click below a widget block; the
    // "add a block" bars under the canvas already cover that, so it only costs
    // us a block the author cannot get rid of.
    trailingBlock: false,
    _tiptapOptions: { extensions: [ProtectBlocks] },
  });

  // Defer mount to after first commit — BlockNoteView calls flushSync internally
  // on mount, which throws if it lands during React's render phase.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Primed once per session so the insert path can read defaults synchronously:
  // a default that arrived mid-session would apply to some inserts and not
  // others, which is more confusing than having none at all.
  useEffect(() => { loadBlockDefaults(); }, []);

  const [libraryOpen, setLibraryOpen] = useState(false);
  // Set when a column's "Browse all" opened the library, so the chosen block
  // goes back into that column instead of the page canvas.
  const libraryHandler = useRef<LibraryHandler | null>(null);

  /** Inserts a library block at the cursor. */
  const insertFromLibrary = useCallback(
    (def: BlockDef) => insertBlockDef(editor, def),
    [editor]
  );

  const openLibrary = useCallback((handler?: LibraryHandler) => {
    libraryHandler.current = handler ?? null;
    setLibraryOpen(true);
  }, []);

  // Columns are several editors deep; they reach the library through this.
  useEffect(() => {
    registerLibraryOpener((handler) => openLibrary(handler));
    return () => registerLibraryOpener(null);
  }, [openLibrary]);

  // Cmd/Ctrl+Shift+A opens the library from anywhere in the editor.
  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        openLibrary();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, openLibrary]);

  /**
   * Vertical position of the round "+" that sits beside an empty line.
   *
   * Measured from the DOM rather than tracked in state: the editor owns its
   * layout, and the block's own element is the only thing that knows where the
   * caret line actually ended up.
   */
  const [plusTop, setPlusTop] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const positionPlus = useCallback(() => {
    const ed = editor as any;
    const host = wrapRef.current;
    if (!host) return;
    try {
      const block = ed.getTextCursorPosition().block;
      const empty =
        block?.type === "paragraph" &&
        (!Array.isArray(block.content) || block.content.length === 0);
      if (!empty) { setPlusTop(null); return; }
      const el = host.querySelector(`[data-id="${block.id}"]`) as HTMLElement | null;
      // A row's columns run their own editors, and they have their own appenders.
      if (!el || el.closest(".bms-row")) { setPlusTop(null); return; }
      const r = el.getBoundingClientRect();
      setPlusTop(r.top - host.getBoundingClientRect().top + r.height / 2 - 10);
    } catch {
      setPlusTop(null);
    }
  }, [editor]);

  /**
   * Content sync and selection tracking.
   *
   * Both run from BlockNoteView's own props rather than `editor.onChange()` /
   * `editor.onSelectionChange()`. The view is rendered behind the `mounted`
   * gate below, so a subscription taken directly on the editor is bound before
   * the view exists — and then silently never fires, because mounting replaces
   * the ProseMirror instance underneath it.
   */
  const handleChange = useCallback(() => {
    // Defer to a microtask so parent setState never runs inside BlockNote's flushSync.
    queueMicrotask(() => {
      onChange?.(editor.document as unknown as Block[]);
      positionPlus();
    });
  }, [editor, onChange, positionPlus]);

  const handleSelectionChange = useCallback(() => {
    // A sidebar edit dispatches a transaction, which lands here — taking the
    // selection back off whatever the author was actually editing.
    if (isPanelWriting()) { positionPlus(); return; }
    const ed = editor as any;
    try {
      const block = ed.getTextCursorPosition().block;
      if (block) {
        setActiveBlock({
          id: block.id,
          type: block.type,
          props: block.props ?? {},
          update: (np) => ed.updateBlock(block, { props: np }),
        });
      }
    } catch {
      /* no cursor position yet */
    }
    positionPlus();
  }, [editor, positionPlus]);

  // Let the List View select a block by id (focus it + open its settings).
  useEffect(() => {
    registerBlockSelector((id: string) => {
      try {
        const ed = editor as any;
        const block = ed.getBlock(id);
        if (!block) {
          // Not in the page document — it belongs to a Row Layout column.
          if (!selectInNestedEditors(id)) return false;
          return Array.isArray(getInNestedEditors(id)?.content);
        }
        setActiveBlock({
          id: block.id,
          type: block.type,
          props: block.props ?? {},
          update: (np) => ed.updateBlock(block, { props: np }),
        });
        // A typing block gets the caret — and keyboard focus, so it blinks.
        // Widget blocks (no inline content) are only highlighted + scrolled to.
        if (!Array.isArray(block.content)) return false;
        try {
          ed.setTextCursorPosition(block, "start");
          ed.focus();
          return true;
        } catch { return false; }
      } catch { return false; }
    });
    return () => registerBlockSelector(null);
  }, [editor]);

  // Expose reorder + append operations (List View drag, add-block button).
  useEffect(() => {
    registerEditorOps({
      reorder: (fromId, toId) => {
        try {
          const e = editor as any;
          const doc = e.document as any[];
          const from = doc.find((b) => b.id === fromId);
          const to = doc.find((b) => b.id === toId);
          if (!from || !to || fromId === toId) return;
          const fromIdx = doc.indexOf(from);
          const toIdx = doc.indexOf(to);
          e.removeBlocks([fromId]);
          e.insertBlocks([from], toId, fromIdx < toIdx ? "after" : "before");
        } catch { /* ignore */ }
      },
      remove: (id) => {
        // Deliberately not swallowed: a delete that quietly does nothing is
        // indistinguishable from a dead button.
        const e = editor as any;
        if (!e.getBlock(id)) {
          // Not in the page document — a Row Layout column owns it.
          if (!removeInNestedEditors(id)) {
            console.warn("[remove] no editor owns block", id);
          }
          return;
        }
        // ProseMirror will not accept an empty document, so the last block
        // standing is emptied rather than removed.
        const doc = e.document as { id: string }[];
        if (doc.length <= 1) e.replaceBlocks([id], [{ type: "paragraph" }]);
        else e.removeBlocks([id]);
      },
      append: (type = "paragraph") => {
        try {
          const e = editor as any;
          const doc = e.document as any[];
          const last = doc[doc.length - 1];
          const inserted = e.insertBlocks([{ type }], last ? last.id : undefined, "after");
          const newBlock = inserted?.[0] ?? null;
          if (newBlock) {
            try { e.setTextCursorPosition(newBlock, "end"); } catch { /* widget */ }
          }
        } catch { /* ignore */ }
      },
      getDocument: () => editor.document as unknown as Block[],
      insert: (def, where) => {
        const doc = (editor as any).document as { id: string }[];
        if (where === "start") insertBlockDef(editor, def, doc[0]?.id, "before");
        else if (where === "end") insertBlockDef(editor, def, doc[doc.length - 1]?.id);
        else insertBlockDef(editor, def);
      },
      undo: () => { try { editor.undo(); } catch { /* nothing to undo */ } },
      redo: () => { try { editor.redo(); } catch { /* nothing to redo */ } },
      get: (id) => {
        const e = editor as any;
        try {
          return e.getBlock(id) ?? getInNestedEditors(id);
        } catch {
          return getInNestedEditors(id);
        }
      },
      insertAfter: (blocks, afterId) => {
        const e = editor as any;
        if (afterId) {
          if (e.getBlock?.(afterId)) {
            const inserted = e.insertBlocks(blocks, afterId, "after") ?? [];
            return inserted.map((b: { id: string }) => b.id);
          }
          const nested = insertAfterInNestedEditors(afterId, blocks);
          if (nested) return nested;
        }
        const doc = e.document as { id: string }[];
        const last = doc[doc.length - 1];
        const inserted = e.insertBlocks(blocks, last?.id, "after") ?? [];
        return inserted.map((b: { id: string }) => b.id);
      },
      move: (id, dir) => {
        const e = editor as any;
        if (e.getBlock?.(id)) {
          moveWithinEditor(e, id, dir);
          return;
        }
        moveInNestedEditors(id, dir);
      },
      insertLink: (href, text) => {
        const e = editor as any;
        const link = { type: "link", href, content: [{ type: "text", text, styles: {} }] };
        // At the caret when there is one in a text block; a custom block or a
        // column has none the page editor can see, so fall back to a new
        // paragraph right after whatever is selected.
        try {
          const pos = e.getTextCursorPosition();
          if (pos?.block && e.getBlock(pos.block.id) && Array.isArray(pos.block.content)) {
            e.insertInlineContent([link, " "]);
            return true;
          }
        } catch {
          // No caret — fall through.
        }
        const ids = insertBlocksAfter([{ type: "paragraph", content: [link] }], getActiveBlock()?.id ?? null);
        if (ids[0]) setTimeout(() => selectBlockById(ids[0]), 30);
        return ids.length > 0;
      },
    });
    return () => registerEditorOps(null);
  }, [editor]);

  // Hex colours on text blocks. BlockNote paints only its named palette (by
  // attribute selector); a hex value set in the panel would otherwise show as
  // no colour at all in the canvas while the page shows it. One rule per
  // distinct value in use, rebuilt as the document changes.
  const [hexCss, setHexCss] = useState("");
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let raf = 0;
    const scan = () => {
      raf = 0;
      const rules = new Set<string>();
      el.querySelectorAll<HTMLElement>('[data-text-color^="#"],[data-background-color^="#"]').forEach((n) => {
        const t = n.getAttribute("data-text-color");
        const b = n.getAttribute("data-background-color");
        if (t && /^#[0-9a-f]{3,8}$/i.test(t)) rules.add(`[data-text-color="${t}"]{color:${t}}`);
        if (b && /^#[0-9a-f]{3,8}$/i.test(b)) rules.add(`[data-background-color="${b}"]{background-color:${b}}`);
      });
      const css = [...rules].join("");
      setHexCss((prev) => (prev === css ? prev : css));
    };
    // `attributeFilter` already keeps plain attribute churn out, but every
    // keystroke fires `childList` mutations too (BlockNote inserting text
    // nodes) — unfiltered, that rescanned the whole canvas on every character
    // typed anywhere. Only nodes that can actually change the hex rule set —
    // an attribute mutation, or an added/removed node carrying one of the two
    // colour attributes — schedule a rescan; a record this loose check can't
    // classify still schedules one, so a real colour change is never missed.
    const isColorNode = (n: Node): boolean =>
      n instanceof Element &&
      (n.hasAttribute("data-text-color") ||
        n.hasAttribute("data-background-color") ||
        !!n.querySelector("[data-text-color],[data-background-color]"));
    const mo = new MutationObserver((records) => {
      if (raf) return;
      const relevant = records.some((r) => {
        if (r.type === "attributes") return true;
        if (r.type !== "childList") return true;
        for (const n of r.addedNodes) if (isColorNode(n)) return true;
        for (const n of r.removedNodes) if (isColorNode(n)) return true;
        return false;
      });
      if (relevant) raf = requestAnimationFrame(scan);
    });
    mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-text-color", "data-background-color"] });
    scan();
    return () => {
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mounted]);

  // Pasting a copied element onto the canvas. The clipboard carries our JSON
  // (see lib/blockClipboard.ts); the editor would otherwise paste it as text.
  // Captured before the editor sees it, and only for our format — everything
  // else is left to the editor's own paste handling.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !editable) return;
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const blocks = parseBlocks(text);
      if (!blocks || blocks.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      let afterId: string | null = getActiveBlock()?.id ?? null;
      if (!afterId) {
        try {
          afterId = (editor as any).getTextCursorPosition()?.block?.id ?? null;
        } catch {
          afterId = null;
        }
      }
      const ids = insertBlocksAfter(blocks, afterId);
      if (ids[0]) setTimeout(() => selectBlockById(ids[0]), 30);
    };
    el.addEventListener("paste", onPaste, true);
    return () => el.removeEventListener("paste", onPaste, true);
    // `mounted` is in the list on purpose: the wrapper only exists after the
    // deferred mount, so the first run of this effect finds no element.
  }, [editor, editable, mounted]);

  const wrapperCls = bare ? "min-h-[300px] -mx-3" : "min-h-[400px] rounded-lg border border-slate-200 bg-white";

  if (!mounted) {
    return <div className={wrapperCls} dir={dir} />;
  }

  return (
    <div className={`relative ${wrapperCls}`} ref={wrapRef} dir={dir}>
      {editable && (
        <div className="px-3 pb-2">
          <Inserter
            variant="bar"
            title="Add a block at the top"
            onPick={(def) => {
              const doc = (editor as any).document as { id: string }[];
              insertBlockDef(editor, def, doc[0]?.id, "before");
            }}
            onBrowseAll={() =>
              openLibrary((def) => {
                const doc = (editor as any).document as { id: string }[];
                insertBlockDef(editor, def, doc[0]?.id, "before");
              })
            }
          />
        </div>
      )}

      {editable && plusTop !== null && (
        <div className="absolute right-3 z-20" style={{ top: plusTop }}>
          <Inserter tooltip="Add block" onPick={insertFromLibrary} onBrowseAll={() => openLibrary()} />
        </div>
      )}

      {hexCss && <style dangerouslySetInnerHTML={{ __html: hexCss }} />}
      {editable && <ActiveBlockToolbar host={wrapRef} />}
      {editable && <IconListLinkBubble />}

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
            filterSuggestionItems(
              [
                ...slashItems(editor, insertFromLibrary),
                ...getReusableBlocks().map((r) => ({
                  title: r.label,
                  subtext: "Reusable block",
                  group: "Reusable",
                  badge: "★",
                  color: "#eab308",
                  onItemClick: () => {
                    const ed = editor as any;
                    ed.insertBlocks([r.block], ed.getTextCursorPosition().block, "after");
                  },
                })),
              ] as MenuItem[],
              query
            )
          }
          suggestionMenuComponent={SlashMenu as any}
        />
      </BlockNoteView>

      {editable && (
        <div className="px-3 pt-2 pb-1">
          <Inserter
            variant="bar"
            title="Add a block  (Ctrl+Shift+A)"
            onPick={insertFromLibrary}
            onBrowseAll={() => openLibrary()}
          />
        </div>
      )}

      <BlockLibrary
        open={libraryOpen}
        onClose={() => { setLibraryOpen(false); libraryHandler.current = null; }}
        onInsert={(def) => {
          const handler = libraryHandler.current;
          libraryHandler.current = null;
          if (handler) handler(def);
          else insertFromLibrary(def);
        }}
        reusable={getReusableBlocks().map((r) => ({ label: r.label, block: r.block }))}
        onInsertReusable={(entry) => {
          const ed = editor as any;
          const doc = ed.document;
          const target = ed.getTextCursorPosition?.().block ?? doc[doc.length - 1];
          if (target) ed.insertBlocks([entry.block], target, "after");
        }}
      />
    </div>
  );
}
