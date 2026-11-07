// Finds dead links in published content.
//
// Links rot: the app a post pointed at moves, a source site closes, an
// internal slug is renamed. Each one is a visitor hitting a 404 and a small
// signal to search engines that the page is unmaintained. This walks every
// published post and page, collects every link, checks each once, and
// reports what is broken and where it is used.
//
// Checked from the server, not the browser, so it sees what a crawler sees.
// A link the server cannot reach at all is reported as "unreachable" rather
// than "broken": a shared host may not be able to open outbound connections,
// or to reach its own public address, and that is a hosting fact, not a dead
// link.

import { isNull, eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { pages, posts } from "@/lib/db/schema";
import { pagePath, postPath } from "@/lib/permalinks";
import type { SiteSettings } from "@/lib/settings";
import { parseColumns } from "@/lib/rowLayout";
import { lookup } from "node:dns/promises";
import { isPrivateAddress } from "@/lib/privateAddress";

export interface LinkUse {
  kind: "post" | "page";
  id: number;
  title: string;
  path: string;
}

export interface LinkResult {
  url: string;
  /** The absolute URL that was actually requested. */
  resolved: string;
  status: number | null;
  state: "ok" | "broken" | "error" | "unreachable" | "redirect";
  detail?: string;
  usedBy: LinkUse[];
}

export interface LinkReport {
  ranAt: string;
  checked: number;
  broken: number;
  results: LinkResult[];
  /** True when the run hit the per-run cap and some links were not checked. */
  truncated: boolean;
}

const MAX_LINKS = 400;
const CONCURRENCY = 6;
const TIMEOUT_MS = 10_000;
const UA = "Mozilla/5.0 (compatible; BMS-LinkCheck/1.0; +https://example.com)";

let last: LinkReport | null = null;
let running: Promise<LinkReport> | null = null;

export function lastLinkReport(): LinkReport | null {
  return last;
}

/**
 * Every link in a document's blocks.
 *
 * Depth-capped for the same reason the renderer's walkers are (see
 * `MAX_WALK_DEPTH` in BlockRenderer): this recurses through `content` and
 * `children` with no natural bound, and a stack overflow here does not lose one
 * link — it rejects the whole run, so the Link Checker reports nothing at all
 * and says only that it failed. Nothing built in the editor comes near 64
 * levels; content that does arrived from an import or a plugin.
 */
const MAX_COLLECT_DEPTH = 64;

const LINK_KEYS = new Set(["href", "url", "link", "downloadUrl", "buttonUrl", "button2Url"]);
const LINKISH = /^(https?:\/\/|\/)/;
/** `[label](url)` inside a plain-string label — the Icon List's inline link. */
const INLINE_LINK = /\[[^\]]+\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

/**
 * Links inside a prop that holds JSON rather than a value: a button group's
 * buttons, an icon list's items, a tab set. The editor keeps these as strings
 * because BlockNote props are scalars, so a walk over the block tree alone
 * never saw them.
 */
function collectJson(value: unknown, out: string[], depth: number) {
  if (depth > MAX_COLLECT_DEPTH) return;
  if (Array.isArray(value)) {
    for (const v of value) collectJson(v, out, depth + 1);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") {
      if (LINK_KEYS.has(k) && LINKISH.test(v)) out.push(v);
      else if (v.includes("](")) inlineLinks(v, out);
    } else {
      collectJson(v, out, depth + 1);
    }
  }
}

function inlineLinks(text: string, out: string[]) {
  INLINE_LINK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_LINK.exec(text))) if (LINKISH.test(m[1])) out.push(m[1]);
}

export function collect(content: unknown, out: string[], depth = 0) {
  if (depth > MAX_COLLECT_DEPTH) return;
  if (!Array.isArray(content)) return;
  for (const c of content) {
    if (typeof c !== "object" || c === null) continue;
    const n = c as Record<string, unknown>;
    if (n.type === "link" && typeof n.href === "string") out.push(n.href);
    const props = (n.props ?? {}) as Record<string, unknown>;
    const type = String(n.type ?? "");

    // A Row Layout's columns are whole block lists stored as JSON text. Only
    // the columns the row shows are walked — a hidden third column left over
    // from a narrower layout is not on the page, so its links are not either.
    if (type === "rowLayout") {
      for (const col of parseColumns(props.cols, parseInt(String(props.columns) || "2", 10) || 2)) {
        collect(col.blocks ?? [], out, depth + 1);
      }
      continue;
    }

    if (!/image|video|embed|gallery|map/i.test(type)) {
      for (const k of LINK_KEYS) {
        if (typeof props[k] === "string" && LINKISH.test(props[k] as string)) out.push(props[k] as string);
      }
      for (const v of Object.values(props)) {
        if (typeof v !== "string") continue;
        const t = v.trimStart();
        if (t.startsWith("[") || t.startsWith("{")) {
          try {
            collectJson(JSON.parse(t), out, depth + 1);
            continue;
          } catch {
            // Not JSON after all — an ordinary string that starts with a bracket.
          }
        }
        if (v.includes("](")) inlineLinks(v, out);
      }
    }
    if (Array.isArray(n.content)) collect(n.content, out, depth + 1);
    if (Array.isArray(n.children)) collect(n.children, out, depth + 1);
  }
}

/**
 * Addresses the checker must not fetch.
 *
 * The URLs come from document content, so an author — who cannot otherwise
 * reach the server's network — chooses them, and an administrator running the
 * check makes the server fetch them. That is a server-side request forgery:
 * a link to `http://169.254.169.254/…` reads the host's cloud metadata,
 * `http://127.0.0.1:6379/` pokes a local service, and the status code comes
 * back in the report either way, so it works as a port scanner.
 *
 * Only http(s) is probed, and only public addresses. Names are left to DNS,
 * which is where a rebinding attack would go — worth knowing, but a link
 * checker that reports "could not check" for a rebinding host is an
 * acceptable outcome, whereas one that reads cloud credentials is not.
 */
const BLOCKED_HOST = new RegExp(
  [
    "^localhost$",
    "^127\\.",                      // loopback
    "^0\\.",                        // "this host"
    "^10\\.",                       // RFC1918
    "^192\\.168\\.",                // RFC1918
    "^172\\.(1[6-9]|2\\d|3[01])\\.", // RFC1918
    "^169\\.254\\.",                // link-local, incl. cloud metadata
    "^100\\.(6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.", // carrier-grade NAT
    "^\\[?::1\\]?$",                // IPv6 loopback
    "^\\[?f[cd]",                   // IPv6 unique-local
    "^\\[?fe80:",                   // IPv6 link-local
    "\\.local$",                    // mDNS
    "\\.internal$",
  ].join("|"),
  "i"
);

function fetchable(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  return !BLOCKED_HOST.test(u.hostname);
}

/**
 * Where the name actually points. The hostname test above only reads the
 * text, so `127.0.0.1.nip.io`, `localtest.me` or `[::ffff:127.0.0.1]` sailed
 * through to a local address. Every address the name resolves to must be
 * public. (A name that changes its answer between this lookup and the fetch
 * — DNS rebinding — is not covered; the report shows only a status code.)
 */
async function resolvesPublic(url: string): Promise<boolean> {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    const addrs = await lookup(host, { all: true, verbatim: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

async function probe(url: string): Promise<Pick<LinkResult, "status" | "state" | "detail">> {
  if (!fetchable(url) || !(await resolvesPublic(url))) {
    return { status: 0, state: "error", detail: "Not checked: private or non-web address." };
  }
  const attempt = async (method: "HEAD" | "GET") => {
    const res = await fetch(url, { method, redirect: "manual", headers: { "user-agent": UA, accept: "*/*" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res;
  };
  try {
    let res = await attempt("HEAD");
    // Plenty of servers refuse HEAD; a 405/403/501 says nothing about the page.
    if ([403, 405, 501].includes(res.status)) res = await attempt("GET");
    if (res.status >= 300 && res.status < 400) {
      return { status: res.status, state: "redirect", detail: res.headers.get("location") ?? undefined };
    }
    if (res.status === 404 || res.status === 410) return { status: res.status, state: "broken" };
    if (res.status >= 400) return { status: res.status, state: "error" };
    return { status: res.status, state: "ok" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: null, state: "unreachable", detail: msg.includes("timeout") || msg.includes("Timeout") ? "timed out" : msg.slice(0, 80) };
  }
}

export async function runLinkCheck(settings: SiteSettings, siteUrl: string): Promise<LinkReport> {
  if (running) return running;
  running = (async () => {
    const usesByUrl = new Map<string, LinkUse[]>();
    const add = (href: string, use: LinkUse) => {
      const key = href.trim();
      if (!key || key.startsWith("#") || /^(mailto|tel|javascript):/i.test(key)) return;
      if (!usesByUrl.has(key)) usesByUrl.set(key, []);
      const uses = usesByUrl.get(key)!;
      if (!uses.some((u) => u.kind === use.kind && u.id === use.id)) uses.push(use);
    };

    const livePosts = await db.query.posts.findMany({
      where: and(eq(posts.status, "published"), isNull(posts.deletedAt)),
      columns: { id: true, title: true, slug: true, language: true, content: true, publishedAt: true, createdAt: true },
    });
    for (const p of livePosts) {
      const links: string[] = [];
      collect(p.content, links);
      const use: LinkUse = { kind: "post", id: p.id, title: p.title, path: postPath(p, settings) };
      for (const l of links) add(l, use);
    }
    const livePages = await db.query.pages.findMany({
      where: and(eq(pages.status, "published"), isNull(pages.deletedAt)),
      columns: { id: true, title: true, slug: true, language: true, content: true },
    });
    for (const pg of livePages) {
      const links: string[] = [];
      collect(pg.content, links);
      const use: LinkUse = { kind: "page", id: pg.id, title: pg.title, path: pagePath(pg, settings) };
      for (const l of links) add(l, use);
    }

    const all = [...usesByUrl.entries()];
    const truncated = all.length > MAX_LINKS;
    const queue = all.slice(0, MAX_LINKS);
    const results: LinkResult[] = [];

    const worker = async () => {
      while (queue.length) {
        const [url, usedBy] = queue.shift()!;
        let resolved = url;
        try {
          resolved = new URL(url, siteUrl).toString();
        } catch {
          results.push({ url, resolved: url, status: null, state: "error", detail: "not a valid URL", usedBy });
          continue;
        }
        const r = await probe(resolved);
        results.push({ url, resolved, usedBy, ...r });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const order: Record<LinkResult["state"], number> = { broken: 0, error: 1, unreachable: 2, redirect: 3, ok: 4 };
    results.sort((a, b) => order[a.state] - order[b.state] || a.url.localeCompare(b.url));

    const report: LinkReport = {
      ranAt: new Date().toISOString(),
      checked: results.length,
      broken: results.filter((r) => r.state === "broken").length,
      results,
      truncated,
    };
    last = report;
    return report;
  })().finally(() => {
    running = null;
  });
  return running;
}
