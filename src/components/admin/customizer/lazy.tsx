"use client";

// The Customizer's panels, loaded when they are first opened.
//
// `customize/page.tsx` is one client entry that imported every panel it can
// show, so opening the Customizer downloaded all of them: the item panel and
// its sub-panels (state, single post, page layout, sidebar — about 2,200 lines
// between them), the header and footer builders, the search panel and the
// media picker. None of that renders on the first paint — `section` starts as
// the index list, `focusItem` is null, the dock is closed and no picker is
// open — so it was all dead weight until the user clicked something.
//
// Same shape as `blocks/lazy.tsx` on the public site: the `dynamic()` calls
// have to live in a module of their own so webpack has a boundary to split
// at, and the page imports these names instead of the real ones.
//
// The labels are deliberately NOT here. `itemLabel`/`footerItemLabel` come
// from `@/lib/builderItems`, because importing them from HeaderDock/FooterDock
// would pull the docks back into the page's chunk and undo the split.

import dynamic from "next/dynamic";

/** What a panel shows while its chunk is in flight. */
const Loading = () => (
  <p className="p-4 text-xs text-slate-400">Loading…</p>
);

export const ItemPanel = dynamic(
  () => import("./ItemPanel").then((m) => m.ItemPanel),
  { ssr: false, loading: Loading }
);

export const HeaderPanel = dynamic(
  () => import("./HeaderPanel").then((m) => m.HeaderPanel),
  { ssr: false, loading: Loading }
);

export const FooterPanel = dynamic(
  () => import("./FooterPanel").then((m) => m.FooterPanel),
  { ssr: false, loading: Loading }
);

export const SearchPanel = dynamic(
  () => import("./SearchPanel").then((m) => m.SearchPanel),
  { ssr: false, loading: Loading }
);

export const HeaderDock = dynamic(
  () => import("./HeaderDock").then((m) => m.HeaderDock),
  { ssr: false }
);

export const FooterDock = dynamic(
  () => import("./FooterDock").then((m) => m.FooterDock),
  { ssr: false }
);

export const CustomFontsManager = dynamic(
  () => import("@/components/admin/CustomFontsManager"),
  { ssr: false }
);

export const MediaPicker = dynamic(
  () => import("@/components/admin/MediaPicker"),
  { ssr: false }
);
