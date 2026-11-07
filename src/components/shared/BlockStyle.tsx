// A block's own scoped CSS, placed where a stylesheet belongs.
//
// Every styled block (buttons, rows, icon lists, contents, accordions,
// tables, info boxes) used to print `<style>` beside its markup: 22 of them
// on one measured page, each invalid HTML (`<style>` is head content) and
// each parsed only after the browser had reached the block it styles. With
// `href` and `precedence`, React hoists the element into <head>, de-duplicates
// identical sheets, and keeps them in order after the site stylesheet.
//
// The editor canvas passes `hoist={false}` and gets the plain element it
// always had: there the CSS changes on every keystroke, and the block owning
// it is what should carry it.

import type { ReactNode } from "react";

/** FNV-1a of the CSS text, the key React de-duplicates hoisted styles by. */
function key(css: string): string {
  let h = 2166136261;
  for (let i = 0; i < css.length; i++) {
    h ^= css.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `b-${h.toString(36)}`;
}

export default function BlockStyle({ css, hoist = true }: { css: string | null | undefined; hoist?: boolean }): ReactNode {
  if (!css) return null;
  if (!hoist) return <style>{css}</style>;
  return <style href={key(css)} precedence="blocks">{css}</style>;
}
