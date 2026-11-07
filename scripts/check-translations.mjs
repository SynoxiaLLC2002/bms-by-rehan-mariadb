// Every language the picker offers must be a language the theme can speak.
//
// The picker in lib/locale.ts offers 47 languages. The theme's own words live
// in three tables, and anything missing from them falls back to English — so a
// Polish site could be set up, look configured, and then say "Your comment" and
// "Read more" in English on every page. That is invisible until someone reads
// the site, which is exactly the wrong time to find it.
//
// Run with `node scripts/check-translations.mjs`. Exits non-zero on a gap, so
// it can guard a release; prints the gap either way.

import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../src/lib/${p}`, import.meta.url), "utf8");

/** Language codes the picker offers. */
function offered() {
  const src = read("locale.ts");
  const start = src.indexOf("export const LANGUAGES");
  const end = src.indexOf("];", start);
  return [...src.slice(start, end).matchAll(/code:\s*"([a-z-]+)"/g)].map((m) => m[1]);
}

/** Language codes one table actually defines. */
function covered(file) {
  const src = read(file);
  const start = src.indexOf("const TEXT");
  const end = src.indexOf("\n};", start);
  return new Set([...src.slice(start, end).matchAll(/^ {2}([a-z]{2,3}(?:-[A-Za-z0-9]+)?):\s*[{t]/gm)].map((m) => m[1]));
}

const TABLES = ["uiText.ts", "archiveText.ts", "notFoundText.ts"];
const all = offered();
const tables = TABLES.map((f) => [f, covered(f)]);

let gaps = 0;
for (const [file, have] of tables) {
  const missing = all.filter((c) => !have.has(c));
  gaps += missing.length;
  const pct = Math.round(((all.length - missing.length) / all.length) * 100);
  console.log(`${file.padEnd(18)} ${all.length - missing.length}/${all.length} (${pct}%)`);
  if (missing.length) console.log(`  falls back to English: ${missing.join(" ")}`);
}

if (gaps) {
  console.log(`\n${gaps} gap(s). Each one is a site that will show English theme text.`);
  process.exit(1);
}
console.log("\nEvery offered language is translated.");
