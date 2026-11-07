// The site's `.htaccess`, in one place.
//
// Two jobs the app cannot do from inside Node:
//
//  1. LiteSpeed keys its page cache on the full URL, so `?utm_source=x` is a
//     second copy of a page it already has. `CacheKeyModify` drops the tags
//     the Speed screen lists under "query strings that do not change the page".
//
//  2. LiteSpeed answers for any file that exists on disk — `public/uploads/*`,
//     `public/bms-plugins.js` — without the request ever reaching Node. The
//     `Cache-Control` that next.config.mjs and Speed -> Browser cache set is
//     therefore never applied to exactly the files that most need it, and the
//     host's own `ExpiresDefault` (four hours on cPanel/LiteSpeed) wins. That
//     is what PageSpeed reports as "use efficient cache lifetimes". These
//     rules put a year back on the files whose names never change.
//
// `release/.htaccess` is a copy of this text, ready to upload — keep the two
// in step when editing.

/**
 * The rules themselves — what the CMS writes into the file, and nothing
 * about where the file lives. Kept apart from the copy below so the block on
 * disk is only ever directives: a comment telling somebody to paste this
 * somewhere makes no sense inside the file it was pasted into.
 */
/**
 * Rules about the page cache. LiteSpeed reads these for the domain, so they
 * belong in the document root and nowhere else — `CacheKeyModify` is not a
 * directory-level directive.
 */
export const HTACCESS_PAGE_RULES = String.raw`# ── LiteSpeed page cache ───────────────────────────────────────────────
# A tracking tag does not change the page. Without these, every
# ?utm_source=... arrives as its own cache key, and every share from a
# newsletter or an ad is a cache miss that has to render from scratch.
<IfModule LiteSpeed>
  CacheKeyModify -qs:utm_source
  CacheKeyModify -qs:utm_medium
  CacheKeyModify -qs:utm_campaign
  CacheKeyModify -qs:utm_term
  CacheKeyModify -qs:utm_content
  CacheKeyModify -qs:fbclid
  CacheKeyModify -qs:gclid
  CacheKeyModify -qs:msclkid
  CacheKeyModify -qs:mc_cid
  CacheKeyModify -qs:mc_eid
  CacheKeyModify -qs:igshid
  CacheKeyModify -qs:ttclid
  CacheKeyModify -qs:twclid
  CacheKeyModify -qs:yclid
</IfModule>

# ── Let Cloudflare cache the pages and the optimised images ──────────
# Below Enterprise, Cloudflare refuses to cache any response whose Vary is
# something other than Accept-Encoding, whatever the cache rule says.
# Measured on the live site with the edge rule switched on and correct:
# every page and every "/_next/image?..." came back "cf-cache-status:
# DYNAMIC", for ever.
#
# Next sends two such headers. The image optimiser says "Vary: Accept" on
# every response whether or not the answer can vary; and every page says
# "Vary: rsc, next-router-state-tree, next-router-prefetch, ...", because a
# client-side navigation asks for the same URL with an "RSC: 1" header and
# expects a React payload, not HTML.
#
# Replacing both with Accept-Encoding is accurate rather than a trick, on two
# conditions this file and the Cloudflare rule keep together:
#
#   Images: "images.formats" in next.config.mjs is pinned to one entry, so
#   one URL is one file. **If AVIF is ever turned on with IMAGE_FORMATS=avif,
#   delete the image lines**, or the edge hands AVIF to a browser without it.
#
#   Pages: the payload requests are kept out of the edge cache another way.
#   Next adds "?_rsc=..." to them, and the Cloudflare rule (Speed → Cloudflare,
#   lib/cloudflare.ts) caches only requests with no query string and no RSC
#   header — so the cache under a page's URL can only ever hold its HTML, and
#   a payload request always goes to the origin. The browser is safe for the
#   same reason: the query makes the two different URLs in its cache too.
#   The lines below leave a payload response's own Vary alone regardless.
#
# SetEnvIf rather than <If> because it behaves the same on Apache and
# LiteSpeed. "Header set" rather than "always set" on purpose: the response
# comes from Passenger, and on Apache "always" adds a second Vary next to
# the backend's instead of replacing it. Both tables are cleared first so
# neither server can keep the old value.
#
# This is set here, at the origin, because "headers()" in next.config.mjs does
# not reach "/_next/*" (tried in 1.9.46, ignored) and cannot replace a Vary
# the page renderer writes after it.
<IfModule mod_headers.c>
  SetEnvIf Request_URI "^/_next/image" BMS_ONE_VARY=1

  SetEnvIf Request_Method "^(GET|HEAD)$" BMS_ONE_VARY=1
  SetEnvIf Request_URI "^/(_next/|api/|api$|admin|preview|og/|og$|site/|uploads/)" !BMS_ONE_VARY
  SetEnvIf RSC "1" !BMS_ONE_VARY
  SetEnvIf Next-Router-Prefetch "1" !BMS_ONE_VARY
  SetEnvIf Next-Router-State-Tree ".+" !BMS_ONE_VARY

  SetEnvIf Request_URI "^/_next/image" BMS_ONE_VARY=1

  Header unset Vary env=BMS_ONE_VARY
  Header always unset Vary env=BMS_ONE_VARY
  Header set Vary "Accept-Encoding" env=BMS_ONE_VARY
</IfModule>`;

/**
 * Rules about individual files, which have to sit where the files are.
 *
 * This is the half that was wrong first time round. With Passenger, an
 * uploaded image is served from `<app>/public/uploads/...`, which is not
 * underneath the domain's document root at all — so a `<FilesMatch>` in the
 * document root is read for pages and never for the files it names. The site
 * reported the rules "in place and up to date" while an upload carried on
 * being served with the host's four-hour default, which is exactly the kind
 * of lie the measurement in this screen exists to catch.
 *
 * So these go in `<app>/public/.htaccess` as well, beside the files.
 */
export const HTACCESS_FILE_RULES = String.raw`# ── How long a browser keeps a file ────────────────────────────────────
<IfModule mod_headers.c>
  # Uploads and font files. The CMS never reuses a name — a second
  # sunset.jpg is stored as sunset-2.jpg — so replacing an image produces a
  # new URL rather than new bytes behind an old one. That makes a year safe,
  # and "immutable" safe too: a reload does not even send a revalidation.
  <FilesMatch "\.(webp|avif|png|jpe?g|gif|svg|ico|woff2?)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>

  # The plugin runtime keeps its name across updates, so it cannot be
  # immutable. A day is long enough to be worth caching and short enough
  # that an update reaches everyone without a purge.
  <FilesMatch "^bms-plugins\.js$">
    Header set Cache-Control "public, max-age=86400"
  </FilesMatch>
</IfModule>

# The same lifetimes as an Expires header, for a host with mod_headers off.
# Where both are present Cache-Control above wins, which is what we want.
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType font/woff2    "access plus 1 year"
  ExpiresByType font/woff     "access plus 1 year"
  ExpiresByType image/webp    "access plus 1 year"
  ExpiresByType image/avif    "access plus 1 year"
  ExpiresByType image/png     "access plus 1 year"
  ExpiresByType image/jpeg    "access plus 1 year"
  ExpiresByType image/gif     "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"
  ExpiresByType image/x-icon  "access plus 1 year"
</IfModule>

# ── Things that should not be fetchable ────────────────────────────────
# A visitor asking for /uploads/ should get a 403, not a list of every file
# an editor has ever uploaded.
Options -Indexes

# Most of these live in the app folder rather than here, but a future
# mis-extraction must not turn one into a public URL.
<FilesMatch "^\.(env|ht)|\.(log|sql)$">
  Require all denied
</FilesMatch>`;

/** Both halves, in the order the document root wants them. */
export const HTACCESS_RULES = `${HTACCESS_PAGE_RULES}

${HTACCESS_FILE_RULES}`;

/** The same rules with the instructions, for the Copy and Download buttons. */
export const HTACCESS = String.raw`#
# WHERE THIS GOES: the domain's document root, not the app folder.
#
#   /home/<user>/<app>          the extracted upload.zip (code and .next)
#   /home/<user>/<domain.tld>   this file
#
# The document root already holds the .htaccess the cPanel Node.js selector
# wrote — the block marked "CLOUDLINUX PASSENGER CONFIGURATION". Leave that
# block exactly as it is and paste this above it: Passenger has to stay in
# charge of handing requests to server.js.

${HTACCESS_RULES}

# Nothing below this line — the Passenger block the Node.js selector wrote
# goes here, untouched.
`;
