"use client";

// The slash menu and the insert helper, shared by the page editor and by the
// nested editors inside Row Layout columns — so a block reachable with "/" at
// the top level is reachable with "/" inside a column too.

import { getDefaultReactSlashMenuItems } from "@blocknote/react";
import { blockDefaultsFor } from "@/lib/blockDefaults";
import { BLOCK_LIBRARY, type BlockDef } from "@/lib/blockLibrary";

/** Blocks BlockNote already offers in its own slash menu — don't list twice. */
export const CORE_SLASH_TYPES = new Set([
  "paragraph", "heading", "bulletListItem", "numberedListItem",
  "checkListItem", "table", "image", "video", "audio", "codeBlock",
]);

export const CATEGORY_GROUP: Record<string, string> = {
  text: "Text",
  media: "Media",
  layout: "Layout",
  highlight: "Highlight",
  data: "Data",
  social: "Social",
  embed: "Embeds",
  form: "Forms",
};

export type MenuItem = {
  title: string;
  subtext?: string;
  group?: string;
  badge?: string;
  color?: string;
  onItemClick: () => void;
};

/** Maps a default block title to the short badge shown in its tile. */
export function defaultBadge(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("heading 1")) return "H1";
  if (t.includes("heading 2")) return "H2";
  if (t.includes("heading 3")) return "H3";
  if (t.includes("heading")) return "H";
  if (t.includes("numbered")) return "1.";
  if (t.includes("bullet")) return "•";
  if (t.includes("check")) return "✓";
  if (t.includes("quote")) return "❝";
  if (t.includes("paragraph")) return "¶";
  if (t.includes("code")) return "</>";
  if (t.includes("table")) return "▦";
  if (t.includes("image")) return "🖼";
  if (t.includes("video")) return "▶";
  if (t.includes("audio")) return "♪";
  if (t.includes("file")) return "📎";
  if (t.includes("emoji")) return "😀";
  return "¶";
}

/** Fully self-styled — it does not rely on BlockNote's portal CSS. */
export function SlashMenu({
  items,
  selectedIndex,
  onItemClick,
}: {
  items: MenuItem[];
  selectedIndex?: number;
  onItemClick?: (item: MenuItem) => void;
}) {
  let lastGroup = "";
  return (
    <div className="w-72 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl py-1.5">
      {items.length === 0 && (
        <div className="px-3 py-4 text-xs text-slate-400 text-center">No matching blocks</div>
      )}
      {items.map((item, i) => {
        const showGroup = item.group && item.group !== lastGroup;
        lastGroup = item.group || lastGroup;
        const active = i === selectedIndex;
        return (
          <div key={`${item.title}-${i}`}>
            {showGroup && (
              <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {item.group}
              </div>
            )}
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); (onItemClick ?? item.onItemClick)(item); }}
              className={`w-full flex items-center gap-3 px-3 py-1.5 text-left transition-colors ${
                active ? "bg-sky-50" : "hover:bg-slate-50"
              }`}
            >
              <span
                className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold"
                style={
                  item.color
                    ? { backgroundColor: item.color + "1f", color: item.color }
                    : { backgroundColor: "#f1f5f9", color: "#64748b" }
                }
              >
                {item.badge || "⊞"}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-800 truncate">{item.title}</span>
                {item.subtext && <span className="block text-[11px] text-slate-400 truncate">{item.subtext}</span>}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Every slash item for an editor: BlockNote's defaults, then the block library.
 *
 * Reusable blocks are appended by the caller, since only the page editor knows
 * how to insert one.
 */
export function slashItems(editor: any, insert: (def: BlockDef) => void): MenuItem[] {
  return [
    ...getDefaultReactSlashMenuItems(editor).map((item: any) => ({
      ...item,
      badge: defaultBadge(item.title),
    })),
    ...BLOCK_LIBRARY.filter((b) => !CORE_SLASH_TYPES.has(b.type)).map((def) => ({
      title: def.label,
      subtext: def.hint,
      group: CATEGORY_GROUP[def.category],
      badge: def.icon,
      color: def.color,
      onItemClick: () => insert(def),
    })),
  ];
}

/**
 * Inserts a library block at the cursor.
 *
 * An empty paragraph under the cursor is replaced rather than pushed down —
 * otherwise every insert from the appender leaves a blank line above it.
 */
export function insertBlockDef(
  editor: any,
  def: BlockDef,
  at?: string,
  placement: "before" | "after" = "after"
): void {
  // Saved Block Defaults sit under the library's own props, so a preset that
  // deliberately sets a value (a Heading 1's level, say) still wins.
  const saved = blockDefaultsFor(def.type);
  const props = saved || def.props ? { ...(saved ?? {}), ...(def.props ?? {}) } : undefined;
  const block = { type: def.type, ...(props ? { props } : {}) };
  try {
    const doc = editor.document as { id: string; type: string; content?: unknown[] }[];
    let target: { id: string; type: string; content?: unknown[] } | undefined;
    if (at) target = doc.find((b) => b.id === at);
    if (!target) {
      try { target = editor.getTextCursorPosition()?.block; } catch { /* no cursor yet */ }
    }
    if (!target) target = doc[doc.length - 1];

    let result: { insertedBlocks?: { id: string }[] } | { id: string }[] | undefined;
    if (!target) {
      result = editor.replaceBlocks(doc, [block]);
    } else {
      const empty =
        target.type === "paragraph" &&
        (!Array.isArray(target.content) || target.content.length === 0);
      result = empty
        ? editor.replaceBlocks([target.id], [block])
        : editor.insertBlocks([block], target.id, placement);
    }

    const inserted = Array.isArray(result) ? result[0] : result?.insertedBlocks?.[0];

    // Land the cursor in whatever was just inserted, when it can hold one.
    setTimeout(() => {
      try {
        if (inserted?.id) editor.setTextCursorPosition(inserted.id, "end");
        editor.focus?.();
      } catch { /* widget block, nothing to focus */ }
    }, 0);
  } catch { /* ignore */ }
}
