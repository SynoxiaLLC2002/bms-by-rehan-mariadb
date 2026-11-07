// Delaying injected scripts until the visitor does something.
//
// Analytics, pixels and chat widgets are the usual reason a fast page scores
// badly: they are third-party JavaScript that the browser downloads and runs
// before it can finish painting, and none of them need to run before the
// visitor has even moved. The technique here is the one caching plugins use:
// the scripts are put on the page as inert text, and a few lines of inline
// code turn them into real scripts on the first scroll, tap, key or mouse
// movement — or after a few seconds regardless, so a visitor who just reads
// is still counted.
//
// It changes nothing about what the scripts do, only when they start. A tag
// that must run immediately (rare — a consent manager, say) can opt out with
// `data-no-delay` on its <script>.

const ATTR = "data-bms-delay";

/**
 * Rewrites `<script …>` tags so they do not execute on load.
 *
 * Attributes are kept; `type` is replaced with text/plain so the browser
 * ignores the element, and the original type (if any) is saved to restore.
 * Tags marked `data-no-delay` and JSON blocks (`application/ld+json`,
 * `importmap`) are left exactly as they are.
 */
export function delayScriptsIn(html: string, exclude: string[] = []): string {
  if (!html || !/<script/i.test(html)) return html;
  // Whole tags, so an exclusion can match the inline code as well as the src.
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (whole, attrs: string, body: string) => {
    if (/data-no-delay/i.test(attrs)) return whole;
    // Speed → Page optimisation → "Never delay": a consent manager, a tag the
    // page's own code calls on load.
    if (exclude.some((needle) => attrs.includes(needle) || body.includes(needle))) return whole;
    const typeMatch = attrs.match(/\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const type = (typeMatch?.[1] ?? typeMatch?.[2] ?? typeMatch?.[3] ?? "").trim().toLowerCase();
    if (type && !/^(text\/javascript|application\/javascript|module)$/.test(type)) return whole;
    const rest = typeMatch ? attrs.replace(typeMatch[0], "") : attrs;
    const saved = type ? ` data-bms-type="${type}"` : "";
    return `<script type="text/plain" ${ATTR}${saved}${rest}>${body}</script>`;
  });
}

/**
 * Adds `defer` to external scripts that asked for neither `async` nor `defer`
 * (Speed → Page optimisation → "Defer head scripts"). A plain `<script src>`
 * in the head stops HTML parsing until it has downloaded and run; deferred,
 * it runs after the document is parsed, in order. Inline and module scripts
 * are left alone — inline cannot defer, modules already do.
 */
export function deferScriptsIn(html: string): string {
  if (!html || !/<script/i.test(html)) return html;
  // Only external scripts that come AFTER the last inline one. Deferring
  // `<script src="jquery.js">` while the inline `jQuery(...)` after it still
  // ran immediately broke the most common pattern there is ("jQuery is not
  // defined"). An inline script cannot be deferred, so anything it might
  // depend on — every external before it — has to stay where it is.
  let lastInline = -1;
  const tagRe = /<script\b([^>]*)>/gi;
  let t: RegExpExecArray | null;
  while ((t = tagRe.exec(html))) {
    const attrs = t[1];
    const type = (attrs.match(/\stype\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? "").toLowerCase();
    const executable = !type || type === "text/javascript" || type === "application/javascript";
    if (!/\ssrc\s*=/i.test(attrs) && executable) lastInline = t.index;
  }
  return html.replace(/<script\b([^>]*)>/gi, (whole, attrs: string, offset: number) => {
    if (offset < lastInline) return whole;
    if (!/\ssrc\s*=/i.test(attrs)) return whole;
    if (/\s(async|defer|data-no-delay)\b/i.test(attrs) || /type\s*=\s*["']?(module|text\/plain)/i.test(attrs)) return whole;
    return `<script defer${attrs}>`;
  });
}

/**
 * The loader, inlined once at the end of the body. Plain ES5 on purpose —
 * it must run in every browser the delayed scripts would have.
 */
const DELAY_LOADER_SRC = `(function(){var done=false;var evs=["scroll","mousemove","keydown","touchstart","click","wheel"];var ran=false;function fire(){try{document.dispatchEvent(new Event("DOMContentLoaded",{bubbles:true}));window.dispatchEvent(new Event("load"));}catch(e){}}function run(){if(done)return;done=true;window.__bmsDelayRan=true;for(var i=0;i<evs.length;i++)window.removeEventListener(evs[i],run,{passive:true});var nodes=document.querySelectorAll('script[${ATTR}]');var list=[];for(var j=0;j<nodes.length;j++)list.push(nodes[j]);(function next(){var old=list.shift();if(!old){if(ran)fire();return;}ran=true;var s=document.createElement("script");for(var k=0;k<old.attributes.length;k++){var a=old.attributes[k];if(a.name==="type"||a.name==="${ATTR}"||a.name==="data-bms-type")continue;s.setAttribute(a.name,a.value);}var t=old.getAttribute("data-bms-type");if(t)s.type=t;if(old.src){s.src=old.src;s.onload=s.onerror=next;old.parentNode.replaceChild(s,old);}else{s.text=old.text;old.parentNode.replaceChild(s,old);next();}})();}for(var i=0;i<evs.length;i++)window.addEventListener(evs[i],run,{passive:true});__FALLBACK__})();`;

// After the last delayed script has run, the loader fires DOMContentLoaded
// and load again. By then both happened long ago, and scripts that wait for
// them — many chat and analytics widgets — would never have started. WP
// Rocket re-fires both for exactly this reason.

/**
 * The loader with its own fallback delay, in seconds (Speed → Page optimisation).
 *
 * Zero means "only on interaction", which is what the setting's help text
 * promises. It used to emit `setTimeout(run, 0)` — which fires on the very
 * next tick and runs every delayed script immediately, so choosing the
 * strictest option silently turned the whole feature off. The fallback timer
 * is now left out entirely at zero, and the scripts wait for a real scroll,
 * key, touch or click.
 */
export function delayLoader(timeoutSeconds: number): string {
  const ms = Math.max(0, Math.round(timeoutSeconds * 1000));
  const fallback = ms > 0 ? `setTimeout(run,${ms});` : "";
  return DELAY_LOADER_SRC.replace("__FALLBACK__", fallback);
}
