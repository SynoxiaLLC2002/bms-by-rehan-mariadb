// The browser side of the client components that need no React on the public
// site. The server renders them exactly as before (lib/render.ts marks them
// <bms-island data-v="<id>">); these few lines then do what their hooks did.
// Not a file the browser downloads: compiled and minified at build
// (astro.config.mjs) and written into each page that has one of them
// (pages/[...path].astro), so such a page needs no script request at all.
// A page whose only interactive parts are these loads no React at all: on a
// typical page that was ~60 KB of script and a five-request chain for a menu
// button and an FAQ.
//
import { VANILLA } from "../lib/vanillaIds";

// Behaviour is copied from the React versions and must stay in step with them:
//   OffCanvas.tsx + useDialogFocus.ts   →  offCanvas()
//   blocks/AccordionFE.tsx              →  accordion()

/** Things a keyboard can land on, in DOM order (same list as useDialogFocus). */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function offCanvas(el: HTMLElement): void {
  const trigger = el.querySelector<HTMLElement>(".offcanvas-trigger");
  const backdrop = el.querySelector<HTMLElement>(".offcanvas-backdrop");
  const panel = el.querySelector<HTMLElement>(".offcanvas");
  if (!trigger || !panel) return;

  let isOpen = false;
  let returnTo: HTMLElement | null = null;
  let prevOverflow = "";

  const focusable = () =>
    Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (n) => n.offsetParent !== null || n === document.activeElement
    );

  // Escape closes; Tab wraps inside the panel and is pulled back in if focus escaped.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const items = focusable();
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !panel.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  function open(): void {
    if (isOpen) return;
    isOpen = true;
    returnTo = document.activeElement as HTMLElement | null;
    panel!.classList.add("is-open");
    backdrop?.classList.add("is-open");
    trigger!.setAttribute("aria-expanded", "true");
    // Stop the page scrolling behind the panel.
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey, true);
    // Into the panel: `aria-modal` promises the rest of the page is out of reach.
    const first = focusable()[0];
    if (first) first.focus();
    else {
      panel!.tabIndex = -1;
      panel!.focus();
    }
  }

  function close(): void {
    if (!isOpen) return;
    isOpen = false;
    panel!.classList.remove("is-open");
    backdrop?.classList.remove("is-open");
    trigger!.setAttribute("aria-expanded", "false");
    document.body.style.overflow = prevOverflow;
    document.removeEventListener("keydown", onKey, true);
    // Back to the control the visitor came from, unless a click put focus elsewhere.
    const active = document.activeElement;
    if (returnTo && (!active || panel!.contains(active) || active === document.body)) returnTo.focus?.();
  }

  trigger.addEventListener("click", open);
  backdrop?.addEventListener("click", close);
  el.querySelector(".offcanvas-close")?.addEventListener("click", close);
  // A link tap closes it (a `#section` link stays on the page).
  panel.addEventListener("click", (e) => {
    if ((e.target as Element).closest("a[href]")) close();
  });
  // Back/forward cache: never come back to a page with the menu still open.
  window.addEventListener("pagehide", close);
}

function accordion(el: HTMLElement): void {
  const root = el.querySelector<HTMLElement>(".bmsacc");
  if (!root) return;
  const closeOthers = root.hasAttribute("data-close-others");
  const icoOpen = root.dataset.icoOpen ?? "";
  const icoClosed = root.dataset.icoClosed ?? "";
  const panes = Array.from(root.querySelectorAll<HTMLElement>(":scope > .bmsacc-pane"));

  const parts = (pane: HTMLElement) => ({
    button: pane.querySelector<HTMLElement>(":scope > .bmsacc-title-wrap > .bmsacc-title"),
    body: pane.querySelector<HTMLElement>(":scope > .bmsacc-body"),
  });

  const set = (pane: HTMLElement, open: boolean) => {
    const { button, body } = parts(pane);
    pane.classList.toggle("is-open", open);
    button?.setAttribute("aria-expanded", String(open));
    const ico = button?.querySelector(".bmsacc-ico");
    if (ico) ico.textContent = open ? icoOpen : icoClosed;
    // Closed panes stay findable: find-in-page and crawlers see the text, and a match opens it.
    if (!body) return;
    if (open) body.removeAttribute("hidden");
    else body.setAttribute("hidden", "until-found");
  };

  const toggle = (i: number, forceOpen = false) => {
    const opening = forceOpen || !panes[i].classList.contains("is-open");
    if (closeOthers) panes.forEach((p, j) => j !== i && p.classList.contains("is-open") && set(p, false));
    set(panes[i], opening);
  };

  panes.forEach((pane, i) => {
    const { button, body } = parts(pane);
    if (body?.hasAttribute("hidden")) body.setAttribute("hidden", "until-found");
    body?.addEventListener("beforematch", () => toggle(i, true));
    button?.addEventListener("click", () => toggle(i));
  });
}

const controllers: Record<string, (el: HTMLElement) => void> = {};
for (const id of VANILLA.offCanvas) controllers[id] = offCanvas;
for (const id of VANILLA.accordion) controllers[id] = accordion;

// Inline at the end of <body>: every island is already in the DOM.
for (const el of document.querySelectorAll<HTMLElement>("bms-island[data-v]")) {
  try {
    controllers[el.dataset.v ?? ""]?.(el);
  } catch (err) {
    console.error("[bms] island", el.dataset.v, err);
  }
}
