# Writing plugins for BMS

A plugin is a **tool that runs in the visitor's browser** — a calculator, a
converter, a checker, a quiz, a chart — packaged as a zip, installed from
Admin → Plugins, and placed in any post or page with a shortcode:

```
[bmi-calculator]
[bmi-calculator units="imperial"]
```

No rebuild. No re-upload of the site. Upload the zip, get the shortcode, use it.

This guide covers everything: what a plugin is made of, how it is rendered,
the JavaScript API, settings and attributes, which tools and frameworks to
use (and which not to), testing, packaging, and the rules that keep plugins
safe and fast.

---

## 1. What a plugin can and cannot do

**Can**
- Show anything HTML, CSS and JavaScript can show
- Take input, compute, draw, animate, fetch from *public* third-party APIs
- Have settings the site owner edits in the admin (colours, labels, limits)
- Take attributes from the shortcode, so one plugin serves many uses
- Store per-visitor state in `localStorage`
- Be placed many times on one page, each instance independent
- Work in RTL and LTR — it is told the page's language and direction

**Cannot**
- Run code on the server, add database tables, or add API routes. Those are
  *native* extensions: a folder in the CMS source that ships with a release
  (see §11). The plugin system is for tools that only need a browser.
- Read or change the rest of the page. Each plugin is isolated in its own
  shadow root; its CSS stays inside, and the site's CSS stays outside.

If your idea is "a form that emails the site owner" — that is the built-in
Forms feature, not a plugin. If it is "a tool that shows the visitor a
result" — plugin.

---

## 2. Anatomy of a plugin

Four files. Two are required.

```
my-tool/
├── plugin.json     ← required: name, slug, version, settings, attributes
├── index.html      ← required: the markup
├── style.css       ← optional: styles (isolated to this plugin)
└── script.js       ← optional: behaviour
```

Anything else you need — images, fonts, extra JS/CSS files — goes in the same
folder (subfolders are fine) and is available at `ctx.base + "file.png"`.

### plugin.json

```json
{
  "slug": "bmi-calculator",
  "name": "BMI Calculator",
  "version": "1.0.0",
  "description": "Body-mass index from height and weight.",
  "author": "Your name",
  "homepage": "https://example.com/bmi-plugin",
  "minHeight": "260px",
  "attributes": [
    { "name": "units", "label": "Default units: metric or imperial", "default": "metric" }
  ],
  "settings": [
    { "key": "accent",     "label": "Accent colour", "type": "color",  "default": "#0ea5e9" },
    { "key": "showScale",  "label": "Show the scale", "type": "toggle", "default": true },
    { "key": "buttonText", "label": "Button text",   "type": "text",   "default": "Calculate" }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `slug` | yes | Lowercase letters, digits, dashes. **This is the shortcode** and the folder name. Never change it after release — content uses it. |
| `name` | yes | Shown in the admin. |
| `version` | yes | Bump it on every release; it cache-busts your script. |
| `description`, `author`, `homepage` | no | Shown in the admin. |
| `minHeight` | no | CSS height reserved before your script runs, so the page does not jump. Set it to roughly your tool's height. |
| `attributes` | no | What the shortcode may pass: `[slug name="value"]`. Documented in the admin and offered in the editor's Plugin block. |
| `settings` | no | Fields the site owner edits once, in Admin → Plugins. Types: `text`, `textarea`, `number`, `toggle`, `select` (needs `options: [{value,label}]`), `color`. |
| `entry` | no | `{ "html": "...", "css": "...", "js": "..." }` if you name the files differently. |

**Attributes vs settings.** A *setting* is chosen once for the whole site
(brand colour, currency). An *attribute* varies per placement (`units`,
`product="pro"`, `title="…"`). Use both, as the sample does.

### index.html

Plain markup. No `<html>`, `<head>` or `<body>` — just the element(s) of your
tool. Use classes, not ids: the same plugin may appear twice on one page, and
ids must be unique.

```html
<div class="tool">
  <label>Amount <input name="amount" type="number" inputmode="decimal"></label>
  <button type="button" class="tool-go">Calculate</button>
  <p class="tool-out" aria-live="polite"></p>
</div>
```

Write the *initial* state into the HTML. It is server-rendered — search
engines and readers with JavaScript off see it — so it should make sense
before your script runs.

### style.css

Ordinary CSS. It applies **only inside your plugin**: the site's styles do
not reach in, yours do not leak out. So you can use simple class names
(`.tool`, `.row`) without worrying about collisions.

Two selectors specific to the plugin box:

```css
:host { /* the container itself */ }
:host([dir="rtl"]) .tool { direction: rtl; }   /* the page is right-to-left */
```

Design for both light and dark: use `rgba(0,0,0,.1)` borders rather than
`#eee`, and `prefers-color-scheme: dark` for anything that needs it. Use
`inherit` for text colour where you can — it then matches the site.

### script.js

Register a mount function. It runs once per instance on the page.

```js
BMS.plugin("bmi-calculator", (root, ctx) => {
  // root: this instance's shadow root. Query INSIDE it.
  const btn = root.querySelector(".tool-go");
  const out = root.querySelector(".tool-out");

  btn.addEventListener("click", () => {
    out.textContent = "…";
  });

  // Optional: return a cleanup function, run if the instance is removed.
  return () => {};
});
```

`BMS` is a global the site provides. The slug must match `plugin.json`.

---

## 3. The mount context (`ctx`)

| Property | What it is |
|---|---|
| `ctx.settings` | Values from Admin → Plugins → Settings, with your manifest defaults filled in. Toggles are booleans, numbers are numbers. |
| `ctx.attrs` | Attributes from the shortcode, as strings. `[slug units="imperial"]` → `{ units: "imperial" }`. An attribute with no value is `"true"`. |
| `ctx.lang` | Page language, e.g. `"en"`, `"ar"`, `"ur"`. |
| `ctx.dir` | `"ltr"` or `"rtl"`. |
| `ctx.base` | URL of your plugin folder, e.g. `/plugins/bmi-calculator/` — for your own images and files. |
| `ctx.host` | The container element, outside the shadow root (rarely needed). |
| `ctx.version` | Your installed version. |

Treat everything as untrusted text: `ctx.attrs` is typed by a content
author. Never build HTML from it with `innerHTML`; set `textContent`.

---

## 4. How rendering works (so you can reason about it)

1. When a page renders, the server finds `[slug …]` in paragraphs and HTML
   blocks (and Plugin blocks), reads your `index.html` and `style.css` from
   disk, and writes them into the page inside a **declarative shadow root**:
   ```html
   <div class="bms-plugin" data-plugin="bmi-calculator" data-bms="{…settings, attrs…}">
     <template shadowrootmode="open"><style>…</style>…your html…</template>
   </div>
   <script type="module" src="/bms-plugins.js"></script>
   <script type="module" src="/plugins/bmi-calculator/script.js?v=1.0.0"></script>
   ```
2. The browser attaches the shadow root while parsing — before any script —
   so your markup and styles are visible immediately. No flash of unstyled
   content.
3. `bms-plugins.js` (the runtime, ~2 KB) and your `script.js` load as
   modules. The browser runs each module URL once, no matter how many
   instances or shortcodes the page has.
4. Your `BMS.plugin(...)` call registers the mount; the runtime calls it for
   every instance, now and for any added later.

Consequences:
- **Your script is a module.** Top-level `await` works; variables are local
  to the file, not globals. To share something, put it inside your mount
  function or on `BMS` yourself.
- **One script, many instances.** Keep per-instance state inside the mount
  function (closures), never in module-level variables.
- **The CSS is per instance** but identical, so it costs the page the size of
  your stylesheet once per placement. Keep it lean.

---

## 5. Which framework to use

Short answer: **none, for most tools.** A calculator is thirty lines of plain
JavaScript. A plugin runs inside a page that has already loaded its own
framework; every kilobyte you add is paid by every visitor to every page that
uses your plugin.

| Tool | Use when | Notes |
|---|---|---|
| **Plain JS + CSS** | Almost always | Zero build step. Zip the folder, done. All the samples are written this way. |
| **Vite** (bundler) | Your tool grows past a few files, or you want TypeScript, imports, npm packages | Build to a single `script.js` (IIFE or ES module). See §7. |
| **Preact** (3 KB) | You genuinely need components and state | Bundle it with Vite; never load React. |
| **Alpine.js** (15 KB) | Declarative interactivity in the HTML with little JS | Load it from your own folder, not a CDN — see §9. |
| **Chart.js / other libs** | Charts, maths, dates | Bundle only what you use; check the size. |

**Do not use React or Vue directly.** The site is a React app, but your plugin
cannot share its React — loading a second copy adds ~40 KB and can misbehave.
Preact via Vite is the right substitute if you want that style.

**Do not load scripts from CDNs** at runtime. The site's security headers
allow it today, but it makes your plugin depend on a third party for every
page view and breaks offline testing. Copy the file into your plugin folder.

---

## 6. A complete plugin, step by step

Let's make a **tip calculator** with a setting and an attribute.

**plugin.json**
```json
{
  "slug": "tip-calculator",
  "name": "Tip Calculator",
  "version": "1.0.0",
  "description": "Bill + tip percentage, split between people.",
  "minHeight": "200px",
  "attributes": [{ "name": "tip", "label": "Default tip %", "default": "15" }],
  "settings": [{ "key": "currency", "label": "Currency symbol", "type": "text", "default": "$" }]
}
```

**index.html**
```html
<div class="tip">
  <label>Bill <input name="bill" type="number" inputmode="decimal" min="0" step="0.01"></label>
  <label>Tip % <input name="pct" type="number" inputmode="numeric" min="0" max="100"></label>
  <label>People <input name="people" type="number" inputmode="numeric" min="1" value="1"></label>
  <p class="tip-out" aria-live="polite">Enter a bill amount.</p>
</div>
```

**style.css**
```css
.tip { font: 15px/1.5 system-ui, sans-serif; display: grid; gap: 10px; max-width: 360px; padding: 16px; border: 1px solid rgba(0,0,0,.1); border-radius: 12px; }
.tip label { font-size: 13px; font-weight: 600; }
.tip input { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px; border: 1px solid rgba(0,0,0,.15); border-radius: 8px; font: inherit; }
.tip-out { margin: 4px 0 0; font-weight: 700; }
:host([dir="rtl"]) .tip { direction: rtl; }
```

**script.js**
```js
BMS.plugin("tip-calculator", (root, ctx) => {
  const $ = (s) => root.querySelector(s);
  const bill = $('input[name="bill"]');
  const pct = $('input[name="pct"]');
  const people = $('input[name="people"]');
  const out = $(".tip-out");
  const cur = ctx.settings.currency || "$";

  pct.value = parseFloat(ctx.attrs.tip) || 15;   // from [tip-calculator tip="20"]

  function update() {
    const b = parseFloat(bill.value), p = parseFloat(pct.value), n = Math.max(1, parseInt(people.value) || 1);
    if (!(b > 0)) { out.textContent = "Enter a bill amount."; return; }
    const tip = b * (p / 100), total = b + tip;
    out.textContent = `Tip ${cur}${tip.toFixed(2)} · Total ${cur}${total.toFixed(2)} · ${cur}${(total / n).toFixed(2)} each`;
  }
  [bill, pct, people].forEach((i) => i.addEventListener("input", update));
  update();
});
```

Zip the four files (the files themselves, or the folder — both work), upload
under Admin → Plugins, put `[tip-calculator]` in a post. Done.

---

## 7. Using Vite (when plain JS is not enough)

```bash
npm create vite@latest my-tool -- --template vanilla-ts
cd my-tool && npm install
```

`vite.config.ts` — build to one file with a fixed name:
```ts
import { defineConfig } from "vite";
export default defineConfig({
  build: {
    outDir: "dist",
    lib: { entry: "src/main.ts", formats: ["es"], fileName: () => "script.js" },
    rollupOptions: { output: { assetFileNames: "style.css" } },
    cssCodeSplit: false,
    minify: true,
  },
});
```

`src/main.ts`:
```ts
declare const BMS: { plugin(slug: string, fn: (root: ShadowRoot, ctx: PluginContext) => void | (() => void)): void };
interface PluginContext { settings: Record<string, unknown>; attrs: Record<string, string>; lang: string; dir: "ltr" | "rtl"; base: string; host: HTMLElement; version: string }

BMS.plugin("my-tool", (root, ctx) => {
  // ...
});
```

`npm run build` → copy `dist/script.js` (and `dist/style.css` if you import
CSS in TS) next to your `plugin.json` and `index.html`, zip, upload. Keep the
source in your own repo; the zip is a build artifact.

Preact with Vite: `npm i preact`, render into the shadow root:
```ts
import { render } from "preact";
BMS.plugin("my-tool", (root, ctx) => {
  const mount = root.querySelector(".mount")!;
  render(<App ctx={ctx} />, mount);
  return () => render(null, mount);
});
```

---

## 8. Testing locally

You do not need the CMS to develop. Make a `test.html` next to your files:

```html
<!doctype html>
<div class="bms-plugin" data-plugin="my-tool"
     data-bms='{"settings":{"currency":"€"},"attrs":{"tip":"20"},"lang":"en","dir":"ltr"}'
     data-base="./">
  <template shadowrootmode="open">
    <style>@import url("style.css");</style>
    <!-- paste index.html here -->
  </template>
</div>
<script type="module" src="https://YOUR-SITE/bms-plugins.js"></script>
<script type="module" src="script.js"></script>
```

Open it in a browser (with a local server — `npx serve .` — modules will not
load from `file://`). Change `dir` to `rtl` to check the Arabic layout. When it
looks right, zip and install for real.

For the real thing, install on the site and put the shortcode on a draft
post; Preview shows it before anything is published.

---

## 9. Rules and limits

The installer enforces these; know them so a zip is not rejected:

- Files allowed: `.html .css .js .mjs .json .md .txt .png .jpg .jpeg .webp .gif .svg .woff .woff2 .ico`. Nothing else.
- Zip up to **5 MB**, up to 300 files. Paths must stay inside the plugin folder.
- SVG files are sanitised (scripts and event handlers removed).
- `plugin.json` must have a valid `slug`, a `name`, and the HTML entry must exist.
- Uploading a zip with an existing slug **upgrades** it: files are replaced,
  settings the site owner chose are kept for keys that still exist.

And what the system guarantees you:

- Your CSS never affects the page and the page's CSS never affects you.
- Your script runs once per page, however many instances there are.
- Each instance gets its own `root`; nothing is shared unless you share it.
- Disabling a plugin turns its shortcodes back into plain text; removing it
  deletes its files. Content is never modified.

Things a plugin must not do, because it runs with the site's origin:
- Use `innerHTML` with anything from `ctx.attrs` or user input.
- Load remote scripts at runtime.
- Touch `document` outside your root (you *can*, but you should not).
- Ship large libraries you barely use.

---

## 10. Checklist before you publish

- [ ] `slug` is final — you will not be able to rename it later
- [ ] `version` bumped
- [ ] `minHeight` roughly right, so pages do not jump
- [ ] Works with two instances on one page
- [ ] Works with `dir="rtl"`
- [ ] Looks right in dark mode
- [ ] Initial HTML makes sense without JavaScript
- [ ] Inputs have labels; results use `aria-live`
- [ ] No `innerHTML` with untrusted data
- [ ] Total size under 100 KB unless there is a reason

---

## 11. When you really need the server: native extensions

A plugin that must store data, send email, call an API with a secret, or add
an admin screen is a change to the CMS itself. The pattern is what the
built-in blocks use:

```
src/lib/<feature>.ts                 logic
src/components/frontend/blocks/…     server-rendered block
src/components/editor/customBlocks   editor block + panel
src/app/api/<feature>/route.ts       API route
drizzle/000N_<feature>.sql           migration, if it needs a table
```

Register the block in `blockLibrary.ts` and `blockMeta.ts`, add it to
`PANEL_TYPES`. Then `npm run build` and ship a release. The App Info block is
a complete example of this shape.

---

## 12. Reference

**Shortcode syntax**
```
[slug]
[slug key="value" other='value' flag]
```
Attribute values may be double- or single-quoted or bare; a bare `flag` is `"true"`.
A shortcode is recognised when it is the whole content of a paragraph, or
anywhere inside an HTML block. Unknown or disabled slugs are left as text.

**Global**
```
BMS.plugin(slug, mountFn)           register; mountFn(root, ctx) → cleanup?
```

**Files served at**
```
/plugins/<slug>/<file>              your folder, cached one day
/bms-plugins.js                     the runtime
```

**Samples** in this folder: `plugins/bmi-calculator` (complete, with
settings and attributes) and `plugins/starter` (the smallest useful plugin —
copy it to begin).
