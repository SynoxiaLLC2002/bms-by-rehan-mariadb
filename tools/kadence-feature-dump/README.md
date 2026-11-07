# Site Feature Dump

A read-only WordPress plugin that enumerates everything the active theme and plugins register, and hands it to you as Markdown you can paste into a chat.

Built to document **Kadence**, **Rank Math** and **LiteSpeed Cache** feature-by-feature so those features can be rebuilt elsewhere.

## Install

WordPress admin → **Plugins → Add New → Upload Plugin** → `kadence-feature-dump.zip` → Activate.
Then **Tools → Feature Dump**.

It never writes an option, setting or post. Reads only.

## The six scopes

| Scope | What it gives you |
|---|---|
| **1 · Customizer index** | Table of every Panel › Section with its Section ID and control count. Start here — it's small enough to paste whole. |
| **2 · Customizer detail** | Every control in the matching sections: label, type, id, description, choices, `input_attrs`, and each setting's default **and** current value. Marks `postMessage` settings, i.e. the ones Kadence previews live. Use a filter — unfiltered this is enormous. |
| **3 · Admin screens** | Every top-level and submenu admin page with its slug. This is the closest thing to a map of a plugin's *workflow* — it shows which screens exist and how they nest. Plus menu locations, widget areas, post types, plugin list. |
| **4 · Blocks & shortcodes** | Every registered block with its category and attribute names (for Kadence Blocks this *is* the feature list), plus all shortcodes. |
| **5 · Theme mods** | The raw stored values the theme keeps — where Kadence actually persists its Customizer state. |
| **6 · Plugin data** | Per product: post types, **per-post meta keys with usage counts**, REST routes, and stored option rows. This is how you see what Rank Math stores against each post, or what LiteSpeed's config looks like. |

## Getting a specific feature documented

1. Scope **1**, no filter → copy → find the Section ID you care about (e.g. `kadence_customizer_header_search`).
2. Scope **2**, filter = that id → copy. You now have every control in that section with its exact type and current value.

For a plugin rather than the theme, use scope **6** with the **Product** dropdown. The **Filter** box narrows option keys and meta keys too, so `rank_math_title` or `litespeed.conf.cache` works.

**Extra option prefix** lets you dump any other plugin's rows without editing the code — type `elementor`, `wpforms`, whatever.

## Notes

- Customizer objects only exist once `customize_register` has fired, which normally happens only on the Customizer screen. The plugin builds its own `WP_Customize_Manager` and fires that hook so the theme declares everything. If a theme callback assumes it's inside the real Customizer, you'll get an error line in the output rather than a white screen.
- Long serialized values are truncated at 1200 characters and deep arrays at 8 levels, so one giant blob can't swamp the dump. Use **Download JSON** if you need the untruncated tree.
- Option and meta queries are capped at 400 and 500 rows.
- The character count above the textarea tells you how big a paste will be before you make it.
