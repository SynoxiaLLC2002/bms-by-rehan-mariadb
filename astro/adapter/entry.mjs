// Built into astro/dist/server/entry.mjs: what the Next route imports.
import { createApp } from "astro/app/entrypoint";

// Not streamed: the Next route hands the whole document to server.js, which
// rewrites its <head> (inline stylesheets, head scripts) before sending.
const app = createApp({ streaming: false });

export function render(request) {
  return app.render(request);
}
