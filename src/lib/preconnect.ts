// Preconnect hints for the third-party hosts a page is about to use.
//
// Every external host costs a DNS lookup, a TCP handshake and a TLS handshake
// before its first byte — 100–300 ms on a phone. `<link rel="preconnect">`
// starts that work as soon as the HTML arrives, in parallel with everything
// else, so by the time the browser reaches the image or iframe the connection
// is already open. Browsers only keep a handful of speculative connections,
// so this picks the few hosts the content actually references rather than a
// fixed list.

type AnyBlock = Record<string, any>;

const URL_RE = /https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?/gi;
const MAX = 4;

/**
 * Hosts that are not worth a preconnect: the click-to-play facade means the
 * players load only on demand, and fonts are already handled by the layout.
 */
const SKIP = new Set([
  "www.youtube.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "player.vimeo.com",
  "vimeo.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
]);

/**
 * Props that hold a link the visitor may click, not a file the page loads.
 * A preconnect to a download mirror or a "read more" target is a connection
 * opened for nothing: the browser drops it long before anyone clicks. `url`
 * is on this list too, except inside the block types where it names the
 * resource itself (an image, a video, a map, an animation).
 */
const LINK_KEYS = new Set(["url", "href", "link", "linkUrl", "buttonUrl", "downloadUrl", "btns", "links", "ctaUrl", "moreUrl", "button2Url", "offersUrl"]);
const URL_IS_RESOURCE = new Set(["image", "video", "videoEmbed", "googleMap", "lottie", "htmlEmbed", "audio", "file"]);

function collect(value: unknown, out: Set<string>, depth = 0, blockType = ""): void {
  if (depth > 12 || out.size > 40) return;
  if (typeof value === "string") {
    // Serialised nested blocks (Row Layout columns) are strings holding JSON.
    if ((value.startsWith("[") || value.startsWith("{")) && value.includes('"type"')) {
      try {
        collect(JSON.parse(value), out, depth + 1, blockType);
        return;
      } catch {
        // Not JSON after all — scan it as text.
      }
    }
    for (const m of value.match(URL_RE) ?? []) {
      try {
        out.add(new URL(m).host.toLowerCase());
      } catch {
        // Not a URL the parser accepts; skip.
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collect(v, out, depth + 1, blockType);
    return;
  }
  if (value && typeof value === "object") {
    const obj = value as AnyBlock;
    const type = typeof obj.type === "string" && obj.props ? obj.type : blockType;
    for (const [k, v] of Object.entries(obj)) {
      if (LINK_KEYS.has(k) && !(k === "url" && URL_IS_RESOURCE.has(type))) continue;
      collect(v, out, depth + 1, type);
    }
  }
}

/**
 * The external hosts referenced by a document's blocks (and, when scripts are
 * not delayed, by the injected head scripts), own origin excluded, most
 * frequent first, capped at a handful.
 */
export function preconnectHosts(
  blocks: AnyBlock[] | null | undefined,
  siteOrigin: string,
  extra: { headScripts?: string; scriptsDelayed?: boolean; videoFacade?: boolean } = {}
): string[] {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  let own = "";
  try {
    own = new URL(siteOrigin).host.toLowerCase();
  } catch {
    own = "";
  }
  const add = (hosts: Set<string>) => {
    for (const h of hosts) {
      // With the facade on, a video costs one poster image, from a different
      // host than the video URL names — preconnect to where the bytes come from.
      if (extra.videoFacade !== false) {
        if (/(^|\.)(youtube(-nocookie)?\.com|youtu\.be)$/.test(h)) counts.set("i.ytimg.com", (counts.get("i.ytimg.com") ?? 0) + 1);
        else if (/(^|\.)vimeo\.com$/.test(h)) counts.set("vumbnail.com", (counts.get("vumbnail.com") ?? 0) + 1);
      }
      if (h === own || SKIP.has(h) || /(^|\.)localhost$/.test(h)) continue;
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }
  };
  for (const b of blocks ?? []) {
    seen.clear();
    collect(b, seen);
    add(seen);
  }
  if (extra.headScripts && !extra.scriptsDelayed) {
    seen.clear();
    collect(extra.headScripts, seen);
    add(seen);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX)
    .map(([h]) => `https://${h}`);
}
