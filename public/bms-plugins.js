// BMS plugin runtime — the few lines every plugin script talks to.
//
// A plugin's script calls:
//
//     BMS.plugin("my-slug", (root, ctx) => { ... });
//
// and this runtime calls that function once for every instance of the plugin
// on the page — now, and again for any added later (a preview, a lazy
// section). `root` is the plugin's own shadow root: query inside it with
// root.querySelector(...). `ctx` carries what the site knows:
//
//     ctx.settings   values from Admin -> Plugins -> Settings
//     ctx.attrs      attributes from the shortcode, e.g. [tool unit="kg"]
//     ctx.lang       the page language, e.g. "en", "ar"
//     ctx.dir        "ltr" or "rtl"
//     ctx.base       URL of the plugin folder, for its own assets
//     ctx.host       the container element (outside the shadow root)
//     ctx.version    the installed plugin version
//
// The mount function may return a cleanup function; it is called if the
// element is removed from the page.
//
// Loaded as a module, so it runs once however many plugins a page has.

(function () {
  if (window.BMS && window.BMS.__runtime) return;

  const mounts = new Map(); // slug -> mount fn
  const mounted = new WeakMap(); // element -> cleanup

  function context(el) {
    let data = {};
    try { data = JSON.parse(el.getAttribute("data-bms") || "{}"); } catch { data = {}; }
    return {
      settings: data.settings || {},
      attrs: data.attrs || {},
      lang: data.lang || el.getAttribute("lang") || "en",
      dir: data.dir || el.getAttribute("dir") || "ltr",
      version: data.version || "",
      base: el.getAttribute("data-base") || "",
      host: el,
    };
  }

  // Declarative shadow roots are attached by the parser in modern browsers.
  // Where they are not (older Safari), build the root from the template.
  function rootOf(el) {
    if (el.shadowRoot) return el.shadowRoot;
    const tpl = el.querySelector(":scope > template[shadowrootmode]");
    if (!tpl) return null;
    const root = el.attachShadow({ mode: "open" });
    root.appendChild(tpl.content.cloneNode(true));
    tpl.remove();
    return root;
  }

  function mountOne(el) {
    if (mounted.has(el)) return;
    const slug = el.getAttribute("data-plugin");
    const fn = mounts.get(slug);
    if (!fn) return;
    const root = rootOf(el);
    if (!root) return;
    try {
      const cleanup = fn(root, context(el));
      mounted.set(el, typeof cleanup === "function" ? cleanup : null);
      el.setAttribute("data-mounted", "");
    } catch (err) {
      console.error("[bms-plugin " + slug + "]", err);
    }
  }

  function mountAll(slug) {
    const sel = slug ? '.bms-plugin[data-plugin="' + slug + '"]' : ".bms-plugin[data-plugin]";
    document.querySelectorAll(sel).forEach(mountOne);
  }

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (!(n instanceof Element)) return;
        if (n.matches && n.matches(".bms-plugin[data-plugin]")) mountOne(n);
        n.querySelectorAll && n.querySelectorAll(".bms-plugin[data-plugin]").forEach(mountOne);
      });
      r.removedNodes.forEach((n) => {
        if (!(n instanceof Element)) return;
        const els = n.matches && n.matches(".bms-plugin") ? [n] : Array.from(n.querySelectorAll ? n.querySelectorAll(".bms-plugin") : []);
        for (const el of els) {
          const cleanup = mounted.get(el);
          if (cleanup) { try { cleanup(); } catch {} }
          mounted.delete(el);
        }
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.BMS = {
    __runtime: true,
    plugin(slug, fn) {
      mounts.set(slug, fn);
      mountAll(slug);
    },
  };
})();
