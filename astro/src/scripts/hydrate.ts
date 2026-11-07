// Brings the page's React islands to life (lib/render.ts writes them). Only
// included on a page that has one (pages/[...path].astro); the menu and the
// accordion need no React (data-v, scripts/vanilla.ts, inlined).
import { islands } from "../lib/islands";

/** The <bms-slot> that belongs to this island, not to one nested inside it. */
function ownSlot(el: Element): Element | null {
  for (const s of el.querySelectorAll("bms-slot")) if (s.closest("bms-island") === el) return s;
  return null;
}

async function hydrate(): Promise<void> {
  const found = [...document.querySelectorAll<HTMLElement>("bms-island[data-c]")];
  if (!found.length) return;
  // Every chunk is asked for at once, alongside React: one round trip, not a chain of them.
  const modules = found.map((el) => {
    const load = islands[(el.dataset.c ?? "").split("#")[0]];
    return load ? load().catch((err: unknown) => err) : null;
  });
  const [{ hydrateRoot }, { createElement }] = await Promise.all([import("react-dom/client"), import("react")]);
  // Outer islands first: a nested one then hydrates inside markup its parent left untouched.
  for (const [i, el] of found.entries()) {
    const name = (el.dataset.c ?? "").split("#")[1];
    if (!modules[i]) continue;
    try {
      const mod = await modules[i];
      if (mod instanceof Error) throw mod;
      const Component = (mod as Record<string, unknown>)[name] as never;
      // { $bmsHtml } is an element the server rendered (lib/render.ts prepare): the same <bms-slot> again.
      const props = JSON.parse(el.dataset.p || "{}", (key, v) =>
        v && typeof v === "object" && typeof v.$bmsHtml === "string"
          ? createElement("bms-slot", { key: /^\d+$/.test(key) ? Number(key) : undefined, style: { display: "contents" }, suppressHydrationWarning: true, dangerouslySetInnerHTML: { __html: v.$bmsHtml } })
          : v
      );
      if (el.hasAttribute("data-s")) {
        const slot = ownSlot(el);
        props.children = createElement("bms-slot", { style: { display: "contents" }, suppressHydrationWarning: true, dangerouslySetInnerHTML: { __html: slot?.innerHTML ?? "" } });
      }
      hydrateRoot(el, createElement(Component, props));
    } catch (err) {
      console.error("[bms] island", el.dataset.c, err);
    }
  }
}

hydrate();
