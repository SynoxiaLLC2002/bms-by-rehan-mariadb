// Link prefetch for the links inside content.
//
// Next prefetches its own <Link>s when they scroll into view, but the links an
// author writes into a post are plain anchors, and those wait for the click.
// Between hovering a link and clicking it there are typically 200–400 ms of
// nothing; fetching the page in that gap makes the click land on a page that
// is already in the browser's cache. The same trick instant.page and WP
// Rocket's "preload links" use.
//
// Three modes (Speed → Page optimisation): `hover` fetches on mouseover /
// touchstart, `viewport` fetches every eligible link as it scrolls into view
// — more bytes, and the click is instant even on a phone with no hover —
// and `prerender`, which hands the URL to the browser's Speculation Rules
// API on hover. A prerender is not a download: the browser builds the whole
// next page, its scripts and its paint included, out of sight, so the click
// swaps in a finished page and costs no navigation at all. Chromium only;
// everywhere else it falls back to the prefetch link the other modes use.
//
// Cautious on purpose: same origin only, no admin/API/feed/asset URLs, never
// on a data-saver or 2G connection, each URL once, and any path the owner
// listed under "Never prefetch" is skipped.
//
// And never a Next <Link> — menus, post cards, archives, pagination. Those
// open client-side, so the HTML fetched for them was thrown away (and in
// prerender mode Chrome built the whole page out of sight for nothing); in
// viewport mode that was every visible menu link on every page view. React
// keeps an element's props on its DOM node, and only a Link gives an anchor
// a click handler, so `spa()` tells the two apart. Next prefetches its own.

import { escapeRegExp } from "@/lib/speed";

export type PrefetchMode = "hover" | "viewport" | "prerender" | "off";

/** Path patterns (`/shop`, `/downloads/*`) as one regex source for the script. */
function excludeSource(patterns: string[]): string {
  if (patterns.length === 0) return "";
  return patterns
    .map((raw) => {
      const p = raw.startsWith("/") || raw.startsWith("*") ? raw : `/${raw}`;
      const body = p.split("*").map(escapeRegExp).join(".*");
      return p.includes("*") ? `^${body}$` : `^${body}(/|$)`;
    })
    .join("|");
}

const CORE = `var c=navigator.connection;if(c&&(c.saveData||/2g/.test(c.effectiveType||'')))return;
var done={},t,ex=__EXCLUDE__;
function ok(a){if(!a||!a.href||a.origin!==location.origin||a.target&&a.target!=='_self')return false;var p=a.pathname;if(p===location.pathname)return false;if(/^\\/(admin|api|preview|og|site|indexnow|uploads|_next|plugins|fonts)(\\/|$)/.test(p))return false;if(/\\.(xml|txt|jpe?g|png|webp|avif|gif|svg|pdf|zip|apk|mp4|mp3|woff2?)$/i.test(p))return false;if(a.hasAttribute('download')||/\\bno-?prefetch\\b/.test(a.rel||''))return false;if(ex&&ex.test(p))return false;if(spa(a))return false;return true}
function spa(a){var ks=Object.keys(a);for(var i=0;i<ks.length;i++){if(ks[i].indexOf('__reactProps')===0){var pr=a[ks[i]];return !!(pr&&pr.onClick)}}return false}`;

/** The cheap one: ask the browser for the bytes and nothing more. */
const GO_PREFETCH = `function go(a){var u=a.pathname+a.search;if(done[u])return;done[u]=1;var l=document.createElement('link');l.rel='prefetch';l.href=u;l.as='document';document.head.appendChild(l)}`;

// Prerender runs the next page in full — its scripts, its network calls, its
// analytics. Two at a time is Chrome's own budget for a non-eager rule, and
// it is the point of the cap here too: a visitor sweeping the mouse across a
// menu must not start ten hidden page loads. Past the cap, and in every
// browser without the API, this degrades to the same prefetch as above.
const GO_PRERENDER = `var sr=typeof HTMLScriptElement!=='undefined'&&HTMLScriptElement.supports&&HTMLScriptElement.supports('speculationrules'),np=0;
function go(a){var u=a.pathname+a.search;if(done[u])return;done[u]=1;
if(sr&&np<2){np++;var s=document.createElement('script');s.type='speculationrules';s.textContent=JSON.stringify({prerender:[{source:'list',urls:[u]}]});document.head.appendChild(s);return}
var l=document.createElement('link');l.rel='prefetch';l.href=u;l.as='document';document.head.appendChild(l)}`;

const HOVER = `document.addEventListener('mouseover',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!ok(a))return;clearTimeout(t);t=setTimeout(function(){go(a)},65)},{passive:true});
document.addEventListener('mouseout',function(){clearTimeout(t)},{passive:true});
document.addEventListener('touchstart',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(ok(a))go(a)},{passive:true});`;

// Viewport mode: each link once, when at least half of it is visible and it
// has stayed there a moment — a fast scroll past a list should not fetch it.
const VIEWPORT = `var io=new IntersectionObserver(function(es){es.forEach(function(en){var a=en.target;if(en.isIntersecting){a._pf=setTimeout(function(){if(ok(a))go(a)},300)}else if(a._pf){clearTimeout(a._pf);a._pf=0}})},{threshold:0.5});
function watch(root){var as=root.querySelectorAll('a[href]');for(var i=0;i<as.length;i++)if(ok(as[i]))io.observe(as[i])}
watch(document);
new MutationObserver(function(ms){ms.forEach(function(m){for(var i=0;i<m.addedNodes.length;i++){var n=m.addedNodes[i];if(n.nodeType===1)watch(n)}})}).observe(document.body,{childList:true,subtree:true});`;

/** The script for a mode, or an empty string when prefetch is off. */
export function prefetchScript(mode: PrefetchMode, exclude: string[] = []): string {
  if (mode === "off") return "";
  const ex = excludeSource(exclude);
  const core = CORE.replace("__EXCLUDE__", ex ? `new RegExp(${JSON.stringify(ex)},'i')` : "null");
  const go = mode === "prerender" ? GO_PRERENDER : GO_PREFETCH;
  // Prerender is a hover decision. Firing it at everything that scrolls past
  // would have a phone rendering half the site, so it shares hover's trigger.
  const trigger = mode === "viewport" ? VIEWPORT : HOVER;
  return `(function(){\nif(!('IntersectionObserver' in window))return;\n${core}\n${go}\n${trigger}\n})();`;
}

