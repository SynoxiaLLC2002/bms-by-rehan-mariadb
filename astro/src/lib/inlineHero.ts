// The page's first-view (LCP) image, when it is a small SVG upload, as a data: URI.
//
// Even preloaded, it was its own request: on PageSpeed's slow phone it started only
// once the HTML had arrived (~540 ms "resource load delay") and took ~370 ms more,
// for 2–3 KB. Inside the page it paints with the first frame. Uploaded SVGs are
// sanitised (lib/sanitizeSvg), and an <img> never runs an SVG's scripts anyway.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MAX_BYTES = 8 * 1024; // past this the HTML grows more than the request costs

export async function inlineHeroSvg(href: string): Promise<string | null> {
  const m = href.replace(/[?#].*$/, "").match(/^\/uploads\/(.+\.svg)$/i);
  if (!m) return null;
  try {
    const parts = decodeURIComponent(m[1]).split("/");
    if (parts.some((p) => p === "" || p === "." || p === ".." || p.includes("\\"))) return null;
    const file = path.join(process.cwd(), "public", "uploads", ...parts);
    if ((await stat(file)).size > MAX_BYTES) return null;
    return `data:image/svg+xml;base64,${(await readFile(file)).toString("base64")}`;
  } catch {
    return null; // missing file or bad name: the link stays as it was
  }
}
