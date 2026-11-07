"use client";

// The drag-handle side menu, guarded against blocks it does not own.
//
// The page editor and every Row Layout column run their own BlockNote instance,
// and each instance's side menu listens for mousemove on the whole document,
// then resolves whatever block element sits under the cursor. A column's DOM
// lives inside the page editor's DOM, so hovering a block in a column makes the
// *outer* editor resolve that block's id — an id its own document does not
// contain. BlockNote hands the menu `block: undefined`, and its default
// component reads `block.type` straight away, which took the whole editor down
// the moment the mouse crossed a Row Layout.
//
// Rendering nothing when the hovered block is not ours leaves the menu to the
// editor that actually owns the block, which is already listening too.
//
// The gutter is deliberately reduced to the drag handle alone. BlockNote's "+"
// duplicates the appender bars under every canvas and column, and its menu's
// Delete duplicates the block toolbar's ✕, the List View's ✕ and the settings
// panel's trash — four ways to delete one block is three too many, and the
// gutter is the one that fires by accident while reaching for the handle.

import {
  SideMenu,
  SideMenuController,
  DragHandleButton,
  DragHandleMenu,
  BlockColorsItem,
} from "@blocknote/react";

function TrimmedDragMenu(props: any) {
  return (
    <DragHandleMenu {...props}>
      <BlockColorsItem {...props}>Colors</BlockColorsItem>
    </DragHandleMenu>
  );
}

export default function SafeSideMenu() {
  return (
    <SideMenuController
      sideMenu={(props) =>
        props.block ? (
          <SideMenu {...props}>
            <DragHandleButton {...props} dragHandleMenu={TrimmedDragMenu} />
          </SideMenu>
        ) : null
      }
    />
  );
}
