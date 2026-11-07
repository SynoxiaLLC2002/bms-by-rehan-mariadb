// The site's own MCP server (api/mcp) — Claude connects straight to the site
// with one of its API tokens, no hub in between:
//
//   claude mcp add --transport http mysite https://example.com/api/mcp \
//     --header "Authorization: Bearer bms_…"
//
// The tools are the hub's (Desktop/bms-mcp-hub/worker.js) minus the `site`
// argument: the site is the one being called. Each tool calls this site's own
// public /api with the caller's token, so every rule a route already has —
// middleware's TOKEN_REFUSED, draft-only new pages, credential settings,
// LiteSpeed purges — applies exactly as it does to the hub. It cannot call the
// routes in-process: Passenger owns the listening socket, and rendering a page
// for render_document needs a real request anyway.
//
// A token with the "publish" scope also gets publish_document; the page and
// post routes accept its status changes too (lib/authz.ts tokenPublishProblem).
//
// Backups and plugins are the exception. Their HTTP routes stay refused to
// every token; a token whose owner ticked the "backups" or "plugins" scope
// (lib/apiTokens.ts) gets tools here that call the libraries directly. A token
// without the scope does not even see those tools.

import { readFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import JSZip from "jszip";
import type { Session } from "next-auth";
import { tokenHasScope, type TokenScope } from "@/lib/apiTokens";
import { backupPath, listBackups, runBackup } from "@/lib/backup";
import { ImportError, importSite } from "@/lib/importSite";
import { restoreMedia } from "@/lib/exportMedia";
import { revalidatePublicSite } from "@/lib/revalidateSite";
import { installPluginZip, listPlugins, uninstallPlugin, updatePlugin, MAX_ZIP_BYTES } from "@/lib/plugins";
import { isPrivateAddress } from "@/lib/privateAddress";
import { CURRENT_VERSION } from "@/lib/version";
import { PROFILE_TEXT, readOwnProfile, updateOwnProfile } from "@/lib/myProfile";
import { makeUploadClaim, UPLOAD_URL_MINUTES } from "@/lib/uploadUrl";

export const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "bms-cms", version: CURRENT_VERSION };

const INSTRUCTIONS = `Builds and edits this site, which runs BMS by Rehan (a Next.js CMS with a BlockNote block editor).
Workflow: site_info → get_blocks (summary, then the types you will use) → read existing pages with get_document → create NEW pages as DRAFTS (publishing is refused); existing pages can be edited, and edits to an already-published page go live at once → render_document to check. To change part of an existing page use get_outline + edit_blocks, not update_document with the whole content. Publishing, unpublishing and publish dates are the owner's, in the admin — unless the owner gave this token Publishing access: then site_info lists "publish" in extraAccess and publish_document is available. Settings, menus and Customizer changes go live immediately — there is no draft for them.
Content is a JSON array of blocks { type, props, content, children }. Missing block ids are filled in, inline text given as a string becomes text nodes, and custom-block props are stringified (arrays/objects → JSON strings, numbers/booleans → strings), so you may write rowLayout "cols" or button "btns" as real arrays.
Media must live on the site: upload_media first, then use the returned URL.`;

/** Who is calling and how to reach the site as them. */
export interface McpContext {
  session: Session;
  /** The caller's own Authorization header, passed on to the site's API. */
  authorization: string;
  /** This site's public origin (siteUrl), no trailing slash. */
  base: string;
  siteName: string;
}

class ToolError extends Error {}

type Args = Record<string, unknown>;

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Shown and callable only to a token holding this scope. */
  scope?: TokenScope;
  run: (a: Args, ctx: McpContext) => Promise<unknown>;
}

// ── Calling the site's own API ─────────────────────────────────────────────

const UA = "Mozilla/5.0 (compatible; BMS-MCP/1.0)";

async function siteFetch(ctx: McpContext, method: string, path: string, body?: unknown): Promise<Response> {
  if (!path.startsWith("/")) path = "/" + path;
  const headers: Record<string, string> = { authorization: ctx.authorization, "user-agent": UA, accept: "application/json" };
  const init: RequestInit = { method, headers, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(60_000) };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }
  try {
    return await fetch(ctx.base + path, init);
  } catch (e) {
    // Some shared hosts cannot connect to their own public domain (see
    // checkLiveSite in lib/siteHealth.ts). Say so, rather than a bare "fetch failed".
    throw new ToolError(
      `This server could not reach its own address (${ctx.base}): ${e instanceof Error ? e.message : e}. ` +
        "Check Settings → Site URL. If the host blocks connections to its own domain, use the MCP hub instead."
    );
  }
}

/** A call to the site's API. Returns parsed JSON, or throws with the site's own error. */
async function siteApi(ctx: McpContext, method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await siteFetch(ctx, method, path, body);
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { body: text.slice(0, 2000) };
  }
  if (!res.ok) {
    throw new ToolError(`${method} ${path} → ${res.status}: ${data.error || data.body || text.slice(0, 500)}`);
  }
  return data;
}

// ── Fetching a URL someone else chose ──────────────────────────────────────
//
// The hub downloaded on Cloudflare; this downloads from the host itself, where
// a URL pointing at localhost or the private network would reach things no
// visitor can (cPanel, other apps). Every hop's addresses are checked.

async function downloadPublic(raw: string, maxBytes: number): Promise<{ bytes: Buffer; name: string; type: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ToolError(`Not a URL: ${raw}`);
  }
  for (let hop = 0; hop < 5; hop++) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new ToolError("Only http and https URLs can be downloaded.");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addrs = await lookup(host, { all: true, verbatim: true }).catch(() => []);
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
      throw new ToolError(`Refusing to download from ${url.host}: it is not a public address.`);
    }
    const res = await fetch(url, { redirect: "manual", cache: "no-store", headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location") as string, url);
      continue;
    }
    if (!res.ok) throw new ToolError(`Could not download ${url}: ${res.status}`);
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw new ToolError(`The file is larger than ${maxBytes / 1048576} MB.`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > maxBytes) throw new ToolError(`The file is larger than ${maxBytes / 1048576} MB.`);
    const name = decodeURIComponent(url.pathname.split("/").pop() || "") || "upload";
    return { bytes, name, type: (res.headers.get("content-type") ?? "").split(";")[0].trim() };
  }
  throw new ToolError("Too many redirects.");
}

function fromBase64(v: unknown): Buffer {
  return Buffer.from(String(v).replace(/^data:[^,]+,/, ""), "base64");
}

// ── Content normalisation (as in the hub) ──────────────────────────────────
//
// BlockNote's own blocks keep typed props (heading level is a number); every
// custom block stores strings. Writing a page by hand, the easy mistake is a
// number or an array where a string belongs — fixed here rather than left to
// fail silently on the page.

const BUILTIN = new Set(["paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem", "quote", "codeBlock", "table", "image", "video", "audio", "file"]);
const INLINE = new Set(["paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem", "quote", "codeBlock"]);

type Node = Record<string, unknown>;

function inline(content: unknown): unknown[] {
  if (typeof content === "string") return content ? [{ type: "text", text: content, styles: {} }] : [];
  if (!Array.isArray(content)) return [];
  return content.map((n) => {
    if (typeof n === "string") return { type: "text", text: n, styles: {} };
    if (n && n.type === "text") return { styles: {}, ...n };
    if (n && n.type === "link") return { ...n, content: inline(n.content) };
    return n;
  });
}

function normalizeBlocks(blocks: unknown): Node[] {
  if (!Array.isArray(blocks)) throw new ToolError("content must be an array of blocks");
  return blocks.map(normalizeBlock);
}

function normalizeBlock(b: Node): Node {
  if (!b || typeof b !== "object" || typeof b.type !== "string") throw new ToolError(`Every block needs a "type": ${JSON.stringify(b).slice(0, 120)}`);
  const props: Record<string, unknown> = { ...((b.props as Node) || {}) };
  const out: Node = { id: b.id || crypto.randomUUID(), type: b.type, props, content: b.content, children: Array.isArray(b.children) ? b.children.map(normalizeBlock) : [] };

  if (b.type === "rowLayout" && props.cols !== undefined) {
    let cols = props.cols;
    if (typeof cols === "string") {
      try {
        cols = JSON.parse(cols);
      } catch {
        throw new ToolError("rowLayout cols is not valid JSON");
      }
    }
    if (!Array.isArray(cols)) throw new ToolError("rowLayout cols must be an array of { blocks: [...] }");
    props.cols = cols.map((c: Node) => ({ ...c, blocks: normalizeBlocks(c.blocks || []) }));
    if (props.columns === undefined) props.columns = String(cols.length);
  }

  if (!BUILTIN.has(b.type)) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined) delete props[k];
      else if (typeof v === "object") props[k] = JSON.stringify(v);
      else if (typeof v !== "string") props[k] = String(v);
    }
  }

  // Text given as a string is inline content for ANY block that takes it —
  // custom ones too (textAdvanced). Only the built-ins are known to want it
  // when nothing was given.
  if (INLINE.has(b.type) || typeof b.content === "string") out.content = inline(b.content ?? "");
  else if (b.type === "table") out.content = b.content;
  else out.content = Array.isArray(b.content) ? b.content : [];
  if (out.content === undefined) delete out.content;
  return out;
}

/**
 * Drafts only, as the hub. The routes refuse publishing by a token too
 * (tokenPublishProblem in lib/authz.ts); saying it here is clearer.
 */
function draftOnly(f: Node) {
  if (f.status !== undefined && f.status !== "draft") {
    throw new ToolError(`New pages are saved as drafts only (status "${f.status}" refused). The owner publishes from the admin.`);
  }
  if (f.publishedAt !== undefined) throw new ToolError("publishedAt is refused: scheduling is publishing. The owner does it from the admin.");
}

function prepareFields(fields: unknown): Node {
  const f: Node = { ...((fields as Node) || {}) };
  if (f.content !== undefined) f.content = normalizeBlocks(f.content);
  return f;
}

function kindOf(a: Args): "page" | "post" {
  if (a.kind !== "page" && a.kind !== "post") throw new ToolError('kind must be "page" or "post"');
  return a.kind;
}

function idOf(a: Args): number {
  const id = Number(a.id);
  if (!Number.isInteger(id) || id < 1) throw new ToolError("id must be a document id");
  return id;
}

// ── Editing blocks in place ───────────────────────────────────────────────
//
// update_document replaces the whole block array, so one new link meant
// re-sending a 30–60 KB page, live, where one slip breaks it. These read the
// page on the server, change only the blocks named, and save it back with the
// version they read (expectedUpdatedAt: a save from another tab in between is
// refused, not overwritten). Blocks inside a Row Layout's columns (props.cols,
// stored as a JSON string) and inside children are reached the same way.

type Visit = (b: Node, list: Node[], index: number, depth: number) => void;

/** A prop holding nested blocks: [{ blocks: [...] }, …], as an array or a JSON string. */
function nestedLists(v: unknown): { cols: Node[]; wasString: boolean } | null {
  let parsed = v;
  const wasString = typeof v === "string";
  if (wasString) {
    const t = (v as string).trim();
    if (!t.startsWith("[")) return null;
    try {
      parsed = JSON.parse(t);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed) || !parsed.some((c) => c && typeof c === "object" && Array.isArray((c as Node).blocks))) return null;
  return { cols: parsed as Node[], wasString };
}

/** Calls visit for every block, depth first, nested ones included; writes changed nested props back. */
function walkBlocks(list: Node[], visit: Visit, depth = 0): void {
  if (depth > 20) return;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b || typeof b !== "object") continue;
    visit(b, list, i, depth);
    if (list[i] !== b) {
      i--; // removed or replaced: look at what is now here
      continue;
    }
    const props = (b.props as Node) || {};
    for (const [k, v] of Object.entries(props)) {
      const nested = nestedLists(v);
      if (!nested) continue;
      for (const c of nested.cols) if (Array.isArray(c.blocks)) walkBlocks(c.blocks as Node[], visit, depth + 1);
      props[k] = nested.wasString ? JSON.stringify(nested.cols) : nested.cols;
    }
    if (Array.isArray(b.children)) walkBlocks(b.children as Node[], visit, depth + 1);
  }
}

function plainText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content.map((n) => (n && typeof n === "object" ? (typeof (n as Node).text === "string" ? (n as Node).text : plainText((n as Node).content)) : "")).join("");
}

function linksIn(content: unknown, out: string[] = []): string[] {
  if (!Array.isArray(content)) return out;
  for (const n of content) {
    if (!n || typeof n !== "object") continue;
    if ((n as Node).type === "link" && typeof (n as Node).href === "string") out.push((n as Node).href as string);
    linksIn((n as Node).content, out);
  }
  return out;
}

/** The page's blocks as a short list: id, type, depth, first words, links, short props. */
function outline(content: Node[]): Node[] {
  const rows: Node[] = [];
  walkBlocks(content, (b, _list, _i, d) => {
    const props = (b.props as Node) || {};
    const text = plainText(b.content).replace(/\s+/g, " ").trim();
    const short: Node = {};
    for (const [k, v] of Object.entries(props)) {
      if (nestedLists(v)) continue;
      const s = typeof v === "string" ? v : JSON.stringify(v);
      if (s && s.length <= 80) short[k] = v;
      else if (s) short[k] = `(${s.length} chars)`;
    }
    const links = linksIn(b.content);
    rows.push({ id: b.id, type: b.type, depth: d, ...(text ? { text: text.length > 100 ? text.slice(0, 100) + "…" : text } : {}), ...(links.length ? { links } : {}), props: short });
  });
  return rows;
}

/** Replaces text in inline content (text and link addresses). Returns how many. */
function replaceInInline(content: unknown, find: string, to: string): number {
  if (!Array.isArray(content)) return 0;
  let n = 0;
  for (const node of content) {
    if (!node || typeof node !== "object") continue;
    const x = node as Node;
    if (typeof x.text === "string" && x.text.includes(find)) {
      n += x.text.split(find).length - 1;
      x.text = x.text.split(find).join(to);
    }
    if (typeof x.href === "string" && x.href.includes(find)) {
      n += 1;
      x.href = x.href.split(find).join(to);
    }
    n += replaceInInline(x.content, find, to);
  }
  return n;
}

/** Replaces text inside a prop value: plain, or every string inside a JSON one. */
function replaceInValue(v: unknown, find: string, to: string): { value: unknown; n: number } {
  if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("[") || t.startsWith("{")) {
      try {
        const parsed = JSON.parse(t);
        const r = replaceInValue(parsed, find, to);
        return r.n ? { value: JSON.stringify(r.value), n: r.n } : { value: v, n: 0 };
      } catch {
        /* not JSON: a plain string */
      }
    }
    if (!v.includes(find)) return { value: v, n: 0 };
    return { value: v.split(find).join(to), n: v.split(find).length - 1 };
  }
  if (Array.isArray(v)) {
    let n = 0;
    const value = v.map((x) => {
      const r = replaceInValue(x, find, to);
      n += r.n;
      return r.value;
    });
    return { value, n };
  }
  if (v && typeof v === "object") {
    let n = 0;
    const value: Node = {};
    for (const [k, x] of Object.entries(v as Node)) {
      if (k === "id" || k === "type") {
        value[k] = x;
        continue;
      }
      const r = replaceInValue(x, find, to);
      n += r.n;
      value[k] = r.value;
    }
    return { value, n };
  }
  return { value: v, n: 0 };
}

function asBlockList(v: unknown): Node[] {
  if (Array.isArray(v)) return v as Node[];
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      if (Array.isArray(p)) return p as Node[];
    } catch {
      /* fall through */
    }
  }
  throw new ToolError("This document's content is not a block list.");
}

/** A saved document as returned by GET /api/{kind}s/{id}. */
async function readDoc(ctx: McpContext, kind: "page" | "post", id: number): Promise<Node> {
  const data = (await siteApi(ctx, "GET", `/api/${kind}s/${id}`)) as Node;
  const doc = (data[kind] ?? data) as Node;
  if (!doc || typeof doc !== "object") throw new ToolError("Document not found");
  return doc;
}

/** The short answer for a save: what a caller needs to carry on, not the whole page back. */
function saved(data: unknown, kind: "page" | "post", changed: string[]): Node {
  const doc = (((data as Node) ?? {})[kind] ?? data) as Node;
  return { id: doc.id, slug: doc.slug, status: doc.status, updatedAt: doc.updatedAt, changed };
}

// ── Rendered page → something readable ────────────────────────────────────

function htmlSummary(html: string, max = 6000): string {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const heads = [...html.matchAll(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => `h${m[1]}: ${m[2].replace(/<[^>]+>/g, "").trim()}`);
  const imgs = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((m) => m[1]);
  const main = (html.match(/<main[\s\S]*?<\/main>/i) || [html])[0];
  const text = main
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return `TITLE: ${title}\nHEADINGS:\n${heads.slice(0, 60).join("\n")}\nIMAGES (${imgs.length}): ${imgs.slice(0, 30).join(", ")}\nTEXT:\n${text.slice(0, max)}${text.length > max ? " …" : ""}`;
}

// ── Tools ──────────────────────────────────────────────────────────────────

const S = { type: "string" };
const KIND = { type: "string", enum: ["page", "post"], description: "page or post" };
const ID = { type: "integer", description: "Document id" };
const FIELDS = {
  type: "object",
  description:
    "Document fields: title, slug, content (block array), status (draft|published|scheduled), excerpt (posts), categoryId (posts), featuredImage, template, language, seoTitle, seoDescription, seoKeywords, ogTitle, ogDescription, ogImage, canonicalUrl, noIndex, noFollow, customCss, publishedAt. Send only what changes.",
  additionalProperties: true,
};

const MIME_BY_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", json: "application/json" };

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

function scopesOf(session: Session): string[] {
  return ((session.user as { scopes?: string[] }).scopes ?? []).slice();
}

const TOOLS: Tool[] = [
  {
    name: "site_info",
    description: "This site: name, address, CMS version, and what this token may do (role, extra access).",
    inputSchema: { type: "object", properties: {} },
    run: async (_a, ctx) => ({
      site: ctx.siteName,
      url: ctx.base,
      version: CURRENT_VERSION,
      role: (ctx.session.user as { role?: string }).role,
      extraAccess: scopesOf(ctx.session),
    }),
  },
  {
    name: "get_blocks",
    description:
      "The blocks this site's editor has. Without types: every block with label, hint, category and prop names, plus the document format rules. With types: those blocks in full — props, defaults, allowed values and format notes. Read the full entry before using a block for the first time.",
    inputSchema: { type: "object", properties: { types: { type: "array", items: S, description: "Block types to describe in full" } } },
    run: async (a, ctx) => {
      const types = Array.isArray(a.types) ? a.types.map(String) : [];
      return siteApi(ctx, "GET", `/api/mcp/blocks${types.length ? `?type=${encodeURIComponent(types.join(","))}` : ""}`);
    },
  },
  {
    name: "list_documents",
    description:
      "Pages or posts: id, title, slug, status — drafts included — newest first, paged: page (from 1) and limit (max 100, default 50). The answer says total and hasMore; keep asking for the next page while hasMore is true.",
    inputSchema: { type: "object", properties: { kind: KIND, search: S, status: S, trash: { type: "boolean" }, page: { type: "integer" }, limit: { type: "integer" } }, required: ["kind"] },
    run: async (a, ctx) => {
      const kind = kindOf(a);
      const page = Math.max(1, Math.floor(Number(a.page) || 1));
      const limit = Math.min(100, Math.max(1, Math.floor(Number(a.limit) || 50)));
      const p = new URLSearchParams();
      if (a.search) p.set("search", String(a.search));
      if (a.status) p.set("status", String(a.status));
      if (a.trash) p.set("trash", "1");
      // Posts are paged by the site; the pages list comes whole and is paged here.
      // It used to stop silently at 20 posts, which hid published ones.
      if (kind === "post") {
        p.set("page", String(page));
        p.set("limit", String(limit));
      }
      const data = (await siteApi(ctx, "GET", `/api/${kind}s?${p}`)) as Node;
      const all = (Array.isArray(data[`${kind}s`]) ? data[`${kind}s`] : []) as Node[];
      if (kind === "post") {
        const total = Number(data.total ?? all.length);
        return { items: all, page, limit, total, hasMore: data.hasMore === true };
      }
      const items = all.slice((page - 1) * limit, page * limit);
      return { items, page, limit, total: all.length, hasMore: page * limit < all.length };
    },
  },
  {
    name: "list_terms",
    description: "Categories or tags: id, name, slug, parent, language, noIndex, SEO title and description. For one term in full: api_request GET /api/categories/{id} (or /api/tags/{id}); change one with PATCH and only the fields that change.",
    inputSchema: { type: "object", properties: { taxonomy: { type: "string", enum: ["categories", "tags"] }, language: S }, required: ["taxonomy"] },
    run: async (a, ctx) => {
      const tax = a.taxonomy === "tags" ? "tags" : "categories";
      const data = (await siteApi(ctx, "GET", `/api/${tax}${a.language ? `?language=${encodeURIComponent(String(a.language))}` : ""}`)) as Node;
      const rows = (Array.isArray(data[tax]) ? data[tax] : []) as Node[];
      const keep = ["id", "name", "slug", "parentId", "language", "noIndex", "seoTitle", "seoDescription"];
      return { [tax]: rows.map((r) => Object.fromEntries(keep.filter((k) => k in r).map((k) => [k, r[k]]))) };
    },
  },
  {
    name: "get_document",
    description:
      "One page or post in full, including its block content and SEO fields. fields: [\"title\", \"seoTitle\", …] returns only those (content is the big one — leave it out unless needed; get_outline lists the blocks).",
    inputSchema: { type: "object", properties: { kind: KIND, id: ID, fields: { type: "array", items: S } }, required: ["kind", "id"] },
    run: async (a, ctx) => {
      const kind = kindOf(a);
      if (!Array.isArray(a.fields) || !a.fields.length) return siteApi(ctx, "GET", `/api/${kind}s/${idOf(a)}`);
      const doc = await readDoc(ctx, kind, idOf(a));
      const want = new Set(["id", ...a.fields.map(String)]);
      return { [kind]: Object.fromEntries(Object.entries(doc).filter(([k]) => want.has(k))) };
    },
  },
  {
    name: "create_document",
    description: "Creates a page or post as a DRAFT. Any other status is refused: publishing is done by the owner in the admin.",
    inputSchema: { type: "object", properties: { kind: KIND, fields: FIELDS, full: { type: "boolean", description: "Return the whole saved document instead of a summary" } }, required: ["kind", "fields"] },
    run: async (a, ctx) => {
      const fields = prepareFields(a.fields);
      if (!fields.title) throw new ToolError("fields.title is required");
      if (!fields.status) fields.status = "draft";
      draftOnly(fields);
      const kind = kindOf(a);
      const data = await siteApi(ctx, "POST", `/api/${kind}s`, fields);
      return a.full === true ? data : saved(data, kind, Object.keys(fields));
    },
  },
  {
    name: "update_document",
    description:
      "Changes fields of a page or post — a draft or an already-published page. Edits to a published page go LIVE immediately, so get_document first, change only what was asked, and render_document after. content, when sent, replaces the whole block array — send the full edited array; to change a few blocks use edit_blocks instead. Returns a summary (id, slug, status, updatedAt, changed); full: true returns the document. status and publishedAt cannot be changed here: publishing and unpublishing are the owner's step in the admin.",
    inputSchema: { type: "object", properties: { kind: KIND, id: ID, fields: FIELDS, full: { type: "boolean", description: "Return the whole saved document instead of a summary" } }, required: ["kind", "id", "fields"] },
    run: async (a, ctx) => {
      const fields = prepareFields(a.fields);
      draftOnly(fields);
      // "draft" here would take a live page offline; the route refuses it too.
      if (fields.status !== undefined) {
        throw new ToolError("update_document cannot change a page's status (that would publish or unpublish it). Leave status out; the owner changes it in the admin.");
      }
      // The whole document came back (64 KB for a homepage, too big for a tool
      // answer): a summary unless asked.
      const kind = kindOf(a);
      const data = await siteApi(ctx, "PATCH", `/api/${kind}s/${idOf(a)}`, fields);
      return a.full === true ? data : saved(data, kind, Object.keys(fields));
    },
  },
  {
    name: "get_outline",
    description:
      "A page or post's blocks as a short list — id, type, depth (0 = top level; blocks inside a Row Layout's columns or a block's children are deeper), first words, links, and short props — plus title, slug, status and updatedAt. Use it to find the block to change with edit_blocks instead of reading the whole document.",
    inputSchema: { type: "object", properties: { kind: KIND, id: ID }, required: ["kind", "id"] },
    run: async (a, ctx) => {
      const kind = kindOf(a);
      const doc = await readDoc(ctx, kind, idOf(a));
      const blocks = outline(asBlockList(doc.content));
      return { id: doc.id, title: doc.title, slug: doc.slug, status: doc.status, updatedAt: doc.updatedAt, blockCount: blocks.length, blocks };
    },
  },
  {
    name: "edit_blocks",
    description:
      "Changes single blocks of a page or post without sending the whole document — blocks inside Row Layout columns included. edits: [{ blockId, props?: { key: value } (merged into the block's props), content?: \"plain text\" or an inline array (replaces the block's text; links are { type: \"link\", href, content: [...] }), remove?: true, insertBefore?: [blocks], insertAfter?: [blocks] }]. replaceText: [{ find, replace, blockId? }] replaces text and link addresses everywhere (or in one block), inside JSON props too. The page is read and saved on the server with a version check; edits to a published page go live. Returns { id, updatedAt, blocksChanged, replacements, notFound }. get_outline first to find block ids.",
    inputSchema: {
      type: "object",
      properties: {
        kind: KIND,
        id: ID,
        edits: { type: "array", items: { type: "object", additionalProperties: true } },
        replaceText: { type: "array", items: { type: "object", properties: { find: S, replace: S, blockId: S }, required: ["find", "replace"] } },
      },
      required: ["kind", "id"],
    },
    run: async (a, ctx) => {
      const kind = kindOf(a);
      const id = idOf(a);
      const edits = Array.isArray(a.edits) ? (a.edits as Node[]) : [];
      const reps = Array.isArray(a.replaceText) ? (a.replaceText as Node[]) : [];
      if (!edits.length && !reps.length) throw new ToolError("Give edits or replaceText.");
      for (const r of reps) if (!r.find || typeof r.find !== "string") throw new ToolError("Every replaceText entry needs a non-empty find.");
      const byId = new Map<string, Node>();
      for (const e of edits) {
        if (!e.blockId) throw new ToolError("Every edit needs a blockId (see get_outline).");
        byId.set(String(e.blockId), e);
      }

      for (let attempt = 0; attempt < 2; attempt++) {
        const doc = await readDoc(ctx, kind, id);
        const content = asBlockList(doc.content);
        const touched = new Set<string>();
        let replacements = 0;

        const seen = new WeakSet<Node>(); // a block moved by an insert is visited again
        walkBlocks(content, (b, list, i) => {
          if (seen.has(b)) return;
          seen.add(b);
          const bid = String(b.id ?? "");
          const e = byId.get(bid);
          if (e) {
            touched.add(bid);
            if (e.remove === true) {
              list.splice(i, 1);
              return;
            }
            if (e.props && typeof e.props === "object") b.props = { ...((b.props as Node) || {}), ...(e.props as Node) };
            if (e.content !== undefined) b.content = e.content;
            const norm = normalizeBlock(b);
            Object.assign(b, norm);
            const before = e.insertBefore ? normalizeBlocks(Array.isArray(e.insertBefore) ? e.insertBefore : [e.insertBefore]) : [];
            const after = e.insertAfter ? normalizeBlocks(Array.isArray(e.insertAfter) ? e.insertAfter : [e.insertAfter]) : [];
            if (before.length || after.length) {
              list.splice(i, 1, ...before, b, ...after);
              byId.delete(bid); // inserted copies must not be edited again on the re-visit
            }
          }
          for (const r of reps) {
            if (r.blockId && String(r.blockId) !== bid) continue;
            let n = replaceInInline(b.content, String(r.find), String(r.replace ?? ""));
            const props = (b.props as Node) || {};
            for (const [k, v] of Object.entries(props)) {
              if (nestedLists(v)) continue; // nested blocks are visited on their own
              const res = replaceInValue(v, String(r.find), String(r.replace ?? ""));
              if (res.n) {
                props[k] = res.value;
                n += res.n;
              }
            }
            if (n) {
              replacements += n;
              touched.add(bid);
            }
          }
        });
        // Edits already applied before an insert removed them from byId still count.
        const notFound = edits.map((e) => String(e.blockId)).filter((bid) => !touched.has(bid));
        if (!touched.size) return { id, changed: false, blocksChanged: 0, replacements: 0, notFound };

        const res = await siteFetch(ctx, "PATCH", `/api/${kind}s/${id}`, { content, expectedUpdatedAt: doc.updatedAt });
        if (res.status === 409 && attempt === 0) {
          for (const e of edits) byId.set(String(e.blockId), e);
          continue; // someone saved in between: read the new version and apply again
        }
        const text = await res.text();
        let data: Node = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { error: text.slice(0, 500) };
        }
        if (!res.ok) throw new ToolError(`PATCH /api/${kind}s/${id} → ${res.status}: ${data.error ?? text.slice(0, 300)}`);
        return { ...saved(data, kind, ["content"]), blocksChanged: touched.size, replacements, notFound };
      }
      throw new ToolError("The document kept changing while it was being edited. Try again.");
    },
  },
  {
    name: "publish_document",
    scope: "publish",
    description:
      "Publishes a page or post, takes it offline (status draft), or schedules it (status published with a future publishedAt). Only on a token the owner gave Publishing access. A published page is live for visitors and search engines at once: render_document first, and never publish a page that links to drafts.",
    inputSchema: {
      type: "object",
      properties: {
        kind: KIND,
        id: ID,
        status: { type: "string", enum: ["published", "draft"] },
        publishedAt: { type: "string", description: "ISO date-time. In the future: scheduled. Leave out to publish now." },
      },
      required: ["kind", "id", "status"],
    },
    run: async (a, ctx) => {
      const status = String(a.status);
      if (status !== "published" && status !== "draft") throw new ToolError('status must be "published" or "draft"');
      const fields: Node = { status };
      if (a.publishedAt !== undefined) {
        if (Number.isNaN(Date.parse(String(a.publishedAt)))) throw new ToolError("publishedAt must be an ISO date-time");
        fields.publishedAt = String(a.publishedAt);
      }
      return siteApi(ctx, "PATCH", `/api/${kindOf(a)}s/${idOf(a)}`, fields);
    },
  },
  {
    name: "render_document",
    description:
      "Renders a page or post (draft or published) exactly as the site would, and returns its title, headings, images and visible text — to check a page after building it.",
    inputSchema: { type: "object", properties: { kind: KIND, id: ID, maxChars: { type: "integer" } }, required: ["kind", "id"] },
    run: async (a, ctx) => {
      const res = await siteFetch(ctx, "GET", `/preview/${kindOf(a)}/${idOf(a)}`);
      const html = await res.text();
      if (!res.ok) throw new ToolError(`preview → ${res.status}`);
      return htmlSummary(html, Number(a.maxChars) || 6000);
    },
  },
  {
    name: "upload_media",
    description:
      "Uploads an image (JPEG, PNG, GIF, WebP, AVIF, SVG) or a Lottie .json to the media library, max 10 MB, and returns its URL (media.url). Raster images are converted to WebP and resized by the site. Video files are NOT accepted — use a videoEmbed block with a YouTube/Vimeo URL. Give source_url (a public address; the site downloads it) or data_base64 + filename (+ mime). For a file on your own disk, create_upload_url is far smaller than base64. SVG is the way to add infographics and diagrams.",
    inputSchema: { type: "object", properties: { source_url: S, data_base64: S, filename: S, mime: S } },
    run: async (a, ctx) => {
      let bytes: Buffer;
      let filename = a.filename ? String(a.filename) : "";
      let type = "";
      if (a.source_url) {
        const got = await downloadPublic(String(a.source_url), MAX_MEDIA_BYTES);
        bytes = got.bytes;
        type = got.type;
        filename = filename || got.name;
      } else if (a.data_base64) {
        bytes = fromBase64(a.data_base64);
      } else throw new ToolError("Give source_url or data_base64");
      if (!filename) throw new ToolError("filename is required with data_base64");
      if (bytes.length > MAX_MEDIA_BYTES) throw new ToolError("The file is larger than 10 MB.");
      // The site checks the declared type against the extension, so guess it
      // from the name when the caller did not say.
      const mime = (a.mime ? String(a.mime) : "") || MIME_BY_EXT[(filename.split(".").pop() || "").toLowerCase()] || type || "application/octet-stream";
      const form = new FormData();
      form.append("file", new File([new Uint8Array(bytes)], filename, { type: mime }));
      return siteApi(ctx, "POST", "/api/media", form);
    },
  },
  {
    name: "create_upload_url",
    description: `An address to upload ONE local file to the media library without base64: ${"`"}curl --upload-file <file> "<url>"${"`"} (or curl -F file=@<file> "<url>"). Valid for ${UPLOAD_URL_MINUTES} minutes; the answer of that request is the same as upload_media's (media.url). Give the file name it should have, with its extension (cover.jpg); the type is taken from the extension unless mime is given. Same formats and 10 MB limit as upload_media.`,
    inputSchema: { type: "object", properties: { filename: S, mime: S }, required: ["filename"] },
    run: async (a, ctx) => {
      const tokenId = Number((ctx.session.user as { tokenId?: number }).tokenId);
      if (!Number.isInteger(tokenId) || tokenId < 1) throw new ToolError("Only an API token can make an upload address.");
      const filename = String(a.filename ?? "").trim().replace(/[\\/]/g, "_").slice(0, 200);
      const ext = (filename.split(".").pop() || "").toLowerCase();
      const mime = (a.mime ? String(a.mime) : "") || MIME_BY_EXT[ext];
      if (!filename || !mime) throw new ToolError("filename needs an image extension (jpg, png, gif, webp, avif, svg) or a .json Lottie file — or give mime.");
      const url = `${ctx.base}/api/media/direct?t=${makeUploadClaim(tokenId, filename, mime)}`;
      return { url, method: "PUT", expiresInMinutes: UPLOAD_URL_MINUTES, curl: `curl --upload-file "${filename}" "${url}"` };
    },
  },
  {
    name: "list_media",
    description: "The media library, newest first, paged.",
    inputSchema: { type: "object", properties: { page: { type: "integer" }, limit: { type: "integer" } } },
    run: async (a, ctx) => siteApi(ctx, "GET", `/api/media?page=${Number(a.page) || 1}&limit=${Number(a.limit) || 60}`),
  },
  {
    name: "get_settings",
    description: "All site settings (site name, description, homepage, appearance, header/footer…). Credentials are never included.",
    inputSchema: { type: "object", properties: { prefix: { type: "string", description: "Only keys starting with this" } } },
    run: async (a, ctx) => {
      const data = (await siteApi(ctx, "GET", "/api/settings")) as { settings?: Record<string, unknown> };
      if (!a.prefix) return data;
      const prefix = String(a.prefix);
      return { settings: Object.fromEntries(Object.entries(data.settings || {}).filter(([k]) => k.startsWith(prefix))) };
    },
  },
  {
    name: "update_settings",
    description: 'Sets site settings: { key: "string value" }. Only the keys sent change. Credentials and head/footer scripts are refused.',
    inputSchema: { type: "object", properties: { values: { type: "object", additionalProperties: { type: "string" } } }, required: ["values"] },
    run: async (a, ctx) => siteApi(ctx, "POST", "/api/settings", a.values),
  },
  {
    name: "list_menus",
    description: "Navigation menus with their items.",
    inputSchema: { type: "object", properties: {} },
    run: async (_a, ctx) => siteApi(ctx, "GET", "/api/menus"),
  },
  {
    name: "save_menu",
    description:
      "Creates a menu (no id) or replaces a menu's items (id). items: [{ label, url, target?, objectType? (custom|page|post|category), objectId?, children?: [...] }]. Assign a menu to a location with update_settings.",
    inputSchema: { type: "object", properties: { id: ID, name: S, items: { type: "array", items: { type: "object", additionalProperties: true } } } },
    run: async (a, ctx) => {
      let id = a.id ? Number(a.id) : 0;
      if (!id) {
        if (!a.name) throw new ToolError("name is required to create a menu");
        const made = (await siteApi(ctx, "POST", "/api/menus", { name: a.name })) as { id?: number; menu?: { id?: number } };
        id = Number(made.menu?.id ?? made.id);
        if (!a.items) return made;
      }
      return siteApi(ctx, "PUT", `/api/menus/${id}`, { ...(a.name ? { name: a.name } : {}), ...(a.items ? { items: a.items } : {}) });
    },
  },
  {
    name: "get_my_profile",
    description: "The public profile of the account this token belongs to: name, slug (the author page address), bio, photo, links, and publicProfile (whether the author page exists).",
    inputSchema: { type: "object", properties: {} },
    run: async (_a, ctx) => ({ profile: await readOwnProfile(String(ctx.session.user?.id ?? "")) }),
  },
  {
    name: "update_my_profile",
    description:
      "Changes the public profile of the account this token belongs to — never another account, and never email, password or role. Fields (send only what changes): name, slug, bio, image (an uploaded image URL), website, twitter, linkedin, facebook, instagram, github, youtube, publicProfile (true gives the author an author page, linked from every byline). A changed slug keeps the old author address answering.",
    inputSchema: {
      type: "object",
      properties: { ...Object.fromEntries(PROFILE_TEXT.map((k) => [k, S])), slug: S, publicProfile: { type: "boolean" } },
    },
    run: async (a, ctx) => {
      const r = await updateOwnProfile(String(ctx.session.user?.id ?? ""), a);
      if (!r.ok) throw new ToolError(r.error);
      return { profile: r.profile };
    },
  },
  {
    name: "api_request",
    description:
      "Any other call to the site's /api (categories, tags, elements, redirects, cache purge…). Tokens are refused access to users (your own public profile: update_my_profile), tokens, backups, import/export, plugins, updates, mail settings, comments and form entries.",
    inputSchema: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
        path: { type: "string", description: "Starts with /api/" },
        body: { type: "object", additionalProperties: true },
      },
      required: ["method", "path"],
    },
    run: async (a, ctx) => {
      const path = String(a.path ?? "");
      const method = String(a.method ?? "").toUpperCase();
      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) throw new ToolError("method must be GET, POST, PUT, PATCH or DELETE");
      if (!/^\/api\/[A-Za-z0-9/_\-.?=&%,]*$/.test(path) || path.includes("..")) throw new ToolError("path must start with /api/");
      if (/^\/api\/mcp(\/|\?|$)/.test(path)) throw new ToolError("Use the tools directly.");
      // Documents go through create/update_document, where drafts-only holds.
      if (method !== "GET" && /^\/api\/(pages|posts|revisions|cron)(\/|\?|$)/.test(path)) {
        throw new ToolError("Use create_document / update_document for pages and posts; this path is read-only here.");
      }
      return siteApi(ctx, method, path, a.body);
    },
  },

  // ── "backups" scope ──
  {
    name: "list_backups",
    scope: "backups",
    description: "The backups stored on this server (newest first): file name, size, date. The server keeps the newest seven.",
    inputSchema: { type: "object", properties: {} },
    run: async () => ({ backups: await listBackups() }),
  },
  {
    name: "make_backup",
    scope: "backups",
    description:
      "Writes a new backup on the server: all content plus every uploaded file. Refused when the last one is less than 20 hours old (that one is returned instead) — the server keeps only seven, so backups made in a burst would push out the real ones.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const r = await runBackup();
      if (!r.ok) throw new ToolError(r.error + (r.file ? ` Latest: ${r.file}.` : ""));
      return r;
    },
  },
  {
    name: "restore_backup",
    scope: "backups",
    description:
      "Restores one of this server's backups (list_backups). Without confirm: true it only REPORTS what would change. With overwrite: true, pages and posts that exist now are put back to the backup's version (each current version is kept in History first); without it only missing things come back. Uploaded files that are missing are put back. Site settings are never restored here — the owner does that from Settings → Import. Nothing is deleted.",
    inputSchema: {
      type: "object",
      properties: { file: { type: "string", description: "Backup file name from list_backups" }, overwrite: { type: "boolean" }, confirm: { type: "boolean" } },
      required: ["file"],
    },
    run: async (a) => {
      const full = backupPath(String(a.file ?? ""));
      if (!full) throw new ToolError("Unknown backup. Use a file name from list_backups.");
      const bytes = await readFile(full).catch(() => null);
      if (!bytes) throw new ToolError("That backup is not on the server any more. See list_backups.");
      const zip = await JSZip.loadAsync(bytes).catch(() => null);
      const manifest = zip && (zip.file("content.json") ?? zip.file("site.json"));
      if (!zip || !manifest) throw new ToolError("That backup is not readable.");
      const dryRun = a.confirm !== true;
      try {
        const report = await importSite(JSON.parse(await manifest.async("string")), { settings: false, dryRun, overwrite: a.overwrite === true });
        if (!dryRun) {
          const { written } = await restoreMedia(zip);
          if (written) report.notes.push(`${written} uploaded file(s) restored.`);
          revalidatePublicSite();
        } else {
          report.notes.push("Nothing was changed. Call again with confirm: true to restore.");
        }
        return report;
      } catch (e) {
        if (e instanceof ImportError) throw new ToolError(e.message);
        throw e;
      }
    },
  },

  // ── "plugins" scope ──
  {
    name: "list_plugins",
    scope: "plugins",
    description: "Installed plugins: slug, name, version, enabled, settings and the shortcodes they provide.",
    inputSchema: { type: "object", properties: {} },
    run: async () => ({ plugins: await listPlugins() }),
  },
  {
    name: "install_plugin",
    scope: "plugins",
    description:
      "Installs a plugin from a .zip (max 5 MB): source_url (a public address) or data_base64. A plugin is code that runs on every visitor's page — install only what the owner asked for. Installing the same slug again updates it.",
    inputSchema: { type: "object", properties: { source_url: S, data_base64: S } },
    run: async (a) => {
      let bytes: Buffer;
      if (a.source_url) bytes = (await downloadPublic(String(a.source_url), MAX_ZIP_BYTES)).bytes;
      else if (a.data_base64) bytes = fromBase64(a.data_base64);
      else throw new ToolError("Give source_url or data_base64");
      if (bytes.length > MAX_ZIP_BYTES) throw new ToolError(`The zip is larger than ${MAX_ZIP_BYTES / 1048576} MB.`);
      try {
        return { ok: true, manifest: await installPluginZip(bytes) };
      } catch (e) {
        throw new ToolError(e instanceof Error ? e.message : "Could not install the plugin.");
      }
    },
  },
  {
    name: "update_plugin",
    scope: "plugins",
    description: "Switches a plugin on or off (enabled) and/or saves its settings ({ key: value }, only keys the plugin declares).",
    inputSchema: { type: "object", properties: { slug: S, enabled: { type: "boolean" }, settings: { type: "object", additionalProperties: true } }, required: ["slug"] },
    run: async (a) => {
      if (!(await updatePlugin(String(a.slug ?? ""), { enabled: a.enabled, settings: a.settings }))) throw new ToolError(`No plugin "${a.slug}". See list_plugins.`);
      return { ok: true };
    },
  },
  {
    name: "uninstall_plugin",
    scope: "plugins",
    description: "Removes a plugin and its files. Pages keep its shortcodes as plain text.",
    inputSchema: { type: "object", properties: { slug: S }, required: ["slug"] },
    run: async (a) => {
      const slug = String(a.slug ?? "");
      if (!(await listPlugins()).some((p) => p.slug === slug)) throw new ToolError(`No plugin "${slug}". See list_plugins.`);
      await uninstallPlugin(slug);
      return { ok: true };
    },
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

function allowed(tool: Tool, session: Session): boolean {
  return !tool.scope || tokenHasScope(session, tool.scope);
}

// ── JSON-RPC ───────────────────────────────────────────────────────────────

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

export async function handleRpc(msg: Rpc, ctx: McpContext): Promise<object | null> {
  const { id, method, params } = msg || {};
  const isNotification = id === undefined || id === null;
  const reply = (result: unknown) => (isNotification ? null : { jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => (isNotification ? null : { jsonrpc: "2.0", id, error: { code, message } });

  switch (method) {
    case "initialize": {
      const asked = String(params?.protocolVersion ?? "");
      return reply({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return reply({});
    case "tools/list": {
      return reply({
        tools: TOOLS.filter((t) => allowed(t, ctx.session)).map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });
    }
    case "tools/call": {
      const tool = TOOL_BY_NAME.get(String(params?.name ?? ""));
      if (!tool || !allowed(tool, ctx.session)) return fail(-32602, `Unknown tool: ${params?.name}`);
      try {
        const out = await tool.run((params?.arguments as Args) || {}, ctx);
        const text = typeof out === "string" ? out : JSON.stringify(out, null, 1);
        return reply({ content: [{ type: "text", text }] });
      } catch (err) {
        const message = err instanceof ToolError ? err.message : `Error: ${err instanceof Error ? err.message : err}`;
        if (!(err instanceof ToolError)) console.error("[mcp]", tool.name, err);
        return reply({ content: [{ type: "text", text: message }], isError: true });
      }
    }
    default:
      if (typeof method === "string" && method.startsWith("notifications/")) return null;
      return fail(-32601, `Method not found: ${method}`);
  }
}
