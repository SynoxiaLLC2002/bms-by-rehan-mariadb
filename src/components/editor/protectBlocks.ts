import { Extension } from "@tiptap/core";
import type { EditorState } from "prosemirror-state";
import { getBlockInfoFromSelection } from "@blocknote/core";

// Backspace / Delete must never destroy an element.
//
// BlockNote's own Backspace, with the caret at the start of any block that is
// not a paragraph, turns that block into a plain paragraph — every prop gone
// (a Text Advanced h1 became a bare "¶"), and the settings panel kept editing
// a block that no longer existed, so its controls did nothing. The next
// Backspace then merged the paragraph into the block above: the element was
// gone. Delete at the end of the block before it merged it away the same way.
//
// This runs ahead of BlockNote's keymap (higher priority) and swallows exactly
// those two keys in exactly those positions. Typing, deleting characters, and
// deleting a real text selection are untouched; removing an element is what the
// toolbar's trash button is for.

/** Blocks where "Backspace at the start turns it into a paragraph" is the expected editing move. */
const LOOSE = new Set(["paragraph", "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem"]);

const isProtected = (typeName: string) => !LOOSE.has(typeName);

/** The next block's content node after `pos`, in document order. */
function nextBlockContentType(state: EditorState, pos: number): string | null {
  let found: string | null = null;
  state.doc.nodesBetween(pos, state.doc.content.size, (node) => {
    if (found) return false;
    if (node.type.spec.group === "blockContent") {
      found = node.type.name;
      return false;
    }
    return true;
  });
  return found;
}

export const ProtectBlocks = Extension.create({
  name: "bmsProtectBlocks",
  priority: 1000,

  addKeyboardShortcuts() {
    const backspace = () => {
      const { state } = this.editor;
      if (!state.selection.empty) return false;
      const info = getBlockInfoFromSelection(state);
      if (!info.isBlockContainer) return false;
      const { blockContent } = info;
      const atStart = state.selection.from === blockContent.beforePos + 1;
      if (!atStart || !isProtected(blockContent.node.type.name)) return false;
      // An indented element may still step out a level — it moves, it isn't lost.
      this.editor.commands.liftListItem("blockContainer");
      return true;
    };

    const del = () => {
      const { state } = this.editor;
      if (!state.selection.empty) return false;
      const info = getBlockInfoFromSelection(state);
      if (!info.isBlockContainer) return false;
      const { blockContent } = info;
      const atEnd = state.selection.from === blockContent.afterPos - 1;
      if (!atEnd) return false;
      const next = nextBlockContentType(state, blockContent.afterPos);
      return next !== null && isProtected(next);
    };

    return {
      Backspace: backspace,
      "Mod-Backspace": backspace,
      "Shift-Backspace": backspace,
      Delete: del,
      "Mod-Delete": del,
    };
  },
});
