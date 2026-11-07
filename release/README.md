# BMS by Rehan — CMS

A content management system built on Next.js 15, React 19, Drizzle and Postgres.
This is a clean copy: no posts, no pages, no media, no users. Installing it
gives you an empty site and a setup screen.

It runs on **shared hosting with a Node.js app manager** (cPanel, Plesk), on a
**VPS**, and on **Vercel**. Pick your section below.

---

## What you need, whichever host

1. **Node.js 18.18 or newer** (20 recommended).
2. **A Postgres database.** Any of these:
   - your host's own Postgres, if cPanel/Plesk offers one;
   - [Neon](https://neon.tech) — free, nothing to install, works from anywhere;
   - Postgres installed on your VPS.

   MySQL will not work — this CMS is Postgres only.

3. The values for `.env.local`. Copy `.env.example`, fill in at least:

   | Variable | What |
   |---|---|
   | `DATABASE_URL` | the Postgres connection string |
   | `AUTH_SECRET` | 32 random bytes, base64 — the file says how to make one |
   | `NEXTAUTH_URL` | the site's **public** address, e.g. `https://example.com` |
   | `AUTH_TRUST_HOST` | `true` (anywhere except Vercel) |
   | `NEXT_PUBLIC_SITE_URL` | same as `NEXTAUTH_URL` |

---

## Shared hosting (cPanel "Setup Node.js App", Plesk, or similar)

The important thing about shared hosting: **build on your own computer, upload
the result.** Shared accounts have small memory limits and a Next.js build will
usually be killed part-way through. Everything else is ordinary.

### On your computer

The build **reads the database** — it pre-renders the blog, categories and
posts as static HTML — so the database has to exist and be reachable from your
computer before you build. That also means you create the tables from here.

```bash
cp .env.example .env.local     # Windows: copy .env.example .env.local
```

Fill in `.env.local` with the **production** values: the database the live site
will use, and `NEXTAUTH_URL` / `NEXT_PUBLIC_SITE_URL` set to the real domain.

```bash
npm install
npm run db:migrate             # creates the tables in that database
npm run build                  # pre-renders from it
npm run check                  # boots the build and tests it (optional, 30s)
npm run pack                   # makes upload.zip
```

`npm run check` starts the built site on a spare port and verifies the pages,
the sitemap, the security headers and the admin gates — the things that fail
without any error message. If it prints FAIL, do not upload.

> If your host's Postgres only accepts connections from the host itself, the
> build cannot reach it. Either whitelist your IP in cPanel's *Remote Database
> Access*, or use a hosted database such as Neon, which is reachable from
> anywhere. This is the one thing that cannot be worked around by uploading.

`npm run pack` writes **`upload.zip`** in the project folder. It contains
exactly what the host needs — the build, `server.js`, the migrations and the
config files — with correct Linux permissions written into it, and never
includes `node_modules`, `.env.local` or the build cache.

> Do not zip the folder yourself with Windows. A Windows-made zip has no Linux
> permissions, and the host then creates folders it cannot read: the site 503s
> with `EACCES: permission denied` on a perfectly good build.

### On the host

0. **Upload the code.** File Manager → your home folder → *+ Folder* named
   after the site (say `bms`) → open it → *Upload* → `upload.zip` → when it
   reaches 100%, go back → right-click the zip → *Extract* → delete the zip.
   Turn on *Settings → Show Hidden Files* first, or you will not see `.next`.

1. **Create the app.** cPanel → *Setup Node.js App* → *Create Application*:
   - Node.js version: **20** (18.18 minimum)
   - Application mode: **Production**
   - Application root: the folder you uploaded to (e.g. `bms`)
   - Application URL: your domain
   - Application startup file: **`server.js`**

2. **Environment variables.** In the same screen, add every line from your
   `.env.local` as a variable — `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL`,
   `AUTH_TRUST_HOST`, `NEXT_PUBLIC_SITE_URL`. (Alternatively upload `.env.local`
   itself into the app root; both work.)

3. **Install dependencies.** Click *Run NPM Install*, or in the terminal the
   panel gives you:
   ```bash
   npm install --omit=dev
   ```

4. **Check the database from the host** (the tables already exist — you made
   them from your computer — so this should say *up to date*):
   ```bash
   npm run db:migrate
   ```
   If it cannot connect, the message says why — almost always the host blocking
   outbound connections to an external database (ask support to allow port
   5432, or use the host's own Postgres).

5. **Start** (or *Restart*) the application from the panel.

6. Open `https://yourdomain.com/admin/setup` and create your administrator. Have an authenticator app on your phone ready (Google Authenticator, Microsoft Authenticator, Authy…): two-factor sign-in is part of setup and cannot be skipped — the first account owns the site, and the app is also how you reset a forgotten password before email is set up.

### Shared-hosting things to know

- **Put a CDN in front of it before you tune anything else.** If the domain is
  on Cloudflare, Admin → Speed → Cloudflare → Apply builds a cache rule that
  serves pages and optimised images from the edge and excludes the admin, the
  API, previews, any request carrying a sign-in cookie and anything with a
  query string. Without it, every page view is a full server render and every
  image a fresh resize — which is what takes CPU to 100% on shared hosting.
  Measured on a live site: 0.41s from the edge against 1.04s from the origin.

- **The first visit after a quiet spell is slow.** Passenger stops idle apps
  and restarts them on demand; expect 3–10 seconds on that one request. Set
  the app's *idle time* / *max pool idle time* as high as the host allows, and
  run the keep-alive cron every 15 minutes (see `CRON_TOKEN` in env.example).

- **Never put `pkill -f lsnode` on a short schedule.** It is sometimes
  suggested as a cure for LiteSpeed's worker processes accumulating, and every
  five minutes it will kill your live site around the clock. The symptoms are
  brutal to diagnose — clean restarts, nothing in any log, no crash — because
  SIGTERM is a polite kill and the process exits normally. If you ever chase
  "the site keeps going down", read the cron list before you read anything
  else. Fix the load with edge caching instead; once the origin is not
  rendering every request, the pressure that made this look necessary is gone.
- **If the site shows a 503**, open `startup.log` in the app folder (File
  Manager → the app folder → right-click → View). `server.js` writes what
  went wrong there in plain words, because this kind of host usually shows
  nothing else. The file grows on every start; delete it for a clean read.
- **If images give a 500** after deploying, add the variable
  `IMAGE_OPTIMIZATION=off` and restart. The host could not run `sharp`; the
  site will serve original images instead.
- **Keep `DB_POOL_MAX` at the default (5).** Shared accounts get a small number
  of database connections and the default is sized for that.
- **One Node app per site.** Most panels allow only a few per account.
- **Uploads are stored in `public/uploads`** on the host's disk. Back that
  folder up — the content export in Settings does not include image files.

### Updating on shared hosting

On your computer, with `.env.local` still pointing at the live database:

```bash
npm install
npm run db:migrate      # applies anything new; says "up to date" otherwise
npm run build
npm run pack
```

Upload the new `upload.zip` into the app folder and extract it over the old
files — **`public/uploads` and `.env.local` are untouched**, the zip never
contains them — then on the host:

```bash
npm install --omit=dev
```

and *Restart* from the panel. Back up first: Settings → Export, and a copy of
`public/uploads`.

---

## VPS (Ubuntu/Debian, nginx, pm2)

Everything builds on the server here — a VPS has the memory for it.

```bash
# once: Node 20 and pm2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# the app
git clone <your repo> bms && cd bms      # or upload and unzip
cp .env.example .env.local               # then edit it
npm install
npm run db:migrate
npm run build
pm2 start npm --name bms -- start
pm2 save && pm2 startup                  # restart on reboot
```

nginx in front, for HTTPS and the domain:

```nginx
server {
    server_name example.com;
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Forwarded-Host  $host;
    }
}
```

then `sudo certbot --nginx -d example.com` for the certificate.

MariaDB on the same box: `DATABASE_URL=mysql://bms:pass@localhost:3306/bms`
in `.env.local`. Raise `DB_POOL_MAX` to 10–20.

### Updating on a VPS

```bash
cd bms
git pull                 # or upload the new files over the old ones
npm run deploy           # install → migrate → build, in that order
pm2 restart bms
```

---

## Vercel

Import the repository, add the environment variables, and set
`BLOB_READ_WRITE_TOKEN` — Vercel's disk is read-only, so uploads must go to
Blob. Use a Neon database. Run `npm run db:migrate` once from your computer
against the production `DATABASE_URL`; after that, every schema change is a
migration you run the same way before pushing the code that needs it.

---

## Before you announce the site

| Where | What | Why it matters |
|---|---|---|
| Settings → Site URL | your real domain | Otherwise every canonical tag, `og:url` and sitemap entry points at localhost, and search engines index it that way. Nothing warns you. |
| Settings → Site Name | your site's name | Used in titles, Open Graph and structured data. |
| Customizer → Single Post | comments, tags, related, prev/next | All **off** by default. |
| cPanel → Cron Jobs | every 5 min: `curl -s "https://yourdomain.com/api/cron/publish?token=…" >/dev/null` | Makes scheduled posts go live on time, pings search engines, keeps the app awake. Token = `CRON_TOKEN` (falls back to `BACKUP_TOKEN` while unset — Site Health warns; give the cron its own). |

---

## About the database

`npm run db:migrate` applies every file in `drizzle/` that this database has not
seen, records what it applied in a `cms_migrations` table, and runs each file in
a transaction so a failure rolls back rather than leaving half a schema behind.
Safe to run repeatedly; if there is nothing to do, it says so. Exits non-zero on
failure, so it is safe to chain in a deploy script.

The site also runs the same check itself every time it starts (`server.js`), so
uploading a new version and restarting the app applies its migrations without a
terminal on the host. `startup.log` records what was applied; if a file fails the
site still starts, Site Health names the file, and `npm run db:migrate` reports
the error in full.

**Do not use `drizzle-kit migrate`** — it tracks migrations through a journal
this project does not keep, so it applies nothing and still exits 0.

`drizzle/0000_init.sql` is generated from `src/lib/db/schema.ts`. The later
files are hand-written and hold what Drizzle cannot express: the full-text
search column and its index, the comment target constraint, and several
indexes. All are needed — without `0001` the search box silently returns
nothing.

---

## Backups

- **Content** — Settings → Export. One file; restore through Settings → Import.
  Import matches on natural keys (email, slug, URL), so re-importing updates
  rather than duplicating.
- **Media** — the media backup in Settings, or copy `public/uploads`.
- Take both before any update.

## Layout

```
src/app/(site)/      the public site
src/app/(admin)/     the admin, at /admin
src/app/api/         REST endpoints
src/components/      frontend/ and admin/ components
src/lib/             database, auth, SEO, settings, permalinks
drizzle/             database migrations — these ARE the schema
scripts/             db-migrate.mjs
server.js            startup file for Passenger / cPanel / Plesk
```

## Plugins

Tools that run in the visitor's browser — calculators, converters, checkers —
installed as a zip under **Admin → Plugins** and placed anywhere with a
shortcode: `[bmi-calculator]`. No rebuild, no re-upload. Each plugin is
isolated (its CSS cannot affect the site or vice versa), server-rendered for
search engines, and has settings the site owner edits in the admin.

Two samples ship in `plugins-samples/` — upload `bmi-calculator.zip` to see
one working, copy `starter/` to write your own. **`PLUGINS.md` is the full
developer guide**: file layout, the JavaScript API, settings and attributes,
which frameworks to use, testing and packaging.

Installed plugins live in `plugins/` next to the app. Back that folder up
along with `public/uploads`.

## Roles

- **admin** — everything, including users, settings, menus, redirects, forms
  and reusable elements.
- **editor** — posts, pages, categories, tags, media and comments; cannot
  change site structure or other people's accounts.
- **author** — writes and publishes **their own posts only**. No pages, no
  moderation, no access to anyone else's work. The admin shows them Posts,
  Media and their own profile. For a team of writers or students.

New accounts default to **editor**.

## Forgotten passwords

*Forgot your password?* on the login page emails a one-hour reset link. It
needs SMTP configured (see `.env.example`); without it the page says so, and
an administrator sets the password from Users instead.
