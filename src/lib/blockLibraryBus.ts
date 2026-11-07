// "Browse all" opens the full block library, which is mounted by the page
// editor. A column's inserter is several editors deep and has no way to reach
// that state, so it asks through here and passes the callback that should
// receive the chosen block.

import type { BlockDef } from "@/lib/blockLibrary";

export type LibraryHandler = (def: BlockDef) => void;

let _open: ((handler: LibraryHandler) => void) | null = null;

export function registerLibraryOpener(fn: ((handler: LibraryHandler) => void) | null): void {
  _open = fn;
}

export function openBlockLibrary(handler: LibraryHandler): void {
  _open?.(handler);
}
