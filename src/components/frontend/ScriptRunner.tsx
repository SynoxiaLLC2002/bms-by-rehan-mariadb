"use client";

// Runs the scripts that arrive with a client-side navigation.
//
// Menus, post grids, archives and pagination change pages without a reload.
// The new page's raw HTML — an HTML Embed, a document's own custom code, a
// plugin's script — is put in with innerHTML, and a browser never executes a
// <script> inserted that way. So an ad slot, a widget or a per-page tracking
// tag worked for someone who landed on the page and stayed blank for someone
// who reached it from the menu.
//
// Every raw-HTML container the site renders carries `data-bms-html` with a
// fingerprint of its content. After each navigation this looks for containers
// it has not run yet — new ones, or a kept one whose content changed — and
// runs their scripts in document order, the way the parser would have.
// Containers that survive a navigation untouched are skipped, so nothing runs
// twice and scripts a third party added afterwards are never re-run.

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Container → fingerprint last run. Module scope: survives this component remounting. */
const ran = new WeakMap<Element, string>();
/** The first scan only records: the browser already ran what was in the HTML. */
let booted = false;

const EXECUTABLE = /^(|text\/javascript|application\/javascript|module)$/i;

/**
 * Inline classic scripts that have already run in this document.
 *
 * Classic scripts share one global scope, so running `const widget = …` a
 * second time — the same embed, reached again from the menu — throws
 * "Identifier 'widget' has already been declared" and the embed stays
 * blank. A repeat runs inside a block instead: `const`/`let`/`class` are
 * local to that run, `var` and functions still land on `window`, and the
 * code does its work again for the new page.
 */
const seenInline = new Set<string>();

function remember(script: HTMLScriptElement) {
  const type = script.getAttribute("type") ?? "";
  // Delayed scripts sit as text/plain until the visitor interacts: not run yet.
  if (script.src || script.hasAttribute("data-bms-delay") || type.toLowerCase() === "module" || !EXECUTABLE.test(type)) return;
  seenInline.add(script.text);
}

/**
 * `document.write` while a script is re-run.
 *
 * Called after the page has loaded, `document.write` opens a new document —
 * the whole page is replaced by what it writes. Before scripts were re-run
 * such an embed simply did nothing; now its markup goes where the parser
 * would have put it, just before the script.
 *
 * Known limit: a <script> in that markup does not run (HTML inserted this
 * way never executes), so ad code that loads in a chain of writes stays empty
 * after an in-site navigation. See reasons.txt 10.10.
 */
function withWriteAt<T>(anchor: HTMLScriptElement, run: () => T): { result: T; restore: () => void } {
  const doc = document as Document & { write: (...s: string[]) => void; writeln: (...s: string[]) => void };
  const write = doc.write;
  const writeln = doc.writeln;
  const put = (html: string) => {
    if (anchor.isConnected) anchor.insertAdjacentHTML("beforebegin", html);
  };
  doc.write = (...parts: string[]) => put(parts.join(""));
  doc.writeln = (...parts: string[]) => put(parts.join("") + "\n");
  const restore = () => {
    doc.write = write;
    doc.writeln = writeln;
  };
  return { result: run(), restore };
}

function activate(old: HTMLScriptElement): Promise<void> {
  return new Promise((resolve) => {
    const s = document.createElement("script");
    for (const a of Array.from(old.attributes)) {
      if (a.name === "type" || a.name === "data-bms-delay" || a.name === "data-bms-type") continue;
      s.setAttribute(a.name, a.value);
    }
    const delayedType = old.getAttribute("data-bms-type");
    const type = old.hasAttribute("data-bms-delay") ? delayedType ?? "" : old.getAttribute("type") ?? "";
    if (type) s.type = type;
    if (old.src) {
      // Runs some time before `load`; the override stays until then. Scripts
      // are activated one at a time, so no other one is running meanwhile.
      let restore = () => {};
      s.onload = s.onerror = () => {
        restore();
        resolve();
      };
      restore = withWriteAt(s, () => old.parentNode?.replaceChild(s, old)).restore;
    } else {
      const text = old.text;
      const isModule = type.toLowerCase() === "module";
      s.text = !isModule && seenInline.has(text) ? `{\n${text}\n}` : text;
      if (!isModule) seenInline.add(text);
      // An inline script runs synchronously on insertion.
      withWriteAt(s, () => old.parentNode?.replaceChild(s, old)).restore();
      resolve();
    }
  });
}

async function runIn(container: Element) {
  const delayDone = !!(window as unknown as { __bmsDelayRan?: boolean }).__bmsDelayRan;
  for (const script of Array.from(container.querySelectorAll("script"))) {
    if (script.hasAttribute("data-bms-delay")) {
      // Left for the delay loader until the visitor has interacted; after
      // that the loader is spent, so the script runs now.
      if (delayDone) await activate(script);
      continue;
    }
    if (!EXECUTABLE.test(script.getAttribute("type") ?? "")) continue; // JSON-LD, templates
    await activate(script);
  }
}

/**
 * The site's head scripts, when server.js could not copy them into <head>
 * (it gives up on pages over its buffer cap). Put there now, once, so they
 * still run before anything the page does next.
 */
function headFallback() {
  if (document.querySelector('meta[name="bms-head-scripts"]')) return;
  const tpl = document.querySelector<HTMLTemplateElement>("template[data-bms-head]");
  if (!tpl) return;
  const holder = document.createElement("div");
  holder.appendChild(tpl.content.cloneNode(true));
  for (const node of Array.from(holder.childNodes)) document.head.appendChild(node);
  for (const s of Array.from(document.head.querySelectorAll("script"))) {
    if (!ran.has(s) && EXECUTABLE.test(s.getAttribute("type") ?? "") && !s.hasAttribute("data-bms-delay")) {
      ran.set(s, "head");
      void activate(s);
    }
  }
  const mark = document.createElement("meta");
  mark.name = "bms-head-scripts";
  document.head.appendChild(mark);
}

function scan() {
  const containers = Array.from(document.querySelectorAll("[data-bms-html]"));
  const todo: Element[] = [];
  for (const c of containers) {
    const sig = c.getAttribute("data-bms-html") ?? "";
    if (ran.get(c) === sig) continue;
    ran.set(c, sig);
    if (booted) todo.push(c);
    // Already run by the browser on this first load.
    else c.querySelectorAll("script").forEach(remember);
  }
  booted = true;
  // In order, one container at a time: a later embed may use what an
  // earlier one loaded, the way it would on a first load.
  void (async () => {
    for (const c of todo) await runIn(c);
  })();
}

export default function ScriptRunner() {
  const pathname = usePathname();
  useEffect(() => {
    if (!booted) headFallback();
    // After React has committed the new page.
    const id = requestAnimationFrame(scan);
    return () => cancelAnimationFrame(id);
  }, [pathname]);
  return null;
}
