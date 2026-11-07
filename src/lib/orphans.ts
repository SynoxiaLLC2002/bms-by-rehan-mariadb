// Orphaned content: published posts and pages that nothing else links to.
//
// Search engines find pages by following links. A post that no other post,
// page or menu points at is reachable only through the sitemap and the blog
// listing — as it slides down the listing it gets crawled less, and it passes
// on and receives none of the ranking that internal links carry. Rank Math
// reports these as "orphans"; the fix is a link from a related post, which
// the editor's Link Suggestions make one click.
//
// Database only — no network — so the report is built on each page view.

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { navItems, pages, posts } from "@/lib/db/schema";
import { isHomepage, pagePath, postPath } from "@/lib/permalinks";
import type { SiteSettings } from "@/lib/settings";

export interface OrphanDoc {
  kind: "post" | "page";
  id: number;
  title: string;
  path: string;
  /** Other documents linking here (a menu link counts as one). */
  inbound: number;
  inMenu: boolean;
  publishedAt: string | null;
}

export interface OrphanReport {
  total: number;
  orphans: OrphanDoc[];
  /** One inbound link only — worth strengthening. */
  weak: OrphanDoc[];
}

type Doc = OrphanDoc & { links: Set<string> };

/** "/a/b/" and "https://site/a/b?x#y" → "/a/b". Null for anything off-site. */
function normalise(href: string, host: string): string | null {
  let v = href.trim();
  if (!v || v.startsWith("#") || /^(mailto|tel|javascript|data):/i.test(v)) return null;
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      if (u.host.replace(/^www\./, "") !== host) return null;
      v = u.pathname;
    } catch {
      return null;
    }
  } else if (!v.startsWith("/")) {
    return null;
  }
  v = v.split(/[?#]/)[0];
  try {
    v = decodeURIComponent(v);
  } catch {
    // Keep it as written.
  }
  if (v.length > 1) v = v.replace(/\/+$/, "");
  return v.toLowerCase();
}

/** Every link-shaped string in a document, including inside JSON-encoded props (Row Layout columns). */
function collectLinks(value: unknown, host: string, out: Set<string>, depth = 0): void {
  if (depth > 20) return;
  if (typeof value === "string") {
    if ((value.startsWith("[") || value.startsWith("{")) && value.includes('"')) {
      try {
        collectLinks(JSON.parse(value), host, out, depth + 1);
        return;
      } catch {
        // Not JSON; fall through.
      }
    }
    // Links inside HTML blocks.
    if (value.includes("href=")) {
      for (const m of value.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
        const n = normalise(m[1], host);
        if (n) out.add(n);
      }
      return;
    }
    const n = value.length < 500 ? normalise(value, host) : null;
    // Only strings that look like page paths, not image files.
    if (n && !/\.(png|jpe?g|webp|avif|gif|svg|ico|json|apk|zip|pdf|mp4|mp3|woff2?)$/i.test(n)) out.add(n);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectLinks(v, host, out, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) collectLinks(v, host, out, depth + 1);
  }
}

export async function orphanReport(settings: SiteSettings, siteOrigin: string): Promise<OrphanReport> {
  let host = "";
  try {
    host = new URL(siteOrigin).host.replace(/^www\./, "");
  } catch {
    host = "";
  }

  const [livePosts, livePages, menu] = await Promise.all([
    db.query.posts.findMany({
      where: and(eq(posts.status, "published"), isNull(posts.deletedAt)),
      columns: { id: true, title: true, slug: true, language: true, content: true, publishedAt: true, createdAt: true },
    }),
    db.query.pages.findMany({
      where: and(eq(pages.status, "published"), isNull(pages.deletedAt)),
      columns: { id: true, title: true, slug: true, language: true, content: true, publishedAt: true },
    }),
    db.select({ url: navItems.url, objectType: navItems.objectType, objectId: navItems.objectId }).from(navItems),
  ]);

  const docs: Doc[] = [];
  const byPath = new Map<string, Doc>();
  const now = Date.now();

  for (const p of livePosts) {
    if (p.publishedAt && new Date(p.publishedAt).getTime() > now) continue; // scheduled, not live yet
    const path = postPath(p, settings);
    const d: Doc = { kind: "post", id: p.id, title: p.title || "(untitled)", path, inbound: 0, inMenu: false, publishedAt: p.publishedAt ? new Date(p.publishedAt).toISOString() : null, links: new Set() };
    collectLinks(p.content, host, d.links);
    docs.push(d);
    byPath.set(path.toLowerCase(), d);
  }
  for (const pg of livePages) {
    if (isHomepage(pg.id, pg.language, settings)) continue; // the front page is linked from everywhere
    const path = pagePath(pg, settings);
    const d: Doc = { kind: "page", id: pg.id, title: pg.title || "(untitled)", path, inbound: 0, inMenu: false, publishedAt: pg.publishedAt ? new Date(pg.publishedAt).toISOString() : null, links: new Set() };
    collectLinks(pg.content, host, d.links);
    docs.push(d);
    byPath.set(path.toLowerCase(), d);
  }

  for (const d of docs) {
    for (const link of d.links) {
      const target = byPath.get(link);
      if (target && target !== d) target.inbound++;
    }
  }

  for (const item of menu) {
    let target: Doc | undefined;
    if ((item.objectType === "post" || item.objectType === "page") && item.objectId) {
      target = docs.find((d) => d.kind === item.objectType && d.id === item.objectId);
    }
    if (!target && item.url) {
      const n = normalise(item.url, host);
      target = n ? byPath.get(n) : undefined;
    }
    if (target && !target.inMenu) {
      target.inMenu = true;
      target.inbound++;
    }
  }

  const strip = ({ links: _links, ...rest }: Doc): OrphanDoc => rest;
  const newest = (a: Doc, b: Doc) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
  return {
    total: docs.length,
    orphans: docs.filter((d) => d.inbound === 0).sort(newest).map(strip),
    weak: docs.filter((d) => d.inbound === 1).sort(newest).map(strip),
  };
}
