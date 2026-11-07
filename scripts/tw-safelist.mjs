// Writes the list of Tailwind classes the public site can ever apply, for
// server.js to trim the Tailwind stylesheet against per page.
//
// Tailwind emits one stylesheet for the whole app — admin screens included —
// and it is inlined into every public page: 26 KB, of which one measured
// page used 3 KB. `.input`, `.label`, `.card` and a few hundred utilities
// only the admin uses were parsed by every visitor. server.js drops a rule
// when none of its classes is on the page. But a class a client component
// adds later (`hidden` toggled on click, `opacity-0` set by a script) is not
// in the HTML yet, so the page alone is not enough evidence. This file is the
// rest of it: every class-shaped token in the public site's source. Over-
// inclusive on purpose — a word in a comment that happens to look like a
// class keeps a rule alive, which costs bytes, never a broken page.
//
// Runs after `next build` (see package.json). Without the file server.js
// leaves Tailwind untrimmed.

import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

const root = process.cwd();
const distDir = process.env.BUILD_DIR || ".next";
const ROOTS = ["src/components/frontend", "src/components/shared", "src/app/(site)", "src/app/(author)", "src/lib"];
// Classes scripts add outside any component (lib/siteExtras, prefetch, video facade).
const ALWAYS = ["is-open", "is-stuck", "is-shown", "hidden", "sr-only"];
const EXT = new Set([".tsx", ".ts", ".css"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXT.has(extname(name))) yield p;
  }
}

// Only client components matter: a server component's classes are in the
// HTML already, and Tailwind built the stylesheet from these same files, so
// scanning everything would just name every class again. What a client
// component can add after hydration is a string literal in a "use client"
// file (`open ? "block" : "hidden"`), so only quoted strings are read.
const STRING = /"([^"\\\n]*)"|'([^'\\\n]*)'|`([^`]*)`/g;
const TOKEN = /[!]?[a-zA-Z][\w:./[\]%()#,-]*/g;
const classes = new Set();
let files = 0;
for (const r of ROOTS) {
  let dir;
  try { dir = join(root, r); statSync(dir); } catch { continue; }
  for (const file of walk(dir)) {
    const text = readFileSync(file, "utf8");
    if (!/^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(text)) continue;
    files++;
    for (const str of text.matchAll(STRING)) {
      for (const m of (str[1] ?? str[2] ?? str[3] ?? "").matchAll(TOKEN)) classes.add(m[0]);
    }
  }
}

// Only the tokens that name a class the built stylesheet defines — the rest
// (every identifier in the source) would be noise in the file.
const defined = new Set();
const cssDir = join(root, distDir, "static", "css");
for (const name of readdirSync(cssDir)) {
  if (!name.endsWith(".css")) continue;
  const css = readFileSync(join(cssDir, name), "utf8");
  // A class in a selector, with Tailwind's escapes (`\:` `\/` `\[`) removed.
  for (const m of css.matchAll(/\.((?:\\.|[\w-])+)/g)) defined.add(m[1].replace(/\\/g, ""));
}
for (const c of ALWAYS) classes.add(c);
const keep = [...classes].filter((c) => defined.has(c)).sort();

const out = join(root, distDir, "bms-css");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "tw-safelist.json"), JSON.stringify(keep));
console.log(`tw-safelist: ${keep.length} of ${defined.size} stylesheet classes are named in ${files} public source files -> ${distDir}/bms-css/tw-safelist.json`);
