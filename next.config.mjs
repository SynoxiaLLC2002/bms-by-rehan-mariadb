import { fileURLToPath } from "node:url";

// Plain JavaScript on purpose. A `next.config.ts` is transpiled when the server
// starts, which needs the `typescript` package - a devDependency. On a host
// that ran `npm install --omit=dev`, Next notices it is missing and tries to
// npm-install it during boot, which on shared hosting is slow at best and a
// hung startup at worst. This file needs nothing to load.

/** @type {import("next").NextConfig} */
const nextConfig = {
  // `next build` writes to `.next`, which is the same directory `next dev` is
  // serving from — so a build run against a live dev server replaces what that
  // server is reading and the site comes back without its CSS. Pointing the
  // build somewhere else makes "does this still compile for production" a
  // question that can be answered at any time, without stopping anything:
  //
  //   BUILD_DIR=.next-verify npm run build
  distDir: process.env.BUILD_DIR || ".next",

  // The trailing slash is removed by the middleware instead (src/middleware.ts,
  // "Trailing slash"). Next's own 308 ran before the middleware, so an old
  // WordPress address like `/old-post/` with a redirect rule took two hops —
  // slash first, rule second — and a `/gone/` rule answered 308 before 410.
  skipTrailingSlashRedirect: true,

  // Off: LiteSpeed (and Cloudflare in front of it) compress responses at the
  // edge already, so Next doing it too is CPU spent twice on a shared host —
  // and server.js needs the plain HTML to lay the <head> out readably.
  compress: false,

  experimental: {
    // Trades a little build time for a lower peak during `next build` — this
    // runs on the dev machine, never on the host, but it is free and safe.
    webpackMemoryOptimizations: true,
    // Next's own stylesheets (Tailwind) are still inlined into the HTML —
    // PageSpeed measured the render-blocking <link>s at ~300 ms on a phone —
    // but by server.js, not by this option. Next's inlining renders the CSS
    // through React, which puts the whole file into the page a second time
    // as hydration data (26 KB of it on every page). server.js swaps the
    // <link> for the file's contents in the HTML alone; see inlineSheets
    // there. INLINE_CSS=off leaves plain links; INLINE_CSS=next restores
    // Next's own inlining.
    inlineCss: process.env.INLINE_CSS === "next",
  },

  images: {
    // Image optimisation needs `sharp`, a native module Next installs as a
    // prebuilt binary. Some shared hosts cannot fetch or run that binary, and
    // the failure is every image on the site returning a 500 from
    // `/_next/image`. Switching optimisation off serves the original files
    // instead — larger, but present. Set IMAGE_OPTIMIZATION=off only if the
    // host turns out to need it; leave it on everywhere else.
    unoptimized: process.env.IMAGE_OPTIMIZATION === "off",

    // How long an optimised image may be cached, by browsers and by any CDN
    // in front. The default is sixty seconds, which meant every repeat visit
    // re-validated every image on the page. Uploads are safe to cache for a
    // year because a name is never reused: a second `sunset.jpg` is stored as
    // `sunset-2.jpg` (api/media uniqueDiskName), so replacing an image
    // produces a new URL, never a new file behind an old one.
    minimumCacheTTL: 31536000,

    // WebP by default; AVIF only with IMAGE_FORMATS=avif.
    //
    // With two formats the optimiser answers the same URL differently per
    // browser (`Vary: Accept`), and Cloudflare does not key its cache on
    // Accept — so optimised images could not be cached at the edge without
    // risking an AVIF served to a browser that cannot show it. Uncached, every
    // image request reached the Node process: on the first live site a
    // Lighthouse run's burst of ~20 images queued behind each other, the host
    // answered 503, and scripts timed out. One format makes each URL mean
    // one file, which the Cloudflare cache rule can then hold (see
    // cacheRuleExpression). WebP is universal; AVIF also measured larger on
    // that site (29 KB vs 22 KB) and encodes several times slower.
    formats: process.env.IMAGE_FORMATS === "avif" ? ["image/avif", "image/webp"] : ["image/webp"],

    // The qualities the optimiser will serve. Speed → Media picks one for
    // content images; 80 is the logo. Next 16 refuses any value not listed.
    qualities: [50, 60, 65, 70, 75, 80, 85, 90],

    // The widths the optimiser generates for a responsive image. Next's
    // default runs to 3840, and the largest width is also what it puts in the
    // plain `src` — so every content image carried a `w=3840` URL, which is
    // what a crawler or an old browser without srcset fetches, and a cache
    // warmer would encode. The ~800px content column needs 1600 at 2x and
    // 1290 on a 3x phone; a full-width landing-page row up to 1280px needs
    // 2560 at 2x, which is the cap. (Plain `src` now carries w=2560, still
    // well short of 3840.)
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2560],

    // The extra widths for images narrower than a screen. Next's default is
    // [16, 32, 48, 64, 96, 128, 256, 384], and whenever `sizes` mentions `vw`
    // (every content image: "calc(100vw - 32px)" on phones) it puts *all* of
    // them in the srcset — six icon-sized candidates no content image will
    // ever be picked at, ~1 KB of URL per image, twice (again in the React
    // payload). Icons here never go through the optimiser. 256 and 384 stay
    // for a small image in a narrow column at 1x.
    //
    // 480 is here because content images inside a post render around 350px
    // wide: 1x wants 384, but a 1.5x or 2x phone jumped straight to 640 and
    // over-fetched. It is still far above icon size, so it does not bring
    // back the srcset bloat the list was trimmed for.
    imageSizes: [256, 384, 480],

    // Scoped to where this CMS actually stores uploads.
    //
    // This was `hostname: "**"`, which allows *any* https URL through the
    // optimiser — and `/_next/image` is a public endpoint, so that turns the
    // deployment into an open image proxy: anyone can point it at a huge remote
    // file and have the server fetch, transcode and cache it on your bandwidth
    // and CPU. Content images (ContentImage.tsx) and the logo do go through
    // `next/image`, but only from the two sources below.
    //
    // Uploads land in Vercel Blob when BLOB_READ_WRITE_TOKEN is set, and in
    // `public/uploads` otherwise — the second case is same-origin and needs no
    // pattern at all. Add a host here if content starts hot-linking one.
    remotePatterns: [
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
    ],
  },

  // `X-Powered-By: Next.js` on every response tells an attacker which
  // framework, and therefore which CVE list, to work through. It buys nothing.
  poweredByHeader: false,

  // The IndexNow key file must sit at the site root: the engines accept a key
  // only for URLs inside the key file's own folder, so one at /indexnow/<key>.txt
  // covered nothing but /indexnow/ and every real ping was refused (422).
  // /<32 hex>.txt is answered by the same route that serves /indexnow/<key>.txt,
  // which still 404s for anything but the real key.
  async rewrites() {
    return { beforeFiles: [{ source: "/:key([a-f0-9]{32}).txt", destination: "/indexnow/:key.txt" }] };
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Stops a browser second-guessing a declared Content-Type. Uploads
          // are already extension-checked, but this is the defence that holds
          // if a file ever gets served with the wrong type anyway.
          { key: "X-Content-Type-Options", value: "nosniff" },

          // Send the full URL to ourselves, only the origin to other sites.
          // The default leaks admin URLs (ids and slugs included) in the
          // Referer of every outbound link an editor clicks.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

          // Clickjacking. `SAMEORIGIN` rather than `DENY` on purpose: the
          // Customizer and the preview screens frame the site's own pages, and
          // DENY would blank both.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Clickjacking plus two directives that never break a feature:
          // plugins are unused, and a forged <base> must not rewrite our
          // URLs. `script-src` is still omitted on purpose — administrators
          // inject analytics <script> tags, and a default script-src would
          // silently drop them on every site. Trusted Types would break the
          // same admin HTML path.
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },

          // Keeps this window's browsing context group to itself: a page
          // opened from here cannot script back through `window.opener`.
          // `allow-popups` (rather than plain same-origin) so a link opened
          // in a new tab still works as one. Nothing here relies on cross-
          // origin popups talking back, so it costs nothing.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },

          // Nothing here uses these, so nothing embedded should get them.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },

          // HSTS is deliberately production-only. On localhost it would pin
          // the browser to https://localhost and make dev unreachable, and the
          // pin outlives the header — a mistake here is not one you can undo
          // by removing the line.
          //
          // No `includeSubDomains` and no `preload`. Both reach beyond this
          // site: the first pins every subdomain of the owner's domain to
          // HTTPS (an http-only `mail.` or control-panel subdomain stops
          // opening), and the second asks for the domain to be baked into
          // browsers, which takes months to reverse. That is the owner's
          // decision to make at their DNS/CDN (Cloudflare has a switch for
          // it), not something a CMS should send on every site by default.
          ...(process.env.NODE_ENV === "production"
            ? [{
                key: "Strict-Transport-Security",
                value: "max-age=63072000",
              }]
            : []),
        ],
      },
      {
        // robots.txt already disallows these, but `Disallow` only asks a
        // crawler not to *fetch* a URL — it can still index one it finds
        // linked elsewhere, on the strength of the link alone. This is the
        // instruction that actually keeps the admin out of results.
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/bms-plugins.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
      {
        // Files in public/ are served with `max-age=0` by default, so a
        // visitor's browser asked for every uploaded image again on every
        // page and Cloudflare never kept one. See `images.minimumCacheTTL`
        // above for why a year is safe here.
        source: "/uploads/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      // Nothing here for `/_next/image`. Next does not apply `headers()` to
      // `/_next/*` at all: a `Vary: Accept-Encoding` was set here in 1.9.46 and
      // the live response still came back `vary: Accept`, not even merged.
      // The override lives in the managed `.htaccess` instead — see
      // `HTACCESS_PAGE_RULES` in `lib/htaccess.ts`, which is the only place
      // that can change what Cloudflare actually receives. Do not re-add it
      // here; it looks right and does nothing.
    ];
  },
};

// ── PageSpeed's "legacy JavaScript" ───────────────────────────────────────
//
// Next bundles `@next/polyfill-module` into the client entry, where it shims
// String.trimEnd, Array.flat/flatMap/at, Object.fromEntries/hasOwn,
// Promise.finally and URL.canParse. Lighthouse sees the shims, knows a
// current browser does not need them, and reports about 11 KiB of "legacy
// JavaScript". It is an unscored insight: it costs no download a modern
// browser would not have made anyway, and a millisecond or two of parse.
//
// It is dropped by default. An earlier note here said Next's own App Router
// calls `Object.hasOwn` and `URL.canParse`, so removing the shims would blank
// the page on older iPhones. Checked against a real build (2026-09-21): in
// every client chunk those names appear only where a polyfill defines them —
// this module, and Next's separate `polyfills-*.js`, which is `nomodule` and
// never loaded by a modern browser. Nothing calls them, nor `.at()` or the
// trim methods. What the code does call (`Object.fromEntries`, `flatMap`,
// `Promise.finally`) has been in Safari since 12 and Chrome since 73, the
// oldest browsers Next targets anyway. If a future Next or a new dependency
// starts relying on one of them, LEGACY_POLYFILLS=on puts the module back;
// re-run the grep (`grep -ohE ".{30}(hasOwn|canParse).{30}" -r .next/static/chunks`)
// after upgrading Next.
// An empty module that can stand in for anything the runtime never reaches.
const noop = fileURLToPath(new URL("./src/lib/noop-module.js", import.meta.url));

nextConfig.webpack = (config, { isServer, webpack, nextRuntime }) => {
  // Client: drop the legacy polyfill shim (see "legacy JavaScript" above).
  if (!isServer && process.env.LEGACY_POLYFILLS !== "on") {
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/[\\/]build[\\/]polyfills[\\/]polyfill-module(\.js)?$/, noop));
  }
  // Edge: errorLog imports pg which needs fs/path — unavailable in Edge.
  // The import is behind a NEXT_RUNTIME guard and is dead code in the Edge
  // bundle, but webpack resolves it before eliminating the dead branch.
  // resolve.alias can't catch it because Next resolves the @/ alias first.
  if (nextRuntime === "edge") {
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/[\\/]lib[\\/]errorLog/, noop));
  }
  return config;
};

export default nextConfig;
