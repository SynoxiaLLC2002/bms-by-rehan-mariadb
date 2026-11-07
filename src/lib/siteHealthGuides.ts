// Where each Site Health finding is fixed, and how — in the words of someone
// who has never seen the admin before.
//
// A finding used to say what was wrong and, sometimes, link somewhere. The
// link was missing on half of them and the other half assumed the reader
// knew which screen and which field. This is the missing half: every check id
// maps to the screen that fixes it and the steps to take there. The checks
// stay focused on *detecting*; the guide is looked up by id when the report
// is assembled, so a check never has to repeat it.

export interface HealthGuide {
  /**
   * Admin screen where this is fixed. "host" means the hosting control panel
   * (environment variables, cron jobs): the link goes to Settings → Hosting
   * control panel when that is filled in, and nowhere otherwise — never back
   * to the report itself. A "#…" anchor scrolls this page.
   */
  href: string | "host";
  /** Steps, in order, as short imperative sentences. */
  how: string;
}

export const HEALTH_GUIDES: Record<string, HealthGuide> = {
  // ── Identity ─────────────────────────────────────────────────────────────
  "site-url": { href: "/admin/settings", how: "Settings → Site URL. Enter the public https:// address, exactly as visitors type it. Save. Every canonical tag, sitemap entry and share link uses this." },
  "site-name": { href: "/admin/settings", how: "Settings → Site Name. This is what appears after the separator in browser tabs and in the Organization schema." },
  "site-description": { href: "/admin/settings", how: "Settings → Site Description. One or two sentences about the site — it becomes the front page's meta description when the homepage has none of its own. To set the homepage's own description instead: Pages → the homepage → SEO tab → Meta Description." },
  favicon: { href: "/admin/customize", how: "Customize → Site Identity → Site Icon. Upload a square PNG of at least 512×512. Browsers and Google's result pages show it." },
  logo: { href: "/admin/customize", how: "Customize → Site Identity → Logo. Upload a PNG or SVG; the header shows it instead of the site name." },
  language: { href: "/admin/settings", how: "Settings → Language and Text Direction. Arabic, Urdu, Persian and Hebrew sites should be right-to-left. Each page and post can still override its own direction in its Page/Post tab." },
  social: { href: "/admin/seo", how: "SEO → Social & Schema → Social profiles. Paste the full profile URLs. They are emitted as sameAs in the Organization schema and shown in the footer's social widget." },

  // ── SEO ──────────────────────────────────────────────────────────────────
  "og-image": { href: "/admin/seo", how: "SEO → Social & Schema → Default share image. Pick a 1200×630 image. It is the picture Facebook, X and WhatsApp show for any page or post that has no featured image of its own." },
  "kg-logo": { href: "/admin/seo", how: "SEO → Social & Schema → Knowledge Graph → Logo. A square PNG of at least 112×112. Google shows it next to the site in the knowledge panel and in the Organization schema." },
  "kg-name": { href: "/admin/seo", how: "SEO → Social & Schema → Knowledge Graph. Choose Organization or Person and enter the name. This is the publisher in every Article's structured data." },
  verification: { href: "/admin/seo", how: "SEO → Webmaster tools. Paste the verification code from Google Search Console, Bing Webmaster Tools, Yandex or Pinterest. Only the code, not the whole meta tag." },
  sitemap: { href: "/admin/seo", how: "SEO → Sitemap → Enable. Then submit https://your-site/sitemap_index.xml in Google Search Console → Sitemaps." },
  twitter: { href: "/admin/seo", how: "SEO → Social & Schema → X / Twitter handle, with the @. It becomes twitter:site on every page. Each author's own handle (Users → the author → Twitter) becomes twitter:creator on their posts." },
  "fb-page": { href: "/admin/seo", how: "SEO → Social & Schema → Facebook page URL. It becomes article:publisher on every post, so Facebook ties shares to your page." },
  noindex: { href: "/admin/seo", how: "SEO → Titles & Meta. Turn off 'Tell search engines not to index' for posts and pages unless you really want the site hidden." },
  "search-noindex": { href: "/admin/seo", how: "SEO → Titles & Meta → Search results → turn on 'Tell search engines not to index search results'. Search pages are thin, duplicate content." },
  indexnow: { href: "/admin/seo", how: "SEO → IndexNow → Enable. Bing, Yandex and others are told the moment a post is published or updated. Google ignores it and uses the sitemap instead." },
  "alt-text": { href: "/admin/media", how: "Media → click an image → Alt text. Describe what is in the picture in one short phrase. The site fills in a fallback (caption, then the page title) when it is empty, but a written one is better for image search." },
  "post-descriptions": { href: "/admin/posts", how: "Posts → open the post → SEO tab → Meta Description, 120–160 characters. Or fill the Excerpt in the Post tab; it is used when the description is empty." },
  "page-descriptions": { href: "/admin/pages", how: "Pages → open the page → SEO tab → Meta Description, 120–160 characters. Google writes its own when it is empty — usually worse than yours." },
  "not-found": { href: "/admin/seo", how: "SEO → Redirects. The 404 log shows the busiest missing addresses; add a redirect from each to the page that replaced it." },
  orphans: { href: "/admin/links", how: "Link Checker → Orphans. Each listed post or page has no internal link pointing to it, so search engines find it only through the sitemap. Link to it from a related post or add it to a menu." },
  "thin-content": { href: "/admin/posts", how: "Posts → open the post. Posts under 300 words rarely rank for anything competitive; expand it, merge it into a related post, or set it to noindex in its SEO tab → Advanced." },
  "duplicate-titles": { href: "/admin/posts", how: "Two published documents share a title. Give each a distinct title, or a distinct SEO title in the SEO tab, so they do not compete in search results." },
  "robots-txt": { href: "/admin/seo", how: "SEO → robots.txt. Remove the 'Disallow: /' line — it tells every crawler to ignore the whole site. Keep only /admin and /api disallowed." },
  "category-base": { href: "/admin/seo", how: "SEO → Titles & Meta → Categories → 'Remove the /category/ base from URLs'. /category/news becomes /news; old addresses redirect." },
  permalinks: { href: "/admin/settings", how: "Settings → Permalinks. 'Post name' (/my-post) is the structure that ranks and reads best. Changing it on a live site redirects old addresses automatically." },
  paginated: { href: "/admin/seo", how: "SEO → Titles & Meta → 'Tell search engines not to index page 2 onwards'. Leave off unless page 2+ of your listings are being indexed as duplicates." },

  // ── Content ──────────────────────────────────────────────────────────────
  homepage: { href: "/admin/customize", how: "Customize → Homepage → 'Homepage displays'. Choose a page to show at /. With nothing chosen, the front page lists the latest posts — and with no posts it is empty." },
  "posts-page": { href: "/admin/customize", how: "Customize → Homepage → 'Posts page'. Create a page (e.g. 'Blog' or 'News'), then choose it here; its URL lists your posts with pagination. Leave empty for no listing page." },
  navigation: { href: "/admin/navigation", how: "Navigation → create a menu → tick pages, posts or categories on the left → Add to Menu → drag to order → Save. Then assign it to the Header location." },
  featured: { href: "/admin/posts", how: "Posts → open the post → Post tab → Featured image. It is the picture in listings, the share preview and the Article schema." },
  "page-featured": { href: "/admin/pages", how: "Pages → open the page → Page tab → Featured image. It is the share preview for the page. The default share image (SEO → Social) is used when it is empty." },
  uncategorised: { href: "/admin/posts", how: "Posts → open the post → Post tab → Category. Every post lands in 'Uncategorized' when none is chosen; file it under a real one so its archive and breadcrumb mean something." },
  "default-category": { href: "/admin/categories", how: "Categories → create real categories, then Posts → each post → Post tab → Category. 'Uncategorized' is the fallback, not a category readers search for." },
  stale: { href: "/admin/posts/stale", how: "Stale Content lists posts untouched for a year. Open each, update facts, dates and screenshots, and save — the modified date is what search engines look at." },
  "comments-pending": { href: "/admin/comments", how: "Comments → Pending. Approve, reply or spam each one. Visitors do not see a comment until it is approved." },
  "empty-categories": { href: "/admin/categories", how: "Categories → either file posts under the empty ones or delete them; an empty archive page is thin content." },
  "unused-tags": { href: "/admin/tags", how: "Tags → delete tags with no posts. Each one has an archive page that lists nothing." },
  "stranded-language": { href: "/admin/settings", how: "Settings → Languages. Documents exist in a language the site no longer publishes, so they have no public address. Add the language back, or open each document and move it (Page/Post tab → Language)." },
  "direction-mismatch": { href: "/admin/settings", how: "Settings → Text Direction. The site's default language is written right-to-left but the direction is left-to-right (or the reverse). Set it to Automatic, or the matching direction." },
  content: { href: "/admin/posts/new", how: "Posts → Add New. Write the first post, add a featured image and a category, and Publish. The front page and feeds fill in from there." },
  drafts: { href: "/admin/posts", how: "Posts → Drafts. Finish and publish, or delete what will never be published — drafts autosave to the database and count toward its size." },

  // ── Security ─────────────────────────────────────────────────────────────
  "auth-secret": { href: "host", how: "Set AUTH_SECRET in the host's environment variables (cPanel → Setup Node.js App → Environment variables): a random 32-byte base64 string. Restart the app afterwards. Every session is signed with it." },
  "auth-url": { href: "host", how: "Set NEXTAUTH_URL in the host's environment variables to the public https:// address, then Restart. Login redirects and cookies depend on it." },
  "node-env": { href: "host", how: "Set NODE_ENV=production in the host's environment variables and Restart. Without it the app runs in development mode: slow, verbose errors shown to visitors." },
  admins: { href: "/admin/users", how: "Users → give at least one other trusted person the Administrator role, or keep one admin and make sure its email can receive password resets." },
  "2fa": { href: "/admin/users", how: "Users → open your account → Two-factor authentication → Enable and scan the QR code with an authenticator app. Every administrator should have it." },
  setup: { href: "/admin/users", how: "The /admin/setup screen is still reachable. It closes itself once a user exists; if it does not, check that the users table is populated." },
  "cron-token": { href: "host", how: "Set CRON_TOKEN in the host's environment variables to a long random string, Restart, then add ?token=… (or the Authorization header) to the publish cron URL." },
  turnstile: { href: "host", how: "Settings → Spam protection. Create a Cloudflare Turnstile widget (dash.cloudflare.com → Turnstile), paste its Site key and Secret key. Comment and contact forms get a bot check." },

  // ── Server / integrations ────────────────────────────────────────────────
  errors: { href: "/admin/errors", how: "Errors → open the newest entries. The message and the page it happened on are logged; most are a plugin or a block with bad data. Fix the cause, then Clear." },
  cron: { href: "host", how: "cPanel → Cron Jobs → Add New Cron Job: Common Settings 'Once Per Fifteen Minutes' (Minute */15). Command: curl -s -o /dev/null -m 30 \"https://your-site/api/cron/publish?token=YOUR_CRON_TOKEN\" — keep the quotes. It keeps the app awake, publishes scheduled posts and runs the daily clean-up. Not more often: every run wakes the database, and on Neon's free plan */3 used up the monthly compute. Wait 15 minutes, then Re-check." },
  keepalive: { href: "host", how: "The publish cron has not run recently. cPanel → Cron Jobs → check the every-15-minutes job exists and its URL is correct (Settings → Site URL), then wait 15 minutes and Re-check." },
  smtp: { href: "/admin/email", how: "Email (left menu) → pick your mail provider → fill in the details it asks for → Save and send a test to yourself. Without it the site cannot send password reset links, comment notifications or form entries." },
  recovery: { href: "/admin/users", how: "Turn on two-factor sign-in for your account (Users → your account → Two-factor authentication) — the Forgot password page can then reset your password with the authenticator app. Setting up Email (left menu) gives you emailed reset links as well." },
  backups: { href: "host", how: "Settings → Backups → Create backup, then download it. Keep one off the server: a host failure takes public/uploads with it." },
  "backup-files": { href: "/admin/settings", how: "Settings → Backups. Old backup files fill the disk; download what you want to keep and delete the rest." },
  storage: { href: "host", how: "public/uploads must be writable by the Node process. cPanel → File Manager → the app folder → public → uploads → Permissions 755 (folders) / 644 (files). Or set BLOB_READ_WRITE_TOKEN for Vercel Blob." },
  images: { href: "host", how: "Set IMAGE_OPTIMIZATION=off in the host's environment variables and Restart if optimised images return 500 on this host; originals are served instead." },
  sharp: { href: "host", how: "Run npm install in the app folder (cPanel → Setup Node.js App → Run NPM Install) so the 'sharp' image library is present, then Restart." },
  disk: { href: "/admin/media", how: "Media → sort by size and delete what is unused; Settings → Backups → delete old backup files; cPanel → Disk Usage for the rest of the account." },
  memory: { href: "host", how: "Set NODE_OPTIONS=--max-old-space-size=384 and MALLOC_ARENA_MAX=2 in the host's environment variables, Restart, and add the 5-minute 'pkill -15 -f lsnode' cron on LiteSpeed hosts." },
  timezone: { href: "/admin/settings", how: "Settings → Timezone. Scheduled posts and displayed dates use it; the server's own clock is usually UTC." },
  versions: { href: "/admin/updates", how: "Updates → the current release. Upload it to the app folder, extract over the old files, and Restart the app." },
  "build-match": { href: "/admin/updates", how: "The running Next.js version differs from the one the build was made with. In the app folder run npm install exactly as packaged (cPanel → Setup Node.js App → Run NPM Install), then Restart." },
  migrations: { href: "host", how: "Restart the app: server.js applies pending migrations on start. If it still reports pending, run npm run db:migrate in the app folder." },
  database: { href: "host", how: "Check DATABASE_URL in the host's environment variables (cPanel → Setup Node.js App). On shared hosts use the Neon connection string with ?sslmode=require and no channel_binding." },
  "db-driver": { href: "host", how: "Use a Neon HTTP-capable DATABASE_URL (…neon.tech…). Shared hosts block outbound Postgres TCP; the HTTP driver is the only one that works there." },
  "db-size": { href: "#cleanup", how: "Site Health → Database clean-up → Run clean-up removes old trash, logs and sessions. Media files are not in the database; see Disk." },
  "post-extras": { href: "/admin/customize", how: "Customize → Single Post. Turn on related posts, previous/next links, tags and the author box — they keep readers on the site." },
  lscache: { href: "/admin/speed", how: "Speed → Cache → Enable page cache. Every public page is then served by the web server without waking Node until something is saved. Speed → Dashboard → Test a URL shows whether it works." },
  cloudflare: { href: "/admin/speed", how: "Speed → Cloudflare. Zone ID from the Cloudflare dashboard → your domain → Overview; an API token with Zone → Cache Purge → Purge and Zone → Zone Settings → Edit. Then a save also clears Cloudflare's edge, and the screen can set Browser Cache TTL to respect the site's headers." },
};
