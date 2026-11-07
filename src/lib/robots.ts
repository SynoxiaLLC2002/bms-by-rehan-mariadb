// Per-document robots directives, beyond the index/follow pair.
//
// Rank Math calls these "Advanced Robots". They matter in specific cases —
// a page whose text must not appear in snippets, a download page whose
// images should not land in image search, a news site that wants no cached
// copy — so they live behind a fold in the SEO panel and default to Google's
// most generous allowances (which every post already sent).

export interface RobotsAdvanced {
  noArchive: boolean;
  noImageIndex: boolean;
  noSnippet: boolean;
  /** -1 = unlimited, 0 = none, otherwise a character count. */
  maxSnippet: number;
  maxImagePreview: "none" | "standard" | "large";
  /** -1 = unlimited, 0 = none, otherwise seconds. */
  maxVideoPreview: number;
}

export const ROBOTS_DEFAULTS: RobotsAdvanced = {
  noArchive: false,
  noImageIndex: false,
  noSnippet: false,
  maxSnippet: -1,
  maxImagePreview: "large",
  maxVideoPreview: -1,
};

/** The stored JSON (or null/garbage) as a full settings object. */
export function parseRobotsAdvanced(raw: string | null | undefined): RobotsAdvanced {
  if (!raw) return { ...ROBOTS_DEFAULTS };
  try {
    const v = JSON.parse(raw) as Partial<RobotsAdvanced>;
    const num = (n: unknown, d: number) => (typeof n === "number" && Number.isFinite(n) ? Math.max(-1, Math.trunc(n)) : d);
    return {
      noArchive: !!v.noArchive,
      noImageIndex: !!v.noImageIndex,
      noSnippet: !!v.noSnippet,
      maxSnippet: num(v.maxSnippet, -1),
      maxImagePreview: v.maxImagePreview === "none" || v.maxImagePreview === "standard" ? v.maxImagePreview : "large",
      maxVideoPreview: num(v.maxVideoPreview, -1),
    };
  } catch {
    return { ...ROBOTS_DEFAULTS };
  }
}

/** Null when everything is at its default, so the column stays empty. */
export function serializeRobotsAdvanced(v: RobotsAdvanced | null | undefined): string | null {
  if (!v) return null;
  const same = (Object.keys(ROBOTS_DEFAULTS) as (keyof RobotsAdvanced)[]).every((k) => v[k] === ROBOTS_DEFAULTS[k]);
  return same ? null : JSON.stringify(v);
}

/** Whether anything differs from the defaults — for the panel's fold label. */
export function hasRobotsAdvanced(v: RobotsAdvanced): boolean {
  return serializeRobotsAdvanced(v) !== null;
}

/**
 * The full directive string. `index`/`follow` are the resolved answers (the
 * document's flag combined with the site-wide setting); the allowances are
 * only stated for a page that may be indexed, and dropped under `nosnippet`,
 * where "no snippet, up to any length" would be contradictory.
 */
export function buildRobots(index: boolean, follow: boolean, adv: RobotsAdvanced = ROBOTS_DEFAULTS): string {
  const parts = [index ? "index" : "noindex", follow ? "follow" : "nofollow"];
  if (adv.noArchive) parts.push("noarchive");
  if (adv.noImageIndex) parts.push("noimageindex");
  if (adv.noSnippet) parts.push("nosnippet");
  if (index && !adv.noSnippet) {
    parts.push(`max-snippet:${adv.maxSnippet}`, `max-image-preview:${adv.maxImagePreview}`, `max-video-preview:${adv.maxVideoPreview}`);
  }
  return parts.join(", ");
}
