// Split out of BlockPanel.tsx (6,300+ lines) so an editor page can know which
// block types have a dedicated settings panel without pulling that whole
// module into its initial bundle. BlockPanel itself is loaded lazily — see
// the `dynamic(() => import(...))` calls in PostEditor/PageEditor/the element
// editor — and this is the one piece of it those callers need synchronously,
// to decide whether to auto-switch the sidebar to the "Block" tab.

/** The blocks with a dedicated settings panel — the keys of `settings` in BlockPanel.tsx. */
export const PANEL_TYPES = [
  "button", "spacer", "infoBox", "progressBar", "countUp", "countdown", "appInfo", "plugin",
  "testimonial", "videoEmbed", "googleMap", "accordion", "tabs", "iconList",
  "tableOfContents", "splitContent", "rowLayout", "callout", "textAdvanced",
  "imageAdvanced", "tableAdvanced", "gallery", "icon", "socialIcons", "starRating",
  "pricingTable", "teamMember", "showMore", "htmlEmbed", "imageCompare",
  "postGrid", "contactForm", "businessInfo", "slider", "modal", "lottie", "timeline", "downloadBox", "iframeEmbedAdvanced", "stepsGrid", "highlightPanel",
  "hero", "ctaBand", "cardGrid", "statsStrip", "prosCons", "callBar", "logoStrip", "noticeBar", "comparisonTable", "versionHistory",
  "linkGrid", "reviewGrid", "priceList", "keyTakeaways", "factSheet", "shareButtons",
] as const;

/** Block types that have a dedicated settings panel (used to decide tab auto-switch). */
export const BLOCK_SETTING_TYPES = new Set<string>(PANEL_TYPES);
