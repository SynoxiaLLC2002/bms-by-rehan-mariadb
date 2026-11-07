// One registry for every block the editor can insert.
//
// The slash menu and the block library both read this, so a block added here
// appears in both places with the same name, icon and description — previously
// the list lived inside the editor component and only the slash menu saw it.

export type BlockCategory = "text" | "media" | "layout" | "highlight" | "data" | "social" | "embed" | "form";

export interface BlockDef {
  /** Block type as registered in the editor schema. */
  type: string;
  label: string;
  hint: string;
  /** Short glyph shown in the coloured tile. */
  icon: string;
  color: string;
  category: BlockCategory;
  /** Extra props applied on insert, e.g. heading level. */
  props?: Record<string, string | number | boolean>;
  /** Words that should match in search but aren't in the label. */
  keywords?: string[];
}

export const BLOCK_CATEGORIES: { id: BlockCategory; label: string; hint: string }[] = [
  { id: "text",      label: "Text",        hint: "Words, headings and lists" },
  { id: "media",     label: "Media",       hint: "Images, video and maps" },
  { id: "layout",    label: "Layout",      hint: "Structure and grouping" },
  { id: "highlight", label: "Highlight",   hint: "Draw attention to something" },
  { id: "data",      label: "Data",        hint: "Numbers, progress and time" },
  { id: "social",    label: "Social",      hint: "People and profiles" },
  { id: "embed",     label: "Embeds",      hint: "Content from elsewhere" },
  { id: "form",      label: "Forms",       hint: "Collect messages" },
];

export const BLOCK_LIBRARY: BlockDef[] = [
  // ── Text ──────────────────────────────────────────────────────────────────
  { type: "paragraph",        label: "Paragraph",     hint: "Plain body text",                     icon: "¶",   color: "#64748b", category: "text", keywords: ["text", "body", "p"] },
  { type: "heading",          label: "Heading 1",     hint: "Large section heading",               icon: "H1",  color: "#0f172a", category: "text", props: { level: 1 } },
  { type: "heading",          label: "Heading 2",     hint: "Medium section heading",              icon: "H2",  color: "#334155", category: "text", props: { level: 2 } },
  { type: "heading",          label: "Heading 3",     hint: "Small section heading",               icon: "H3",  color: "#475569", category: "text", props: { level: 3 } },
  { type: "textAdvanced",     label: "Text Advanced", hint: "Rich text with tag, colour and spacing", icon: "T+", color: "#7c3aed", category: "text", keywords: ["rich", "styled"] },
  { type: "bulletListItem",   label: "Bulleted List", hint: "An unordered list",                   icon: "•",   color: "#64748b", category: "text", keywords: ["ul", "bullets"] },
  { type: "numberedListItem", label: "Numbered List", hint: "An ordered list",                     icon: "1.",  color: "#64748b", category: "text", keywords: ["ol", "steps"] },
  { type: "checkListItem",    label: "Check List",    hint: "A list with checkboxes",              icon: "☑",   color: "#10b981", category: "text", keywords: ["todo", "task"] },
  { type: "quote",            label: "Quote",         hint: "A pull quote",                        icon: "❝",   color: "#8b5cf6", category: "text", keywords: ["blockquote", "citation"] },
  { type: "codeBlock",        label: "Code",          hint: "Preformatted code",                   icon: "</>", color: "#0f172a", category: "text", keywords: ["snippet", "pre"] },
  { type: "table",            label: "Table",         hint: "Rows and columns",                    icon: "▤",   color: "#64748b", category: "text" },
  { type: "tableAdvanced",    label: "Table Advanced", hint: "Header, footer, stripes and styling", icon: "▤+",  color: "#0d9488", category: "text", keywords: ["grid", "rows", "columns", "data"] },
  { type: "tableOfContents",  label: "Table of Contents", hint: "Auto-built from your headings",   icon: "≔",   color: "#64748b", category: "text", keywords: ["toc", "index"] },

  // ── Media ─────────────────────────────────────────────────────────────────
  { type: "image",            label: "Image",         hint: "A single image",                      icon: "▣",   color: "#ec4899", category: "media", keywords: ["photo", "picture"] },
  { type: "imageAdvanced",    label: "Image Advanced", hint: "Caption, filters, overlay and link", icon: "IMG", color: "#ec4899", category: "media" },
  { type: "video",            label: "Video",         hint: "An uploaded video file",              icon: "▶",   color: "#8b5cf6", category: "media" },
  { type: "videoEmbed",       label: "Video Embed",   hint: "YouTube or Vimeo by URL",             icon: "▶",   color: "#8b5cf6", category: "media", keywords: ["youtube", "vimeo", "iframe"] },
  { type: "audio",            label: "Audio",         hint: "An audio file",                       icon: "♪",   color: "#0ea5e9", category: "media" },
  { type: "googleMap",        label: "Google Map",    hint: "Embed a map by address",              icon: "📍",  color: "#10b981", category: "media", keywords: ["location", "address"] },
  { type: "slider",           label: "Slider",        hint: "Swipeable carousel of images or slides", icon: "⇆", color: "#ec4899", category: "media", keywords: ["carousel", "slideshow", "swipe", "banner", "logos"] },
  { type: "lottie",           label: "Lottie",        hint: "A Lottie .json animation",            icon: "✨",  color: "#14b8a6", category: "media", keywords: ["animation", "json", "motion", "lottiefiles"] },
  { type: "gallery",          label: "Gallery",       hint: "A grid of images",                    icon: "▦",   color: "#ec4899", category: "media", keywords: ["photos", "grid", "album", "masonry"] },
  { type: "imageCompare",     label: "Image Compare", hint: "Before and after slider",             icon: "◧",   color: "#ec4899", category: "media", keywords: ["before", "after", "slider", "reveal"] },

  // ── Layout ────────────────────────────────────────────────────────────────
  { type: "rowLayout",        label: "Row Layout",    hint: "Multi-column row",                    icon: "▦",   color: "#8b5cf6", category: "layout", keywords: ["columns", "grid"] },
  { type: "splitContent",     label: "Split Content", hint: "Image beside text",                   icon: "⧉",   color: "#8b5cf6", category: "layout", keywords: ["media text", "two column"] },
  { type: "spacer",           label: "Spacer",        hint: "Vertical space or a rule",            icon: "—",   color: "#94a3b8", category: "layout", keywords: ["divider", "gap", "hr"] },
  { type: "accordion",        label: "Accordion",     hint: "Collapsible sections",                icon: "≡",   color: "#0ea5e9", category: "layout", keywords: ["faq", "toggle", "collapse"] },
  { type: "modal",            label: "Modal / Popup", hint: "Content in a popup — on click, after a delay or on exit", icon: "🗖", color: "#8b5cf6", category: "layout", keywords: ["popup", "lightbox", "dialog", "overlay", "exit intent"] },
  { type: "timeline",         label: "Timeline",      hint: "Steps or events along a line",        icon: "⋮",   color: "#0ea5e9", category: "layout", keywords: ["steps", "history", "process", "how to", "changelog"] },
  { type: "tabs",             label: "Tabs",          hint: "Tabbed panels",                       icon: "⊟",   color: "#0ea5e9", category: "layout" },
  { type: "hero",             label: "Hero",          hint: "Page top: heading, text, ticks, buttons and a photo", icon: "◼", color: "#0b2545", category: "layout", keywords: ["banner", "header", "landing", "top", "cover", "intro", "headline"] },
  { type: "linkGrid",         label: "Link Grid",     hint: "Many links in columns: service areas, services, guides", icon: "⋮⋮", color: "#0b6fb8", category: "layout", keywords: ["areas", "locations", "towns", "cities", "links", "directory", "sitemap", "service areas"] },
  { type: "cardGrid",         label: "Card Grid",     hint: "Services or features as cards with photo, text and link", icon: "▦", color: "#0b6fb8", category: "layout", keywords: ["cards", "services", "features", "categories", "tiles", "boxes", "columns"] },

  // ── Highlight ─────────────────────────────────────────────────────────────
  { type: "callout",          label: "Callout",       hint: "A highlighted box",                   icon: "📌",  color: "#f59e0b", category: "highlight", keywords: ["notice", "warning"] },
  { type: "highlightPanel",   label: "Highlight Panel", hint: "Coloured panel: heading and 1–12 points in columns", icon: "▣", color: "#0b3d2e", category: "highlight", keywords: ["panel", "points", "checklist", "tips", "warning", "before", "features", "columns"] },
  { type: "stepsGrid",        label: "Steps Grid",    hint: "1–25 numbered steps or guides in a grid", icon: "①",   color: "#c2410c", category: "highlight", keywords: ["steps", "process", "journey", "how to", "stages", "numbered", "guides"] },
  { type: "ctaBand",          label: "CTA Band",      hint: "Coloured strip with a heading and buttons", icon: "▬", color: "#f59e0b", category: "highlight", keywords: ["call to action", "banner", "strip", "section", "contact", "quote", "call"] },
  { type: "callBar",          label: "Call Bar",      hint: "Call button fixed to the bottom of the screen", icon: "📞", color: "#16a34a", category: "highlight", keywords: ["sticky", "phone", "call", "mobile", "fixed", "tap to call", "bottom"] },
  { type: "noticeBar",        label: "Notice Bar",    hint: "One-line announcement with an optional link", icon: "📣", color: "#f59e0b", category: "highlight", keywords: ["announcement", "banner", "offer", "alert", "news", "promo"] },
  { type: "keyTakeaways",     label: "Key Takeaways", hint: "The article in a few points, in a box", icon: "💡", color: "#0b6fb8", category: "highlight", keywords: ["summary", "tl;dr", "tldr", "highlights", "in short", "overview", "key points"] },
  { type: "reviewGrid",       label: "Review Grid",   hint: "Several customer reviews side by side", icon: "❝", color: "#f59e0b", category: "highlight", keywords: ["testimonials", "reviews", "feedback", "customers", "stars", "quotes"] },
  { type: "prosCons",         label: "Pros & Cons",   hint: "Two lists side by side with ticks and crosses", icon: "±", color: "#15803d", category: "highlight", keywords: ["advantages", "disadvantages", "review", "good", "bad", "compare"] },
  { type: "infoBox",          label: "Info Box",     hint: "Icon, title and description card",    icon: "ℹ",   color: "#0ea5e9", category: "highlight", keywords: ["card", "feature", "service", "advanced"] },
  { type: "testimonial",      label: "Testimonial",   hint: "Quote with name and rating",          icon: "★",   color: "#f59e0b", category: "highlight", keywords: ["review", "quote"] },
  { type: "button",           label: "Button",        hint: "One or more call-to-action buttons",  icon: "BTN", color: "#0ea5e9", category: "highlight", keywords: ["cta", "link", "buttons", "advanced"] },
  { type: "iconList",         label: "Icon List",     hint: "A list with custom icons",            icon: "☑",   color: "#64748b", category: "highlight", keywords: ["features", "ticks"] },
  { type: "icon",             label: "Icon",          hint: "A single icon, optionally linked",    icon: "★",   color: "#f59e0b", category: "highlight", keywords: ["emoji", "symbol", "glyph"] },
  { type: "pricingTable",     label: "Pricing Table", hint: "Side-by-side plan cards",             icon: "¤",   color: "#10b981", category: "highlight", keywords: ["plans", "tiers", "price", "packages"] },
  { type: "showMore",         label: "Show More",     hint: "Long text behind a button",           icon: "⋯",   color: "#64748b", category: "highlight", keywords: ["read more", "collapse", "expand", "truncate"] },

  // ── Data ──────────────────────────────────────────────────────────────────
  { type: "progressBar",      label: "Progress Bar",  hint: "A skill or progress meter",           icon: "▰",   color: "#10b981", category: "data", keywords: ["skill", "meter", "percent"] },
  { type: "countUp",          label: "Count Up",      hint: "An animated number counter",          icon: "0→",  color: "#8b5cf6", category: "data", keywords: ["stat", "number"] },
  { type: "countdown",        label: "Countdown",     hint: "A timer to a date",                   icon: "⏱",   color: "#ef4444", category: "data", keywords: ["timer", "deadline"] },
  { type: "statsStrip",       label: "Stats Strip",   hint: "Two to six figures in a row",         icon: "#",   color: "#0b2545", category: "data", keywords: ["numbers", "figures", "trust", "badges", "facts", "counter", "years"] },
  { type: "priceList",        label: "Price List",    hint: "Services or items with a price each", icon: "$", color: "#10b981", category: "data", keywords: ["menu", "prices", "rates", "services", "cost", "tariff", "fees"] },
  { type: "factSheet",        label: "Fact Sheet",    hint: "Label and value pairs: specifications, key facts", icon: "≣", color: "#0d9488", category: "data", keywords: ["specs", "specifications", "details", "facts", "properties", "information", "definition"] },
  { type: "comparisonTable",  label: "Comparison Table", hint: "Options side by side with ticks and crosses", icon: "⇄", color: "#0d9488", category: "data", keywords: ["compare", "versus", "vs", "features", "plans", "yes no", "table"] },
  { type: "versionHistory",   label: "Version History", hint: "Changelog: each release and what changed", icon: "↻", color: "#0b6fb8", category: "data", keywords: ["changelog", "release notes", "updates", "what's new", "versions", "apk"] },
  { type: "starRating",       label: "Star Rating",  hint: "A score out of five",                 icon: "★",   color: "#f59e0b", category: "data", keywords: ["review", "score", "stars"] },
  { type: "downloadBox",      label: "Download Box",  hint: "Download button with file details — 8 designs", icon: "⬇", color: "#16a34a", category: "data", keywords: ["download", "apk", "file", "button", "mirror", "version", "size", "countdown"] },
  { type: "appInfo",          label: "App Info",      hint: "App details, download button and rich-result schema", icon: "📱", color: "#10b981", category: "data", keywords: ["apk", "app", "download", "software", "version", "schema", "rating"] },
  { type: "businessInfo",     label: "Business Info", hint: "Address, phone, hours and map from Local SEO", icon: "🏪", color: "#059669", category: "data", keywords: ["local", "address", "phone", "hours", "map", "contact", "business"] },
  { type: "authorBio",        label: "Author Bio",    hint: "Avatar, name, biography and socials — live from the account", icon: "👤", color: "#059669", category: "data", keywords: ["author", "profile", "bio", "avatar", "byline", "team"] },
  { type: "plugin",           label: "Plugin",        hint: "A tool you installed under Plugins", icon: "🧩",  color: "#10b981", category: "data", keywords: ["shortcode", "tool", "calculator", "widget", "extension"] },
  { type: "postGrid",         label: "Post Grid",     hint: "Your latest posts, live",             icon: "▤",   color: "#0ea5e9", category: "data", keywords: ["recent", "blog", "articles", "loop", "related"] },

  // ── Social ────────────────────────────────────────────────────────────────
  { type: "socialIcons",      label: "Social Icons",  hint: "Links to your profiles",              icon: "◉",   color: "#8b5cf6", category: "social", keywords: ["links", "profiles", "follow", "share"] },
  { type: "teamMember",       label: "Team Member",   hint: "Photo, name, role and links",         icon: "👤",  color: "#8b5cf6", category: "social", keywords: ["person", "staff", "author", "profile", "bio"] },
  { type: "shareButtons",     label: "Share Buttons", hint: "Share this page: Facebook, X, WhatsApp and more, with no tracking scripts", icon: "↗", color: "#8b5cf6", category: "social", keywords: ["share", "social", "facebook", "twitter", "whatsapp", "telegram", "send"] },
  { type: "logoStrip",        label: "Logo Strip",    hint: "A row of partner or client logos",    icon: "◍",   color: "#64748b", category: "social", keywords: ["logos", "brands", "partners", "clients", "trusted by", "as seen in", "sponsors"] },

  // ── Embeds ──────────────────────────────────────────────────────────────
  { type: "iframeEmbedAdvanced", label: "Iframe Embed Advanced", hint: "Embed a page in a card with header, notice and button", icon: "⧉", color: "#0b3d2e", category: "embed", keywords: ["iframe", "portal", "embed", "website", "service", "official"] },
  { type: "htmlEmbed",        label: "HTML Embed",    hint: "Paste any embed code",                icon: "<>",  color: "#0f172a", category: "embed", keywords: ["iframe", "script", "widget", "custom"] },

  // ── Forms ────────────────────────────────────────────────────────────────
  { type: "contactForm",      label: "Contact Form",  hint: "Messages land in your inbox",         icon: "✉",   color: "#0ea5e9", category: "form", keywords: ["enquiry", "email", "message", "lead", "get in touch"] },
];

/**
 * Ranked search across label, hint and keywords.
 *
 * A label match outranks a description match, so typing "image" puts Image
 * above blocks that merely mention images in their description.
 */
export function searchBlocks(query: string, blocks: BlockDef[] = BLOCK_LIBRARY): BlockDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return blocks;

  const scored: { block: BlockDef; score: number }[] = [];
  for (const b of blocks) {
    const label = b.label.toLowerCase();
    let score = 0;
    if (label === q) score = 100;
    else if (label.startsWith(q)) score = 80;
    else if (label.includes(q)) score = 60;
    else if ((b.keywords ?? []).some((k) => k.toLowerCase().includes(q))) score = 40;
    else if (b.hint.toLowerCase().includes(q)) score = 20;
    if (score > 0) scored.push({ block: b, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.block.label.localeCompare(b.block.label)).map((s) => s.block);
}
