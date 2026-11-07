// The blocks this author reaches for, so the inserter's first screen is theirs
// rather than a fixed list.
//
// Stored per browser: it is a convenience, not content, and it should not
// travel with the site or need a database round-trip to read.

import { BLOCK_LIBRARY, type BlockDef } from "@/lib/blockLibrary";

const KEY = "bms_recent_blocks";
const LIMIT = 12;

/** A block def is identified by label — headings share one type, three labels. */
function idOf(def: BlockDef): string {
  return `${def.type}|${def.label}`;
}

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function rememberBlock(def: BlockDef): void {
  if (typeof window === "undefined") return;
  const id = idOf(def);
  const next = [id, ...read().filter((v) => v !== id)].slice(0, LIMIT);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
}

/**
 * Recently used blocks, most recent first.
 *
 * `extra` covers defs that are not in the library as their own entry — the
 * inserter's quick picks include a plain "Heading" that the library does not.
 */
export function recentBlocks(extra: BlockDef[] = []): BlockDef[] {
  const pool = [...extra, ...BLOCK_LIBRARY];
  const out: BlockDef[] = [];
  for (const id of read()) {
    const def = pool.find((d) => idOf(d) === id);
    if (def) out.push(def);
  }
  return out;
}
