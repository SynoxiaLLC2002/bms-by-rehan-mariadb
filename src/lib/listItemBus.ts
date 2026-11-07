// Which Icon List item the settings panel is editing.
//
// An item is not a BlockNote block — the whole list is one block — so it cannot
// go through `selectBlockById` the way a real block does. List View still needs
// to open one, which is the same problem a Row Layout column has, solved the
// same way: a tiny module-level bus, because React context cannot cross
// BlockNote's renderer boundary.

type Selection = { blockId: string; index: number };
type Listener = (sel: Selection | null) => void;

let current: Selection | null = null;
const listeners = new Set<Listener>();

export function setActiveListItem(sel: Selection | null): void {
  current = sel;
  for (const fn of listeners) fn(current);
}

export function subscribeActiveListItem(fn: Listener): () => void {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}
