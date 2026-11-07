// A complete, portable copy of everything this site has written.
//
// Until now the only copy of a site's content was the Neon database it happened
// to be provisioned against. No export, no backup, no way to move a site to
// another host or read it without the CMS running — which makes the content
// hostage to one hosted service staying available and one connection string
// staying valid.
//
// The file this produces is plain JSON: every content table, in dependency
// order, with secrets removed. It is meant to be readable by a person and
// re-importable by a future importer, in that order of priority.

import { db } from "@/lib/db";
import {
  categories, comments, elements, formSubmissions, media, menus, navItems,
  pages, postTags, posts, redirects, siteSettings, tags, users,
} from "@/lib/db/schema";

/**
 * Bumped when the *shape* changes, not when a table gains a column.
 *
 * An importer reads this first to decide whether it understands the file at
 * all; adding a nullable column does not break that, renaming a table does.
 */
export const EXPORT_VERSION = 1;

export interface SiteExport {
  version: number;
  exportedAt: string;
  /** Which site this came from, so two backups are distinguishable. */
  site: { name: string; url: string };
  counts: Record<string, number>;
  data: Record<string, unknown[]>;
}

/**
 * Columns that must never leave the database.
 *
 * Password hashes and TOTP secrets are credentials — a backup file is copied to
 * laptops, emailed, and dropped in cloud storage, which is precisely where
 * credentials should not be. Sessions are excluded for the same reason and
 * because they are worthless once restored anyway.
 */
function safeUser(u: Record<string, unknown>) {
  // The reset-attempt counter is this database's state, not the account's.
  const { password, totpSecret, totpResetFailures, totpResetSince, ...rest } = u;
  void password;
  void totpSecret;
  void totpResetFailures;
  void totpResetSince;
  return rest;
}

/** Settings that are credentials, not configuration. */
const CREDENTIAL_SETTING = /(?:token|secret|password|api_key)$/i;

/**
 * Everything, in dependency order.
 *
 * The order is the order an importer would have to insert in — categories
 * before posts, posts before the join table — so the file can be replayed top
 * to bottom without a second pass.
 */
export async function buildExport(settings: Record<string, string>, siteUrl: string): Promise<SiteExport> {
  const [
    userRows, categoryRows, tagRows, postRows, pageRows, postTagRows,
    mediaRows, menuRows, navRows, elementRows, redirectRows,
    commentRows, submissionRows, settingRows,
  ] = await Promise.all([
    db.select().from(users),
    db.select().from(categories),
    db.select().from(tags),
    db.select().from(posts),
    db.select().from(pages),
    db.select().from(postTags),
    db.select().from(media),
    db.select().from(menus),
    db.select().from(navItems),
    db.select().from(elements),
    db.select().from(redirects),
    db.select().from(comments),
    db.select().from(formSubmissions),
    db.select().from(siteSettings),
  ]);

  const data: Record<string, unknown[]> = {
    users: userRows.map((u) => safeUser(u as unknown as Record<string, unknown>)),
    categories: categoryRows,
    tags: tagRows,
    posts: postRows,
    pages: pageRows,
    post_tags: postTagRows,
    media: mediaRows,
    menus: menuRows,
    nav_items: navRows,
    elements: elementRows,
    redirects: redirectRows,
    comments: commentRows,
    form_submissions: submissionRows,
    // The Cloudflare API token and anything else named like a credential
    // stay behind, for the reason given at `safeUser`. After a restore they
    // are entered again on the Speed screen.
    site_settings: settingRows.filter((r) => !CREDENTIAL_SETTING.test(r.key)),
  };

  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    site: { name: settings.site_name || "", url: siteUrl },
    counts,
    data,
  };
}

/**
 * A filename that sorts chronologically and says where it came from.
 *
 * Backups accumulate in a downloads folder; `export.json` three times over
 * tells you nothing about which is which.
 */
export function exportFilename(siteName: string): string {
  const slug = (siteName || "site")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "site";
  return `${slug}-export-${new Date().toISOString().slice(0, 10)}.json`;
}
