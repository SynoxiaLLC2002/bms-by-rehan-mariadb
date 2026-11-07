// Every client component a public page can contain, by id. The server uses it
// to recognise them in the tree (lib/render.ts) and the browser to load the
// one an island needs (scripts/hydrate.ts) — each its own chunk.
// Regenerate when a "use client" file is added under src/components.
export const islands: Record<string, () => Promise<Record<string, unknown>>> = {
  "frontend/DarkModeToggle": () => import("@/components/frontend/DarkModeToggle"),
  "frontend/HeaderNav": () => import("@/components/frontend/HeaderNav"),
  "frontend/HeaderSearch": () => import("@/components/frontend/HeaderSearch"),
  "frontend/OffCanvas": () => import("@/components/frontend/OffCanvas"),
  "frontend/ReplyBox": () => import("@/components/frontend/ReplyBox"),
  "frontend/ReportNotFound": () => import("@/components/frontend/ReportNotFound"),
  "frontend/ScriptRunner": () => import("@/components/frontend/ScriptRunner"),
  "frontend/ScrollAnimations": () => import("@/components/frontend/ScrollAnimations"),
  "frontend/SiteExtras": () => import("@/components/frontend/SiteExtras"),
  "frontend/StickyHeader": () => import("@/components/frontend/StickyHeader"),
  "frontend/Turnstile": () => import("@/components/frontend/Turnstile"),
  "frontend/blocks/AccordionFE": () => import("@/components/frontend/blocks/AccordionFE"),
  "frontend/blocks/CommentForm": () => import("@/components/frontend/blocks/CommentForm"),
  "frontend/blocks/ContactFormFE": () => import("@/components/frontend/blocks/ContactFormFE"),
  "frontend/blocks/CountUpClient": () => import("@/components/frontend/blocks/CountUpClient"),
  "frontend/blocks/CountUpFE": () => import("@/components/frontend/blocks/CountUpFE"),
  "frontend/blocks/CountdownClient": () => import("@/components/frontend/blocks/CountdownClient"),
  "frontend/blocks/CountdownFE": () => import("@/components/frontend/blocks/CountdownFE"),
  "frontend/blocks/ImageCompareFE": () => import("@/components/frontend/blocks/ImageCompareFE"),
  "frontend/blocks/LottieFE": () => import("@/components/frontend/blocks/LottieFE"),
  "frontend/blocks/ModalFE": () => import("@/components/frontend/blocks/ModalFE"),
  "frontend/blocks/ShowMoreFE": () => import("@/components/frontend/blocks/ShowMoreFE"),
  "frontend/blocks/SliderFE": () => import("@/components/frontend/blocks/SliderFE"),
  "frontend/blocks/TableOfContentsFE": () => import("@/components/frontend/blocks/TableOfContentsFE"),
  "frontend/blocks/TabsFE": () => import("@/components/frontend/blocks/TabsFE"),
  "frontend/blocks/WaitButton": () => import("@/components/frontend/blocks/WaitButton"),
  "frontend/blocks/lazy": () => import("@/components/frontend/blocks/lazy"),
  "shared/DownloadBoxActions": () => import("@/components/shared/DownloadBoxActions"),
};
