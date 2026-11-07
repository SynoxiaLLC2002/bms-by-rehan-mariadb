// Which nav item is the page you're on?
//
// The CSS for `.hnav-item.is-active` has always existed — Colors & Fonts has
// active colour and background controls — but nothing ever set the class, so
// those controls did nothing. This decides it, once, for both the server and
// client renderers.

export interface ActiveNode {
  id: number;
  url: string;
  children: ActiveNode[];
}

/** Trailing slashes, query strings and hashes never change which page it is. */
export function normaliseUrl(url: string): string {
  if (!url) return "";
  let u = url.trim();
  // An absolute URL to this site still points at one of our paths.
  const m = /^https?:\/\/[^/]+(\/.*)?$/i.exec(u);
  if (m) u = m[1] || "/";
  if (!u.startsWith("/")) return u;
  u = u.split("#")[0].split("?")[0];
  if (u.length > 1 && u.endsWith("/")) u = u.slice(0, -1);
  return u || "/";
}

/**
 * The ids to mark active for the page at `currentPath`.
 *
 * An exact URL match is always active. With `parentActive`, an item is also
 * active when one of its children matches, or — for a section link like
 * `/blog` — when the current page sits underneath it. The home link is
 * excluded from that prefix rule, since `/` prefixes everything.
 */
export function activeNavIds(
  items: ActiveNode[],
  currentPath: string | undefined,
  parentActive: boolean
): Set<number> {
  const out = new Set<number>();
  const here = normaliseUrl(currentPath ?? "");
  if (!here.startsWith("/")) return out;

  const matches = (url: string) => {
    const u = normaliseUrl(url);
    if (!u.startsWith("/")) return false;
    if (u === here) return true;
    return parentActive && u !== "/" && here.startsWith(u + "/");
  };

  for (const item of items) {
    let active = matches(item.url);
    for (const child of item.children) {
      if (matches(child.url)) {
        out.add(child.id);
        if (parentActive) active = true;
      }
    }
    if (active) out.add(item.id);
  }
  return out;
}
