"use client";

// Block Defaults — the props a newly inserted block of a given type starts with.
//
// Stored in `siteSettings` under one key rather than in the browser, because a
// default is a property of the site: set it on your laptop and it should hold
// when you next edit from anywhere, and for anyone else with an account. That
// rules out localStorage, which is where the reusable-block list lives and is
// deliberately per-browser.
//
// Reads are served from a module-level cache primed once per editor session, so
// inserting a block never waits on the network — a default that arrives a moment
// late would apply to some inserts and not others, which is worse than none.

const SETTING_KEY = "block_defaults";

export type BlockDefaults = Record<string, Record<string, string>>;

let _cache: BlockDefaults | null = null;
let _loading: Promise<BlockDefaults> | null = null;

/** Props never worth carrying onto a new block: identity and content. */
const NEVER_DEFAULT = new Set(["cols", "bx", "anchor", "src", "images", "blocks"]);

export function loadBlockDefaults(): Promise<BlockDefaults> {
  if (_cache) return Promise.resolve(_cache);
  if (_loading) return _loading;

  _loading = fetch("/api/settings")
    .then((r) => r.json())
    .then((d) => {
      const raw = d?.settings?.[SETTING_KEY];
      const parsed = typeof raw === "string" && raw.trim() ? JSON.parse(raw) : {};
      _cache = parsed && typeof parsed === "object" ? (parsed as BlockDefaults) : {};
      return _cache;
    })
    .catch(() => {
      // A failed load must not block editing — it just means no defaults.
      _cache = {};
      return _cache;
    })
    .finally(() => {
      _loading = null;
    });

  return _loading;
}

/** Synchronous read for the insert path. Empty until `loadBlockDefaults` lands. */
export function blockDefaultsFor(type: string): Record<string, string> | null {
  const forType = _cache?.[type];
  return forType && Object.keys(forType).length > 0 ? forType : null;
}

export function hasBlockDefault(type: string): boolean {
  return !!blockDefaultsFor(type);
}

async function persist(next: BlockDefaults): Promise<void> {
  const previous = _cache;
  _cache = next;
  let res: Response;
  try {
    res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [SETTING_KEY]: JSON.stringify(next) }),
    });
  } catch {
    _cache = previous;
    throw new Error("Could not reach the server. Your block default was not saved.");
  }
  if (!res.ok) {
    // The in-memory copy was already updated, which is why this looked as
    // though it had worked: the editor went on using the new default for the
    // rest of the session and it was gone after a reload. Put the old value
    // back and say so.
    //
    // `POST /api/settings` is administrators only — block defaults are
    // site-wide, so an editor saving one would change the default for
    // everybody. The refusal is correct; reporting success was not.
    _cache = previous;
    const detail = res.status === 403
      ? "Block defaults are site-wide, so only an administrator can change them."
      : await res.json().then((d) => (d as { error?: string })?.error).catch(() => undefined);
    throw new Error(detail || "Could not save the block default.");
  }
}

/**
 * Stores one block's current props as the default for its type.
 *
 * Content-carrying and identity props are stripped: a default that pinned an
 * anchor would produce duplicate ids the moment you inserted two.
 */
export async function saveBlockDefault(type: string, props: Record<string, string>): Promise<void> {
  const keep: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) {
    if (NEVER_DEFAULT.has(k) || k.startsWith("__")) continue;
    if (typeof v === "string" && v !== "") keep[k] = v;
  }
  await loadBlockDefaults();
  await persist({ ...(_cache ?? {}), [type]: keep });
}

export async function clearBlockDefault(type: string): Promise<void> {
  await loadBlockDefaults();
  const next = { ...(_cache ?? {}) };
  delete next[type];
  await persist(next);
}
