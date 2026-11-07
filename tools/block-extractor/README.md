# BMS Block Extractor

A WordPress plugin that exports **one block instance exactly as it renders** — its HTML, every CSS rule that actually matches it, its attribute JSON, its assets, and its measured layout at three widths.

Companion to [kadence-feature-dump](../kadence-feature-dump/), which documents what a plugin *registers*. This one captures what a block *is* on a real page.

## Install

WordPress admin → **Plugins → Add New → Upload Plugin** → `bms-block-extractor.zip` → Activate.

Two entry points appear:

- **Tools → Block Extractor** — the full capture.
- A **download icon** in every block's toolbar in the editor — quick copies.

## How it works

The plugin loads the chosen page's real front end in an iframe with `?bms_capture=1` (nonce + `edit_posts` required). In that mode every block that renders is stamped with a `data-bms-uid` on its outermost element, and a uid → name/attributes map is printed in the footer.

A script then walks the DOM **with the real cascade in effect** and reads back:

| What | How |
|---|---|
| Matched CSS | Every rule in every readable stylesheet is tested with `element.matches()` against the block's subtree. Pseudo-elements and states are stripped **only to test** the selector — the rule text is kept whole, so `:hover` and `::before` survive. |
| Responsive CSS | Rules inside `@media` / `@supports` / `@container` are kept with their condition regardless of the current viewport, so one pass gets every breakpoint. |
| Context CSS | Rules matching an *ancestor* of the block are kept separately, because that is where inherited fonts, container widths and `:root` custom properties live. |
| Computed styles | ~110 curated properties per node, **diffed against the browser's own defaults** for that tag (measured in a blank iframe) so UA noise is dropped. |
| Measurements | The iframe is given a real CSS width of 1440 / 810 / 390 px in turn. Transforms scale it visually only, so layout and media queries stay honest. |

## What comes out

```
kadence-rowlayout-20260824-003412-a7f2k9/
  README.md            block summary, nested outline, limits
  markup.html          the block as rendered, outer element included
  styles.css           matched rules, grouped by condition into real nested blocks
  block.json           editor attributes for this block and every nested block
  variables.json       CSS custom properties resolved on the block root
  computed-desktop.json
  computed-tablet.json
  computed-mobile.json per-node styles + box sizes at each width
  assets.json          images (natural vs rendered size), backgrounds, fonts, media
  scripts.json         page scripts + every data-/aria-/role attribute in the block
  bundle.json          all of it, unsplit
```

Written to `wp-content/uploads/bms-block-extractor/<slug>/` and zipped when `ZipArchive` is available.

**Copy Markdown** puts attributes + markup + CSS + measurements on the clipboard as one fenced document — that is the paste-into-chat path.

## Limits, stated plainly

- **JavaScript behaviour is described, not extracted.** `scripts.json` tells you which scripts loaded and which `data-` attributes the block carries. Sliders, accordions and lightboxes still need reimplementing — you cannot carve one block's logic out of a shared bundle.
- **The editor sidebar UI is not extractable.** Those panels are the plugin's own React build. `block.json` gives you the *data* behind every control, which is the useful half.
- **Cross-origin stylesheets can't be read** (Google Fonts, some CDNs). Their URLs are listed at the bottom of `styles.css`.
- **Dynamic blocks** (query loops, forms) snapshot one render, not the query behind it.
- Computed styles cap at 120 nodes and markup at 400 KB per block; both are noted in the output when hit.

## Safety

Read-only against your site — no option, setting or post is written. The only writes are the export bundles under `uploads/`. Capture mode requires a valid nonce *and* `edit_posts`, so a bare `?bms_capture=1` from a logged-out visitor does nothing.
