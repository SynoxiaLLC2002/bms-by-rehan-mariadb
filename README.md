# BMS by Rehan — MariaDB edition

A content management system for fast content sites: block editor, SEO tools, menus, forms and a Claude connector. This edition runs on an ordinary Node.js host (cPanel "Setup Node.js App", Plesk or a VPS) with a MariaDB or MySQL database. Public pages are rendered by Astro.

Version 2.0.3.

## What you need

- Node.js 22 on the host
- A MariaDB or MySQL database (cPanel's MySQL Databases screen is enough)

## Install

1. Upload the files to your Node.js app folder and run **NPM Install**.
2. Copy `release/env.example` to `.env.local` and fill it in: the database address, `AUTH_SECRET` and your site address. The file explains each value.
3. Start the app and open `/admin/setup` to create the first admin account.

`release/README.md` has the longer guide for shared hosting and VPS setups. Parts of it were written for the older Postgres version: where it says Postgres, use MariaDB or MySQL.

## Updating

Upload the new files over the old ones, keep your `.env.local`, run **NPM Install**, then restart the app.

## License

All rights reserved. You may read this code; using, copying or redistributing it needs written permission from the author.
