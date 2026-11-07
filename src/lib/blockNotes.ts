// What the block manifest (blockManifest.json, generated from the editor's
// specs) cannot say on its own: how a document is shaped, and the format of
// the props that hold JSON. Served with the manifest by /api/mcp/blocks so a
// program building pages writes what the editor would have written.
//
// Keep these in step with the parsers they name — they are the contract.

export const DOCUMENT_FORMAT = [
  "A page or post `content` is a JSON array of BlockNote blocks: { id, type, props, content, children }.",
  "`id` is any unique string; omit it and the editor assigns one when the document is next opened.",
  "Every custom-block prop is a STRING, numbers and booleans included: \"3\", \"true\". List-like props hold a JSON string (JSON.stringify of an array).",
  "Text blocks (content: \"inline\") take `content` as an array of inline nodes: { type: \"text\", text, styles: { bold?, italic?, underline?, strike?, code?, textColor?, backgroundColor? } } or { type: \"link\", href, content: [text nodes] }.",
  "Blocks with content \"none\" carry everything in props; send `content: []` or leave it out.",
  "Nesting is only via rowLayout: its `cols` prop holds each column's own block array. `children` is for list indentation only.",
  "Omitted props take the defaults listed here. Send only what differs.",
  "`bx` is the block's box/style JSON written by the editor's style panel; leave it out unless copying a block that has one.",
  "Images, video and files must be URLs on this site: upload through /api/media first and use the returned url.",
  "HTML Embed <script> and inline handlers are stripped from content saved with an API token.",
];

export const BLOCK_NOTES: Record<string, string> = {
  rowLayout:
    "Columns and sections. `columns`: \"1\"–\"5\". `layout` is a ratio preset id: \"equal\" (any count); 2 cols: \"left-golden\" 67/33, \"right-golden\" 33/67, \"left-major\" 75/25, \"right-major\" 25/75, \"left-forty\" 40/60, \"right-forty\" 60/40; 3 cols: \"center-wide\" 25/50/25, \"center-exwide\", \"left-half\", \"right-half\"; 4 cols: \"left-half\", \"right-half\". " +
    "`cols` = JSON string of an array, one entry per column: { blocks: [ ...BlockNote blocks ], ...optional column style keys }. " +
    "Row background: bgType \"color\"|\"gradient\"|\"image\" with bgColor / gradFrom+gradTo+gradAngle / bgImage. " +
    "Spacing: padT/padR/padB/padL (px numbers as strings). Width: inheritMax \"true\" keeps the site content width; set \"false\" + maxWidth for custom. " +
    "valign \"top\"|\"center\"|\"bottom\". Use a 1-column row as a full-width coloured section (hero, CTA band).",
  button:
    "One block is a group of buttons. `btns` = JSON string of an array of { text, url, target: \"_self\"|\"_blank\", inherit: \"theme\"|\"theme2\"|\"fill\"|\"outline\", size: \"sm\"|\"md\"|\"lg\"|\"xl\", width: \"auto\"|\"fixed\"|\"full\" }. " +
    "Group: align \"left\"|\"center\"|\"right\"|\"between\". Ignore the legacy text/url/style props when using btns.",
  pricingTable:
    "`plans` = JSON string of an array of { name, price, period, features (newline-separated), cta, url, featured: boolean }. `columns` \"1\"–\"4\"; `accent` a CSS colour.",
  iconList: "`items` = JSON string of an array of { icon, text, url? }. Icon is a glyph/emoji or an icon name.",
  accordion: "`items` = JSON string of an array of { title, content }. Good for FAQs.",
  tabs: "`tabs` = JSON string of an array of { label, content } (content is plain text).",
  gallery: "`images` = JSON string of an array of { src, alt?, caption? }.",
  slider: "`slides` = JSON string of an array of { image, alt, title, text, buttonLabel, buttonUrl }. per* props set slides visible per breakpoint.",
  timeline: "`items` = JSON string of an array of { date, title, text, icon }.",
  stepsGrid: "`steps` = JSON string of an array of { title, text, number, url }. `columns` \"2\"–\"4\".",
  highlightPanel: "`heading`, `intro`, and `points` = JSON string of an array of { title, text, icon, url }.",
  hero:
    "The top of a page. `layout` \"split\" (text beside the photo; `imageSide` \"right\"|\"left\"), \"cover\" (text over the photo; `overlay` \"0\"–\"95\" is how much of `bg` covers it) or \"plain\". `eyebrow`, `heading`, `text`; `ticks` = short points, one per line (up to 6); `btn1Label`+`btn1Url`, `btn2Label`+`btn2Url` (a button with no url is not shown; tel:+15551234567 makes a call button). `image` must be on this site, with `imageAlt`. `headingTag` \"h1\" only when the page's own title is hidden. Prefer this to a rowLayout with a background image: the photo is a real <img> and loads first.",
  ctaBand: "`heading`, `text`, `btn1Label`+`btn1Url`, `btn2Label`+`btn2Url` (url may be tel:…). `layout` \"center\" or \"split\" (buttons to the side).",
  cardGrid:
    "`cards` = JSON string of an array of { image, alt, icon, title, text, url } (up to 24). `image` is a photo on this site; without one the `icon` (an emoji) is shown. A card with a url is linked through its title, so every linked card needs a title. `columns` / `columnsTablet` / `columnsMobile`; `titleTag` \"h3\" under an H2.",
  statsStrip: "`items` = JSON string of an array of { value, label } (2–6), e.g. { value: \"24/7\", label: \"Available\" }. Real figures only.",
  prosCons: "`pros` and `cons` = plain text, one point per line. `prosTitle`, `consTitle`.",
  callBar:
    "A call button fixed to the bottom of the screen. `phone` (empty = the number in SEO → Local SEO), `label`, optional `text` and `btn2Label`+`btn2Url`. `show` \"mobile\" or \"all\". One per page; it draws nothing when there is no number.",
  logoStrip: "`logos` = JSON string of an array of { src, alt, url? } (up to 16); `src` on this site, `alt` = the brand's name. `heading` is the small line above.",
  noticeBar: "`text`, optional `icon` (emoji), `linkLabel`+`url`.",
  comparisonTable:
    "`cols` = JSON string of an array of column headers (2–6; the first names what is compared). `rows` = JSON string of an array of rows, each an array of cell strings as long as `cols`. A cell \"yes\" or \"no\" is drawn as a tick or cross. `highlight` = index of the recommended column (\"0\" = none). `caption` is optional.",
  linkGrid: "`links` = plain text, one per line: \"Name | /address\" (up to 150; a line with no address is plain text). `look` \"plain\"|\"pills\"|\"boxes\"; `columns` / `columnsTablet` / `columnsMobile`; `icon` an emoji before each. Use it for a business's service areas and for lists of sibling pages.",
  reviewGrid: "`reviews` = JSON string of an array of { quote, name, detail, rating (\"1\"–\"5\"), source } (up to 12). ONLY reviews the business really received, word for word: never write one. Leave the block out when the user has given none.",
  priceList: "`items` = JSON string of an array of { name, note, price } (price is text: \"$40\", \"From $90\"). `footnote` for small print. Real prices from the user only.",
  keyTakeaways: "`title` and `points` = plain text, one point per line (up to 12). `marker` \"tick\"|\"dot\"|\"number\". Place it near the top of an article.",
  factSheet: "`rows` = plain text, one per line: \"Label | Value\" (up to 60). `columns` \"1\" or \"2\".",
  shareButtons: "`show` = comma-separated networks from: facebook, x, whatsapp, linkedin, telegram, pinterest, reddit, email. `look` \"solid\"|\"outline\"|\"plain\"; `names` \"false\" for icons only. It shares the page it is on; nothing to fill in.",
  versionHistory: "`versions` = JSON string of an array of { version, date (YYYY-MM-DD), changes (one per line) }, newest first. `fold` \"true\" folds each release, newest open.",
  socialIcons: "`items` = JSON string of an array of { network, url } — network e.g. x, facebook, instagram, youtube, linkedin, github, tiktok.",
  teamMember: "`links` = JSON string of an array of { network, url }.",
  contactForm:
    "`fields` = JSON string of an array of { name, label, type: \"text\"|\"email\"|\"tel\"|\"textarea\"|\"select\"|..., required?, placeholder?, options? (newline-separated, for select), half? }. Empty = the built-in name/email/message form.",
  tableAdvanced: "Rows are a JSON string of string[][] (first row is the header when the header option is on).",
  splitContent: "Image beside text: image (URL), imagePosition \"left\"|\"right\", heading, text, buttonText, buttonUrl.",
  videoEmbed: "A YouTube or Vimeo page URL in `url`; rendered as a lightweight facade until clicked.",
  video: "An uploaded video file: upload to /api/media, put the returned URL in `url`.",
  image: "Built-in image: `url`, `caption`, `name` (used as alt), `previewWidth` (px number) and `textAlignment`.",
  imageAdvanced: "Image with caption, link, filters and overlay. Prefer it over `image` for designed sections.",
  countUp: "Animated number: to, prefix, suffix, title, duration (seconds).",
  infoBox: "Icon/image + title + text card, many style options. Use several inside a rowLayout for feature grids.",
  testimonial: "A single quote with author name, role and avatar.",
  htmlEmbed: "Raw HTML. Scripts are removed when saved with an API token — prefer real blocks.",
};
