// Reading an export back in.
//
// The export is only half a safety net: it stops content being *lost*, but
// without this it cannot be restored, moved to another host, or cloned to set a
// student up with a working site. This is the other half.
//
// Two rules shape everything below.
//
// **It never deletes.** Import adds; it does not replace. A "wipe and restore"
// mode is one misclick from destroying a live site, and the same outcome is
// reachable deliberately by importing into a fresh database. Anything that
// already exists is skipped and reported, not overwritten.
//
// **Every id is remapped.** Serial ids are assigned by the destination
// database, so a post that was id 7 in the file is whatever id it gets here —
// and every reference to it (its category, its comments, its translation group)
// has to follow. That is what most of this file is doing.

import { db } from "@/lib/db";
import { insertReturning } from "@/lib/db/write";
import { invalidateSiteSettings } from "@/lib/settings";
import {
  categories, comments, elements, formSubmissions, media, menus, navItems,
  pages, postTags, posts, redirects, siteSettings, tags, users,
} from "@/lib/db/schema";
import { EXPORT_VERSION } from "@/lib/exportSite";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

type Row = Record<string, unknown>;

export interface ImportOptions {
  /**
   * Whether to overwrite site settings.
   *
   * Off by default: settings are the destination site's own configuration —
   * its domain, its languages, its appearance — and silently replacing them
   * while restoring a few posts is not what anybody meant.
   */
  settings?: boolean;
  /** Report what would happen without writing anything. */
  dryRun?: boolean;
  /**
   * Restore mode: a post or page that exists here as well as in the file is
   * put back to the file's version, not skipped.
   *
   * Import was built to add what is missing, so a backup restored onto the
   * same site brought back only documents deleted outright — nothing for a
   * defaced site, a bad bulk edit or an emptied post, which is what a backup
   * is for. Each overwritten document keeps its current version in History.
   */
  overwrite?: boolean;
}

export interface ImportReport {
  ok: boolean;
  dryRun: boolean;
  created: Record<string, number>;
  skipped: Record<string, number>;
  /** Existing documents put back to the file's version (restore mode). */
  restored: Record<string, number>;
  notes: string[];
}

/** A rejection a person can act on, rather than a stack trace. */
export class ImportError extends Error {}

const str = (v: unknown) => (v == null ? null : String(v));

/**
 * The fields a restore compares, to tell a document that differs from the
 * backup from one that is already as it was. Dates compare as instants.
 */
const RESTORE_COMPARE = [
  "title", "content", "excerpt", "status", "publishedAt", "deletedAt", "featuredImage",
  "seoTitle", "seoDescription", "canonicalUrl", "noIndex", "noFollow", "ogImage",
] as const;
function sameAsFile(current: Row, file: Row): boolean {
  const norm = (v: unknown) => {
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
      const t = Date.parse(v);
      return Number.isNaN(t) ? v : new Date(t).toISOString();
    }
    return JSON.stringify(v ?? null);
  };
  return RESTORE_COMPARE.every((k) => norm(current[k]) === norm(file[k]));
}
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/** Timestamps arrive as ISO strings; the driver wants Dates. */
const date = (v: unknown) => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Everything except the id and the columns this importer sets itself.
 *
 * Copying the row wholesale and deleting the id keeps the import working when
 * a table gains a column, instead of silently dropping the new field until
 * somebody remembers to list it here.
 */
function withoutKeys(row: Row, keys: string[]): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (keys.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Dates come back from JSON as strings; the columns that need Dates. */
// Every date column a row can carry. A key missing here stays a string, and
// the driver then fails the whole import on `toISOString` — a single trashed
// post (deletedAt) did that to a full-site restore (2026-10-22).
const DATE_KEYS = [
  "createdAt", "updatedAt", "publishedAt", "deletedAt", "lastLogin", "emailVerified", "lastHit",
  "lastUsedAt", "expiresAt", "installedAt", "totpResetSince",
];
function reviveDates(row: Row): Row {
  const out = { ...row };
  for (const k of DATE_KEYS) if (k in out) out[k] = date(out[k]);
  return out;
}

/** Settings whose value is a page id: `homepage_id`, `posts_page_id`, and their `_<lang>` forms. */
const PAGE_ID_SETTING = /^(?:homepage_id|posts_page_id)(?:_[a-z]{2,3}(?:-[a-z0-9]+)?)?$/i;

/**
 * Settings that belong to the install, not to the site's content — never
 * carried from a file. See the settings section of importSite.
 */
const SITE_SPECIFIC_SETTING = /^(?:mail_\w+|site_url|indexnow_key|cf_zone_id|embeds_resanitized_v\d+|maintenance_last_cleanup|crawler_last_\w+)$/;

export async function importSite(
  file: unknown,
  options: ImportOptions = {}
): Promise<ImportReport> {
  const dryRun = !!options.dryRun;
  const created: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const restored: Record<string, number> = {};
  /** New ids of posts put back to the file's version: their tags are replaced, not merged. */
  const restoredPosts = new Set<number>();
  const { snapshotRevision, revisionMetaOf } = await import("@/lib/revisions");

  /**
   * Restore mode, for one document that exists here and in the file: put the
   * file's version back, keeping the current one in History. Returns whether
   * anything differed.
   */
  const restoreOver = async (
    kind: "post" | "page",
    id: number,
    fileRow: Row,
    extra: Row
  ): Promise<boolean> => {
    const tbl = kind === "post" ? posts : pages;
    const [current] = await db.select().from(tbl).where(eq(tbl.id, id)).limit(1);
    if (!current) return false;
    const next = {
      ...(reviveDates(withoutKeys(fileRow, ["id", "categoryId", "authorId", "translationGroup", "createdAt", "slug", "language"])) as Row),
      ...extra,
    };
    if (sameAsFile(current as Row, { ...(current as Row), ...next })) return false;
    if (dryRun) return true;
    const cur = current as Row & { title: string | null; content: unknown; excerpt?: string | null };
    await snapshotRevision(
      kind,
      id,
      { title: cur.title, content: cur.content, excerpt: cur.excerpt ?? null, meta: revisionMetaOf(cur as never) },
      { title: str(next.title), content: next.content, excerpt: str(next.excerpt), meta: revisionMetaOf(next as never) },
      null
    );
    await db.update(tbl).set({ ...next, updatedAt: new Date() } as never).where(eq(tbl.id, id));
    return true;
  };
  const notes: string[] = [];
  const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };

  if (!file || typeof file !== "object") throw new ImportError("That file is not a site export.");
  const doc = file as Record<string, unknown>;

  const version = num(doc.version);
  if (version === null) throw new ImportError("That file is not a site export — it has no version.");
  if (version > EXPORT_VERSION) {
    throw new ImportError(
      `This export was made by a newer version (${version}); this site understands up to ${EXPORT_VERSION}.`
    );
  }

  const data = (doc.data ?? {}) as Record<string, Row[]>;
  const table = (name: string): Row[] => (Array.isArray(data[name]) ? data[name] : []);

  // ── Id maps, filled as each table is inserted ───────────────────────────
  const userIds = new Map<string, string>();
  const categoryIds = new Map<number, number>();
  const tagIds = new Map<number, number>();
  const postIds = new Map<number, number>();
  const pageIds = new Map<number, number>();
  const menuIds = new Map<number, number>();
  // Documents this run created (file ids). Comments attach only to these: a
  // document that already existed already has its comments, and adding the
  // file's again is what made a second import double every thread.
  const freshPosts = new Set<number>();
  const freshPages = new Set<number>();

  // ── Users ────────────────────────────────────────────────────────────────
  //
  // Matched on email, which is the only stable identity across two databases —
  // the uuid primary key is not. An existing account keeps its own id and its
  // own password; the import never touches credentials.
  for (const u of table("users")) {
    // Lowercased before it is matched or stored. Sign-in looks accounts up by
    // the lowercased address, so importing "Rehan@x.com" next to an existing
    // "rehan@x.com" created a SECOND account that the login could then pick
    // instead of the real one — and the imported one has no password, so the
    // owner was locked out of their own site by a restore.
    const email = str(u.email)?.trim().toLowerCase();
    if (!email) { bump(skipped, "users"); continue; }
    const existing = await db.query.users.findFirst({
      where: eq(users.email, email), columns: { id: true },
    });
    if (existing) {
      userIds.set(String(u.id), existing.id);
      bump(skipped, "users");
      continue;
    }
    const id = randomUUID();
    // An author slug is unique across the site (`users_slug_key`). A colliding
    // one used to reach the insert and throw, which aborted the whole import
    // partway through and left the site half-restored. The account matters
    // more than its vanity URL, so the slug is dropped instead — the owner can
    // set a new one on the author page afterwards.
    const wantedSlug = str(u.slug);
    let slug: string | null = wantedSlug ?? null;
    if (slug) {
      const taken = await db.query.users.findFirst({
        where: eq(users.slug, slug),
        columns: { id: true },
      });
      if (taken) slug = null;
    }
    if (!dryRun) {
      // `password` is absent from every export, so an imported account cannot
      // sign in until someone sets one. That is the correct default: a backup
      // must not be a way to create a working login.
      await db.insert(users).values({
        ...(reviveDates(withoutKeys(u, ["id", "password", "totpSecret", "totpResetFailures", "totpResetSince", "slug"])) as Row),
        id,
        email,
        slug,
      } as never);
    }
    userIds.set(String(u.id), id);
    bump(created, "users");
  }
  const mapUser = (v: unknown) => (v == null ? null : userIds.get(String(v)) ?? null);

  // ── Categories ───────────────────────────────────────────────────────────
  //
  // Parents are resolved in a second pass: a child can appear before its parent
  // in the file, and a self-referencing column cannot be satisfied in one.
  for (const c of table("categories")) {
    const slug = str(c.slug), language = str(c.language) ?? "en";
    if (!slug) { bump(skipped, "categories"); continue; }
    const existing = await db.query.categories.findFirst({
      where: and(eq(categories.slug, slug), eq(categories.language, language)),
      columns: { id: true },
    });
    if (existing) {
      categoryIds.set(Number(c.id), existing.id);
      bump(skipped, "categories");
      continue;
    }
    if (dryRun) { bump(created, "categories"); continue; }
    const [row] = await insertReturning(categories, { ...(reviveDates(withoutKeys(c, ["id", "parentId", "translationGroup"])) as Row), slug, language } as never)
      ;
    categoryIds.set(Number(c.id), row.id);
    bump(created, "categories");
  }
  if (!dryRun) {
    for (const c of table("categories")) {
      const mine = categoryIds.get(Number(c.id));
      const parent = c.parentId == null ? null : categoryIds.get(Number(c.parentId)) ?? null;
      const group = c.translationGroup == null ? null : categoryIds.get(Number(c.translationGroup)) ?? null;
      if (mine && (parent !== null || group !== null)) {
        await db.update(categories).set({ parentId: parent, translationGroup: group })
          .where(eq(categories.id, mine));
      }
    }
  }

  // ── Tags ─────────────────────────────────────────────────────────────────
  for (const t of table("tags")) {
    const slug = str(t.slug), language = str(t.language) ?? "en";
    if (!slug) { bump(skipped, "tags"); continue; }
    const existing = await db.query.tags.findFirst({
      where: and(eq(tags.slug, slug), eq(tags.language, language)), columns: { id: true },
    });
    if (existing) { tagIds.set(Number(t.id), existing.id); bump(skipped, "tags"); continue; }
    if (dryRun) { bump(created, "tags"); continue; }
    const [row] = await insertReturning(tags, { ...(reviveDates(withoutKeys(t, ["id", "translationGroup"])) as Row), slug, language } as never)
      ;
    tagIds.set(Number(t.id), row.id);
    bump(created, "tags");
  }

  // ── Media ────────────────────────────────────────────────────────────────
  //
  // The rows are restored; the files themselves are not. An export is JSON, so
  // it carries the record of an upload and not its bytes — a `/uploads/...`
  // URL will 404 until the files are copied across too.
  let mediaRestored = 0;
  for (const m of table("media")) {
    const url = str(m.url);
    if (!url) { bump(skipped, "media"); continue; }
    const existing = await db.query.media.findFirst({ where: eq(media.url, url), columns: { id: true } });
    if (existing) { bump(skipped, "media"); continue; }
    if (!dryRun) {
      await db.insert(media).values({
        ...(reviveDates(withoutKeys(m, ["id", "uploadedById"])) as Row),
        url,
        uploadedById: mapUser(m.uploadedById),
      } as never);
    }
    mediaRestored++;
    bump(created, "media");
  }
  if (mediaRestored > 0) {
    notes.push(
      `${mediaRestored} media record(s) restored. The files themselves are not in the export — copy your uploads directory across, or those URLs will 404.`
    );
  }

  // ── Posts ────────────────────────────────────────────────────────────────
  for (const p of table("posts")) {
    const slug = str(p.slug), language = str(p.language) ?? "en";
    if (!slug) { bump(skipped, "posts"); continue; }
    const existing = await db.query.posts.findFirst({
      where: and(eq(posts.slug, slug), eq(posts.language, language)), columns: { id: true },
    });
    if (existing) {
      postIds.set(Number(p.id), existing.id);
      const cat = p.categoryId == null ? null : categoryIds.get(Number(p.categoryId)) ?? null;
      const author = mapUser(p.authorId);
      if (options.overwrite && (await restoreOver("post", existing.id, p, { categoryId: cat, ...(author ? { authorId: author } : {}) }))) {
        restoredPosts.add(existing.id);
        bump(restored, "posts");
      } else bump(skipped, "posts");
      continue;
    }
    freshPosts.add(Number(p.id));
    if (dryRun) { bump(created, "posts"); continue; }
    const [row] = await insertReturning(posts, {
      ...(reviveDates(withoutKeys(p, ["id", "categoryId", "authorId", "translationGroup"])) as Row),
      slug,
      language,
      categoryId: p.categoryId == null ? null : categoryIds.get(Number(p.categoryId)) ?? null,
      authorId: mapUser(p.authorId),
    } as never);
    postIds.set(Number(p.id), row.id);
    bump(created, "posts");
  }

  // ── Pages ────────────────────────────────────────────────────────────────
  for (const pg of table("pages")) {
    const slug = str(pg.slug), language = str(pg.language) ?? "en";
    if (!slug) { bump(skipped, "pages"); continue; }
    const existing = await db.query.pages.findFirst({
      where: and(eq(pages.slug, slug), eq(pages.language, language)), columns: { id: true },
    });
    if (existing) {
      pageIds.set(Number(pg.id), existing.id);
      const author = mapUser(pg.authorId);
      if (options.overwrite && (await restoreOver("page", existing.id, pg, author ? { authorId: author } : {}))) bump(restored, "pages");
      else bump(skipped, "pages");
      continue;
    }
    freshPages.add(Number(pg.id));
    if (dryRun) { bump(created, "pages"); continue; }
    const [row] = await insertReturning(pages, {
      ...(reviveDates(withoutKeys(pg, ["id", "authorId", "translationGroup"])) as Row),
      slug,
      language,
      authorId: mapUser(pg.authorId),
    } as never);
    pageIds.set(Number(pg.id), row.id);
    bump(created, "pages");
  }

  // Translation groups, once both sides exist.
  //
  // The group key is the id of whichever document the group started from, so it
  // has to be remapped like any other reference — left alone, it would point at
  // whatever document happens to hold that id here.
  if (!dryRun) {
    for (const [rows, map, tbl] of [
      [table("posts"), postIds, posts],
      [table("pages"), pageIds, pages],
    ] as const) {
      for (const r of rows) {
        const mine = map.get(Number(r.id));
        const group = r.translationGroup == null ? null : map.get(Number(r.translationGroup)) ?? null;
        if (mine && group !== null) {
          await db.update(tbl).set({ translationGroup: group }).where(eq(tbl.id, mine));
        }
      }
    }
  }

  // ── Post ⇄ tag ───────────────────────────────────────────────────────────
  // A restored post gets the file's tags, not the file's plus today's.
  if (!dryRun && restoredPosts.size) {
    for (const id of restoredPosts) await db.delete(postTags).where(eq(postTags.postId, id));
  }
  for (const pt of table("post_tags")) {
    const postId = postIds.get(Number(pt.postId));
    const tagId = tagIds.get(Number(pt.tagId));
    if (!postId || !tagId) { bump(skipped, "post_tags"); continue; }
    if (!dryRun) {
      await db.insert(postTags).values({ postId, tagId }).onDuplicateKeyUpdate({ set: { postId: sql.raw("`post_id`") } });
    }
    bump(created, "post_tags");
  }

  // ── Menus and their items ────────────────────────────────────────────────
  //
  // Matched on name, because a menu has no other natural key and running the
  // same file twice must not leave the site with two "Main Menu"s. The first
  // version of this inserted unconditionally, and the round-trip test caught it
  // immediately: re-importing an unchanged export reported two menus created.
  const freshMenus = new Set<number>();
  for (const m of table("menus")) {
    const name = str(m.name);
    if (!name) { bump(skipped, "menus"); continue; }
    const existing = await db.query.menus.findFirst({
      where: eq(menus.name, name), columns: { id: true },
    });
    if (existing) { menuIds.set(Number(m.id), existing.id); bump(skipped, "menus"); continue; }
    if (dryRun) { freshMenus.add(Number(m.id)); bump(created, "menus"); continue; }
    const [row] = await insertReturning(menus, reviveDates(withoutKeys(m, ["id"])) as never)
      ;
    menuIds.set(Number(m.id), row.id);
    freshMenus.add(Number(m.id));
    bump(created, "menus");
  }

  const navIdMap = new Map<number, number>();
  for (const n of table("nav_items")) {
    // Only for menus this import actually created. A menu that already existed
    // has the destination site's own items in it; adding the file's on top
    // would silently double every entry in the navigation.
    if (n.menuId != null && !freshMenus.has(Number(n.menuId))) {
      bump(skipped, "nav_items");
      continue;
    }
    if (dryRun) { bump(created, "nav_items"); continue; }
    // `objectId` points at a post, page or category depending on `objectType`,
    // so it is remapped through whichever map that names.
    const type = str(n.objectType) ?? "custom";
    const objectId =
      n.objectId == null ? null
      : type === "post" ? postIds.get(Number(n.objectId)) ?? null
      : type === "page" ? pageIds.get(Number(n.objectId)) ?? null
      : type === "category" ? categoryIds.get(Number(n.objectId)) ?? null
      : num(n.objectId);
    const [row] = await insertReturning(navItems, {
      ...(reviveDates(withoutKeys(n, ["id", "menuId", "parentId", "objectId"])) as Row),
      menuId: n.menuId == null ? null : menuIds.get(Number(n.menuId)) ?? null,
      objectId,
    } as never);
    navIdMap.set(Number(n.id), row.id);
    bump(created, "nav_items");
  }
  if (!dryRun) {
    for (const n of table("nav_items")) {
      const mine = navIdMap.get(Number(n.id));
      const parent = n.parentId == null ? null : navIdMap.get(Number(n.parentId)) ?? null;
      if (mine && parent !== null) {
        await db.update(navItems).set({ parentId: parent }).where(eq(navItems.id, mine));
      }
    }
  }

  // ── Elements, redirects ──────────────────────────────────────────────────
  // Elements match on name, for the same reason menus do: no other natural key,
  // and a second import must not leave two copies of the same banner injected
  // into every page.
  for (const e of table("elements")) {
    const name = str(e.name);
    if (!name) { bump(skipped, "elements"); continue; }
    const existing = await db.query.elements.findFirst({
      where: eq(elements.name, name), columns: { id: true },
    });
    if (existing) { bump(skipped, "elements"); continue; }
    if (!dryRun) await db.insert(elements).values(reviveDates(withoutKeys(e, ["id"])) as never);
    bump(created, "elements");
  }
  for (const r of table("redirects")) {
    const source = str(r.source);
    if (!source) { bump(skipped, "redirects"); continue; }
    const existing = await db.query.redirects.findFirst({
      where: eq(redirects.source, source), columns: { id: true },
    });
    if (existing) { bump(skipped, "redirects"); continue; }
    if (!dryRun) await db.insert(redirects).values(reviveDates(withoutKeys(r, ["id"])) as never);
    bump(created, "redirects");
  }

  // ── Comments and form submissions ────────────────────────────────────────
  for (const c of table("comments")) {
    if (!(c.postId != null ? freshPosts.has(Number(c.postId)) : c.pageId != null && freshPages.has(Number(c.pageId)))) {
      bump(skipped, "comments");
      continue;
    }
    const postId = c.postId == null ? null : postIds.get(Number(c.postId)) ?? null;
    const pageId = c.pageId == null ? null : pageIds.get(Number(c.pageId)) ?? null;
    // The table's own CHECK requires exactly one target; a comment whose
    // document did not come across has nowhere to attach.
    if ((postId === null) === (pageId === null)) { bump(skipped, "comments"); continue; }
    if (!dryRun) {
      await db.insert(comments).values({
        ...(reviveDates(withoutKeys(c, ["id", "postId", "pageId", "parentId"])) as Row),
        postId, pageId,
      } as never);
    }
    bump(created, "comments");
  }
  for (const s of table("form_submissions")) {
    // No natural key; the form and the moment it arrived is as close as it
    // gets, and is enough to make a second import land nothing.
    const at = date(s.createdAt);
    if (at) {
      const existing = await db.query.formSubmissions.findFirst({
        where: and(
          eq(formSubmissions.formName, str(s.formName) ?? "Contact"),
          // The column keeps microseconds; the export, milliseconds.
          gte(formSubmissions.createdAt, at),
          lt(formSubmissions.createdAt, new Date(at.getTime() + 1))
        ),
        columns: { id: true },
      });
      if (existing) { bump(skipped, "form_submissions"); continue; }
    }
    if (!dryRun) await db.insert(formSubmissions).values(reviveDates(withoutKeys(s, ["id"])) as never);
    bump(created, "form_submissions");
  }

  // ── Settings, only when asked ────────────────────────────────────────────
  if (options.settings) {
    const leftAlone: string[] = [];
    for (const s of table("site_settings")) {
      const key = str(s.key);
      if (!key) { bump(skipped, "site_settings"); continue; }
      // Settings about *this* install, not the site's content: its address,
      // its IndexNow key (one per domain), its Cloudflare zone, and the
      // markers of one-off and scheduled jobs. Copied, a moved site's
      // canonicals and sitemap pointed at the old domain, and the one-time
      // embed clean-up was marked done on a database it never ran on.
      if (SITE_SPECIFIC_SETTING.test(key)) { leftAlone.push(key); bump(skipped, "site_settings"); continue; }
      let value = str(s.value) ?? "";
      // The homepage and the blog page are stored as page ids, and imported
      // pages get new ids here. Copied as-is they pointed at the wrong page,
      // or at none.
      if (PAGE_ID_SETTING.test(key) && value.trim()) {
        // A dry run inserts no pages, so a page it *would* create has no new
        // id yet; it still counts as present.
        const mapped = pageIds.get(Number(value)) ?? (dryRun && freshPages.has(Number(value)) ? Number(value) : undefined);
        if (mapped === undefined) {
          notes.push(`"${key}" pointed at a page that was not in the file; it was left as it was here.`);
          bump(skipped, "site_settings");
          continue;
        }
        value = String(mapped);
      }
      if (!dryRun) {
        await db.insert(siteSettings).values({ key, value })
          .onDuplicateKeyUpdate({ set: { value } });
      }
      bump(created, "site_settings");
    }
    if (leftAlone.length) {
      notes.push(`Kept this site's own ${leftAlone.join(", ")} rather than the file's.`);
    }
    if (!dryRun) invalidateSiteSettings();
  } else if (table("site_settings").length > 0) {
    notes.push(
      `${table("site_settings").length} settings were in the file and left alone. Tick "Also import settings" to apply them.`
    );
  }

  return { ok: true, dryRun, created, skipped, restored, notes };
}
