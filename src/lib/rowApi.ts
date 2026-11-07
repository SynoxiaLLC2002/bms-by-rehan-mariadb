// A live handle on each Row Layout in the editor.
//
// The settings sidebar works from a snapshot of the selected block's props,
// which is fine for scalars but wrong for `cols`: columns are rewritten
// whenever someone types in one, so a snapshot goes stale within a keystroke.
// Column styling therefore goes through the row itself, which reads its own
// current props before writing.

import type { RowColumnData } from "@/lib/rowLayout";

export interface RowApi {
  /** Columns as the row currently has them. */
  getColumns: () => RowColumnData[];
  /** Merges style fields into one column. Never touches its blocks. */
  setColumnStyle: (index: number, patch: Partial<RowColumnData>) => void;
  /** Opens one column's own Section panel in the sidebar. */
  selectSection: (index: number) => void;
}

const _rows = new Map<string, RowApi>();

export function registerRowApi(id: string, api: RowApi | null): void {
  if (api) _rows.set(id, api);
  else _rows.delete(id);
}

export function getRowApi(id: string): RowApi | null {
  return _rows.get(id) ?? null;
}
