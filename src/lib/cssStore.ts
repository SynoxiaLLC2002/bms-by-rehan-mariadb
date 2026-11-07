// Stylesheets the page links to by content hash, kept on disk so server.js
// can put them back inline.
//
// Why not just render `<style>{css}</style>`: React sends every server
// component's output twice — once as HTML and once as the data the browser
// hydrates from — so an inlined stylesheet was in each page two times (the
// theme's 28 KB, the font CSS, and Next's own 26 KB Tailwind file on top).
// A `<link>` is a few bytes in that data. server.js then swaps each link for
// the file's contents in the HTML only, which keeps what inlining was for —
// no render-blocking request — without the second copy. The same files serve
// `/site/<name>.css` for client-side navigations and as the fallback when the
// swap is off (INLINE_CSS=off).
//
// Stored under the build directory (`.next/bms-css`), not `.next/cache`: the
// upload package leaves the cache out, and pages prerendered at build time
// must find their files on the host. Names are content hashes, so a file is
// written once and never changes.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const DIR = path.join(process.cwd(), process.env.BUILD_DIR || ".next", "bms-css");

/** `s-<hash>` for the site stylesheet, `f-<hash>` for font faces. */
const NAME = /^[sf]-[a-f0-9]{8,40}$/;

/** A content-addressed name for CSS that has no hash of its own. */
export function cssName(prefix: "s" | "f", css: string, hash?: string): string {
  return `${prefix}-${hash ?? createHash("sha1").update(css).digest("hex").slice(0, 16)}`;
}

/**
 * Writes the file if it is not there yet. Never throws: a read-only disk
 * only means the page's link is served by the route's fallback.
 */
export function storeCss(name: string, css: string): void {
  if (!NAME.test(name)) return;
  const file = path.join(DIR, `${name}.css`);
  try {
    if (existsSync(file)) return;
    mkdirSync(DIR, { recursive: true });
    // Under a temporary name, then renamed: another request (or server.js)
    // reading the same name mid-write must see the whole file or none.
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, css);
    renameSync(tmp, file);
  } catch {
    // See above.
  }
}

export function readStoredCss(name: string): string | null {
  if (!NAME.test(name)) return null;
  try {
    return readFileSync(path.join(DIR, `${name}.css`), "utf8");
  } catch {
    return null;
  }
}
