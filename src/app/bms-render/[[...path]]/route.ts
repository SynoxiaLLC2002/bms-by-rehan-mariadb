// Public pages rendered by Astro (astro/, built into astro/dist by `npm run build`).
//
// The middleware rewrites a visitor's request for a page here, with all its
// usual work done first — redirects, maintenance, language, the LiteSpeed and
// Cloudflare cache headers — so Next keeps every rule it had and only the HTML
// changes: the same page, without React's second copy of it (the RSC payload,
// most of a page's weight) and without React in the browser for the menu and
// the FAQ. Visitors cannot open this address themselves (middleware.ts).
//
// Anything Astro does not answer — no such page, an archive, an error, or no
// Astro build at all — comes back as `x-bms-next`, and server.js asks Next for
// the same request again, the way it was always rendered.
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const dynamic = "force-dynamic";

const ENTRY = path.join(process.cwd(), "astro", "dist", "server", "entry.mjs");
const PREFIX = "/bms-render";

type Astro = { render: (request: Request) => Promise<Response> };
let loaded: Promise<Astro | null> | null = null;
function astro(): Promise<Astro | null> {
  loaded ??= existsSync(ENTRY)
    ? (import(/* webpackIgnore: true */ pathToFileURL(ENTRY).href) as Promise<Astro>).catch((err) => {
        console.error("[bms] astro build could not be loaded; pages render with Next", err);
        return null;
      })
    : Promise.resolve(null);
  return loaded;
}

const toNext = () => new Response(null, { status: 404, headers: { "x-bms-next": "1", "Cache-Control": "no-store" } });

async function handle(req: Request): Promise<Response> {
  const app = await astro();
  if (!app) return toNext();
  const url = new URL(req.url);
  url.pathname = req.headers.get("x-bms-path") || url.pathname.slice(PREFIX.length) || "/";
  let res: Response;
  try {
    res = await app.render(new Request(url, { method: "GET", headers: req.headers }));
  } catch (err) {
    console.error("[bms] astro render failed", url.pathname, err);
    return toNext();
  }
  // A redirect the page asked for (an old slug) goes out as it is; anything
  // else that is not a page is Next's to answer.
  if (res.headers.has("x-bms-next") || (res.status !== 200 && (res.status < 300 || res.status > 308))) return toNext();
  const headers = new Headers(res.headers);
  // The middleware's Cache-Control and LiteSpeed headers apply, not Astro's.
  headers.delete("cache-control");
  return new Response(req.method === "HEAD" ? null : res.body, { status: res.status, headers });
}

export const GET = handle;
export const HEAD = handle;
