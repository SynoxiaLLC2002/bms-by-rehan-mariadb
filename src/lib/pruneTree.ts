// Removes `undefined` props — and `undefined` entries inside `style` — from a
// rendered element tree before React serialises it.
//
// The block renderers build style objects field by field
// (`{ fontFamily: p.ff || undefined, textShadow: …, writingMode: … }`), which
// is the readable way to write them and harmless in the HTML: React skips an
// undefined style. It is not harmless in the hydration data. React writes
// every key it is given, so each undefined one travels as `"key":"$undefined"`
// — measured on a live article: 2,001 of them, about 52 KB of a 216 KB
// payload, and `"style":"$undefined"` alone 313 times. Brotli shrinks the
// repetition on the wire, but the browser still has to parse all of it.
//
// One pass here instead of a change in every block: host elements, client
// component references and Fragments are copied without the undefined keys;
// an element with none is returned as it was. A missing prop and an
// undefined one are the same to a destructuring default, which is how every
// component here reads its props.

import { isValidElement, type ReactElement, type ReactNode } from "react";

function cleanStyle(style: unknown): unknown {
  if (!style || typeof style !== "object" || Array.isArray(style)) return style;
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style as Record<string, unknown>)) {
    if (v === undefined) changed = true;
    else out[k] = v;
  }
  if (!changed) return style;
  // An object with nothing left says nothing; drop the prop entirely.
  return Object.keys(out).length ? out : undefined;
}

function pruneElement(el: ReactElement): ReactElement {
  const props = el.props as Record<string, unknown>;
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (k === "children") continue;
    const value = k === "style" ? cleanStyle(v) : v;
    if (value !== v || value === undefined) changed = true;
    if (value !== undefined) next[k] = value;
  }
  const children = props.children;
  const pruned = children == null || typeof children === "string" || typeof children === "number" ? children : pruneUndefined(children as ReactNode);
  if (pruned !== children) changed = true;
  if (!changed) return el;
  // `children: null` renders the same as no children and was serialised as
  // `"children":null` on every empty element — 65 times on one page.
  if (pruned !== undefined && pruned !== null) next.children = pruned;
  else if (children === null) changed = true;
  // A copy of the element with new props, not createElement: that would turn
  // static children (`<p>{a}{b}</p>`) into a list React checks for keys, and
  // drop the element's own bookkeeping. The element is a plain object; its
  // type, key and owner carry over as they were.
  const copy = { ...el, props: next } as ReactElement;
  // React's development build keeps `_debugStack`, `_debugTask` and
  // `_debugInfo` on the element as *non-enumerable* properties, so the spread
  // above silently drops them — and React 19's server renderer then refuses
  // the element ("Attempted to render <…> without development properties"),
  // which took every content page down to a 500 under `next dev` while the
  // production build, which has no such check, was fine. Carried over the
  // same way React defines them.
  for (const k of ["_debugInfo", "_debugStack", "_debugTask"]) {
    const d = Object.getOwnPropertyDescriptor(el, k);
    if (d) Object.defineProperty(copy, k, d);
  }
  return copy;
}

export function pruneUndefined(node: ReactNode): ReactNode {
  if (Array.isArray(node)) {
    let changed = false;
    const out: ReactNode[] = [];
    for (const child of node) {
      // A block that rendered nothing (an empty paragraph, a hidden row) is
      // a `null` in the list, and React serialises every one of them. It
      // produces no DOM either way, so it is left out.
      if (child === null || child === undefined || child === false) { changed = true; continue; }
      const p = pruneUndefined(child as ReactNode);
      if (p !== child) changed = true;
      out.push(p);
    }
    return changed ? out : node;
  }
  if (isValidElement(node)) return pruneElement(node);
  return node;
}
