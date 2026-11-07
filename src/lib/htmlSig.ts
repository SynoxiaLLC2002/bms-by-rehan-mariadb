/**
 * A short fingerprint of a raw-HTML string, for `data-bms-html`.
 *
 * ScriptRunner compares it to decide whether a container's scripts have run:
 * a container React kept across a navigation but refilled with a different
 * page's HTML gets a new fingerprint, so its new scripts run too. FNV-1a,
 * 32-bit — this detects change, it protects nothing.
 */
export function htmlSig(html: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < html.length; i++) {
    h ^= html.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
