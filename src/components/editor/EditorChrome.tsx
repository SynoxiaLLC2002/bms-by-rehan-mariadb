"use client";

// The editor's top-left tool group and its bottom breadcrumb bar.
//
// Both live outside the editor component but act on it, so everything here goes
// through the editor-ops registry rather than props.

import { useEffect, useState } from "react";
import {
  editorRedo,
  editorUndo,
  insertBlockAt,
  subscribeActiveBlock,
} from "@/lib/blockSettingsStore";
import { openBlockLibrary } from "@/lib/blockLibraryBus";
import { blockMeta } from "@/lib/blockMeta";
import Inserter from "./QuickInserter";
import { Undo2, Redo2, List } from "lucide-react";

const toolBtn =
  "w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors";

export function EditorTools({ listOpen, onToggleList }: { listOpen: boolean; onToggleList: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <Inserter
        variant="square"
        tooltip="Add block"
        onPick={(def) => insertBlockAt(def, "cursor")}
        onBrowseAll={() => openBlockLibrary((def) => insertBlockAt(def, "cursor"))}
      />
      <button type="button" title="Undo" className={toolBtn} onClick={editorUndo}>
        <Undo2 size={15} />
      </button>
      <button type="button" title="Redo" className={toolBtn} onClick={editorRedo}>
        <Redo2 size={15} />
      </button>
      <button
        type="button"
        title={listOpen ? "Hide list view" : "Show list view"}
        onClick={onToggleList}
        className={`${toolBtn} ${listOpen ? "bg-slate-900 text-white hover:bg-slate-800 hover:text-white" : ""}`}
      >
        <List size={15} />
      </button>
      <span className="mx-1 h-5 w-px bg-slate-200" />
    </div>
  );
}

/** `Page › Paragraph` — what is selected, and what it sits in. */
export function Breadcrumb({ root }: { root: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => subscribeActiveBlock((b) => setLabel(b ? blockMeta(b.type).label : null)), []);

  return (
    <div className="flex h-7 shrink-0 items-center gap-1 border-t border-slate-200 bg-white px-3 text-[11px] text-slate-500">
      <span className="rounded px-1.5 py-0.5 hover:bg-slate-100">{root}</span>
      {label && (
        <>
          <span className="text-slate-300">›</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">{label}</span>
        </>
      )}
    </div>
  );
}
