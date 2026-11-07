// The public pages of BMS on Node (cPanel, VPS), rendered by Astro from BMS's
// own components and database code (../src) — the same front end as BMS on
// Cloudflare. Next stays the server: it routes every request, runs the
// middleware, serves the admin and the API, and asks this build for the HTML of
// public pages (src/app/bms-render). `npm run build` builds both.
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import bmsNextRoute from "./adapter/index.mjs";

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const shim = (name, file) => ({ find: new RegExp(`^${name.replace(/[/.]/g, "\\$&")}$`), replacement: at(`./shims/${file}`) });

// scripts/vanilla.ts as one minified string (virtual:bms-vanilla), for
// pages/[...path].astro to write into the page: the menu and the accordion then
// cost no request.
const vanillaScript = () => ({
  name: "bms-vanilla-script",
  resolveId: (id) => (id === "virtual:bms-vanilla" ? "\0virtual:bms-vanilla" : null),
  async load(id) {
    if (id !== "\0virtual:bms-vanilla") return null;
    const entry = at("./src/scripts/vanilla.ts");
    this.addWatchFile(entry);
    const out = await esbuild({ entryPoints: [entry], bundle: true, minify: true, format: "iife", target: "es2020", legalComments: "none", write: false });
    // Inside <script>: a "</script" in a string would end the element early.
    const code = out.outputFiles[0].text.trim().replace(/<\/(script)/gi, "<\\/$1");
    return `export default ${JSON.stringify(code)};`;
  },
});

export default defineConfig({
  output: "server",
  // First paint waits for no stylesheet request (PageSpeed: render-blocking).
  build: { inlineStylesheets: "always" },
  adapter: bmsNextRoute(),
  integrations: [react()],
  vite: {
    plugins: [vanillaScript()],
    resolve: {
      alias: [
        shim("@/lib/auth", "auth.ts"),
        shim("next/link", "link.tsx"),
        shim("next/dynamic", "dynamic.tsx"),
        shim("next/image", "image.tsx"),
        shim("next/navigation", "navigation.ts"),
        shim("next/headers", "headers.ts"),
        shim("next/cache", "cache.ts"),
        { find: /^@\/(.*)$/, replacement: at("../src/$1") },
      ],
    },
    // Tailwind's config and the PostCSS setup live with the Next app.
    css: { postcss: at("..") },
  },
});
