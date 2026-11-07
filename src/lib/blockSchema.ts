// Structured data that *blocks* emit, tied into the page's graph.
//
// The App Info block, the Download Box and the FAQ accordion each write their
// own JSON-LD — a MobileApplication, a FAQPage — and each was a separate,
// unnamed node: valid on its own, but nothing on the page said the page was
// *about* it. `mainEntityId` (lib/schemaTypes) only looked at the SEO → Schema
// tab, so on an APK site the one schema that matters most was the one the
// WebPage never pointed at.
//
// Two halves, both from the block's own id so they cannot disagree:
//   • `blockSchemaId` — the `@id` the block's renderer puts on its node;
//   • `firstBlockEntityId` — the id of the first such block in a document,
//     for the page's `mainEntity` (or an Article's `about`) when the Schema
//     tab has named nothing.

import { schemaUrl } from "./seoMeta";
import { parseColumns } from "./rowLayout";
import { resolveAppInfo } from "./appInfo";
import { resolveDownloadBox } from "./downloadBox";

type AnyBlock = Record<string, any>;

/** A stable `@id` for one block's schema node on one page. */
export function blockSchemaId(pageUrl: string, kind: string, blockId: unknown): string {
  const id = String(blockId ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16) || "0";
  const base = schemaUrl(pageUrl);
  // A bare origin gets its slash back, as `schemaId.webpage` does, so the
  // root reads `https://x.net/#…` like every other id on the site.
  return `${base}${/^https?:\/\/[^/]+$/i.test(base) ? "/" : ""}#${kind}-${id}`;
}

/**
 * Whether this block will emit a "thing" node — an app or a download with
 * its schema switched on. Mirrors the conditions in the renderers exactly,
 * so a page never points at a node that is not there.
 */
function emitsThing(b: AnyBlock): string | null {
  const props = (b?.props ?? {}) as Record<string, unknown>;
  if (b?.type === "appInfo") {
    const app = resolveAppInfo(props);
    return app.showSchema && app.name ? "app" : null;
  }
  if (b?.type === "downloadBox") {
    const box = resolveDownloadBox(props);
    return box.schema && box.title ? "download" : null;
  }
  return null;
}

/**
 * The `@id` of the first app / download node this document renders, walking
 * Row Layout columns the way the renderer does (and, like it, not `children`,
 * which nothing renders).
 */
export function firstBlockEntityId(blocks: unknown, pageUrl: string): string | undefined {
  if (!Array.isArray(blocks)) return undefined;
  for (const b of blocks as AnyBlock[]) {
    const kind = emitsThing(b);
    if (kind) return blockSchemaId(pageUrl, kind, b.id);
    const props = (b?.props ?? {}) as Record<string, unknown>;
    if (b?.type === "rowLayout" && typeof props.cols === "string") {
      for (const c of parseColumns(props.cols, parseInt(String(props.columns) || "2", 10) || 2)) {
        const found = firstBlockEntityId(c.blocks ?? [], pageUrl);
        if (found) return found;
      }
    }
  }
  return undefined;
}
