// The smallest Astro adapter: the build is one module that exports
// `render(request) → Response`, called by the Next route that serves public
// pages (src/app/bms-render/[[...path]]/route.ts). Next keeps the server, the
// routing, the middleware (redirects, maintenance, LiteSpeed headers) and the
// admin; Astro only turns a page into HTML. One process per site, as before.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every .mjs under `dir`. */
function files(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith(".mjs"))
    .map((e) => join(e.parentPath ?? e.path, e.name));
}

export default function bmsNextRoute() {
  let config;
  return {
    name: "bms-next-route",
    hooks: {
      "astro:config:done": ({ config: c, setAdapter }) => {
        config = c;
        setAdapter({
          name: "bms-next-route",
          entrypointResolution: "auto",
          serverEntrypoint: new URL("./entry.mjs", import.meta.url),
          supportedAstroFeatures: { serverOutput: "stable", staticOutput: "unsupported", hybridOutput: "unsupported", sharpImageService: "unsupported" },
        });
      },
      // The server build names the building PC's folder (the manifest's dirs, module-id
      // comments, script keys) — a user name in every shipped zip. None of it is read as a
      // real path at runtime, so it becomes /app/ everywhere, the same in every file (keys still match).
      "astro:build:done": () => {
        const project = fileURLToPath(new URL("..", config.root));
        const plain = project.replace(/\\/g, "/").replace(/\/?$/, "/");
        const url = pathToFileURL(project).href.replace(/\/?$/, "/");
        const forms = [[new RegExp(escape(url), "gi"), "file:///app/"], [new RegExp(escape(plain), "gi"), "/app/"]];
        for (const f of files(fileURLToPath(config.build.server))) {
          const before = readFileSync(f, "utf8");
          const after = forms.reduce((s, [re, to]) => s.replace(re, to), before);
          if (after !== before) writeFileSync(f, after);
        }
      },
    },
  };
}
