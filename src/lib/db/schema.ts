import {
  mysqlTable,
  longtext,
  datetime,
  boolean,
  int,
  varchar,
  primaryKey,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// Written by the database, in UTC (the pool sets time_zone = '+00:00').
const NOW = sql`CURRENT_TIMESTAMP(3)`;

/**
 * JSON stored as LONGTEXT. MariaDB's JSON type is LONGTEXT underneath and
 * mysql2 hands it back as a string, which Drizzle's own mysql `json` column
 * does not parse — every block document would have arrived as text.
 */
const jsonText = customType<{ data: unknown; driverData: string }>({
  dataType: () => "longtext",
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (value) => (typeof value === "string" ? JSON.parse(value) : value),
});

export const users = mysqlTable("users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: longtext("name"),
  email: varchar("email", { length: 320 }).notNull().unique(),
  emailVerified: datetime("email_verified", { mode: "date", fsp: 3 }),
  image: longtext("image"),
  password: longtext("password"),
  // Defaults to the least privilege, not the most. The API always sets this
  // explicitly, so the default only applies to a row inserted some other
  // way — a restored backup, a hand-written INSERT — and "admin" meant
  // every one of those silently became an administrator.
  role: varchar("role", { length: 20 }).notNull().default("editor"),
  totpSecret: longtext("totp_secret"),
  totpEnabled: boolean("totp_enabled").default(false),
  /** Attempts at /api/auth/reset-2fa inside the window below (drizzle/0020). */
  totpResetFailures: int("totp_reset_failures").notNull().default(0),
  /** Start of the current 24-hour attempt window, or null when there is none. */
  totpResetSince: datetime("totp_reset_since", { mode: "date", fsp: 3 }),
  lastLogin: datetime("last_login", { mode: "date", fsp: 3 }),

  // ── The public person, as opposed to the account ──────────────────────────
  //
  // A byline had nowhere to point and nothing behind it. These are what an
  // author page is made of.

  /** URL segment for the author page. Unique among the rows that have one. */
  slug: varchar("slug", { length: 700 }),
  bio: longtext("bio"),
  website: longtext("website"),
  twitter: longtext("twitter"),
  linkedin: longtext("linkedin"),
  facebook: longtext("facebook"),
  instagram: longtext("instagram"),
  github: longtext("github"),
  youtube: longtext("youtube"),

  // SEO, named to match posts, pages and categories.
  seoTitle: longtext("seo_title"),
  seoDescription: longtext("seo_description"),
  canonicalUrl: longtext("canonical_url"),
  ogImage: longtext("og_image"),
  noIndex: boolean("no_index").notNull().default(false),

  /**
   * Whether this account has a public author page.
   *
   * Off by default: most accounts never write anything, and giving every
   * login a public URL by default leaks the staff list before anyone has
   * chosen to have one. Existing accounts keep whatever they already had —
   * this only changes what a newly created account starts as.
   */
  publicProfile: boolean("public_profile").notNull().default(false),

  // Layout for that page, named to match the equivalents on `pages` so the
  // editor and the renderer can treat every document type the same way. An
  // author page was the only public document with no say over its own width.
  /** "ltr" / "rtl" override for this account's page, or null to follow its language — same field posts and pages already carry. */
  direction: varchar("direction", { length: 4 }),
  /**
   * Language override for the author page's `<html lang>` (and Direction's
   * "Auto" fallback), independent of which `/en`, `/fr`… address it is read
   * under — unlike a post or page, this one document answers at every
   * language's address at once, so it needs its own idea of what language it
   * is written in rather than inheriting the URL's.
   */
  language: varchar("language", { length: 16 }),
  pageLayout: varchar("page_layout", { length: 20 }).notNull().default("default"),
  contentStyle: varchar("content_style", { length: 10 }).notNull().default("default"),
  verticalSpacing: varchar("vertical_spacing", { length: 20 }).notNull().default("default"),
  transparentHeader: varchar("transparent_header", { length: 10 }).notNull().default("default"),
  disableHeader: boolean("disable_header").notNull().default(false),
  disableFooter: boolean("disable_footer").notNull().default(false),
  cssClasses: longtext("css_classes"),
  customCss: longtext("custom_css"),
  scriptHead: longtext("script_head"),
  scriptBodyEnd: longtext("script_body_end"),

  /**
   * The author page as an actual block document, the same `content` shape
   * `pages` and `posts` carry. Null until the author opens the page editor for
   * the first time — until then the page renders from the profile fields
   * directly (avatar, bio, social links), which is what a null `content` means
   * to every reader of this column.
   */
  content: jsonText("content"),

  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
}, (t) => [
  // An author's public page lives at /author/<slug>, so two users sharing a
  // slug would make one of them unreachable. `slug` is null for every account
  // that has never been given an author page; a MariaDB UNIQUE index allows
  // any number of NULLs, so the Postgres version's partial index is not
  // needed. Keep this in step with the baseline (drizzle-mysql/0000).
  uniqueIndex("users_slug_key").on(t.slug),
]);

// Tokens a program signs in with instead of a browser — the MCP hub, a
// script. See lib/apiTokens.ts and drizzle/0019_api_tokens.sql.
export const apiTokens = mysqlTable("api_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("user_id", { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: longtext("name").notNull(),
  /** SHA-256 hex of the token. The token itself is never stored. */
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  /** The first characters, so a list can tell tokens apart. */
  prefix: varchar("prefix", { length: 16 }).notNull(),
  /** The most this token may do; the owner's current role still caps it. */
  role: varchar("role", { length: 20 }).notNull().default("editor"),
  /** Extra powers beyond the role, comma-separated: "backups", "plugins" (lib/apiTokens.ts). */
  scopes: longtext("scopes").notNull().default(""),
  expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }),
  lastUsedAt: datetime("last_used_at", { mode: "date", fsp: 3 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
}, (t) => [
  uniqueIndex("api_tokens_hash_key").on(t.tokenHash),
  index("api_tokens_user_idx").on(t.userId),
]);

/**
 * "Connect Claude" sign-in codes (lib/oauth.ts): written when the owner clicks
 * Allow, traded once for an API token within five minutes, then deleted.
 */
export const oauthCodes = mysqlTable("oauth_codes", {
  /** SHA-256 hex of the code. */
  codeHash: varchar("code_hash", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  clientId: longtext("client_id").notNull(),
  redirectUri: longtext("redirect_uri").notNull(),
  codeChallenge: varchar("code_challenge", { length: 128 }).notNull(),
  tokenName: longtext("token_name").notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  scopes: longtext("scopes").notNull().default(""),
  expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
});

export const sessions = mysqlTable("sessions", {
  sessionToken: varchar("session_token", { length: 255 }).primaryKey(),
  userId: varchar("user_id", { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: datetime("expires", { mode: "date", fsp: 3 }).notNull(),
});

export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: longtext("name").notNull(),
  // Unique within a language, not globally — see the composite index below.
  slug: varchar("slug", { length: 700 }).notNull(),
  description: longtext("description"),
  /**
   * Which language set this term belongs to.
   *
   * Posts were partitioned by language while the terms they are filed under
   * were not, so a French archive listed English category names.
   */
  language: varchar("language", { length: 16 }).notNull().default("en"),
  /**
   * Writing direction override for the archive: "ltr" or "rtl". Null follows
   * the language, the same rule documents use — see documentDir().
   */
  direction: varchar("direction", { length: 4 }),
  /** Links this term to the same term in another language. */
  translationGroup: int("translation_group"),

  /**
   * Parent term, for hierarchy.
   *
   * `ON DELETE SET NULL`, not cascade: deleting a parent orphans its children
   * rather than silently deleting a whole subtree — and with it the only route
   * by which those posts were reachable.
   */
  parentId: int("parent_id"),

  // Archive appearance, overriding the Customizer's archive defaults.
  archiveColor: longtext("archive_color"),
  archiveHoverColor: longtext("archive_hover_color"),
  headerImage: longtext("header_image"),
  /** default | 1 | 2 | 3 | 4 — `default` follows the site-wide setting. */
  archiveColumns: varchar("archive_columns", { length: 10 }).notNull().default("default"),
  /**
   * The card design for this category's archive — the same vocabulary the
   * Customizer offers (classic, elevated, bordered, overlay, list, minimal),
   * with `default` following the site-wide choice. A news category and a
   * gallery category rarely want the same listing.
   */
  archiveCardStyle: varchar("archive_card_style", { length: 12 }).notNull().default("default"),
  /**
   * This category's own archive colours, as JSON keyed by the same setting
   * names the Customizer uses (`archive_title_color`, `archive_card_bg`, …).
   * One column rather than a dozen, and the same keys, so the term path and
   * the site path feed the identical CSS builders. Null = follow the site.
   */
  archiveDesign: longtext("archive_design"),

  // SEO. Named to match the columns on `posts` and `pages` so one reader works
  // for all three.
  seoTitle: longtext("seo_title"),
  seoDescription: longtext("seo_description"),
  focusKeyword: longtext("focus_keyword"),
  canonicalUrl: longtext("canonical_url"),
  ogTitle: longtext("og_title"),
  ogDescription: longtext("og_description"),
  ogImage: longtext("og_image"),

  // Robots directives combine, so each is its own flag.
  noIndex: boolean("no_index").notNull().default(false),
  noFollow: boolean("no_follow").notNull().default(false),
  noArchive: boolean("no_archive").notNull().default(false),
  noImageIndex: boolean("no_image_index").notNull().default(false),
  noSnippet: boolean("no_snippet").notNull().default(false),

  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
}, (t) => [
  uniqueIndex("categories_language_slug_key").on(t.language, t.slug),
  index("categories_language_idx").on(t.language),
  index("categories_translation_group_idx").on(t.translationGroup),
  index("categories_parent_idx").on(t.parentId),
]);

export const tags = mysqlTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  name: longtext("name").notNull(),
  // Unique within a language, not globally — see the composite index below.
  slug: varchar("slug", { length: 700 }).notNull(),
  description: longtext("description"),
  /** Which language set this tag belongs to. Same reasoning as categories. */
  language: varchar("language", { length: 16 }).notNull().default("en"),
  /** Same override as categories.direction. */
  direction: varchar("direction", { length: 4 }),
  /** Links this tag to the same tag in another language. */
  translationGroup: int("translation_group"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
}, (t) => [
  uniqueIndex("tags_language_slug_key").on(t.language, t.slug),
  index("tags_language_idx").on(t.language),
  index("tags_translation_group_idx").on(t.translationGroup),
]);

/**
 * Post ⇄ tag join.
 *
 * A composite primary key rather than a surrogate id: the pair is the identity,
 * and it makes tagging the same post twice impossible at the database level
 * instead of only in the code that writes it.
 */
export const postTags = mysqlTable(
  "post_tags",
  {
    postId: int("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    tagId: int("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tagId] }), index("post_tags_tag_idx").on(t.tagId)]
);

/**
 * Post comments, including threaded replies.
 *
 * Comments arrive from the public internet, so they land as `pending` and only
 * become visible once approved. The author fields are plain columns rather than
 * a user reference: commenters are not accounts here.
 */
export const comments = mysqlTable(
  "comments",
  {
    id: int("id").autoincrement().primaryKey(),
    /**
     * The document this comment belongs to — exactly one of these is set.
     *
     * A database CHECK (`comments_one_target`) enforces that, so "a comment
     * belongs to one thing" is a fact about the data rather than a rule the
     * application has to remember at every insert.
     */
    postId: int("post_id").references(() => posts.id, { onDelete: "cascade" }),
    pageId: int("page_id").references(() => pages.id, { onDelete: "cascade" }),
    /** Set when this is a reply. Self-references are added by the relation. */
    parentId: int("parent_id"),
    authorName: longtext("author_name").notNull(),
    authorEmail: longtext("author_email").notNull(),
    authorUrl: longtext("author_url"),
    content: longtext("content").notNull(),
    /** pending | approved | spam | trash */
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    ip: longtext("ip"),
    userAgent: longtext("user_agent"),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
  },
  (t) => [
    index("comments_post_idx").on(t.postId, t.status),
    index("comments_page_status_created_idx").on(t.pageId, t.status, t.createdAt),
  ]
);

export const posts = mysqlTable("posts", {
  id: int("id").autoincrement().primaryKey(),
  title: longtext("title").notNull(),
  // Unique *within a language*, not globally — see the composite index
  // below. `/about` and `/fr/about` are different URLs with no reason to
  // fight over one slug.
  slug: varchar("slug", { length: 700 }).notNull(),
  excerpt: longtext("excerpt"),
  content: jsonText("content"),
  // Flattened body text for search; kept in sync on save. A FULLTEXT index
  // (posts_search_ft) covers title + excerpt + this, see drizzle-mysql/0000.
  searchText: longtext("search_text"),
  featuredImage: longtext("featured_image"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  categoryId: int("category_id").references(() => categories.id, { onDelete: "set null" }),
  authorId: varchar("author_id", { length: 64 }).references(() => users.id, { onDelete: "set null" }),
  seoTitle: longtext("seo_title"),
  seoDescription: longtext("seo_description"),
  seoKeywords: longtext("seo_keywords"),
  ogTitle: longtext("og_title"),
  ogDescription: longtext("og_description"),
  ogImage: longtext("og_image"),
  twitterTitle: longtext("twitter_title"),
  twitterDescription: longtext("twitter_description"),
  twitterImage: longtext("twitter_image"),
  canonicalUrl: longtext("canonical_url"),
  noIndex: boolean("no_index").default(false),
  noFollow: boolean("no_follow").default(false),
  /** JSON, see lib/robots.ts; null when everything is at its default. */
  robotsAdvanced: longtext("robots_advanced"),
  schemaType: varchar("schema_type", { length: 50 }).default("Article"),
  /** Author-added JSON-LD entries (SEO → Schema) — see lib/schemaTypes.ts. */
  schemas: longtext("schemas"),
  // Per-post layout / design settings
  transparentHeader: varchar("transparent_header", { length: 10 }).notNull().default("default"),
  showTitle: varchar("show_title", { length: 10 }).notNull().default("default"),
  postLayout: varchar("post_layout", { length: 20 }).notNull().default("default"),
  contentStyle: varchar("content_style", { length: 10 }).notNull().default("default"),
  verticalSpacing: varchar("vertical_spacing", { length: 20 }).notNull().default("default"),
  showFeaturedImage: varchar("show_featured_image", { length: 10 }).notNull().default("default"),
  /**
   * Whether this post takes comments.
   *
   * `default` follows the site-wide `post_comments_show`; `enable`/`disable`
   * override it — the same three states as `showTitle`, so the column reads
   * the same way and needs no new vocabulary.
   */
  showComments: varchar("show_comments", { length: 10 }).notNull().default("default"),
  /**
   * In the trash since this moment, or null.
   *
   * A timestamp rather than a `trash` status: the status already records
   * whether the document was a draft or published, and overwriting it would
   * lose the state to restore *to*.
   */
  deletedAt: datetime("deleted_at", { mode: "date", fsp: 3 }),
  cssClasses: longtext("css_classes"),
  disableHeader: boolean("disable_header").notNull().default(false),
  disableFooter: boolean("disable_footer").notNull().default(false),
  /**
   * Which language this document is written in.
   *
   * Content is partitioned by language rather than shared: an Urdu site and an
   * English site living in one install do not share posts, they have their own.
   * `translation_group` is what links a document to its counterpart elsewhere,
   * so "show me the Urdu version" is answerable without the two being the same
   * row.
   */
  language: varchar("language", { length: 16 }).notNull().default("en"),
  /**
   * Writing direction override: "ltr" or "rtl". Null follows the language —
   * the site's Direction setting for the default language, the script's own
   * direction for any other. See documentDir().
   */
  direction: varchar("direction", { length: 4 }),
  /** Shared across every translation of one thing. Null when it stands alone. */
  translationGroup: int("translation_group"),
  publishedAt: datetime("published_at", { mode: "date", fsp: 3 }),
  /**
   * Scripts for this document only.
   *
   * The site-wide pair in settings runs everywhere; a pixel for one landing
   * page or a widget on one article does not belong there. Raw markup by
   * design — that is what a tracking snippet is — which is why writing it is an
   * administrator's action, not an editor's.
   */
  scriptHead: longtext("script_head"),
  scriptBodyEnd: longtext("script_body_end"),
  /** CSS scoped to this document, so a one-page tweak is not a site-wide rule. */
  customCss: longtext("custom_css"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
},
  (t) => [
    // Listings are always scoped to one language now.
    uniqueIndex("posts_language_slug_key").on(t.language, t.slug),
    index("posts_language_idx").on(t.language, t.status, t.publishedAt),
    index("posts_translation_group_idx").on(t.translationGroup),
    // Every public listing is "published, newest first" — the archive, the
    // homepage, the feed, the sitemap, related posts and prev/next. Without
    // this the planner scans the whole table and sorts it each time.
    index("posts_status_published_idx").on(t.status, t.publishedAt),
    // Category archives and the related-posts query filter on this first.
    index("posts_category_idx").on(t.categoryId, t.publishedAt),
    // Author archives and "my posts" — see drizzle/0018_author_indexes.sql.
    index("posts_author_idx").on(t.authorId, t.publishedAt),
  ]
);

export const pages = mysqlTable("pages", {
  id: int("id").autoincrement().primaryKey(),
  title: longtext("title").notNull(),
  // Unique *within a language*, not globally — see the composite index
  // below. `/about` and `/fr/about` are different URLs with no reason to
  // fight over one slug.
  slug: varchar("slug", { length: 700 }).notNull(),
  content: jsonText("content"),
  featuredImage: longtext("featured_image"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  template: varchar("template", { length: 50 }).default("default"),
  authorId: varchar("author_id", { length: 64 }).references(() => users.id, { onDelete: "set null" }),
  seoTitle: longtext("seo_title"),
  seoDescription: longtext("seo_description"),
  seoKeywords: longtext("seo_keywords"),
  ogTitle: longtext("og_title"),
  ogDescription: longtext("og_description"),
  ogImage: longtext("og_image"),
  twitterTitle: longtext("twitter_title"),
  twitterDescription: longtext("twitter_description"),
  twitterImage: longtext("twitter_image"),
  canonicalUrl: longtext("canonical_url"),
  noIndex: boolean("no_index").default(false),
  noFollow: boolean("no_follow").default(false),
  robotsAdvanced: longtext("robots_advanced"),
  schemaType: varchar("schema_type", { length: 50 }).default("WebPage"),
  /** Author-added JSON-LD entries (SEO → Schema) — see lib/schemaTypes.ts. */
  schemas: longtext("schemas"),
  // Per-page layout / design settings
  transparentHeader: varchar("transparent_header", { length: 10 }).notNull().default("default"),
  showTitle: varchar("show_title", { length: 10 }).notNull().default("default"),
  postLayout: varchar("post_layout", { length: 20 }).notNull().default("default"),
  contentStyle: varchar("content_style", { length: 10 }).notNull().default("default"),
  verticalSpacing: varchar("vertical_spacing", { length: 20 }).notNull().default("default"),
  showFeaturedImage: varchar("show_featured_image", { length: 10 }).notNull().default("default"),
  /** The page's own override of the Customizer's page-comments default. */
  showComments: varchar("show_comments", { length: 10 }).notNull().default("default"),
  /**
   * In the trash since this moment, or null.
   *
   * A timestamp rather than a `trash` status: the status already records
   * whether the document was a draft or published, and overwriting it would
   * lose the state to restore *to*.
   */
  deletedAt: datetime("deleted_at", { mode: "date", fsp: 3 }),
  cssClasses: longtext("css_classes"),
  disableHeader: boolean("disable_header").notNull().default(false),
  disableFooter: boolean("disable_footer").notNull().default(false),
  /** Same partitioning as posts — see the note there. */
  language: varchar("language", { length: 16 }).notNull().default("en"),
  /**
   * Writing direction override: "ltr" or "rtl". Null follows the language —
   * the site's Direction setting for the default language, the script's own
   * direction for any other. See documentDir().
   */
  direction: varchar("direction", { length: 4 }),
  translationGroup: int("translation_group"),
  publishedAt: datetime("published_at", { mode: "date", fsp: 3 }),
  /**
   * Scripts for this document only.
   *
   * The site-wide pair in settings runs everywhere; a pixel for one landing
   * page or a widget on one article does not belong there. Raw markup by
   * design — that is what a tracking snippet is — which is why writing it is an
   * administrator's action, not an editor's.
   */
  scriptHead: longtext("script_head"),
  scriptBodyEnd: longtext("script_body_end"),
  /** CSS scoped to this document, so a one-page tweak is not a site-wide rule. */
  customCss: longtext("custom_css"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
},
  (t) => [
    uniqueIndex("pages_language_slug_key").on(t.language, t.slug),
    index("pages_language_idx").on(t.language, t.status),
    index("pages_translation_group_idx").on(t.translationGroup),
  ]
);

export const media = mysqlTable("media", {
  id: int("id").autoincrement().primaryKey(),
  filename: longtext("filename").notNull(),
  originalName: longtext("original_name").notNull(),
  url: varchar("url", { length: 768 }).notNull(),
  mimeType: longtext("mime_type").notNull(),
  size: int("size").notNull(),
  /**
   * Intrinsic pixel size, read from the file header at upload.
   *
   * Nullable because it is genuinely unknown for rows uploaded before this
   * existed, and for AVIF, whose header is not parsed. Every reader treats null
   * as "omit the attribute" rather than guessing — a wrong size reserves the
   * wrong space, which is worse than reserving none.
   */
  width: int("width"),
  height: int("height"),
  /**
   * A tiny blurred preview as a data URI (~400 bytes), made at upload. Shown
   * in the image's place while the real file loads, so it fades in rather
   * than popping into blank space. Null for SVG, GIF and older uploads.
   */
  blur: longtext("blur"),
  alt: longtext("alt"),
  caption: longtext("caption"),
  uploadedById: varchar("uploaded_by_id", { length: 64 }).references(() => users.id, { onDelete: "set null" }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
}, (t) => [
  // The image-size lookup resolves images by URL on every render that has one.
  index("media_url_idx").on(t.url),
]);

export const siteSettings = mysqlTable("site_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 191 }).notNull().unique(),
  value: longtext("value"),
  type: varchar("type", { length: 20 }).default("text"),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
});

export const menus = mysqlTable("menus", {
  id: int("id").autoincrement().primaryKey(),
  name: longtext("name").notNull(),
  autoAddPages: boolean("auto_add_pages").default(false),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
});

export const navItems = mysqlTable("nav_items", {
  id: int("id").autoincrement().primaryKey(),
  menuId: int("menu_id").references(() => menus.id, { onDelete: "cascade" }),
  label: longtext("label").notNull(),
  objectType: varchar("object_type", { length: 20 }).default("custom"), // page | post | category | custom
  objectId: int("object_id"),
  // Rich item options — icon, sub-label, badge, and mega-menu behaviour
  icon: longtext("icon"),
  description: longtext("description"),
  badge: longtext("badge"),
  highlight: varchar("highlight", { length: 20 }),
  megaMenu: boolean("mega_menu").default(false),
  megaColumns: int("mega_columns").default(2),
  url: longtext("url").notNull(),
  target: varchar("target", { length: 10 }).default("_self"),
  order: int("order").default(0),
  parentId: int("parent_id"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
});

export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Media = typeof media.$inferSelect;
export type SiteSetting = typeof siteSettings.$inferSelect;
export type NavItem = typeof navItems.$inferSelect;

/**
 * Version history for posts and pages.
 *
 * One table for both kinds, keyed by (`documentKind`, `documentId`): two tables
 * would duplicate every query and every prune. The row holds the state *before*
 * a save, so a revision is always a version you can return to — the current
 * version already lives in `posts`/`pages` and does not need storing twice.
 */
export const revisions = mysqlTable("revisions", {
  id: int("id").autoincrement().primaryKey(),
  documentKind: varchar("document_kind", { length: 10 }).notNull(),
  documentId: int("document_id").notNull(),
  title: longtext("title"),
  content: jsonText("content"),
  excerpt: longtext("excerpt"),
  /** Slug, featured image, category, SEO/social/robots — see lib/revisions.ts. */
  meta: jsonText("meta"),
  // SET NULL, not CASCADE: removing a user must not delete the history of
  // everything they ever touched.
  authorId: varchar("author_id", { length: 64 }).references(() => users.id, { onDelete: "set null" }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
}, (t) => [
  index("revisions_document_idx").on(t.documentKind, t.documentId, t.createdAt),
]);


export const redirects = mysqlTable("redirects", {
  id: int("id").autoincrement().primaryKey(),
  source: varchar("source", { length: 768 }).notNull().unique(),
  destination: longtext("destination").notNull(),
  type: int("type").notNull().default(301),
  enabled: boolean("enabled").notNull().default(true),
  hits: int("hits").notNull().default(0),
  lastHit: datetime("last_hit", { mode: "date", fsp: 3 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
});

export const notFoundLog = mysqlTable("not_found_log", {
  id: int("id").autoincrement().primaryKey(),
  path: varchar("path", { length: 768 }).notNull().unique(),
  hits: int("hits").notNull().default(1),
  referrer: longtext("referrer"),
  lastHit: datetime("last_hit", { mode: "date", fsp: 3 }).default(NOW).notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
});

// Installed plugins — tools uploaded as a zip and placed with a shortcode.
//
// The files live under public/plugins/<slug>/; this row is what the admin
// lists and what rendering consults: whether the plugin is on, its version
// (for cache-busting its script), and the settings the site owner chose.
export const plugins = mysqlTable("plugins", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: longtext("name").notNull(),
  version: varchar("version", { length: 32 }).notNull().default("1.0.0"),
  description: longtext("description"),
  enabled: boolean("enabled").notNull().default(true),
  /** The plugin.json it was installed from, verbatim. */
  manifest: longtext("manifest").notNull(),
  /** Values for the settings the manifest declares, as JSON. */
  settings: longtext("settings").notNull().default("{}"),
  installedAt: datetime("installed_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
});

// Errors the site has thrown, so they can be read from the admin.
//
// On shared hosting the server log is not something the site owner can open;
// a 500 is discovered by a visitor, and the only trace of it is gone by the
// time anyone looks. Everything that reaches Next's error hook is written
// here instead: what failed, where, and the stack — enough to fix it.
export const errorLog = mysqlTable("error_log", {
  id: int("id").autoincrement().primaryKey(),
  /** "render", "route", "middleware", "client" — where it surfaced. */
  source: varchar("source", { length: 20 }).notNull().default("render"),
  path: longtext("path"),
  method: varchar("method", { length: 10 }),
  message: longtext("message").notNull(),
  stack: longtext("stack"),
  /** Next's error digest, the handle a visitor's error page shows. */
  digest: varchar("digest", { length: 64 }),
  userAgent: longtext("user_agent"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
}, (t) => [index("error_log_created_idx").on(t.createdAt)]);

// Reusable content injected at a layout hook — an announcement bar, a CTA under
// every post, a promo above the footer. The alternative is editing the layout
// for every one of them, which is what Elements exists to avoid.
export const elements = mysqlTable("elements", {
  id: int("id").autoincrement().primaryKey(),
  name: longtext("name").notNull(),
  content: jsonText("content"),
  /** Layout position, one of ELEMENT_HOOKS in src/lib/elements.ts. */
  hook: varchar("hook", { length: 40 }).notNull().default("before_footer"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  /** Lower renders first when several elements share a hook. */
  priority: int("priority").notNull().default(10),
  /** JSON: { include: PageType[], exclude: PageType[] }. Empty include = everywhere. */
  conditions: jsonText("conditions"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
});

// Contact form submissions. The form's shape lives in the block that rendered
// it, so the payload is stored as-is rather than in fixed columns — one table
// serves every form on the site, whatever fields it has.
export const formSubmissions = mysqlTable("form_submissions", {
  id: int("id").autoincrement().primaryKey(),
  /** The form block's name, so several forms can share this inbox. */
  formName: longtext("form_name").notNull().default("Contact"),
  /** Where it was submitted from, for context in the inbox. */
  pagePath: longtext("page_path"),
  data: jsonText("data").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  ip: longtext("ip"),
  userAgent: longtext("user_agent"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(NOW).notNull(),
});
