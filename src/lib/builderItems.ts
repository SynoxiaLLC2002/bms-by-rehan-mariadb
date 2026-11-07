// The canonical list of header/footer builder items, shared by the admin panels
// and by SiteLayout's customizer mode (which pre-renders every one of them so
// the live preview can reveal them without a server round trip).

export const HEADER_ITEMS: { id: string; label: string }[] = [
  { id: "logo",       label: "Logo" },
  { id: "navigation",  label: "Primary Navigation" },
  { id: "navigation2", label: "Secondary Navigation" },
  { id: "search",     label: "Search" },
  { id: "button",     label: "Button" },
  { id: "social",     label: "Social" },
  { id: "darkmode",   label: "Dark Mode Toggle" },
  { id: "languageSwitcher", label: "Language Switcher" },
  { id: "divider",    label: "Divider" },
  { id: "html",       label: "HTML" },
  { id: "trigger",    label: "Trigger (off-canvas)" },
];

export const FOOTER_ITEMS: { id: string; label: string }[] = [
  { id: "widget1",   label: "Widget 1" },
  { id: "widget2",   label: "Widget 2" },
  { id: "widget3",   label: "Widget 3" },
  { id: "widget4",   label: "Widget 4" },
  { id: "widget5",   label: "Widget 5" },
  { id: "widget6",   label: "Widget 6" },
  { id: "footernav", label: "Footer Navigation" },
  { id: "social",    label: "Social" },
  { id: "copyright", label: "Copyright" },
  { id: "darkmode",  label: "Dark Mode Toggle" },
];

/**
 * The label the builder shows for an item id.
 *
 * These live here rather than beside the docks so a panel can name an item
 * without pulling the whole drag-and-drop dock into its bundle — and so there
 * is one list, not two: the docks used to carry their own copy of
 * HEADER_ITEMS, which had drifted and no longer offered the Language Switcher
 * the site renders.
 */
export const itemLabel = (id: string) => HEADER_ITEMS.find((i) => i.id === id)?.label ?? id;
export const footerItemLabel = (id: string) => FOOTER_ITEMS.find((i) => i.id === id)?.label ?? id;

export const HEADER_ITEM_IDS = HEADER_ITEMS.map((i) => i.id);
export const FOOTER_ITEM_IDS = FOOTER_ITEMS.map((i) => i.id);

export const HEADER_ROWS = ["topbar", "main", "bottombar"] as const;
export const FOOTER_ROWS = ["toprow", "main", "bottomrow"] as const;
/**
 * Five zones per row, matching the reference builder. The extra half-positions
 * let a row centre one item while keeping others pinned outward.
 */
export const COLS = ["left", "left_center", "center", "right_center", "right"] as const;

/** Justification for each zone, used by both the site and the dock. */
export type Col = (typeof COLS)[number];

/**
 * The mobile header uses three zones, not five, and adds an off-canvas row —
 * matching how the reference builder splits desktop from mobile.
 */
export const MOBILE_COLS = ["left", "center", "right"] as const;

export const COL_ALIGN: Record<Col, string> = {
  left: "flex-start",
  left_center: "flex-start",
  center: "center",
  right_center: "flex-end",
  right: "flex-end",
};

/** Stable id for one pre-rendered slot in the preview DOM. */
export const slotId = (scope: string, row: string, col: string, item: string) =>
  `${scope}:${row}:${col}:${item}`;
